import type { Prisma } from "@workspace/db";

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    client: true;
    sales: true;
    pm: true;
    technicalWriter: true;
    adminProject: true;
    resources: { include: { user: true } };
    timesheets: { include: { user: true } };
    expenses: true;
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
}

export function computeMetrics(project: ProjectWithRelations): ProjectMetrics {
  // Map userId -> rate from resources (fallback to user.dailyRate via timesheet's user)
  const rateMap = new Map<string, number>();
  for (const r of project.resources) {
    rateMap.set(r.userId, r.dailyRate);
  }

  let actualMandays = 0;
  let resourceCost = 0;
  for (const ts of project.timesheets) {
    if (ts.status !== "APPROVED") continue;
    const days = ts.hours / 8;
    actualMandays += days;
    const rate = rateMap.get(ts.userId) ?? ts.user?.dailyRate ?? 0;
    resourceCost += days * rate;
  }
  const additionalCost = (project.expenses ?? []).reduce(
    (sum, e) => sum + (e.amount ?? 0),
    0,
  );
  const actualCost = resourceCost + additionalCost;
  const actualProfit = project.contractValue - actualCost;
  const marginPct =
    project.contractValue > 0
      ? (actualProfit / project.contractValue) * 100
      : 0;
  const estimatedProfit = project.contractValue - project.estimatedCost;

  return {
    actualMandays,
    resourceCost,
    additionalCost,
    actualCost,
    actualProfit,
    marginPct,
    estimatedProfit,
  };
}

export function serializeUser(u: UserBasic) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    title: u.title,
    dailyRate: u.dailyRate,
    isActive: u.isActive,
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
]);

export function canViewProjectFinancials(role: string | null | undefined): boolean {
  return !!role && !FINANCIALS_BLOCKED_ROLES.has(role);
}

export function serializeProject(project: ProjectWithRelations, callerRole?: string | null) {
  const m = computeMetrics(project);
  const includeFinancials = canViewProjectFinancials(callerRole ?? "MANAGEMENT");
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
      };
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
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
    lastStatusReason: project.lastStatusReason ?? null,
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
} as const;
