import type { Prisma } from "@workspace/db";
import { getOverheadMultiplier } from "./overhead.js";
import { splitVat } from "./invoicing.js";

export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    client: true;
    sales: true;
    pm: true;
    technicalWriter: true;
    adminProject: true;
    resources: { include: { user: true; rates: true } };
    timesheets: { include: { user: true } };
    expenses: true;
    raidItems: true;
    billingMilestones: true;
  };
}>;

type UserBasic = Prisma.UserGetPayload<object>;

export interface ProjectMetrics {
  actualMandays: number;
  resourceCost: number;
  additionalCost: number;
  actualCost: number;
  actualProfit: number;
  marginPct: number;
  estimatedProfit: number;
  // PSAK 72 / ASC 606 — recognized revenue based on burn rate (POC method)
  burnRatePct: number;
  recognizedRevenue: number;
  // Accrual accounting — costs from SUBMITTED + APPROVED timesheets
  accruedCost: number;
  // Net (fully-loaded) cost & margin via OVERHEAD_MULTIPLIER env
  overheadMultiplier: number;
  loadedResourceCost: number;
  netActualCost: number;
  netActualProfit: number;
  netMarginPct: number;
  // DPP/PPN — net revenue (DPP) excluding VAT
  vatPercent: number;
  contractValueIncludesVat: boolean;
  revenueNet: number;
  vatAmount: number;
  currency: string;
  exchangeRate: number;
}

export function computeMetrics(project: ProjectWithRelations): ProjectMetrics {
  // Map userId -> rate resolution from resources. `dailyRate` is the
  // denormalized current cost rate; when a resource has append-only rate
  // history rows (ProjectResourceRate), the rate charged for a timesheet is
  // the newest history row whose effectiveFrom <= workDate. Timesheets dated
  // before the earliest history row (and resources with no history at all)
  // fall back to `dailyRate`, so projects without history behave exactly as
  // before.
  type RatePeriod = { costRate: number; effectiveFrom: Date };
  const rateMap = new Map<string, { dailyRate: number; periods: RatePeriod[] }>();
  for (const r of project.resources) {
    const periods = (((r as { rates?: RatePeriod[] }).rates ?? []) as RatePeriod[])
      .slice()
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
    rateMap.set(r.userId, { dailyRate: r.dailyRate, periods });
  }
  const rateFor = (userId: string, workDate: Date, fallback: number): number => {
    const entry = rateMap.get(userId);
    if (!entry) return fallback;
    const t = workDate.getTime();
    for (const p of entry.periods) {
      if (p.effectiveFrom.getTime() <= t) return p.costRate;
    }
    return entry.dailyRate;
  };

  let actualMandays = 0;
  let resourceCost = 0;
  let accruedResourceCost = 0;
  for (const ts of project.timesheets) {
    const days = ts.hours / 8;
    const rate = rateFor(ts.userId, ts.workDate, ts.user?.dailyRate ?? 0);
    if (ts.status === "APPROVED") {
      actualMandays += days;
      resourceCost += days * rate;
      accruedResourceCost += days * rate;
    } else if (ts.status === "SUBMITTED") {
      // Accrual: include submitted-but-not-yet-approved labor as accrued cost
      accruedResourceCost += days * rate;
    }
  }
  // Only APPROVED expenses count toward actualCost. PENDING/REJECTED expenses
  // are visible in the Expenses tab for transparency but never inflate the
  // project's reported cost or shrink margin until a PM/MGMT approves them.
  // Settled cash advances count at their settled (actual) amount instead of
  // the original advance.
  const additionalCost = (project.expenses ?? []).reduce(
    (sum, e) =>
      sum +
      ((e as any).status === "APPROVED"
        ? ((e as any).settledAmount ?? e.amount ?? 0)
        : 0),
    0,
  );
  const actualCost = resourceCost + additionalCost;
  const actualProfit = project.contractValue - actualCost;
  const marginPct =
    project.contractValue > 0
      ? (actualProfit / project.contractValue) * 100
      : 0;
  const estimatedProfit = project.contractValue - project.estimatedCost;

  // DPP (net revenue) vs gross including PPN
  const vatPercent = (project as any).vatPercent ?? 11;
  const contractValueIncludesVat = (project as any).contractValueIncludesVat ?? true;
  const { dpp: revenueNet, vat: vatAmount } = splitVat(
    project.contractValue,
    vatPercent,
    contractValueIncludesVat,
  );

  // Recognized revenue (PSAK 72 / ASC 606) — % completion via mandays burn
  const burnRatePct =
    project.plannedMandays > 0
      ? Math.min((actualMandays / project.plannedMandays) * 100, 100)
      : 0;
  const recognizedRevenue = (burnRatePct / 100) * revenueNet;

  // Accrued cost: include submitted-pending-approval labor + all expenses
  const accruedCost = accruedResourceCost + additionalCost;

  // Net (fully-loaded) cost via overhead loader
  const overheadMultiplier = getOverheadMultiplier();
  const loadedResourceCost = resourceCost * overheadMultiplier;
  const netActualCost = loadedResourceCost + additionalCost;
  const netActualProfit = revenueNet - netActualCost;
  const netMarginPct =
    revenueNet > 0 ? (netActualProfit / revenueNet) * 100 : 0;

  return {
    actualMandays,
    resourceCost,
    additionalCost,
    actualCost,
    actualProfit,
    marginPct,
    estimatedProfit,
    burnRatePct,
    recognizedRevenue,
    accruedCost,
    overheadMultiplier,
    loadedResourceCost,
    netActualCost,
    netActualProfit,
    netMarginPct,
    vatPercent,
    contractValueIncludesVat,
    revenueNet,
    vatAmount,
    currency: (project as any).currency ?? "IDR",
    exchangeRate: (project as any).exchangeRate ?? 1,
  };
}

