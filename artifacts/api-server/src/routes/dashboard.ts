import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import {
  serializeProject,
  projectInclude,
  computeMetrics,
} from "../lib/serializers.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/dashboard/summary", async (_req, res) => {
  const projects = await prisma.project.findMany({ where: { deletedAt: null }, include: projectInclude });
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
  // Weighted (portfolio) margin = Σ profit / Σ revenue × 100. This avoids
  // small-revenue projects skewing the simple average and aligns with how
  // finance teams report blended portfolio margin.
  const weightedMarginPct =
    totalContractValue > 0 ? (totalActualProfit / totalContractValue) * 100 : 0;
  const weightedNetMarginPct =
    totalRevenueNet > 0 ? (totalNetActualProfit / totalRevenueNet) * 100 : 0;
  res.json({
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
  });
});

router.get("/dashboard/profit-trend", async (_req, res) => {
  // Group approved timesheets by month for cost; spread project contract value
  const projects = await prisma.project.findMany({ where: { deletedAt: null }, include: projectInclude });
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
  res.json(
    sorted.map((month) => {
      const v = monthly.get(month)!;
      return { month, revenue: v.revenue, cost: v.cost, profit: v.revenue - v.cost };
    }),
  );
});

router.get("/dashboard/status-breakdown", async (_req, res) => {
  const grouped = await prisma.project.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
    _sum: { contractValue: true },
  });
  res.json(
    grouped.map((g) => ({
      status: g.status,
      count: g._count._all,
      value: g._sum.contractValue ?? 0,
    })),
  );
});

router.get("/dashboard/top-projects", async (_req, res) => {
  const projects = await prisma.project.findMany({ where: { deletedAt: null }, include: projectInclude });
  const serialized = projects.map((p) => serializeProject(p));
  serialized.sort((a, b) => b.contractValue - a.contractValue);
  res.json(serialized.slice(0, 5));
});

router.get("/dashboard/recent-activity", async (_req, res) => {
  const acts = await prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: true, project: true },
  });
  res.json(
    acts.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      userName: a.user?.name ?? null,
      projectName: a.project?.name ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  );
});

router.get("/dashboard/pending-aging", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const where: any = { status: "SUBMITTED" };
  if (role === "PROJECT_MANAGER") where.project = { pmId: req.user!.sub };
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
  res.json({
    pendingTotal: list.length,
    overdueCount: aged.length,
    oldestHours,
    buckets,
    samples: aged.slice(0, 20).map((t) => ({
      id: t.id,
      submitterName: t.user.name,
      projectName: t.project.name,
      projectId: t.projectId,
      hours: t.hours,
      workDate: t.workDate.toISOString(),
      submittedAt: t.createdAt.toISOString(),
      hoursWaiting: Math.round((now - t.createdAt.getTime()) / (60 * 60 * 1000)),
    })),
    overdue: aged.slice(0, 20).map((t) => ({
      id: t.id,
      submitterName: t.user.name,
      projectName: t.project.name,
      projectId: t.projectId,
      hours: t.hours,
      workDate: t.workDate.toISOString(),
      submittedAt: t.createdAt.toISOString(),
      hoursWaiting: Math.round((now - t.createdAt.getTime()) / (60 * 60 * 1000)),
    })),
  });
});

router.get("/dashboard/utilization-trend", async (req, res) => {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? 30), 10) || 30, 7), 90);
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
  res.json({ days, headcount, trend });
});

router.get("/dashboard/resource-utilization-detail", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // PM only sees resources that have a current assignment OR recent timesheet
  // on a project they own.
  let pmProjectIdSet: Set<string> | null = null;
  if (role === "PROJECT_MANAGER") {
    const ownProjects = await prisma.project.findMany({
      where: { pmId: req.user!.sub, deletedAt: null },
      select: { id: true },
    });
    pmProjectIdSet = new Set(ownProjects.map((p) => p.id));
  }
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const horizon = new Date(startOfDay);
  horizon.setDate(horizon.getDate() + 2);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const recentSince = new Date(startOfDay);
  recentSince.setDate(recentSince.getDate() - 30);

  const last7Since = new Date(startOfDay);
  last7Since.setDate(last7Since.getDate() - 6);

  const userWhere: any = {
    isActive: true,
    deletedAt: null,
    role: { in: ["KONSULTAN", "TECHNICAL_WRITER", "PROJECT_MANAGER"] },
  };
  if (pmProjectIdSet) {
    const ids = Array.from(pmProjectIdSet);
    userWhere.OR = [
      { resources: { some: { projectId: { in: ids } } } },
      { timesheets: { some: { projectId: { in: ids }, workDate: { gte: recentSince } } } },
    ];
  }
  const users = await prisma.user.findMany({
    where: userWhere,
    include: {
      resources: {
        where: pmProjectIdSet
          ? { projectId: { in: Array.from(pmProjectIdSet) } }
          : undefined,
        include: { project: { include: { client: true } } },
      },
      timesheets: {
        where: {
          status: "APPROVED",
          workDate: { gte: recentSince },
          ...(pmProjectIdSet
            ? { projectId: { in: Array.from(pmProjectIdSet) } }
            : {}),
        },
        include: { project: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const monthHours = await prisma.timesheet.groupBy({
    by: ["userId"],
    where: { status: "APPROVED", workDate: { gte: monthStart } },
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
      finishingSoon =
        isActive && daysRemaining >= 0 && daysRemaining <= 2;
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

  res.json({
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
  });
});

router.get("/dashboard/utilization", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null, role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
    include: { resources: true },
  });
  const tsAgg = await prisma.timesheet.groupBy({
    by: ["userId"],
    where: { status: "APPROVED" },
    _sum: { hours: true },
  });
  const actualMap = new Map<string, number>();
  for (const a of tsAgg) actualMap.set(a.userId, (a._sum.hours ?? 0) / 8);
  res.json(
    users.map((u) => {
      const planned = u.resources.reduce((s, r) => s + r.plannedMandays, 0);
      const actual = actualMap.get(u.id) ?? 0;
      return {
        userId: u.id,
        userName: u.name,
        role: u.role,
        plannedMandays: planned,
        actualMandays: actual,
        utilizationPct: planned > 0 ? (actual / planned) * 100 : 0,
      };
    }),
  );
});

export default router;
