import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

const SECRET = process.env["SESSION_SECRET"];
if (!SECRET) throw new Error("SESSION_SECRET must be set");

// Issue a long-lived ICS subscription token for the current user. The token
// embeds the user's current calendarTokenVersion so that "Regenerate" (which
// bumps the version) invalidates all prior subscription URLs server-side.
router.get("/token", requireAuth, async (req: any, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { calendarTokenVersion: true },
  });
  const cv = u?.calendarTokenVersion ?? 0;
  const token = jwt.sign({ sub: req.user.sub, kind: "ical", cv }, SECRET, { expiresIn: "365d" });
  res.json({ token });
});

// Rotate the calendar token version, invalidating all previously issued ICS
// subscription URLs, and return a fresh token.
router.post("/regenerate", requireAuth, async (req: any, res) => {
  const updated = await prisma.user.update({
    where: { id: req.user.sub },
    data: { calendarTokenVersion: { increment: 1 } },
    select: { calendarTokenVersion: true },
  });
  const token = jwt.sign(
    { sub: req.user.sub, kind: "ical", cv: updated.calendarTokenVersion },
    SECRET,
    { expiresIn: "365d" },
  );
  res.json({ token });
});

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function formatIcsDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function fold(line: string): string {
  // RFC5545: lines should be ≤75 octets; fold with CRLF + space
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 73) chunks.push(line.slice(i, i + 73));
  return chunks.join("\r\n ");
}

router.get("/ics", async (req, res) => {
  const tokenRaw = req.query.token ? String(req.query.token) : null;
  if (!tokenRaw) {
    res.status(401).type("text/plain").send("Missing token");
    return;
  }
  let payload: { sub: string; kind: string; cv?: number };
  try {
    payload = jwt.verify(tokenRaw, SECRET, { algorithms: ["HS256"] }) as any;
  } catch {
    res.status(401).type("text/plain").send("Invalid token");
    return;
  }
  if (payload.kind !== "ical" || !payload.sub) {
    res.status(401).type("text/plain").send("Invalid token");
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt) {
    res.status(404).type("text/plain").send("User not found");
    return;
  }
  // Enforce server-side revocation: a regenerated calendarTokenVersion makes
  // older subscription URLs (with smaller `cv`) immediately stop working.
  if ((payload.cv ?? 0) !== user.calendarTokenVersion) {
    res.status(401).type("text/plain").send("Token revoked");
    return;
  }

  // Pull events relevant to this user
  const [ownProjects, tasks, milestones] = await Promise.all([
    prisma.project.findMany({
      where: {
        deletedAt: null,
        OR: [
          { pmId: user.id },
          { salesId: user.id },
          { adminProjectId: user.id },
          { technicalWriterId: user.id },
        ],
        status: { in: ["OBSERVATION", "ACTIVE", "PAUSE"] },
      },
      select: { id: true, projectId: true, code: true, name: true, startDate: true, endDate: true, status: true },
    }),
    prisma.task.findMany({
      where: {
        OR: [{ assigneeId: user.id }, { assignees: { some: { userId: user.id } } }],
        endDate: { not: null },
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        status: true,
        project: { select: { projectId: true, code: true, name: true } },
      },
    }),
    prisma.billingMilestone.findMany({
      where: {
        project: { pmId: user.id, deletedAt: null },
        dueDate: { not: null },
        status: { in: ["PLANNED", "INVOICED"] },
      },
      select: {
        id: true,
        name: true,
        dueDate: true,
        amount: true,
        status: true,
        project: { select: { projectId: true, code: true, name: true } },
      },
    }),
  ]);

  const now = formatIcsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SecureProfit Hub//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`SecureProfit – ${user.name}`)}`,
    "X-WR-TIMEZONE:Asia/Jakarta",
  ];

  for (const p of ownProjects) {
    if (p.endDate) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:project-end-${p.id}@secureprofit`);
      lines.push(`DTSTAMP:${now}`);
      // Use all-day DATE format with DTEND exclusive (next day)
      const start = new Date(p.endDate);
      const endExcl = new Date(start.getTime() + 86400000);
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(start)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(endExcl)}`);
      lines.push(fold(`SUMMARY:[Deadline] ${escapeIcs(p.projectId ?? p.code ?? "")} – ${escapeIcs(p.name)}`));
      lines.push(fold(`DESCRIPTION:${escapeIcs(`Status: ${p.status}`)}`));
      lines.push("END:VEVENT");
    }
  }
  for (const t of tasks) {
    const s = t.startDate ?? t.endDate;
    const e = t.endDate ?? t.startDate;
    if (!s || !e) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:task-${t.id}@secureprofit`);
    lines.push(`DTSTAMP:${now}`);
    const endExcl = new Date(new Date(e).getTime() + 86400000);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(new Date(s))}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(endExcl)}`);
    lines.push(fold(`SUMMARY:[Task] ${escapeIcs(t.title)} (${escapeIcs(t.project.projectId ?? t.project.code ?? "")})`));
    lines.push(fold(`DESCRIPTION:${escapeIcs(`${t.project.name} – status: ${t.status}`)}`));
    lines.push("END:VEVENT");
  }
  for (const m of milestones) {
    if (!m.dueDate) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:milestone-${m.id}@secureprofit`);
    lines.push(`DTSTAMP:${now}`);
    const start = new Date(m.dueDate);
    const endExcl = new Date(start.getTime() + 86400000);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(endExcl)}`);
    lines.push(fold(`SUMMARY:[Milestone] ${escapeIcs(m.name)} – ${escapeIcs(m.project.projectId ?? m.project.code ?? "")}`));
    lines.push(
      fold(`DESCRIPTION:${escapeIcs(`${m.project.name} – status: ${m.status} – amount: ${m.amount}`)}`),
    );
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  res.type("text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="secureprofit-${user.id}.ics"`);
  res.send(lines.join("\r\n"));
});

export default router;
