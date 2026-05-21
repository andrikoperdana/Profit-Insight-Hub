import { prisma } from "@workspace/db";
import { notifyUser } from "./notifications.js";

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
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  return `Rp ${n.toFixed(0)}`;
}

/**
 * Rule 1: Billing milestones with dueDate within next 7 days, still PLANNED
 * or INVOICED. Notify PM of project and adminProject (if assigned).
 */
async function checkInvoicesDueSoon(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * ONE_DAY_MS);
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
    const title = isInvoiced ? `Invoice jatuh tempo: ${ms.project.name}` : `Termin akan datang: ${ms.project.name}`;
    const message = `${ms.name} — ${formatIDRShort(gross)} jatuh tempo ${due}.`;
    const recipients = [ms.project.pmId, ms.project.adminProjectId].filter((u): u is string => !!u);
    for (const userId of recipients) {
      if (await notifyOnceDaily({ userId, type: "INVOICE_DUE_SOON", title, message, link })) created++;
    }
  }
  return created;
}

/**
 * Rule 2: Active/Observation projects where actual cost > 80% of contract
 * value. Notify PM + all MANAGEMENT users.
 */
async function checkProjectOverrun(): Promise<number> {
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

  const rateByProjectUser = new Map<string, number>();
  for (const p of projects) {
    for (const r of p.resources) rateByProjectUser.set(`${p.id}:${r.userId}`, r.dailyRate);
  }
  const costByProject = new Map<string, number>();
  for (const t of timesheets) {
    const rate = rateByProjectUser.get(`${t.projectId}:${t.userId}`) ?? 0;
    costByProject.set(t.projectId, (costByProject.get(t.projectId) ?? 0) + (t.hours / 8) * rate);
  }
  for (const e of expenses) {
    costByProject.set(e.projectId, (costByProject.get(e.projectId) ?? 0) + e.amount);
  }

  const mgmt = await prisma.user.findMany({ where: { role: "MANAGEMENT", deletedAt: null }, select: { id: true } });
  let created = 0;
  for (const p of projects) {
    const actual = costByProject.get(p.id) ?? 0;
    const pct = (actual / p.contractValue) * 100;
    if (pct < 80) continue;
    const link = `/projects/${p.id}`;
    const title = pct >= 100 ? `Budget terlampaui: ${p.name}` : `Budget mendekati limit: ${p.name}`;
    const message = `Realisasi biaya sudah ${pct.toFixed(0)}% dari nilai kontrak (${formatIDRShort(actual)} / ${formatIDRShort(p.contractValue)}).`;
    const recipients = new Set<string>([...(p.pmId ? [p.pmId] : []), ...mgmt.map((m) => m.id)]);
    for (const userId of recipients) {
      if (await notifyOnceDaily({ userId, type: "PROJECT_OVERRUN", title, message, link })) created++;
    }
  }
  return created;
}

/**
 * Rule 3: KONSULTAN/TECHNICAL_WRITER who haven't submitted a timesheet in 3+
 * days (no DRAFT or SUBMITTED/APPROVED with workDate within last 3 days).
 * Notify the user themselves + their PM (via principal/manager).
 */
async function checkLateTimesheets(): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * ONE_DAY_MS);
  const users = await prisma.user.findMany({
    where: { deletedAt: null, role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
    select: { id: true, name: true, principalId: true },
  });
  let created = 0;
  for (const u of users) {
    const recent = await prisma.timesheet.findFirst({
      where: { userId: u.id, workDate: { gte: cutoff } },
      select: { id: true },
    });
    if (recent) continue;
    const title = "Timesheet belum diisi";
    const message = `Anda belum mengisi timesheet sejak ${cutoff.toISOString().slice(0, 10)}.`;
    if (await notifyOnceDaily({ userId: u.id, type: "TIMESHEET_LATE", title, message, link: "/timesheets" })) created++;
    if (u.principalId) {
      const pTitle = `Timesheet terlambat: ${u.name}`;
      const pMsg = `${u.name} belum submit timesheet dalam 3 hari terakhir.`;
      if (await notifyOnceDaily({ userId: u.principalId, type: "TIMESHEET_LATE_REPORT", title: pTitle, message: pMsg, link: `/timesheets?userId=${u.id}` })) created++;
    }
  }
  return created;
}

/**
 * Rule 4: Active/Observation projects with margin (contractValue - actualCost) / contractValue < 15%.
 * Notify PM + MANAGEMENT.
 */
async function checkLowMargin(): Promise<number> {
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
  const rateMap = new Map<string, number>();
  for (const p of projects) for (const r of p.resources) rateMap.set(`${p.id}:${r.userId}`, r.dailyRate);
  const costByProject = new Map<string, number>();
  for (const t of timesheets) {
    const rate = rateMap.get(`${t.projectId}:${t.userId}`) ?? 0;
    costByProject.set(t.projectId, (costByProject.get(t.projectId) ?? 0) + (t.hours / 8) * rate);
  }
  for (const e of expenses) {
    costByProject.set(e.projectId, (costByProject.get(e.projectId) ?? 0) + e.amount);
  }
  const mgmt = await prisma.user.findMany({ where: { role: "MANAGEMENT", deletedAt: null }, select: { id: true } });
  let created = 0;
  for (const p of projects) {
    const actual = costByProject.get(p.id) ?? 0;
    if (actual === 0) continue; // skip "0 cost" projects
    const profit = p.contractValue - actual;
    const marginPct = (profit / p.contractValue) * 100;
    if (marginPct >= 15) continue;
    const title = marginPct < 0 ? `Margin negatif: ${p.name}` : `Margin tipis: ${p.name}`;
    const message = `Margin saat ini ${marginPct.toFixed(1)}% (${formatIDRShort(profit)} dari ${formatIDRShort(p.contractValue)}).`;
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
