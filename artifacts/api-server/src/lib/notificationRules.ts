import { prisma } from "@workspace/db";
import { notifyUser } from "./notifications.js";
import { getAppSettings } from "./app-settings.js";

/**
 * Notification rules engine.
 *
 * Each `check*` function looks for projects/milestones/users that match a
 * business rule, then creates one notification per affected user — but only
 * if an equivalent notification hasn't already been created today (dedup by
 * type + recent createdAt + link).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function alreadyNotifiedToday(opts: { userId: string; type: string; link?: string | null }) {
  const since = new Date(Date.now() - ONE_DAY_MS);
  const existing = await prisma.notification.findFirst({
    where: {
      userId: opts.userId,
      type: opts.type,
      link: opts.link ?? null,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return !!existing;
}

async function notifyOnceDaily(opts: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}) {
  if (!opts.userId) return false;
  const dup = await alreadyNotifiedToday({ userId: opts.userId, type: opts.type, link: opts.link });
  if (dup) return false;
  await notifyUser(opts);
  return true;
}

function formatIDRShort(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} M`;
  return `Rp ${n.toFixed(0)}`;
}

/**
 * Shared cost math for the overrun/low-margin rules: approved labor cost per
 * project (and per user within it) at the project-resource dailyRate, plus
 * approved expenses. Timesheets from users without a resource row cost 0,
 * matching the original behavior of both checks.
 */
function computeProjectCosts(
  projects: { id: string; resources: { userId: string; dailyRate: number }[] }[],
  timesheets: { projectId: string; userId: string; hours: number }[],
  expenses: { projectId: string; amount: number }[],
) {
  const rate = new Map<string, number>();
  for (const p of projects) for (const r of p.resources) rate.set(`${p.id}:${r.userId}`, r.dailyRate);
  const laborByProjectUser = new Map<string, Map<string, number>>();
  const costByProject = new Map<string, number>();
  for (const t of timesheets) {
    const cost = (t.hours / 8) * (rate.get(`${t.projectId}:${t.userId}`) ?? 0);
    if (cost === 0) continue;
    let perUser = laborByProjectUser.get(t.projectId);
    if (!perUser) {
      perUser = new Map();
      laborByProjectUser.set(t.projectId, perUser);
    }
    perUser.set(t.userId, (perUser.get(t.userId) ?? 0) + cost);
    costByProject.set(t.projectId, (costByProject.get(t.projectId) ?? 0) + cost);
  }
  const expenseByProject = new Map<string, number>();
  for (const e of expenses) {
    expenseByProject.set(e.projectId, (expenseByProject.get(e.projectId) ?? 0) + e.amount);
    costByProject.set(e.projectId, (costByProject.get(e.projectId) ?? 0) + e.amount);
  }
  return { costByProject, laborByProjectUser, expenseByProject };
}

function topContributorUserIds(
  projectIds: string[],
  laborByProjectUser: Map<string, Map<string, number>>,
  perProject = 2,
): string[] {
  const ids = new Set<string>();
  for (const pid of projectIds) {
    const perUser = laborByProjectUser.get(pid);
    if (!perUser) continue;
    [...perUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, perProject)
      .forEach(([uid]) => ids.add(uid));
  }
  return [...ids];
}

async function fetchUserNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Deterministic "why" appended to cost alerts: names the top labor
 * contributors and the expense share. No AI involved — real numbers only.
 */
