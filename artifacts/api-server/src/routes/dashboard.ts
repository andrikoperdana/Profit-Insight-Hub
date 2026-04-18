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
