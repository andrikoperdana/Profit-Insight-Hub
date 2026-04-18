import type { Prisma } from "@workspace/db";

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    client: true;
    sales: true;
    pm: true;
    resources: { include: { user: true } };
    timesheets: { include: { user: true } };
  };
}>;

type UserBasic = Prisma.UserGetPayload<object>;

export interface ProjectMetrics {
  actualMandays: number;
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
  let actualCost = 0;
  for (const ts of project.timesheets) {
    if (ts.status !== "APPROVED") continue;
    const days = ts.hours / 8;
    actualMandays += days;
    const rate = rateMap.get(ts.userId) ?? ts.user?.dailyRate ?? 0;
    actualCost += days * rate;
  }
  const actualProfit = project.contractValue - actualCost;
  const marginPct =
    project.contractValue > 0
      ? (actualProfit / project.contractValue) * 100
      : 0;
  const estimatedProfit = project.contractValue - project.estimatedCost;

  return { actualMandays, actualCost, actualProfit, marginPct, estimatedProfit };
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
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeProject(project: ProjectWithRelations) {
  const m = computeMetrics(project);
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
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
    contractValue: project.contractValue,
    estimatedCost: project.estimatedCost,
    estimatedProfit: m.estimatedProfit,
    plannedMandays: project.plannedMandays,
    actualMandays: m.actualMandays,
    actualCost: m.actualCost,
    actualProfit: m.actualProfit,
    marginPct: m.marginPct,
    lastStatusReason: project.lastStatusReason ?? null,
    createdAt: project.createdAt.toISOString(),
  };
}

export const projectInclude = {
  client: true,
  sales: true,
  pm: true,
  resources: { include: { user: true } },
  timesheets: { include: { user: true } },
} as const;
