import { prisma, Prisma } from "@workspace/db";
import {
  serializeProject,
  projectInclude,
  projectMetricsSelect,
  computeMetrics,
} from "../serializers.js";
import type { ProjectWithRelations } from "../serializers.js";
import { isPrincipalRole } from "../roles.js";
import { classifyProject, type ProjectType } from "@workspace/shared";

// Pure, request-agnostic dashboard compute functions. The individual
// /dashboard/* route handlers delegate here, and GET /dashboard/overview
// fans these out via Promise.all so a single round-trip serves the whole
// MANAGEMENT/FINANCE dashboard (avoids the cold-start request herd). Each
// function returns exactly the payload shape its legacy endpoint did.

export async function computeSummary() {
  // Executive KPIs are commercial; exclude non-billable INTERNAL/PRESALES/TRAINING.
  const projects = (await prisma.project.findMany({
    where: { deletedAt: null, kind: "CLIENT" },
    select: projectMetricsSelect,
  })) as unknown as ProjectWithRelations[];
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
  let totalContractValue = 0;
  let totalRevenueNet = 0;
  let totalActualCost = 0;
  let totalActualProfit = 0;
  let totalNetActualCost = 0;
  let totalNetActualProfit = 0;
  let totalRecognizedRevenue = 0;
  let totalAccruedCost = 0;
  let totalMandays = 0;
  let marginSum = 0;
  let marginCount = 0;
  for (const p of projects) {
    const m = computeMetrics(p);
    totalContractValue += p.contractValue;
    totalRevenueNet += m.revenueNet;
    totalActualCost += m.actualCost;
    totalActualProfit += m.actualProfit;
    totalNetActualCost += m.netActualCost;
    totalNetActualProfit += m.netActualProfit;
    totalRecognizedRevenue += m.recognizedRevenue;
    totalAccruedCost += m.accruedCost;
    totalMandays += m.actualMandays;
    if (p.contractValue > 0) {
      marginSum += m.marginPct;
      marginCount += 1;
    }
  }
  const pendingTimesheets = await prisma.timesheet.count({
    where: { status: "SUBMITTED" },
  });
  const weightedMarginPct =
    totalContractValue > 0 ? (totalActualProfit / totalContractValue) * 100 : 0;
  const weightedNetMarginPct =
    totalRevenueNet > 0 ? (totalNetActualProfit / totalRevenueNet) * 100 : 0;
  return {
    totalProjects,
    activeProjects,
    totalContractValue,
    totalRevenueNet,
    totalActualCost,
    totalActualProfit,
    totalNetActualCost,
    totalNetActualProfit,
    totalRecognizedRevenue,
    totalAccruedCost,
    avgMarginPct: marginCount > 0 ? marginSum / marginCount : 0,
    weightedMarginPct,
    weightedNetMarginPct,
    pendingTimesheets,
    totalMandays,
  };
}

export async function computeProfitTrend() {
  // Group approved timesheets by month for cost; spread project contract value.
  // Only CLIENT projects contribute to commercial profit trend.
  const projects = (await prisma.project.findMany({
    where: { deletedAt: null, kind: "CLIENT" },
    select: projectMetricsSelect,
  })) as unknown as ProjectWithRelations[];
  const monthly = new Map<string, { revenue: number; cost: number }>();

  for (const p of projects) {
    const rateMap = new Map<string, number>();
    for (const r of p.resources) rateMap.set(r.userId, r.dailyRate);
    const months = new Set<string>();
    for (const ts of p.timesheets) {
      if (ts.status !== "APPROVED") continue;
      const d = ts.workDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.add(key);
      const cost = (ts.hours / 8) * (rateMap.get(ts.userId) ?? 0);
      const cur = monthly.get(key) ?? { revenue: 0, cost: 0 };
      cur.cost += cost;
      monthly.set(key, cur);
    }
    if (months.size > 0) {
      const vatPct = (p as any).vatPercent ?? 11;
      const includesVat = (p as any).contractValueIncludesVat ?? true;
      const revenueNet = includesVat
        ? p.contractValue / (1 + vatPct / 100)
        : p.contractValue;
      const rev = revenueNet / months.size;
      for (const m of months) {
        const cur = monthly.get(m)!;
        cur.revenue += rev;
      }
    }
  }
  const sorted = Array.from(monthly.keys()).sort();
  return sorted.map((month) => {
    const v = monthly.get(month)!;
    return { month, revenue: v.revenue, cost: v.cost, profit: v.revenue - v.cost };
  });
}

