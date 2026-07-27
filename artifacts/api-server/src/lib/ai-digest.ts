import { prisma, Prisma } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { GenerateAiWeeklyDigestResponse } from "@workspace/api-zod";
import { getAppSettings } from "./app-settings.js";
import { notifyUser } from "./notifications.js";
import { fetchOpenMilestones } from "./billing-facts.js";
import {
  computeMetrics,
  projectMetricsSelect,
  type ProjectWithRelations,
} from "./serializers.js";

/**
 * Weekly AI digest ("Peringatan Pintar" weekly summary).
 *
 * Every Monday morning (WIB) the scheduler generates one digest per ISO week:
 * deterministic facts are computed from the live DB, the LLM only phrases them
 * into a headline + highlights + narrative, and the validated result is stored
 * in AiWeeklyDigest (id = weekKey) so all managers read the same digest.
 */

const MODEL = "gpt-5.4";
const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

export interface WeeklyDigestResult {
  weekKey: string;
  generatedAt: string;
  model: string;
  headline: string;
  highlights: { title: string; detail: string; severity: "CRITICAL" | "WARNING" | "INFO"; link?: string | null }[];
  narrative: string;
}

/** ISO week key (e.g. "2026-W31") for the WIB calendar day containing `now`. */
export function isoWeekKeyWIB(now: Date): string {
  const s = new Date(now.getTime() + WIB_OFFSET_MS);
  const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Real UTC instant of Monday 00:00 WIB of the ISO week containing `now`. */
export function currentWeekMondayWIB(now: Date): Date {
  const s = new Date(now.getTime() + WIB_OFFSET_MS);
  const dayStart = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const dayNum = (new Date(dayStart).getUTCDay() + 6) % 7; // Mon=0
  return new Date(dayStart - dayNum * DAY_MS - WIB_OFFSET_MS);
}

function fmtIDR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)} B`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(0)} M`;
  return `${sign}Rp ${Math.round(abs).toLocaleString("en-US")}`;
}

const digestProjectSelect = {
  ...projectMetricsSelect,
  code: true,
  name: true,
  endDate: true,
} as const;