function costDriverSentence(
  labor: Map<string, number> | undefined,
  expenseTotal: number,
  nameById: Map<string, string>,
): string {
  const parts: string[] = [];
  if (labor && labor.size > 0) {
    const top = [...labor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    for (const [uid, cost] of top) {
      parts.push(`${nameById.get(uid) ?? "unassigned rate"} ${formatIDRShort(cost)} labor`);
    }
  }
  if (expenseTotal > 0) parts.push(`expenses ${formatIDRShort(expenseTotal)}`);
  if (parts.length === 0) return "";
  return ` Main cost drivers: ${parts.join(", ")}.`;
}

/**
 * Rule 1: Billing milestones with dueDate within the configurable
 * invoiceDueSoonDays horizon, still PLANNED or INVOICED. Notify PM of
 * project and adminProject (if assigned).
 */
async function checkInvoicesDueSoon(): Promise<number> {
  const { invoiceDueSoonDays } = await getAppSettings();
  const now = new Date();
  const horizon = new Date(now.getTime() + invoiceDueSoonDays * ONE_DAY_MS);
  const milestones = await prisma.billingMilestone.findMany({
    where: {
      status: { in: ["PLANNED", "INVOICED"] },
      dueDate: { gte: now, lte: horizon },
    },
    select: {
      id: true, name: true, status: true, dueDate: true,
      project: { select: { id: true, name: true, pmId: true, adminProjectId: true, contractValue: true, vatPercent: true, contractValueIncludesVat: true } },
      percentage: true, amount: true,
    },
  });

  let created = 0;
  for (const ms of milestones) {
    if (!ms.dueDate) continue;
    const gross = ms.amount ?? (ms.project.contractValue * (ms.percentage ?? 0)) / 100;
    const due = ms.dueDate.toISOString().slice(0, 10);
    const link = `/projects/${ms.project.id}?tab=billing`;
    const isInvoiced = ms.status === "INVOICED";
    const title = isInvoiced ? `Invoice due: ${ms.project.name}` : `Upcoming milestone: ${ms.project.name}`;
    const message = `${ms.name} — ${formatIDRShort(gross)} due ${due}.`;
    const recipients = [ms.project.pmId, ms.project.adminProjectId].filter((u): u is string => !!u);
    for (const userId of recipients) {
      if (await notifyOnceDaily({ userId, type: "INVOICE_DUE_SOON", title, message, link })) created++;
    }
  }
  return created;
}

/**
 * Rule 2: Active/Observation projects where actual cost exceeds the
 * configurable budgetOverrunPct of contract value. Notify PM + all MANAGEMENT users.
 */
async function checkProjectOverrun(): Promise<number> {
  const { budgetOverrunPct } = await getAppSettings();
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "OBSERVATION", "PAUSE"] }, contractValue: { gt: 0 } },
    select: {
      id: true, name: true, contractValue: true, pmId: true,
      resources: { select: { id: true, dailyRate: true, userId: true } },
    },
  });

  // Compute actualCost = approved timesheets × dailyRate + approved expenses
  const projectIds = projects.map((p) => p.id);
  const [timesheets, expenses] = await Promise.all([
    prisma.timesheet.findMany({
      where: { projectId: { in: projectIds }, status: "APPROVED" },
      select: { projectId: true, userId: true, hours: true },
    }),
    prisma.projectExpense.findMany({
      where: { projectId: { in: projectIds }, status: "APPROVED" },
      select: { projectId: true, amount: true },
    }),
  ]);

  const { costByProject, laborByProjectUser, expenseByProject } = computeProjectCosts(
    projects,
    timesheets,
    expenses,
  );

  const mgmt = await prisma.user.findMany({ where: { role: "MANAGEMENT", deletedAt: null }, select: { id: true } });
  const flagged = projects.filter(
    (p) => ((costByProject.get(p.id) ?? 0) / p.contractValue) * 100 >= budgetOverrunPct,
  );
  const nameById = await fetchUserNames(
    topContributorUserIds(flagged.map((f) => f.id), laborByProjectUser),
  );
  let created = 0;
  for (const p of flagged) {
    const actual = costByProject.get(p.id) ?? 0;
    const pct = (actual / p.contractValue) * 100;
    const link = `/projects/${p.id}`;
    const title = pct >= 100 ? `Budget exceeded: ${p.name}` : `Budget nearing limit: ${p.name}`;
    const cause = costDriverSentence(laborByProjectUser.get(p.id), expenseByProject.get(p.id) ?? 0, nameById);
    const message = `Actual cost has reached ${pct.toFixed(0)}% of the contract value (${formatIDRShort(actual)} / ${formatIDRShort(p.contractValue)}).${cause}`;
    const recipients = new Set<string>([...(p.pmId ? [p.pmId] : []), ...mgmt.map((m) => m.id)]);
    for (const userId of recipients) {
      if (await notifyOnceDaily({ userId, type: "PROJECT_OVERRUN", title, message, link })) created++;
    }
  }
  return created;
}

/**
 * Rule 3: KONSULTAN/TECHNICAL_WRITER who haven't submitted a timesheet within
 * the configurable lateTimesheetDays window. Notify the user themselves + their Principal.
 */
