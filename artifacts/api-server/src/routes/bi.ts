import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { computeMetrics, projectInclude } from "../lib/serializers.js";
import { classifyProject, PROJECT_TYPES, type ProjectType } from "@workspace/shared";

const router: IRouter = Router();

type Period = "month" | "quarter" | "year" | "custom";

function resolvePeriod(req: { query: Record<string, unknown> }): { from: Date; to: Date; label: Period } {
  const period = String(req.query.period ?? "year") as Period;
  const now = new Date();
  let from: Date;
  let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (period === "custom") {
    const f = req.query.from ? new Date(String(req.query.from)) : null;
    const t = req.query.to ? new Date(String(req.query.to)) : null;
    from = f && !isNaN(f.getTime()) ? f : new Date(now.getFullYear(), 0, 1);
    to = t && !isNaN(t.getTime()) ? t : to;
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
  }
  return { from, to, label: period };
}

function inRange(d: Date | null | undefined, from: Date, to: Date): boolean {
  if (!d) return false;
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

router.get("/bi/overview", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const { from, to, label } = resolvePeriod(req);
  const principalId = req.query.principalId ? String(req.query.principalId) : null;
  const projectTypeFilter = req.query.projectType ? String(req.query.projectType) : null;

  const allProjects = await prisma.project.findMany({
    where: { deletedAt: null, kind: "CLIENT" },
    include: projectInclude,
  });

  // Filter scope: project considered "in period" if it had any approved
  // timesheet in range OR was created/active during range.
  const scoped = allProjects.filter((p) => {
    if (principalId && p.pmId !== principalId) return false;
    const type = classifyProject(p);
    if (projectTypeFilter && type !== projectTypeFilter) return false;

    const createdIn = inRange(p.createdAt, from, to);
    const tsIn = p.timesheets.some(
      (t) => t.status === "APPROVED" && inRange(t.workDate, from, to),
    );
    const activeWindow =
      (p.startDate ? p.startDate.getTime() <= to.getTime() : true) &&
      (p.endDate ? p.endDate.getTime() >= from.getTime() : true);
    return createdIn || tsIn || activeWindow;
  });

  // Pre-compute scoped metrics: when computing cost/profit we restrict
  // approved timesheets to those falling within the period.
  type Scoped = {
    project: (typeof scoped)[number];
    type: ProjectType;
    revenue: number;
    cost: number;
    profit: number;
    marginPct: number;
    mandays: number;
  };
  const scopedMetrics: Scoped[] = scoped.map((p) => {
    const rateMap = new Map<string, number>();
    for (const r of p.resources) rateMap.set(r.userId, r.dailyRate);
    let cost = 0;
    let mandays = 0;
    const monthsTouched = new Set<string>();
    for (const ts of p.timesheets) {
      if (ts.status !== "APPROVED") continue;
      if (!inRange(ts.workDate, from, to)) continue;
      const days = ts.hours / 8;
      mandays += days;
      cost += days * (rateMap.get(ts.userId) ?? ts.user?.dailyRate ?? 0);
      const k = `${ts.workDate.getFullYear()}-${ts.workDate.getMonth()}`;
      monthsTouched.add(k);
    }
    // Include additional project expenses (software/hardware/etc) that fall within the period
    for (const e of p.expenses ?? []) {
      if (!inRange(e.spentAt, from, to)) continue;
      cost += e.amount ?? 0;
    }
    // Pro-rate revenue across project lifetime falling in range
    let revenue = 0;
    if (p.startDate && p.endDate) {
      const total = p.endDate.getTime() - p.startDate.getTime();
      if (total > 0) {
        const overlapStart = Math.max(p.startDate.getTime(), from.getTime());
        const overlapEnd = Math.min(p.endDate.getTime(), to.getTime());
        const overlap = Math.max(0, overlapEnd - overlapStart);
        revenue = (overlap / total) * p.contractValue;
      } else {
        revenue = p.contractValue;
      }
    } else if (monthsTouched.size > 0) {
      revenue = p.contractValue;
    } else {
      revenue = p.contractValue * 0.25; // light estimate when no dates/timesheets
    }
    const profit = revenue - cost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { project: p, type: classifyProject(p), revenue, cost, profit, marginPct, mandays };
  });

  // ------- 1) Profitability by Project Type -------
  const byType = new Map<ProjectType, { revenue: number; cost: number; profit: number; count: number; marginSum: number; marginCount: number }>();
  for (const t of PROJECT_TYPES) {
    byType.set(t, { revenue: 0, cost: 0, profit: 0, count: 0, marginSum: 0, marginCount: 0 });
  }
  for (const m of scopedMetrics) {
    const b = byType.get(m.type)!;
    b.revenue += m.revenue;
    b.cost += m.cost;
    b.profit += m.profit;
    b.count += 1;
    if (m.revenue > 0) {
      b.marginSum += m.marginPct;
      b.marginCount += 1;
    }
  }
  const profitabilityByType = Array.from(byType.entries())
    .map(([type, v]) => ({
      type,
      revenue: v.revenue,
      cost: v.cost,
      profit: v.profit,
      projectCount: v.count,
      avgMarginPct: v.marginCount > 0 ? v.marginSum / v.marginCount : 0,
    }))
    .filter((r) => r.projectCount > 0)
    .sort((a, b) => b.profit - a.profit);

  const topTypes = [...profitabilityByType]
    .sort((a, b) => b.avgMarginPct - a.avgMarginPct)
    .slice(0, 3)
    .map((r) => ({ type: r.type, avgMarginPct: r.avgMarginPct, profit: r.profit }));

  // ------- 2) Team Performance per Principal (PM) -------
  const principalUsers = await prisma.user.findMany({
    where: { role: { in: ["MANAGEMENT", "PROJECT_MANAGER"] }, deletedAt: null },
    select: { id: true, name: true, role: true },
  });
  const principalMap = new Map(principalUsers.map((u) => [u.id, u]));

  type PerfBucket = {
    principalId: string;
    principalName: string;
    principalRole: string;
    revenue: number;
    cost: number;
    profit: number;
    marginSum: number;
    marginCount: number;
    projectCount: number;
    teamUserIds: Set<string>;
    teamMandays: number;
  };
  const perf = new Map<string, PerfBucket>();
  for (const m of scopedMetrics) {
    const pmId = m.project.pmId;
    if (!pmId) continue;
    const p = principalMap.get(pmId);
    if (!p) continue;
    let b = perf.get(pmId);
    if (!b) {
      b = {
        principalId: pmId,
        principalName: p.name,
        principalRole: p.role,
        revenue: 0,
        cost: 0,
        profit: 0,
        marginSum: 0,
        marginCount: 0,
        projectCount: 0,
        teamUserIds: new Set<string>(),
        teamMandays: 0,
      };
      perf.set(pmId, b);
    }
    b.revenue += m.revenue;
    b.cost += m.cost;
    b.profit += m.profit;
    if (m.revenue > 0) {
      b.marginSum += m.marginPct;
      b.marginCount += 1;
    }
    b.projectCount += 1;
    b.teamMandays += m.mandays;
    for (const r of m.project.resources) b.teamUserIds.add(r.userId);
  }

  // Compute team utilization for each principal
  const teamUtilByUser = new Map<string, { capacity: number; actual: number }>();
  const periodWorkdays = (() => {
    let n = 0;
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    while (cur <= end) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) n += 1;
      cur.setDate(cur.getDate() + 1);
    }
    return n;
  })();
  const allTeamUserIds = new Set<string>();
  for (const b of perf.values()) for (const id of b.teamUserIds) allTeamUserIds.add(id);
  if (allTeamUserIds.size > 0) {
    const tsRows = await prisma.timesheet.groupBy({
      by: ["userId"],
      where: {
        status: "APPROVED",
        workDate: { gte: from, lte: to },
        userId: { in: Array.from(allTeamUserIds) },
      },
      _sum: { hours: true },
    });
    for (const r of tsRows) {
      teamUtilByUser.set(r.userId, {
        capacity: periodWorkdays * 8,
        actual: r._sum.hours ?? 0,
      });
    }
  }

  const teamPerformance = Array.from(perf.values())
    .map((b) => {
      let utilSum = 0;
      let utilCount = 0;
      for (const id of b.teamUserIds) {
        const u = teamUtilByUser.get(id);
        if (u && u.capacity > 0) {
          utilSum += (u.actual / u.capacity) * 100;
          utilCount += 1;
        }
      }
      return {
        principalId: b.principalId,
        principalName: b.principalName,
        principalRole: b.principalRole,
        revenue: b.revenue,
        cost: b.cost,
        profit: b.profit,
        avgMarginPct: b.marginCount > 0 ? b.marginSum / b.marginCount : 0,
        projectCount: b.projectCount,
        teamSize: b.teamUserIds.size,
        avgUtilizationPct: utilCount > 0 ? utilSum / utilCount : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  // ------- 3) Resource Demand Forecast (next 3 months) -------
  const today = new Date();
  const monthBuckets: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + i + 1, 0);
    monthBuckets.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      start,
      end,
    });
  }

  type DemandRow = {
    month: string;
    label: string;
    junior: number;
    senior: number;
    writer: number;
    admin: number;
    pm: number;
    totalDemandMandays: number;
    capacityMandays: number;
    shortage: number;
  };

  const forecastProjects = allProjects.filter(
    (p) =>
      (p.status === "ACTIVE" || p.status === "OBSERVATION") &&
      (!principalId || p.pmId === principalId) &&
      (!projectTypeFilter || classifyProject(p) === projectTypeFilter),
  );

  const remainingByProject = forecastProjects.map((p) => {
    const m = computeMetrics(p);
    const remaining = Math.max(0, p.plannedMandays - m.actualMandays);
    return { project: p, remaining };
  });

  // Distinct active staff for capacity
  const staffByRole = await prisma.user.groupBy({
    by: ["role"],
    where: { isActive: true, deletedAt: null },
    _count: { _all: true },
  });
  const headcount = (role: string) =>
    staffByRole.find((r) => r.role === role)?._count._all ?? 0;
  const juniorSeniorTotal = headcount("KONSULTAN");
  // Heuristic split: 60% senior, 40% junior of consultants
  const seniorCap = Math.round(juniorSeniorTotal * 0.6);
  const juniorCap = juniorSeniorTotal - seniorCap;
  const writerCap = headcount("TECHNICAL_WRITER");
  const adminCap = headcount("ADMIN_PROJECT");
  const pmCap = headcount("PROJECT_MANAGER");

  const workdaysIn = (start: Date, end: Date) => {
    let n = 0;
    const c = new Date(start);
    while (c <= end) {
      const d = c.getDay();
      if (d !== 0 && d !== 6) n += 1;
      c.setDate(c.getDate() + 1);
    }
    return n;
  };

  const forecast: DemandRow[] = monthBuckets.map((b) => {
    let junior = 0,
      senior = 0,
      writer = 0,
      admin = 0,
      pm = 0;
    for (const { project, remaining } of remainingByProject) {
      if (remaining <= 0) continue;
      // Spread remaining across months between today and project.endDate
      const projEnd = project.endDate ?? new Date(today.getFullYear(), today.getMonth() + 3, 0);
      const projStart = today > (project.startDate ?? today) ? today : project.startDate!;
      const spreadStart = projStart > today ? projStart : today;
      const totalDays = Math.max(1, workdaysIn(spreadStart, projEnd));
      const overlapStart = b.start > spreadStart ? b.start : spreadStart;
      const overlapEnd = b.end < projEnd ? b.end : projEnd;
      if (overlapEnd < overlapStart) continue;
      const overlapDays = workdaysIn(overlapStart, overlapEnd);
      if (overlapDays <= 0) continue;
      const portion = (overlapDays / totalDays) * remaining;

      // Distribute across role categories from project resources
      const resByRole = { KONSULTAN: 0, TECHNICAL_WRITER: 0, ADMIN_PROJECT: 0, PROJECT_MANAGER: 0 };
      let plannedSum = 0;
      for (const r of project.resources) {
        const role = (r.user.role as keyof typeof resByRole) || "KONSULTAN";
        resByRole[role] = (resByRole[role] ?? 0) + r.plannedMandays;
        plannedSum += r.plannedMandays;
      }
      if (plannedSum === 0) {
        // fall back: assume all KONSULTAN
        resByRole.KONSULTAN = 1;
        plannedSum = 1;
      }
      const consultantPortion = (resByRole.KONSULTAN / plannedSum) * portion;
      senior += consultantPortion * 0.6;
      junior += consultantPortion * 0.4;
      writer += (resByRole.TECHNICAL_WRITER / plannedSum) * portion;
      admin += (resByRole.ADMIN_PROJECT / plannedSum) * portion;
      pm += (resByRole.PROJECT_MANAGER / plannedSum) * portion;
    }
    const totalDemand = junior + senior + writer + admin + pm;
    const monthWorkdays = workdaysIn(b.start, b.end);
    const totalCapacity =
      monthWorkdays * (juniorCap + seniorCap + writerCap + adminCap + pmCap);
    return {
      month: b.key,
      label: b.label,
      junior: Math.round(junior * 10) / 10,
      senior: Math.round(senior * 10) / 10,
      writer: Math.round(writer * 10) / 10,
      admin: Math.round(admin * 10) / 10,
      pm: Math.round(pm * 10) / 10,
      totalDemandMandays: Math.round(totalDemand * 10) / 10,
      capacityMandays: totalCapacity,
      shortage: Math.max(0, Math.round((totalDemand - totalCapacity) * 10) / 10),
    };
  });

  // ------- 4) Overall Business Health -------
  // Profit margin month and quarter
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  function rangeMargin(s: Date, e: Date) {
    let revenue = 0;
    let cost = 0;
    for (const p of allProjects) {
      const rateMap = new Map<string, number>();
      for (const r of p.resources) rateMap.set(r.userId, r.dailyRate);
      for (const ts of p.timesheets) {
        if (ts.status !== "APPROVED") continue;
        if (!inRange(ts.workDate, s, e)) continue;
        const days = ts.hours / 8;
        cost += days * (rateMap.get(ts.userId) ?? ts.user?.dailyRate ?? 0);
      }
      // Additional project expenses falling in the range count as cost too
      for (const ex of p.expenses ?? []) {
        if (!inRange(ex.spentAt, s, e)) continue;
        cost += ex.amount ?? 0;
      }
      if (p.startDate && p.endDate) {
        const total = p.endDate.getTime() - p.startDate.getTime();
        if (total > 0) {
          const overlapStart = Math.max(p.startDate.getTime(), s.getTime());
          const overlapEnd = Math.min(p.endDate.getTime(), e.getTime());
          const overlap = Math.max(0, overlapEnd - overlapStart);
          revenue += (overlap / total) * p.contractValue;
        }
      }
    }
    return revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
  }

  const monthMarginPct = rangeMargin(monthStart, todayEnd);
  const quarterMarginPct = rangeMargin(quarterStart, todayEnd);

  // Average project duration (days) for completed/closed projects
  const finished = allProjects.filter(
    (p) => (p.status === "CLOSED" || p.status === "COMPLETE") && p.startDate && p.endDate,
  );
  const avgProjectDurationDays =
    finished.length > 0
      ? finished.reduce(
          (s, p) => s + (p.endDate!.getTime() - p.startDate!.getTime()) / 86400000,
          0,
        ) / finished.length
      : 0;

  // Utilization trend last 3 months
  const headcountAll = await prisma.user.count({
    where: {
      isActive: true,
      deletedAt: null,
      role: { in: ["KONSULTAN", "TECHNICAL_WRITER", "PROJECT_MANAGER"] },
    },
  });
  const utilTrend: { month: string; label: string; utilizationPct: number; hours: number }[] = [];
  for (let i = 2; i >= 0; i -= 1) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const cap = workdaysIn(start, end) * headcountAll * 8;
    const tsRows = await prisma.timesheet.aggregate({
      where: { status: "APPROVED", workDate: { gte: start, lte: end } },
      _sum: { hours: true },
    });
    const hrs = tsRows._sum.hours ?? 0;
    utilTrend.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      utilizationPct: cap > 0 ? (hrs / cap) * 100 : 0,
      hours: hrs,
    });
  }

  // Project success rate: closed projects with positive profit
  const closedProjects = allProjects.filter((p) => p.status === "CLOSED");
  const successfulClosed = closedProjects.filter((p) => {
    const m = computeMetrics(p);
    return m.actualProfit > 0;
  }).length;
  const projectSuccessRatePct =
    closedProjects.length > 0 ? (successfulClosed / closedProjects.length) * 100 : 0;

  // Top 5 most profitable projects (within scope)
  const topProjects = [...scopedMetrics]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map((m) => ({
      id: m.project.id,
      code: m.project.code,
      name: m.project.name,
      clientName: m.project.client.name,
      type: m.type,
      revenue: m.revenue,
      cost: m.cost,
      profit: m.profit,
      marginPct: m.marginPct,
    }));

  res.json({
    period: {
      label,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    filters: {
      principals: principalUsers.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      })),
      projectTypes: PROJECT_TYPES,
    },
    profitabilityByType,
    topTypes,
    teamPerformance,
    forecast,
    forecastCapacity: {
      junior: juniorCap,
      senior: seniorCap,
      writer: writerCap,
      admin: adminCap,
      pm: pmCap,
    },
    health: {
      monthMarginPct,
      quarterMarginPct,
      avgProjectDurationDays,
      utilizationTrend: utilTrend,
      projectSuccessRatePct,
      closedProjectCount: closedProjects.length,
      successfulClosedCount: successfulClosed,
      topProjects,
    },
  });
});

export default router;