export async function computeStatusBreakdown() {
  const grouped = await prisma.project.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
    _sum: { contractValue: true },
  });
  return grouped.map((g) => ({
    status: g.status,
    count: g._count._all,
    value: g._sum.contractValue ?? 0,
  }));
}

export async function computeRecentActivity() {
  const acts = await prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: true, project: true },
  });
  return acts.map((a) => ({
    id: a.id,
    type: a.type,
    message: a.message,
    userName: a.user?.name ?? null,
    projectName: a.project?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  }));
}

// pmId null => whole portfolio; otherwise scope to a single PM's projects.
export async function computePendingAging(pmId: string | null) {
  const where: any = { status: "SUBMITTED" };
  if (pmId) where.project = { pmId };
  const list = await prisma.timesheet.findMany({
    where,
    include: { user: true, project: true },
    orderBy: { createdAt: "asc" },
  });
  const now = Date.now();
  const buckets = { lt24h: 0, h24to48: 0, gt48h: 0, gt72h: 0 };
  let oldestHours = 0;
  for (const t of list) {
    const h = (now - t.createdAt.getTime()) / 3600000;
    if (h > oldestHours) oldestHours = h;
    if (h < 24) buckets.lt24h += 1;
    else if (h < 48) buckets.h24to48 += 1;
    else if (h < 72) buckets.gt48h += 1;
    else buckets.gt72h += 1;
  }
  const aged = list.filter(
    (t) => now - t.createdAt.getTime() > 48 * 60 * 60 * 1000,
  );
  const sample = (t: (typeof list)[number]) => ({
    id: t.id,
    submitterName: t.user.name,
    projectName: t.project.name,
    projectId: t.projectId,
    hours: t.hours,
    workDate: t.workDate.toISOString(),
    submittedAt: t.createdAt.toISOString(),
    hoursWaiting: Math.round((now - t.createdAt.getTime()) / (60 * 60 * 1000)),
  });
  return {
    pendingTotal: list.length,
    overdueCount: aged.length,
    oldestHours,
    buckets,
    samples: aged.slice(0, 20).map(sample),
    overdue: aged.slice(0, 20).map(sample),
  };
}

export async function computeUtilizationTrend(days: number) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const since = new Date(startOfDay);
  since.setDate(since.getDate() - (days - 1));

  const headcount = await prisma.user.count({
    where: {
      isActive: true,
      deletedAt: null,
      role: { in: ["KONSULTAN", "TECHNICAL_WRITER", "PROJECT_MANAGER"] },
    },
  });

  const ts = await prisma.timesheet.findMany({
    where: { status: "APPROVED", workDate: { gte: since } },
    select: { workDate: true, hours: true },
  });

  const dailyHours = new Map<string, number>();
  for (const t of ts) {
    const k = t.workDate.toISOString().slice(0, 10);
    dailyHours.set(k, (dailyHours.get(k) ?? 0) + t.hours);
  }

  const trend: { date: string; utilizationPct: number; hours: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const day = d.getDay();
    const isWorkday = day !== 0 && day !== 6;
    const k = d.toISOString().slice(0, 10);
    const hrs = dailyHours.get(k) ?? 0;
    const cap = isWorkday ? headcount * 8 : 0;
    const pct = cap > 0 ? (hrs / cap) * 100 : 0;
    trend.push({ date: k, utilizationPct: pct, hours: hrs });
  }
  return { days, headcount, trend };
}

