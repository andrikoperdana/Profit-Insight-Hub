import type { Prisma } from "@workspace/db";
import { getOverheadMultiplier } from "./overhead.js";

export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    client: true;
    sales: true;
    pm: true;
    technicalWriter: true;
    adminProject: true;
    resources: { include: { user: true } };
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
  // Map userId -> rate from resources (fallback to user.dailyRate via timesheet's user)
  const rateMap = new Map<string, number>();
  for (const r of project.resources) {
    rateMap.set(r.userId, r.dailyRate);
  }

  let actualMandays = 0;
  let resourceCost = 0;
  let accruedResourceCost = 0;
  for (const ts of project.timesheets) {
    const days = ts.hours / 8;
    const rate = rateMap.get(ts.userId) ?? ts.user?.dailyRate ?? 0;
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
  const additionalCost = (project.expenses ?? []).reduce(
    (sum, e) => sum + ((e as any).status === "APPROVED" ? (e.amount ?? 0) : 0),
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
  const revenueNet = contractValueIncludesVat
    ? project.contractValue / (1 + vatPercent / 100)
    : project.contractValue;
  const vatAmount = contractValueIncludesVat
    ? project.contractValue - revenueNet
    : project.contractValue * (vatPercent / 100);

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
]);

export function canViewDailyRate(role: string | null | undefined): boolean {
  return !!role && DAILY_RATE_ALLOWED_ROLES.has(role);
}

export function serializeProject(project: ProjectWithRelations, callerRole?: string | null) {
  const m = computeMetrics(project);
  const includeFinancials = canViewProjectFinancials(callerRole ?? "MANAGEMENT");
  const health = includeFinancials ? computeHealthScore(project, m) : null;
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
  resources: { include: { user: true } },
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
  resources: { select: { userId: true, dailyRate: true } },
  timesheets: {
    select: {
      hours: true,
      status: true,
      userId: true,
      workDate: true,
      user: { select: { dailyRate: true } },
    },
  },
  expenses: { select: { amount: true, status: true } },
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
  if (project.status === "DRAFT" || project.status === "CLOSED") return null;
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