async function checkLateTimesheets(): Promise<number> {
  const { lateTimesheetDays } = await getAppSettings();
  const cutoff = new Date(Date.now() - lateTimesheetDays * ONE_DAY_MS);
  const users = await prisma.user.findMany({
    where: { deletedAt: null, role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
    select: { id: true, name: true, principalId: true },
  });
  // Batch the "has a recent timesheet" lookup into a single query instead of
  // one findFirst per user (an N+1 that dominated this check's runtime).
  const recentRows = await prisma.timesheet.findMany({
    where: { userId: { in: users.map((u) => u.id) }, workDate: { gte: cutoff } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const hasRecentTimesheet = new Set(recentRows.map((r) => r.userId));
  let created = 0;
  for (const u of users) {
    if (hasRecentTimesheet.has(u.id)) continue;
    const title = "Timesheet missing";
    const message = `You have not submitted a timesheet since ${cutoff.toISOString().slice(0, 10)}.`;
    if (await notifyOnceDaily({ userId: u.id, type: "TIMESHEET_LATE", title, message, link: "/timesheets" })) created++;
    if (u.principalId) {
      const pTitle = `Timesheet overdue: ${u.name}`;
      const pMsg = `${u.name} has not submitted a timesheet in the last ${lateTimesheetDays} day${lateTimesheetDays === 1 ? "" : "s"}.`;
      if (await notifyOnceDaily({ userId: u.principalId, type: "TIMESHEET_LATE_REPORT", title: pTitle, message: pMsg, link: `/timesheets?userId=${u.id}` })) created++;
    }
  }
  return created;
}

/**
 * Rule 4: Active/Observation projects with margin
 * (contractValue - actualCost) / contractValue below the configurable lowMarginPct.
 * Notify PM + MANAGEMENT.
 */
async function checkLowMargin(): Promise<number> {
  const { lowMarginPct } = await getAppSettings();
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "OBSERVATION", "PAUSE"] }, contractValue: { gt: 0 } },
    select: {
      id: true, name: true, contractValue: true, pmId: true,
      resources: { select: { userId: true, dailyRate: true } },
    },
  });
  const projectIds = projects.map((p) => p.id);
  const [timesheets, expenses] = await Promise.all([
    prisma.timesheet.findMany({
      where: { projectId: { in: projectIds }, status: "APPROVED" },
      select: { projectId: true, userId: true, hours: true },
    }),
    prisma.projectExpense.findMany({
      where: { projectId: { in: projectIds }, status: "APPROVED" },
      select: { projectId: true, amount: true },
    }),
  ]);
  const { costByProject, laborByProjectUser, expenseByProject } = computeProjectCosts(
    projects,
    timesheets,
    expenses,
  );
  const mgmt = await prisma.user.findMany({ where: { role: "MANAGEMENT", deletedAt: null }, select: { id: true } });
  const flagged = projects.filter((p) => {
    const actual = costByProject.get(p.id) ?? 0;
    if (actual === 0) return false; // skip "0 cost" projects
    return ((p.contractValue - actual) / p.contractValue) * 100 < lowMarginPct;
  });
  const nameById = await fetchUserNames(
    topContributorUserIds(flagged.map((f) => f.id), laborByProjectUser),
  );
  let created = 0;
  for (const p of flagged) {
    const actual = costByProject.get(p.id) ?? 0;
    const profit = p.contractValue - actual;
    const marginPct = (profit / p.contractValue) * 100;
    const title = marginPct < 0 ? `Negative margin: ${p.name}` : `Thin margin: ${p.name}`;
    const cause = costDriverSentence(laborByProjectUser.get(p.id), expenseByProject.get(p.id) ?? 0, nameById);
    const message = `Current margin is ${marginPct.toFixed(1)}% (${formatIDRShort(profit)} of ${formatIDRShort(p.contractValue)}).${cause}`;
    const link = `/projects/${p.id}`;
    const recipients = new Set<string>([...(p.pmId ? [p.pmId] : []), ...mgmt.map((m) => m.id)]);
    for (const userId of recipients) {
      if (await notifyOnceDaily({ userId, type: "LOW_MARGIN", title, message, link })) created++;
    }
  }
  return created;
}

export async function runAllNotificationChecks(): Promise<{
  invoicesDueSoon: number;
  projectOverrun: number;
  lateTimesheets: number;
  lowMargin: number;
  total: number;
}> {
  const [invoicesDueSoon, projectOverrun, lateTimesheets, lowMargin] = await Promise.all([
    checkInvoicesDueSoon(),
    checkProjectOverrun(),
    checkLateTimesheets(),
    checkLowMargin(),
  ]);
  return {
    invoicesDueSoon,
    projectOverrun,
    lateTimesheets,
    lowMargin,
    total: invoicesDueSoon + projectOverrun + lateTimesheets + lowMargin,
  };
}