async function buildWeeklyDigestFacts(): Promise<{ facts: Record<string, unknown>; allowedLinks: Set<string> }> {
  const now = new Date();
  const nowMs = now.getTime();
  const settings = await getAppSettings();
  const allowedLinks = new Set<string>(["/alerts", "/timesheets", "/projects"]);

  // --- Project health: low margin / over budget / delayed -------------------
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "OBSERVATION", "PAUSE"] } },
    select: digestProjectSelect,
  });

  type ProjRow = { code: string; name: string; link: string; marginPct: number; budgetPct: number; costTopUser: string | null };
  const lowMargin: ProjRow[] = [];
  const overBudget: ProjRow[] = [];
  const delayed: { code: string; name: string; daysOverdue: number; link: string }[] = [];
  const topUserIds = new Set<string>();
  const perProjectTopUser = new Map<string, string>(); // project id -> top labor userId

  for (const p of projects) {
    const metrics = computeMetrics(p as unknown as ProjectWithRelations);
    const link = `/projects/${p.id}`;
    if ((p.status === "ACTIVE" || p.status === "PAUSE") && p.endDate && p.endDate.getTime() < nowMs) {
      delayed.push({
        code: p.code,
        name: p.name,
        daysOverdue: Math.floor((nowMs - p.endDate.getTime()) / DAY_MS),
        link,
      });
      allowedLinks.add(link);
    }
    if (p.contractValue <= 0 || metrics.actualCost <= 0) continue;
    // Top approved-labor contributor (deterministic "why").
    const rateByUser = new Map(p.resources.map((r) => [r.userId, r.dailyRate]));
    const laborByUser = new Map<string, number>();
    for (const t of p.timesheets) {
      if (t.status !== "APPROVED") continue;
      const cost = (t.hours / 8) * (rateByUser.get(t.userId) ?? 0);
      if (cost > 0) laborByUser.set(t.userId, (laborByUser.get(t.userId) ?? 0) + cost);
    }
    const top = [...laborByUser.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      perProjectTopUser.set(p.id, top[0]);
      topUserIds.add(top[0]);
    }
    const row: ProjRow = {
      code: p.code,
      name: p.name,
      link,
      marginPct: Math.round(metrics.marginPct * 10) / 10,
      budgetPct: Math.round((metrics.actualCost / p.contractValue) * 100),
      costTopUser: null,
    };
    if (metrics.marginPct < settings.lowMarginPct) {
      lowMargin.push(row);
      allowedLinks.add(link);
    }
    if ((metrics.actualCost / p.contractValue) * 100 >= settings.budgetOverrunPct) {
      overBudget.push(row);
      allowedLinks.add(link);
    }
  }
  // Resolve top-contributor names in one query.
  const nameById = new Map<string, string>();
  if (topUserIds.size > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...topUserIds] } },
      select: { id: true, name: true },
    });
    for (const u of users) nameById.set(u.id, u.name);
  }
  const fillTopUser = (rows: ProjRow[], byId: Map<string, string>) => {
    for (const r of rows) {
      const pid = projects.find((p) => p.code === r.code)?.id;
      const uid = pid ? perProjectTopUser.get(pid) : undefined;
      r.costTopUser = uid ? byId.get(uid) ?? null : null;
    }
  };
  fillTopUser(lowMargin, nameById);
  fillTopUser(overBudget, nameById);
  lowMargin.sort((a, b) => a.marginPct - b.marginPct);
  overBudget.sort((a, b) => b.budgetPct - a.budgetPct);
  delayed.sort((a, b) => b.daysOverdue - a.daysOverdue);

  // --- Billing: overdue + due this week --------------------------------------
  const in7 = new Date(nowMs + 7 * DAY_MS);
  // Uncapped shared fetch (billing-facts) so these totals are exact and always
  // match the assistant's get_billing_status numbers.
  const openMilestones = (await fetchOpenMilestones()).filter(
    (ms) => ms.dueDate !== null && ms.dueDate.getTime() <= in7.getTime(),
  );
  let overdueAmount = 0;
  let overdueCount = 0;
  let dueSoonAmount = 0;
  let dueSoonCount = 0;
  const overdueTop: Record<string, unknown>[] = [];
  const dueSoonTop: Record<string, unknown>[] = [];
  for (const ms of openMilestones) {
    if (!ms.dueDate) continue;
    const amount = ms.amount;
    const link = `/projects/${ms.project.id}?tab=billing`;
    if (ms.dueDate.getTime() < nowMs) {
      overdueCount++;
      overdueAmount += amount;
      if (overdueTop.length < 3) {
        overdueTop.push({
          project: `${ms.project.code} ${ms.project.name}`,
          milestone: ms.name,
          amount: fmtIDR(amount),
          daysOverdue: Math.floor((nowMs - ms.dueDate.getTime()) / DAY_MS),
          status: ms.status,
          link,
        });
        allowedLinks.add(link);
      }
    } else {
      dueSoonCount++;
      dueSoonAmount += amount;
      if (dueSoonTop.length < 3) {
        dueSoonTop.push({
          project: `${ms.project.code} ${ms.project.name}`,
          milestone: ms.name,
          amount: fmtIDR(amount),
          dueDate: ms.dueDate.toISOString().slice(0, 10),
          status: ms.status,
          link,
        });
        allowedLinks.add(link);
      }
    }
  }

  // --- Timesheets: pending approvals + late submitters -----------------------
  const [pendingAgg, pendingUsers] = await Promise.all([
    prisma.timesheet.aggregate({
      where: { status: "SUBMITTED" },
      _count: { _all: true },
      _min: { workDate: true },
    }),
    prisma.timesheet.groupBy({ by: ["userId"], where: { status: "SUBMITTED" } }),
  ]);
  const lateCutoff = new Date(nowMs - settings.lateTimesheetDays * DAY_MS);
  const deliveryUsers = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
    select: { id: true, name: true },
  });
  const recentRows = await prisma.timesheet.findMany({
    where: { userId: { in: deliveryUsers.map((u) => u.id) }, workDate: { gte: lateCutoff } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const hasRecent = new Set(recentRows.map((r) => r.userId));
  const lateUsers = deliveryUsers.filter((u) => !hasRecent.has(u.id));

  // --- Hours trend: last completed WIB week vs the week before ---------------
  const monday = currentWeekMondayWIB(now);
  const lastWeekStart = new Date(monday.getTime() - 7 * DAY_MS);
  const prevWeekStart = new Date(monday.getTime() - 14 * DAY_MS);
  const [lastWeekAgg, prevWeekAgg] = await Promise.all([
    prisma.timesheet.aggregate({
      where: { status: "APPROVED", workDate: { gte: lastWeekStart, lt: monday } },
      _sum: { hours: true },
    }),
    prisma.timesheet.aggregate({
      where: { status: "APPROVED", workDate: { gte: prevWeekStart, lt: lastWeekStart } },
      _sum: { hours: true },
    }),
  ]);
  const lastWeekHours = lastWeekAgg._sum.hours ?? 0;
  const prevWeekHours = prevWeekAgg._sum.hours ?? 0;

  const oldestPending = pendingAgg._min.workDate
    ? Math.floor((nowMs - pendingAgg._min.workDate.getTime()) / DAY_MS)
    : null;

  const facts = {
    generatedForWeek: isoWeekKeyWIB(now),
    projectAlerts: {
      lowMarginThresholdPct: settings.lowMarginPct,
      lowMarginProjects: lowMargin.slice(0, 5),
      budgetOverrunThresholdPct: settings.budgetOverrunPct,
      overBudgetProjects: overBudget.slice(0, 5),
      delayedProjects: delayed.slice(0, 5),
      delayedCount: delayed.length,
    },
    billing: {
      overdue: { count: overdueCount, totalAmount: fmtIDR(overdueAmount), top: overdueTop },
      dueWithin7Days: { count: dueSoonCount, totalAmount: fmtIDR(dueSoonAmount), top: dueSoonTop },
    },
    timesheets: {
      pendingApprovalEntries: pendingAgg._count._all,
      pendingApprovalPeople: pendingUsers.length,
      oldestPendingEntryAgeDays: oldestPending,
      lateSubmitters: {
        count: lateUsers.length,
        names: lateUsers.slice(0, 5).map((u) => u.name),
        thresholdDays: settings.lateTimesheetDays,
      },
      approvedHoursLastWeek: Math.round(lastWeekHours * 10) / 10,
      approvedHoursWeekBefore: Math.round(prevWeekHours * 10) / 10,
    },
    links: {
      alertsPage: "/alerts",
      timesheets: "/timesheets",
    },
  };
  return { facts, allowedLinks };
}

const digestLlmSchema = GenerateAiWeeklyDigestResponse.pick({
  headline: true,
  highlights: true,
  narrative: true,
});

function rowToResult(row: { id: string; generatedAt: Date; model: string; payload: Prisma.JsonValue }): WeeklyDigestResult {
  const payload = row.payload as unknown as Pick<WeeklyDigestResult, "headline" | "highlights" | "narrative">;
  return {
    weekKey: row.id,
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    headline: payload.headline,
    highlights: payload.highlights ?? [],
    narrative: payload.narrative,
  };
}

export async function getLatestDigest(): Promise<WeeklyDigestResult | null> {
  const row = await prisma.aiWeeklyDigest.findFirst({ orderBy: { generatedAt: "desc" } });
  return row ? rowToResult(row) : null;
}

export async function generateWeeklyDigest(opts: { force: boolean }): Promise<WeeklyDigestResult> {
  const now = new Date();
  const weekKey = isoWeekKeyWIB(now);
  const existing = await prisma.aiWeeklyDigest.findUnique({ where: { id: weekKey } });
  if (existing && !opts.force) return rowToResult(existing);

  const { facts, allowedLinks } = await buildWeeklyDigestFacts();
  const system = [
    "You write the Monday operations digest for the management of a cybersecurity consulting firm (project profitability platform).",
    "Write in clear, direct English.",
    "STRICT RULES:",
    "- Use ONLY the facts JSON. Never invent projects, people, numbers, or dates. Copy money strings verbatim.",
    "- Pick the 3-6 MOST important items as highlights, ordered most critical first.",
    "- severity: CRITICAL for negative margin / heavily overdue money / budget exceeded; WARNING for thin margins, due-soon invoices, delays; INFO for routine follow-ups.",
    '- Each highlight\'s "link" must be copied EXACTLY from a "link" field in the facts (or use "/timesheets" for timesheet items); if none applies use null.',
    "- If everything looks healthy, say so honestly (severity INFO).",
    'Output STRICT JSON only: {"headline": string (one sentence), "highlights": [{"title": string (short), "detail": string (numbers verbatim), "severity": "CRITICAL"|"WARNING"|"INFO", "link": string|null}], "narrative": string (2-4 sentences, plain text)}',
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Weekly FACTS (authoritative, do not alter):\n${JSON.stringify(facts)}` },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw) throw new Error("Empty AI response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI response was not valid JSON");
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as { highlights?: unknown };
    if (Array.isArray(obj.highlights)) obj.highlights = obj.highlights.slice(0, 6);
  }
  const digest = digestLlmSchema.parse(parsed);
  // The model may only cite links that exist in the facts — anything else is dropped.
  for (const h of digest.highlights) {
    if (h.link && !allowedLinks.has(h.link)) h.link = null;
  }

  const generatedAt = now.toISOString();
  const payload = digest as unknown as Prisma.InputJsonValue;
  // Create-first: the unique weekKey row makes the DB pick exactly one winner
  // even when the scheduler and a manual regenerate race. Only the winner
  // notifies management; a concurrent loser updates content only when the
  // caller explicitly asked to regenerate (force).
  let createdNewWeek = false;
  try {
    await prisma.aiWeeklyDigest.create({
      data: { id: weekKey, generatedAt: now, model: MODEL, payload },
    });
    createdNewWeek = true;
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") throw err;
    if (opts.force) {
      await prisma.aiWeeklyDigest.update({
        where: { id: weekKey },
        data: { generatedAt: now, model: MODEL, payload },
      });
    }
  }

  // Notify management exactly once per week (only the creator of the row).
  if (createdNewWeek) {
    const mgmt = await prisma.user.findMany({
      where: { role: "MANAGEMENT", deletedAt: null, isActive: true },
      select: { id: true },
    });
    for (const m of mgmt) {
      try {
        await notifyUser({
          userId: m.id,
          type: "WEEKLY_DIGEST",
          title: "Weekly AI digest ready",
          message: digest.headline.slice(0, 300),
          link: "/alerts",
        });
      } catch {
        // Best-effort: a notification failure must not fail digest generation.
      }
    }
  }

  return { weekKey, generatedAt, model: MODEL, ...digest };
}

/**
 * Scheduler hook: generate this week's digest once we're past Monday 07:00 WIB
 * and no digest exists yet for the current ISO week. Runs inside the hourly
 * notification claim, so at most one instance attempts it per hour; the unique
 * weekKey row makes it idempotent even across racing instances.
 */
export async function maybeGenerateWeeklyDigest(): Promise<WeeklyDigestResult | null> {
  const now = new Date();
  const monday7amWIB = new Date(currentWeekMondayWIB(now).getTime() + 7 * 3_600_000);
  if (now < monday7amWIB) return null;
  const weekKey = isoWeekKeyWIB(now);
  const existing = await prisma.aiWeeklyDigest.findUnique({ where: { id: weekKey }, select: { id: true } });
  if (existing) return null;
  return generateWeeklyDigest({ force: false });
}
