import { Router, type IRouter } from "express";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { canViewWorkHoursTeam, isWorkHoursRequiredRole } from "../lib/roles.js";
import {
  computeWorkHoursSummary,
  overallRange,
  type WorkHoursEntry,
  type WorkHoursLeave,
} from "../lib/work-hours.js";
import { workHoursCsv, workHoursXlsx, type WorkHoursMemberRow } from "../lib/work-hours-export.js";

const router: IRouter = Router();
router.use(requireAuth);

type MemberMeta = {
  id: string;
  name: string;
  role: string;
  businessUnitName: string | null;
};

function buildSummary(
  member: MemberMeta,
  entries: WorkHoursEntry[],
  leaves: WorkHoursLeave[],
  now: Date,
) {
  const required = isWorkHoursRequiredRole(member.role);
  const core = computeWorkHoursSummary(entries, leaves, now, required);
  return {
    userId: member.id,
    userName: member.name,
    role: member.role,
    businessUnitName: member.businessUnitName,
    required,
    ...core,
  };
}

// GET /api/work-hours/me — the caller's own weekly/monthly/yearly compliance.
router.get("/work-hours/me", async (req, res) => {
  const now = new Date();
  const { start, end } = overallRange(now);

  const [user, timesheets, leaves] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, name: true, role: true, businessUnit: { select: { name: true } } },
    }),
    prisma.timesheet.findMany({
      where: { userId: req.user!.sub, workDate: { gte: start, lte: end } },
      select: { workDate: true, hours: true, status: true },
    }),
    prisma.userLeave.findMany({
      where: { userId: req.user!.sub, startDate: { lte: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(
    buildSummary(
      { id: user.id, name: user.name, role: user.role, businessUnitName: user.businessUnit?.name ?? null },
      timesheets,
      leaves,
      now,
    ),
  );
});

// Build the scoped team compliance report for a supervisor. HR sees all
// required-role staff, Management sees Project Managers, and each Principal
// sees their own supervisees. Returns null when the caller is not allowed.
async function buildTeamReport(
  role: string,
  sub: string,
): Promise<{ scopeLabel: string; members: ReturnType<typeof buildSummary>[] } | null> {
  if (!canViewWorkHoursTeam(role)) return null;

  let scopeLabel: string;
  const where: Prisma.UserWhereInput = { deletedAt: null, isActive: true };
  if (role === "HR" || role === "SUPER_ADMIN") {
    where.role = {
      in: [
        "PROJECT_MANAGER",
        "KONSULTAN",
        "TECHNICAL_WRITER",
        "PRINCIPAL_KONSULTAN",
        "PRINCIPAL_TECHNICAL_WRITER",
        "PRINCIPAL_ADMIN_PROJECT",
      ],
    };
    scopeLabel = "All required staff";
  } else if (role === "MANAGEMENT") {
    where.role = "PROJECT_MANAGER";
    scopeLabel = "Project Managers";
  } else {
    // Principal: only their direct supervisees.
    where.principalId = sub;
    scopeLabel = "My team";
  }

  const members = await prisma.user.findMany({
    where,
    select: { id: true, name: true, role: true, businessUnit: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  });

  const now = new Date();
  if (members.length === 0) {
    return { scopeLabel, members: [] };
  }

  const { start, end } = overallRange(now);
  const memberIds = members.map((m) => m.id);

  const [timesheets, leaves] = await Promise.all([
    prisma.timesheet.findMany({
      where: { userId: { in: memberIds }, workDate: { gte: start, lte: end } },
      select: { userId: true, workDate: true, hours: true, status: true },
    }),
    prisma.userLeave.findMany({
      where: { userId: { in: memberIds }, startDate: { lte: end }, endDate: { gte: start } },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const tsByUser = new Map<string, WorkHoursEntry[]>();
  for (const t of timesheets) {
    const arr = tsByUser.get(t.userId) ?? [];
    arr.push({ workDate: t.workDate, hours: t.hours, status: t.status });
    tsByUser.set(t.userId, arr);
  }
  const leaveByUser = new Map<string, WorkHoursLeave[]>();
  for (const l of leaves) {
    const arr = leaveByUser.get(l.userId) ?? [];
    arr.push({ startDate: l.startDate, endDate: l.endDate });
    leaveByUser.set(l.userId, arr);
  }

  const result = members.map((m) =>
    buildSummary(
      { id: m.id, name: m.name, role: m.role, businessUnitName: m.businessUnit?.name ?? null },
      tsByUser.get(m.id) ?? [],
      leaveByUser.get(m.id) ?? [],
      now,
    ),
  );

  return { scopeLabel, members: result };
}

// GET /api/work-hours/team — compliance for the people the caller supervises.
router.get("/work-hours/team", async (req, res) => {
  const report = await buildTeamReport(req.user!.role, req.user!.sub);
  if (!report) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(report);
});

// GET /api/work-hours/team/export?format=csv|xlsx — download the scoped team
// report. Not in OpenAPI; fetched as a bearer-authenticated blob by the client.
router.get("/work-hours/team/export", async (req, res) => {
  const report = await buildTeamReport(req.user!.role, req.user!.sub);
  if (!report) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const format = String(req.query.format || "csv").toLowerCase();
  if (!["csv", "xlsx"].includes(format)) {
    res.status(400).json({ error: "INVALID_FORMAT" });
    return;
  }

  const rows: WorkHoursMemberRow[] = report.members.map((m) => ({
    userName: m.userName,
    role: m.role,
    businessUnitName: m.businessUnitName,
    required: m.required,
    week: m.week,
    month: m.month,
    year: m.year,
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  try {
    if (format === "csv") {
      const csv = workHoursCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="work-hours-${stamp}.csv"`);
      res.send("\uFEFF" + csv);
      return;
    }
    const buf = await workHoursXlsx(rows, report.scopeLabel);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="work-hours-${stamp}.xlsx"`);
    res.send(buf);
  } catch (err) {
    req.log.error({ err, format }, "work-hours export failed");
    res.status(500).json({ error: "WORK_HOURS_EXPORT_FAILED" });
  }
});

export default router;
