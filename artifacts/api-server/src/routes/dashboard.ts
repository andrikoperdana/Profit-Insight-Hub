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
  const projects = await prisma.project.findMany({ include: projectInclude });
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
  let totalContractValue = 0;
  let totalActualCost = 0;
  let totalActualProfit = 0;
  let totalMandays = 0;
  let marginSum = 0;
  let marginCount = 0;
  for (const p of projects) {
    const m = computeMetrics(p);
    totalContractValue += p.contractValue;
    totalActualCost += m.actualCost;
    totalActualProfit += m.actualProfit;
    totalMandays += m.actualMandays;
    if (p.contractValue > 0) {
      marginSum += m.marginPct;
      marginCount += 1;
    }
  }
  const pendingTimesheets = await prisma.timesheet.count({
    where: { status: "SUBMITTED" },
  });
  res.json({
    totalProjects,
    activeProjects,
    totalContractValue,
    totalActualCost,
    totalActualProfit,
    avgMarginPct: marginCount > 0 ? marginSum / marginCount : 0,
    pendingTimesheets,
    totalMandays,
  });
});

router.get("/dashboard/profit-trend", async (_req, res) => {
  // Group approved timesheets by month for cost; spread project contract value
  const projects = await prisma.project.findMany({ include: projectInclude });
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
      const rev = p.contractValue / months.size;
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
  const projects = await prisma.project.findMany({ include: projectInclude });
  const serialized = projects.map(serializeProject);
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

router.get("/dashboard/resource-utilization-detail", async (_req, res) => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const horizon = new Date(startOfDay);
  horizon.setDate(horizon.getDate() + 2);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const recentSince = new Date(startOfDay);
  recentSince.setDate(recentSince.getDate() - 30);

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["KONSULTAN", "TECHNICAL_WRITER", "PROJECT_MANAGER"] },
    },
    include: {
      resources: { include: { project: true } },
      timesheets: {
        where: { status: "APPROVED", workDate: { gte: recentSince } },
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
    status: "ACTIVE" | "IDLE";
    currentProjectId: string | null;
    currentProjectName: string | null;
    currentProjectStatus: string | null;
    assignmentEndDate: string | null;
    daysRemaining: number | null;
    finishingSoon: boolean;
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

    return {
      userId: u.id,
      userName: u.name,
      role: u.role,
      title: u.title,
      status: isActive ? "ACTIVE" : "IDLE",
      currentProjectId: current?.projectId ?? null,
      currentProjectName: current?.project.name ?? null,
      currentProjectStatus: current?.project.status ?? null,
      assignmentEndDate: assignmentEnd ? assignmentEnd.toISOString() : null,
      daysRemaining,
      finishingSoon,
      monthHours: hoursThisMonth,
      utilizationPctMonth: Math.min(utilizationPctMonth, 200),
    };
  });

  const total = rows.length;
  const activeCount = rows.filter((r) => r.status === "ACTIVE").length;
  const idleCount = total - activeCount;
  const finishingSoonCount = rows.filter((r) => r.finishingSoon).length;
  const utilizationPct = total > 0 ? (activeCount / total) * 100 : 0;

  res.json({
    summary: {
      total,
      active: activeCount,
      idle: idleCount,
      vacation: 0,
      finishingSoon: finishingSoonCount,
      utilizationPct,
    },
    distribution: [
      { name: "Active", value: activeCount },
      { name: "Idle", value: idleCount },
      { name: "Vacation", value: 0 },
    ],
    resources: rows,
    finishingSoonList: rows.filter((r) => r.finishingSoon),
  });
});

router.get("/dashboard/utilization", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
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