// role/sub drive workforce scope: PM => own-project resources; Principal =>
// direct supervisees; MGMT/FINANCE/HR/SUPER_ADMIN => full eligible workforce.
export async function computeResourceUtilizationDetail(role: string, sub: string) {
  const isPrincipal = isPrincipalRole(role);

  let pmProjectIdSet: Set<string> | null = null;
  if (role === "PROJECT_MANAGER") {
    const ownProjects = await prisma.project.findMany({
      where: { pmId: sub, deletedAt: null },
      select: { id: true },
    });
    pmProjectIdSet = new Set(ownProjects.map((p) => p.id));
  }
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const recentSince = new Date(startOfDay);
  recentSince.setDate(recentSince.getDate() - 30);

  const last7Since = new Date(startOfDay);
  last7Since.setDate(last7Since.getDate() - 6);

  const userWhere: any = {
    isActive: true,
    deletedAt: null,
    role: { in: ["KONSULTAN", "TECHNICAL_WRITER", "PROJECT_MANAGER", "ADMIN_PROJECT"] },
  };
  // Principal sees only their direct supervisees (User.principalId = me).
  if (isPrincipal) {
    userWhere.principalId = sub;
  }
  if (pmProjectIdSet) {
    const ids = Array.from(pmProjectIdSet);
    userWhere.OR = [
      { resources: { some: { projectId: { in: ids } } } },
      { timesheets: { some: { projectId: { in: ids }, workDate: { gte: recentSince } } } },
    ];
  }
  const users = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      role: true,
      title: true,
      resources: {
        where: pmProjectIdSet
          ? { projectId: { in: Array.from(pmProjectIdSet) } }
          : undefined,
        select: {
          projectId: true,
          plannedMandays: true,
          project: {
            select: {
              name: true,
              status: true,
              endDate: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
      },
      timesheets: {
        where: {
          status: "APPROVED",
          workDate: { gte: recentSince },
          ...(pmProjectIdSet
            ? { projectId: { in: Array.from(pmProjectIdSet) } }
            : {}),
        },
        select: {
          projectId: true,
          hours: true,
          workDate: true,
          project: { select: { status: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const monthHours = await prisma.timesheet.groupBy({
    by: ["userId"],
    where: {
      status: "APPROVED",
      workDate: { gte: monthStart },
      ...(pmProjectIdSet
        ? { projectId: { in: Array.from(pmProjectIdSet) } }
        : {}),
    },
    _sum: { hours: true },
  });
  const monthMap = new Map<string, number>();
  for (const m of monthHours) monthMap.set(m.userId, m._sum.hours ?? 0);

  // Workdays in current month so far
  let workdaysSoFar = 0;
  for (let d = new Date(monthStart); d <= startOfDay; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) workdaysSoFar += 1;
  }
  const monthCapacityHours = Math.max(workdaysSoFar, 1) * 8;

  type Row = {
    userId: string;
    userName: string;
    role: string;
    title: string | null;
    specialization: string | null;
    status: "ACTIVE" | "IDLE" | "OVERLOADED";
    currentProjectId: string | null;
    currentProjectName: string | null;
    currentProjectStatus: string | null;
    currentClientId: string | null;
    currentClientName: string | null;
    liveProjects: {
      projectId: string;
      projectName: string;
      projectStatus: string;
      clientName: string | null;
      endDate: string | null;
      plannedMandays: number;
    }[];
    assignmentEndDate: string | null;
    daysRemaining: number | null;
    finishingSoon: boolean;
    daysSinceLastActivity: number | null;
    idleLong: boolean;
    overloaded: boolean;
    avgHoursPerDay7d: number;
    monthHours: number;
    utilizationPctMonth: number;
  };

  const rows: Row[] = users.map((u) => {
    const liveResources = u.resources.filter(
      (r) => r.project.status === "ACTIVE" || r.project.status === "PAUSE",
    );
    const recentProjectIds = new Set(
      u.timesheets
        .filter(
          (t) => t.project.status === "ACTIVE" || t.project.status === "PAUSE",
        )
        .map((t) => t.projectId),
    );
    const isActive = liveResources.length > 0 || recentProjectIds.size > 0;

    // Pick the soonest-finishing live assignment as the "current" project
    let current: (typeof liveResources)[number] | null = null;
    for (const r of liveResources) {
      if (!current) {
        current = r;
        continue;
      }
      const a = r.project.endDate?.getTime() ?? Infinity;
      const b = current.project.endDate?.getTime() ?? Infinity;
      if (a < b) current = r;
    }

    let assignmentEnd: Date | null = current?.project.endDate ?? null;
    let daysRemaining: number | null = null;
    let finishingSoon = false;
    if (assignmentEnd) {
      const ms = assignmentEnd.getTime() - startOfDay.getTime();
      daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
      finishingSoon = isActive && daysRemaining >= 0 && daysRemaining <= 2;
    }

    const hoursThisMonth = monthMap.get(u.id) ?? 0;
    const utilizationPctMonth = (hoursThisMonth / monthCapacityHours) * 100;

    // Avg hours/day in last 7 days (calendar days, divided by 7 for true average)
    let hours7 = 0;
    let lastTsDate: Date | null = null;
    for (const t of u.timesheets) {
      if (t.workDate >= last7Since) hours7 += t.hours;
      if (!lastTsDate || t.workDate > lastTsDate) lastTsDate = t.workDate;
    }
    const avgHoursPerDay7d = hours7 / 7;
    const overloaded = avgHoursPerDay7d > 8;

    let daysSinceLastActivity: number | null = null;
    if (lastTsDate) {
      daysSinceLastActivity = Math.floor(
        (startOfDay.getTime() - lastTsDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    const idleLong = !isActive && (daysSinceLastActivity ?? 999) > 5;

    const status: Row["status"] = overloaded
      ? "OVERLOADED"
      : isActive
        ? "ACTIVE"
        : "IDLE";

    return {
      userId: u.id,
      userName: u.name,
      role: u.role,
      title: u.title,
      specialization: u.title,
      status,
      currentProjectId: current?.projectId ?? null,
      currentProjectName: current?.project.name ?? null,
      currentProjectStatus: current?.project.status ?? null,
      currentClientId: current?.project.client.id ?? null,
      currentClientName: current?.project.client.name ?? null,
      liveProjects: liveResources
        .slice()
        .sort((a, b) => {
          const ae = a.project.endDate?.getTime() ?? Infinity;
          const be = b.project.endDate?.getTime() ?? Infinity;
          return ae - be;
        })
        .map((r) => ({
          projectId: r.projectId,
          projectName: r.project.name,
          projectStatus: r.project.status,
          clientName: r.project.client?.name ?? null,
          endDate: r.project.endDate ? r.project.endDate.toISOString() : null,
          plannedMandays: r.plannedMandays ?? 0,
        })),
      assignmentEndDate: assignmentEnd ? assignmentEnd.toISOString() : null,
      daysRemaining,
      finishingSoon,
      daysSinceLastActivity,
      idleLong,
      overloaded,
      avgHoursPerDay7d,
      monthHours: hoursThisMonth,
      utilizationPctMonth: Math.min(utilizationPctMonth, 200),
    };
  });

  const total = rows.length;
  const activeCount = rows.filter(
    (r) => r.status === "ACTIVE" || r.status === "OVERLOADED",
  ).length;
  const idleCount = rows.filter((r) => r.status === "IDLE").length;
  const overloadedCount = rows.filter((r) => r.overloaded).length;
  const idleLongCount = rows.filter((r) => r.idleLong).length;
  const finishingSoonCount = rows.filter((r) => r.finishingSoon).length;
  const utilizationPct = total > 0 ? (activeCount / total) * 100 : 0;

  // Distinct principals & specializations for filter dropdowns
  const principals = new Map<string, string>();
  const specializations = new Set<string>();
  for (const r of rows) {
    if (r.currentClientId && r.currentClientName)
      principals.set(r.currentClientId, r.currentClientName);
    if (r.specialization) specializations.add(r.specialization);
  }

  return {
    summary: {
      total,
      active: activeCount,
      idle: idleCount,
      vacation: 0,
      finishingSoon: finishingSoonCount,
      overloaded: overloadedCount,
      idleLong: idleLongCount,
      utilizationPct,
    },
    distribution: [
      { name: "Active", value: activeCount - overloadedCount },
      { name: "Overloaded", value: overloadedCount },
      { name: "Idle", value: idleCount },
    ],
    filters: {
      principals: Array.from(principals.entries()).map(([id, name]) => ({
        id,
        name,
      })),
      specializations: Array.from(specializations).sort(),
    },
    resources: rows,
    finishingSoonList: rows.filter((r) => r.finishingSoon),
    idleLongList: rows.filter((r) => r.idleLong),
    overloadedList: rows.filter((r) => r.overloaded),
  };
}

// role/sub scope: PM => own projects only; everyone else => all projects.
export async function computeBillableUtilization(
  role: string,
  sub: string,
  days: number,
) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const since = new Date(startOfDay);
  since.setDate(since.getDate() - (days - 1));

  const where: Prisma.TimesheetWhereInput = {
    status: "APPROVED",
    workDate: { gte: since },
  };
  // PMs only see hours logged against their own projects.
  if (role === "PROJECT_MANAGER") {
    where.project = { pmId: sub };
  }
  const ts = await prisma.timesheet.findMany({
    where,
    select: {
      workDate: true,
      hours: true,
      task: { select: { billable: true } },
    },
  });

  const dailyBillable = new Map<string, number>();
  const dailyNonBillable = new Map<string, number>();
  let billableHours = 0;
  let nonBillableHours = 0;
  for (const t of ts) {
    const k = t.workDate.toISOString().slice(0, 10);
    // No task or task.billable !== false → counted as billable
    const isBillable = !t.task || t.task.billable !== false;
    if (isBillable) {
      dailyBillable.set(k, (dailyBillable.get(k) ?? 0) + t.hours);
      billableHours += t.hours;
    } else {
      dailyNonBillable.set(k, (dailyNonBillable.get(k) ?? 0) + t.hours);
      nonBillableHours += t.hours;
    }
  }

  const trend: {
    date: string;
    billableHours: number;
    nonBillableHours: number;
    billablePct: number;
  }[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    const b = dailyBillable.get(k) ?? 0;
    const nb = dailyNonBillable.get(k) ?? 0;
    const total = b + nb;
    trend.push({
      date: k,
      billableHours: b,
      nonBillableHours: nb,
      billablePct: total > 0 ? (b / total) * 100 : 0,
    });
  }

  const totalHours = billableHours + nonBillableHours;
  return {
    days,
    billableHours,
    nonBillableHours,
    totalHours,
    billablePct: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
    trend,
  };
}

// One findMany of every non-deleted project (with full relations) feeds all the
// portfolio-level project insight cards that the dashboard used to derive
// client-side from GET /projects: top projects, at-risk (losing) projects,
// project-type profitability, PM allocation, and Sales->PM pending-assignment.
export async function computeProjectInsights(role: string | undefined) {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: projectInclude,
  });
  const serialized = projects.map((p) => serializeProject(p, role));

  const topProjects = serialized
    .slice()
    .sort((a, b) => b.contractValue - a.contractValue)
    .slice(0, 5);

  const losingProjects = serialized
    .filter(
      (p) =>
        (p.status === "ACTIVE" || p.status === "PAUSE") &&
        p.marginPct !== null &&
        p.marginPct !== undefined &&
        (p.actualMandays ?? 0) > 0 &&
        p.marginPct < 10,
    )
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, 5);

  const pendingAssignment = serialized.filter(
    (p) => p.status === "DRAFT" && !p.pmId,
  );

  const typeMap = new Map<
    ProjectType,
    { type: ProjectType; count: number; revenue: number; cost: number; profit: number }
  >();
  for (const p of serialized) {
    const t = classifyProject({ name: p.name, code: p.code });
    const cur = typeMap.get(t) ?? { type: t, count: 0, revenue: 0, cost: 0, profit: 0 };
    cur.count += 1;
    cur.revenue += p.contractValue ?? 0;
    const ac = (p as any).actualCost ?? 0;
    const ap = (p as any).actualProfit ?? ((p.contractValue ?? 0) - ac);
    cur.cost += ac;
    cur.profit += ap;
    typeMap.set(t, cur);
  }
  const projectTypeStats = Array.from(typeMap.values())
    .map((r) => ({ ...r, marginPct: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit);

  const pmUsers = await prisma.user.findMany({
    where: { role: "PROJECT_MANAGER", isActive: true, deletedAt: null },
    select: { id: true, name: true, title: true },
  });
  const pmAllocation = pmUsers
    .map((pm) => {
      const owned = serialized.filter((p) => p.pmId === pm.id);
      const active = owned.filter((p) => p.status === "ACTIVE").length;
      const observation = owned.filter((p) => p.status === "OBSERVATION").length;
      const draft = owned.filter((p) => p.status === "DRAFT").length;
      const totalActiveValue = owned
        .filter((p) => p.status === "ACTIVE" || p.status === "OBSERVATION")
        .reduce((s, p) => s + (p.contractValue ?? 0), 0);
      const inFlight = active + observation;
      return {
        id: pm.id,
        name: pm.name,
        title: pm.title,
        active,
        observation,
        draft,
        totalActiveValue,
        inFlight,
      };
    })
    .sort((a, b) => b.inFlight - a.inFlight);

  return { topProjects, losingProjects, pendingAssignment, projectTypeStats, pmAllocation };
}

// --- Cash-flow forecast (compact 6-month billing inflow) ---------------------
// Mirrors the month-mode math in routes/invoice-planning.ts: bucket non-deleted
// OBSERVATION/ACTIVE/PAUSE projects' PLANNED/INVOICED/PAID milestones by dueDate
// into the next 6 calendar months, splitting VAT both ways so the card can
// toggle DPP vs gross. Date/VAT helpers are inlined to keep lib free of a
// route import; keep them in lockstep with invoice-planning.ts.
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function splitVat(gross: number, vatPct: number, includesVat: boolean) {
  if (includesVat) {
    const dpp = gross / (1 + vatPct / 100);
    return { dpp, vat: gross - dpp, total: gross };
  }
  const vat = gross * (vatPct / 100);
  return { dpp: gross, vat, total: gross + vat };
}

export async function computeCashFlowForecast() {
  const periods = 6;
  const start = startOfMonth(new Date());
  const periodEnd = addMonthsUtc(start, periods);

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: ["OBSERVATION", "ACTIVE", "PAUSE"] } },
    select: {
      id: true,
      contractValue: true,
      vatPercent: true,
      contractValueIncludesVat: true,
    },
  });
  const projMap = new Map(projects.map((p) => [p.id, p]));

  const milestones = projects.length
    ? await prisma.billingMilestone.findMany({
        where: {
          projectId: { in: projects.map((p) => p.id) },
          status: { in: ["PLANNED", "INVOICED", "PAID"] },
          dueDate: { gte: start, lt: periodEnd },
        },
        select: {
          projectId: true,
          status: true,
          amount: true,
          percentage: true,
          dueDate: true,
        },
      })
    : [];

  const months = Array.from({ length: periods }, (_, i) => ({
    periodStart: isoDate(addMonthsUtc(start, i)),
    paidDpp: 0,
    paidTotal: 0,
    invoicedDpp: 0,
    invoicedTotal: 0,
    plannedDpp: 0,
    plannedTotal: 0,
  }));

  for (const ms of milestones) {
    if (!ms.dueDate) continue;
    const idx =
      (ms.dueDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (ms.dueDate.getUTCMonth() - start.getUTCMonth());
    if (idx < 0 || idx >= periods) continue;
    const p = projMap.get(ms.projectId);
    if (!p) continue;
    const gross = ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100;
    const { dpp, total } = splitVat(
      gross,
      p.vatPercent ?? 11,
      p.contractValueIncludesVat ?? true,
    );
    const cell = months[idx];
    if (ms.status === "PAID") {
      cell.paidDpp += dpp;
      cell.paidTotal += total;
    } else if (ms.status === "INVOICED") {
      cell.invoicedDpp += dpp;
      cell.invoicedTotal += total;
    } else if (ms.status === "PLANNED") {
      cell.plannedDpp += dpp;
      cell.plannedTotal += total;
    }
  }

  return { months };
}