type UserWithRels = UserBasic & {
  businessUnit?: { id: string; name: string } | null;
  skills?: { skill: { id: string; name: string; category: string | null }; proficiency: number }[];
};

export function serializeUser(u: UserBasic) {
  const ux = u as UserWithRels;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    title: u.title,
    dailyRate: u.dailyRate,
    seniority: (u as any).seniority ?? null,
    businessUnitId: (u as any).businessUnitId ?? null,
    businessUnitName: ux.businessUnit?.name ?? null,
    skills:
      ux.skills?.map((s) => ({
        skillId: s.skill.id,
        name: s.skill.name,
        category: s.skill.category,
        proficiency: s.proficiency,
      })) ?? [],
    isActive: u.isActive,
    avatarDataUrl: (u as any).avatarDataUrl ?? null,
    managerId: (u as any).managerId ?? null,
    principalId: (u as any).principalId ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * Roles that must NOT see commercial figures (contractValue, costs, margin,
 * profit, estimatedCost). Mirrors `canViewProjectFinancials` on the frontend.
 */
const FINANCIALS_BLOCKED_ROLES = new Set<string>([
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
  "HR",
]);

export function canViewProjectFinancials(role: string | null | undefined): boolean {
  return !!role && !FINANCIALS_BLOCKED_ROLES.has(role);
}

/**
 * Daily rate visibility on project resources is strictly limited to
 * Management and Project Manager. Everyone else (Finance, HR, Sales,
 * Admin Project, Site Admin, Principals, Consultants, Technical Writers)
 * sees 0. Finance reconciles invoices via aggregate financials, not per-
 * person rates; HR manages rates only in the Employees directory.
 */
const DAILY_RATE_ALLOWED_ROLES = new Set<string>([
  "MANAGEMENT",
  "PROJECT_MANAGER",
  "SUPER_ADMIN",
]);

export function canViewDailyRate(role: string | null | undefined): boolean {
  return !!role && DAILY_RATE_ALLOWED_ROLES.has(role);
}

export function serializeProject(project: ProjectWithRelations, callerRole?: string | null) {
  const m = computeMetrics(project);
  const includeFinancials = canViewProjectFinancials(callerRole ?? "MANAGEMENT");
  const health = includeFinancials ? computeHealthScore(project, m) : null;
  const profitOutlook = includeFinancials ? computeProfitOutlook(project, m) : null;
  const financials = includeFinancials
    ? {
        contractValue: project.contractValue,
        estimatedCost: project.estimatedCost,
        estimatedProfit: m.estimatedProfit,
        actualCost: m.actualCost,
        resourceCost: m.resourceCost,
        additionalCost: m.additionalCost,
        actualProfit: m.actualProfit,
        marginPct: m.marginPct,
        vatPercent: m.vatPercent,
        contractValueIncludesVat: m.contractValueIncludesVat,
        currency: m.currency,
        exchangeRate: m.exchangeRate,
        revenueNet: m.revenueNet,
        vatAmount: m.vatAmount,
        recognizedRevenue: m.recognizedRevenue,
        accruedCost: m.accruedCost,
        loadedResourceCost: m.loadedResourceCost,
        netActualCost: m.netActualCost,
        netActualProfit: m.netActualProfit,
        netMarginPct: m.netMarginPct,
        overheadMultiplier: m.overheadMultiplier,
      }
    : {
        contractValue: 0,
        estimatedCost: 0,
        estimatedProfit: 0,
        actualCost: 0,
        resourceCost: 0,
        additionalCost: 0,
        actualProfit: 0,
        marginPct: 0,
        vatPercent: 0,
        contractValueIncludesVat: true,
        revenueNet: 0,
        vatAmount: 0,
        recognizedRevenue: 0,
        accruedCost: 0,
        loadedResourceCost: 0,
        netActualCost: 0,
        netActualProfit: 0,
        netMarginPct: 0,
        overheadMultiplier: 1,
      };
  return {
    id: project.id,
    projectId: (project as any).projectId ?? null,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
    kind: project.kind,
    clientId: project.clientId,
    clientName: project.client.name,
    salesId: project.salesId,
    salesName: project.sales?.name ?? null,
    pmId: project.pmId,
    pmName: project.pm?.name ?? null,
    technicalWriterId: project.technicalWriterId ?? null,
    technicalWriterName: project.technicalWriter?.name ?? null,
    adminProjectId: project.adminProjectId ?? null,
    adminProjectName: project.adminProject?.name ?? null,
    reportCoverUrl: project.reportCoverUrl ?? null,
    reportLink: project.reportLink ?? null,
    reportSubmittedAt: project.reportSubmittedAt?.toISOString() ?? null,
    spkFileUrl: project.spkFileUrl ?? null,
    spkFileName: project.spkFileName ?? null,
    contractFileUrl: project.contractFileUrl ?? null,
    contractFileName: project.contractFileName ?? null,
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
    plannedMandays: project.plannedMandays,
    actualMandays: m.actualMandays,
    ...financials,
    healthScore: health?.score ?? null,
    healthLabel: health?.label ?? null,
    healthComponents: health?.components ?? null,
    healthReasons: health?.reasons ?? null,
    profitOutlook,
    lastStatusReason: project.lastStatusReason ?? null,
    useWorkstreams: (project as any).useWorkstreams ?? false,
    createdAt: project.createdAt.toISOString(),
  };
}

export const projectInclude = {
  client: true,
  sales: true,
  pm: true,
  technicalWriter: true,
  adminProject: true,
  resources: { include: { user: true, rates: true } },
  timesheets: { include: { user: true } },
  expenses: true,
  raidItems: true,
  billingMilestones: true,
} as const;

/**
 * Minimal selection containing only the fields `computeMetrics` reads. Use this
 * for portfolio aggregations (e.g. dashboard summary / profit-trend) instead of
 * `projectInclude`, which eagerly loads full user rows (including base64
 * avatars), RAID items, billing milestones, etc. for every project — large
 * payloads that aggregation never needs. Numbers are identical because the same
 * `computeMetrics` runs over the result.
 */
export const projectMetricsSelect = {
  id: true,
  status: true,
  contractValue: true,
  plannedMandays: true,
  estimatedCost: true,
  vatPercent: true,
  contractValueIncludesVat: true,
  currency: true,
  exchangeRate: true,
  resources: {
    select: {
      userId: true,
      dailyRate: true,
      rates: { select: { costRate: true, effectiveFrom: true } },
    },
  },
  timesheets: {
    select: {
      hours: true,
      status: true,
      userId: true,
      workDate: true,
      user: { select: { dailyRate: true } },
    },
  },
  expenses: { select: { amount: true, status: true, settledAmount: true } },
} as const;

/**
 * Project Health Score (0-100). Operational + financial composite signal.
 *
 * Components (max points):
 *   - Margin (30): how actual margin tracks vs estimated margin
 *   - RAID (20): penalty per OPEN/MITIGATING CRITICAL or HIGH-impact item
 *   - Expenses (15): penalty per PENDING expense awaiting decision
 *   - Billing (20): penalty per overdue milestone (past due, not PAID/CANCELLED)
 *   - Schedule (15): penalty when endDate has passed and project is not
 *     COMPLETE/CLOSED, scaled by days overdue (capped)
 *
 * Score is only meaningful for ACTIVE / OBSERVATION / PAUSE / COMPLETE.
 * DRAFT and CLOSED return null (caller should hide the badge).
 */
export interface HealthScore {
  score: number;
  label: "HEALTHY" | "AT_RISK" | "CRITICAL";
  components: {
    margin: number;
    raid: number;
    expenses: number;
    billing: number;
    schedule: number;
  };
  reasons: string[];
}

export function computeHealthScore(
  project: ProjectWithRelations,
  metrics: ProjectMetrics,
): HealthScore | null {
  // Health measures execution health (margin erosion vs actuals, overdue
  // billing/schedule, open RAID, pending expenses). It is only meaningful once
  // delivery has started, so it is withheld until ACTIVE. DRAFT/OBSERVATION are
  // still planning phases; CLOSED is archived.
  if (
    project.status === "DRAFT" ||
    project.status === "OBSERVATION" ||
    project.status === "CLOSED"
  )
    return null;
  const reasons: string[] = [];
  const now = Date.now();

  // --- Margin (30 pts) -------------------------------------------------------
  // If we have no estimated cost, treat margin component as full (no signal).
  // Otherwise compare actual margin to estimated margin; penalize proportionally
  // for each percentage point of margin erosion, up to 30 pts.
  let marginPts = 30;
  if (project.contractValue > 0 && project.estimatedCost > 0) {
    const estimatedMarginPct =
      ((project.contractValue - project.estimatedCost) / project.contractValue) * 100;
    const drop = estimatedMarginPct - metrics.marginPct;
    if (drop > 0) {
      marginPts = Math.max(0, 30 - Math.round(drop * 1.5));
      if (drop >= 5) reasons.push(`Margin ${metrics.marginPct.toFixed(1)}% vs estimated ${estimatedMarginPct.toFixed(1)}%`);
    }
  }

  // --- RAID (20 pts) ---------------------------------------------------------
  let raidPts = 20;
  let raidCritical = 0;
  let raidHigh = 0;
  for (const r of project.raidItems ?? []) {
    if (r.status === "CLOSED") continue;
    if (r.impact === "CRITICAL") raidCritical++;
    else if (r.impact === "HIGH") raidHigh++;
  }
  const raidPenalty = raidCritical * 5 + raidHigh * 2;
  raidPts = Math.max(0, 20 - raidPenalty);
  if (raidCritical > 0) reasons.push(`${raidCritical} critical RAID item${raidCritical > 1 ? "s" : ""} open`);
  if (raidHigh > 0) reasons.push(`${raidHigh} high-impact RAID item${raidHigh > 1 ? "s" : ""} open`);

  // --- Expenses (15 pts) -----------------------------------------------------
  const pendingExpenses = (project.expenses ?? []).filter(
    (e) => (e as any).status === "PENDING",
  ).length;
  const expensesPts = Math.max(0, 15 - pendingExpenses * 3);
  if (pendingExpenses > 0) reasons.push(`${pendingExpenses} pending expense${pendingExpenses > 1 ? "s" : ""} awaiting approval`);

  // --- Billing (20 pts) ------------------------------------------------------
  let overdueMilestones = 0;
  for (const m of project.billingMilestones ?? []) {
    if (m.status === "PAID" || m.status === "CANCELLED") continue;
    if (m.dueDate && m.dueDate.getTime() < now) overdueMilestones++;
  }
  const billingPts = Math.max(0, 20 - overdueMilestones * 5);
  if (overdueMilestones > 0) reasons.push(`${overdueMilestones} overdue billing milestone${overdueMilestones > 1 ? "s" : ""}`);

  // --- Schedule (15 pts) -----------------------------------------------------
  let schedulePts = 15;
  if (
    project.endDate &&
    project.endDate.getTime() < now &&
    project.status !== "COMPLETE"
  ) {
    const daysOverdue = Math.floor((now - project.endDate.getTime()) / 86400_000);
    schedulePts = Math.max(0, 15 - Math.min(15, daysOverdue));
    if (daysOverdue > 0) reasons.push(`${daysOverdue} day${daysOverdue > 1 ? "s" : ""} past end date`);
  }

  const score = marginPts + raidPts + expensesPts + billingPts + schedulePts;
  const label: HealthScore["label"] =
    score >= 80 ? "HEALTHY" : score >= 60 ? "AT_RISK" : "CRITICAL";

  return {
    score,
    label,
    components: {
      margin: marginPts,
      raid: raidPts,
      expenses: expensesPts,
      billing: billingPts,
      schedule: schedulePts,
    },
    reasons,
  };
}

// --- Profit outlook --------------------------------------------------------
// A plain-language "will this project make a profit?" view that compares three
// snapshots: the initial estimate captured at intake, the actual result so far,
// and the projected final result. Used by the Profit Outlook panel.

export type ProfitOutlookStatus = "PROFIT" | "THIN" | "LOSS_RISK" | "EARLY";

export interface ProfitOutlook {
  status: ProfitOutlookStatus;
  contractValue: number;
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
  actualCost: number;
  actualProfit: number;
  actualMarginPct: number;
  forecastCost: number;
  forecastProfit: number;
  forecastMarginPct: number;
  // Percentage of planned work completed so far (mandays burn). Drives the
  // "X% of work done" caption and the "too early to tell" guard.
  progressPct: number;
}

// A project whose projected final margin is below this percentage is flagged as
// having a "thin" margin; a projected loss is flagged as a loss risk.
const THIN_MARGIN_PCT = 10;

// Below this much logged progress the burn-rate sample is too small to trust, so
// the projection is shown as "too early to tell" instead of a hard profit/loss
// verdict (avoids alarming verdicts from one or two early high-rate timesheets).
const EARLY_PROGRESS_PCT = 20;

/**
 * Linear burn-rate projection of the final cost: scale the observed average
 * daily rate across the full planned mandays, then add fixed expenses. Returns
 * the burn-rate forecast regardless of whether any work has been logged yet.
 */
export function computeBurnRateForecast(
  project: ProjectWithRelations,
  metrics: ProjectMetrics,
): { forecastCost: number; forecastProfit: number } {
  const projectedMandays = Math.max(project.plannedMandays, metrics.actualMandays);
  const avgRate =
    metrics.actualMandays > 0
      ? metrics.resourceCost / metrics.actualMandays
      : project.resources.length > 0
        ? project.resources.reduce((s, r) => s + r.dailyRate, 0) / project.resources.length
        : 0;
  const forecastCost = projectedMandays * avgRate + metrics.additionalCost;
  const forecastProfit = project.contractValue - forecastCost;
  return { forecastCost, forecastProfit };
}

export function computeProfitOutlook(
  project: ProjectWithRelations,
  metrics: ProjectMetrics,
): ProfitOutlook {
  const contractValue = project.contractValue;
  const estimatedCost = project.estimatedCost;
  const estimatedProfit = contractValue - estimatedCost;
  const actualCost = metrics.actualCost;
  const actualProfit = metrics.actualProfit;

  // Projected final outcome: once any work is logged, project forward from the
  // burn rate; before any actuals exist the best estimate of the final result
  // is the initial estimate captured at intake (avoids reporting near-100%
  // profit just because no cost has accrued yet).
  let forecastCost: number;
  let forecastProfit: number;
  if (metrics.actualMandays > 0) {
    const f = computeBurnRateForecast(project, metrics);
    forecastCost = f.forecastCost;
    forecastProfit = f.forecastProfit;
  } else {
    forecastCost = estimatedCost;
    forecastProfit = estimatedProfit;
  }

  const pct = (profit: number) => (contractValue > 0 ? (profit / contractValue) * 100 : 0);
  const estimatedMarginPct = pct(estimatedProfit);
  const actualMarginPct = pct(actualProfit);
  const forecastMarginPct = pct(forecastProfit);
  const progressPct = metrics.burnRatePct;

  // Once work is logged but still below the early threshold, the burn-rate
  // sample is too small to extrapolate confidently, so hold off on a hard
  // profit/loss verdict and surface "too early to tell" instead.
  let status: ProfitOutlookStatus;
  if (metrics.actualMandays > 0 && progressPct < EARLY_PROGRESS_PCT) {
    status = "EARLY";
  } else if (forecastProfit < 0) {
    status = "LOSS_RISK";
  } else if (forecastMarginPct < THIN_MARGIN_PCT) {
    status = "THIN";
  } else {
    status = "PROFIT";
  }

  return {
    status,
    contractValue,
    estimatedCost,
    estimatedProfit,
    estimatedMarginPct,
    actualCost,
    actualProfit,
    actualMarginPct,
    forecastCost,
    forecastProfit,
    forecastMarginPct,
    progressPct,
  };
}

// --- Earned Value Management (EVM) -----------------------------------------
// PMP-standard cost & schedule performance derived from physical task progress
// versus money spent. All metrics are null-safe: when the project lacks the
// inputs EVM needs (a budget, any dated leaf tasks, a schedule window), the
// relevant fields are null and `insufficientData` is true so the UI can show a
// "not enough data" notice instead of misleading numbers.
//
// Definitions:
//   BAC — Budget At Completion (the project's estimated cost)
//   AC  — Actual Cost incurred so far
//   EV  — Earned Value = physical % complete × BAC
//   PV  — Planned Value = schedule-elapsed fraction × BAC
//   CPI — Cost Performance Index = EV / AC      (>1 under budget)
//   SPI — Schedule Performance Index = EV / PV  (>1 ahead of schedule)
//   EAC — Estimate At Completion = BAC / CPI
//   ETC — Estimate To Complete = EAC − AC
//   VAC — Variance At Completion = BAC − EAC
//   TCPI— To-Complete Performance Index = (BAC − EV) / (BAC − AC)

export interface EvmTaskInput {
  id: string;
  parentTaskId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  progressPercent: number;
  status?: string;
}

export type EvmCostStatus = "UNDER" | "ON_TARGET" | "OVER";
export type EvmScheduleStatus = "AHEAD" | "ON_TARGET" | "BEHIND";

export interface EvmMetrics {
  insufficientData: boolean;
  reason: string | null;
  bac: number;
  ac: number;
  ev: number | null;
  pv: number | null;
  percentComplete: number | null;
  plannedPct: number | null;
  cpi: number | null;
  spi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  tcpi: number | null;
  costStatus: EvmCostStatus | null;
  scheduleStatus: EvmScheduleStatus | null;
  pvBasis: "BASELINE" | "PROJECT";
}

// Tolerance band around 1.0 for CPI/SPI plain-language status. Indices within
// ±5% read as "on target" rather than over/under or ahead/behind.
const EVM_EPSILON = 0.05;

function evmClamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeEvm(opts: {
  bac: number;
  ac: number;
  tasks: EvmTaskInput[];
  scheduleStart: Date | null;
  scheduleEnd: Date | null;
  pvBasis?: "BASELINE" | "PROJECT";
  now?: Date;
}): EvmMetrics {
  const { bac, ac, tasks, scheduleStart, scheduleEnd } = opts;
  const now = opts.now ?? new Date();
  const pvBasis = opts.pvBasis ?? "PROJECT";

  const base: EvmMetrics = {
    insufficientData: true,
    reason: null,
    bac,
    ac,
    ev: null,
    pv: null,
    percentComplete: null,
    plannedPct: null,
    cpi: null,
    spi: null,
    eac: null,
    etc: null,
    vac: null,
    tcpi: null,
    costStatus: null,
    scheduleStatus: null,
    pvBasis,
  };

  if (!(bac > 0)) {
    return {
      ...base,
      reason: "No budget at completion (estimated cost) set for this project.",
    };
  }

  // EV: duration-weighted physical % complete across LEAF tasks only. Parent /
  // summary tasks are excluded (their progress is a roll-up of children and
  // would double-count). Only tasks with both a start and end date contribute,
  // weighted by their duration in days (min 1) so longer tasks carry more of
  // the schedule. Using stored progressPercent (TaskStatus forces DONE=100 /
  // TODO=0) keeps EV honest rather than tying it to mandays burn (which would
  // pin CPI ≈ 1 by construction).
  const parentIds = new Set<string>();
  for (const t of tasks) {
    if (t.parentTaskId) parentIds.add(t.parentTaskId);
  }
  let weightSum = 0;
  let weightedProgress = 0;
  for (const t of tasks) {
    if (parentIds.has(t.id)) continue;
    if (!t.startDate || !t.endDate) continue;
    const days = Math.max(
      1,
      (t.endDate.getTime() - t.startDate.getTime()) / 86_400_000,
    );
    const progress = evmClamp(t.progressPercent ?? 0, 0, 100);
    weightSum += days;
    weightedProgress += days * progress;
  }

  if (weightSum <= 0) {
    return {
      ...base,
      reason:
        "No leaf tasks with start and end dates yet — EVM needs scheduled tasks to measure earned value.",
    };
  }

  const percentComplete = weightedProgress / weightSum; // 0..100
  const ev = (percentComplete / 100) * bac;

  // PV: fraction of the schedule window that has elapsed × BAC. Uses the
  // baseline dates when a baseline exists (caller passes them in via
  // scheduleStart/scheduleEnd + pvBasis), else the project's current dates.
  let pv: number | null = null;
  let plannedPct: number | null = null;
  if (
    scheduleStart &&
    scheduleEnd &&
    scheduleEnd.getTime() > scheduleStart.getTime()
  ) {
    const frac = evmClamp(
      (now.getTime() - scheduleStart.getTime()) /
        (scheduleEnd.getTime() - scheduleStart.getTime()),
      0,
      1,
    );
    plannedPct = frac * 100;
    pv = frac * bac;
  }

  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv && pv > 0 ? ev / pv : null;
  const eac = cpi && cpi > 0 ? bac / cpi : null;
  const etc = eac != null ? eac - ac : null;
  const vac = eac != null ? bac - eac : null;
  // TCPI is only meaningful while budget remains (BAC − AC > 0); once the budget
  // is spent there is no remaining cost to index against.
  const tcpi = bac - ac > 0 ? (bac - ev) / (bac - ac) : null;

  const costStatus: EvmCostStatus | null =
    cpi == null
      ? null
      : cpi > 1 + EVM_EPSILON
        ? "UNDER"
        : cpi < 1 - EVM_EPSILON
          ? "OVER"
          : "ON_TARGET";
  const scheduleStatus: EvmScheduleStatus | null =
    spi == null
      ? null
      : spi > 1 + EVM_EPSILON
        ? "AHEAD"
        : spi < 1 - EVM_EPSILON
          ? "BEHIND"
          : "ON_TARGET";

  // Cost metrics (CPI/EAC/...) are valid from EV + AC alone, so we keep the
  // panel live even when no schedule window exists — but surface a reason so the
  // blank Planned Value / SPI are explained rather than silently empty.
  const reason =
    pv == null
      ? "No baseline or project start/end date window set — schedule metrics (Planned Value, SPI) are unavailable."
      : null;

  return {
    insufficientData: false,
    reason,
    bac,
    ac,
    ev,
    pv,
    percentComplete,
    plannedPct,
    cpi,
    spi,
    eac,
    etc,
    vac,
    tcpi,
    costStatus,
    scheduleStatus,
    pvBasis,
  };
}
