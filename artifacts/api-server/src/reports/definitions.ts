import { prisma } from "@workspace/db";
import { computeMetrics, projectInclude } from "../lib/serializers.js";
import type { ReportDefinition, ReportContext, ReportResult, ReportRow } from "./types.js";

const projectStatusBadgeMap = {
  DRAFT: "secondary",
  OBSERVATION: "outline",
  ACTIVE: "default",
  PAUSE: "warning",
  COMPLETE: "success",
  CLOSED: "secondary",
} as const;

const expenseStatusBadgeMap = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
} as const;

const billingStatusBadgeMap = {
  PLANNED: "secondary",
  INVOICED: "default",
  PAID: "success",
  CANCELLED: "destructive",
} as const;

function parseDateOrUndefined(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

function yearOrCurrent(s: string | undefined): number {
  const n = Number(s);
  if (Number.isInteger(n) && n >= 2000 && n <= 2100) return n;
  return new Date().getFullYear();
}

function sumColumns(rows: ReportRow[], keys: string[]): ReportRow {
  const totals: ReportRow = {};
  for (const k of keys) totals[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return totals;
}

function avgColumn(rows: ReportRow[], key: string): number {
  if (rows.length === 0) return 0;
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length;
}

// =====================================================================
// 1. PROFITABILITY PER PROJECT
// =====================================================================
const profitabilityPerProject: ReportDefinition = {
  id: "profitability-per-project",
  name: "Profitability per Project",
  description: "Margin & profit per project, filterable by status / PM / period. Sorted by worst margin first.",
  category: "profitability",
  scope: ["MANAGEMENT", "PROJECT_MANAGER", "FINANCE"],
  filters: [
    { key: "status", label: "Status", type: "select", optionsSource: "projectStatuses" },
    { key: "pmId", label: "PM", type: "select", optionsSource: "pms", scope: ["MANAGEMENT", "FINANCE"] },
    { key: "clientId", label: "Client", type: "select", optionsSource: "clients" },
    { key: "startFrom", label: "Start From", type: "date" },
    { key: "startTo", label: "Start To", type: "date" },
  ],
  columns: [
    { key: "code", label: "Code", type: "string", width: 90 },
    { key: "name", label: "Project", type: "string", width: 200 },
    { key: "clientName", label: "Client", type: "string", width: 140 },
    { key: "pmName", label: "PM", type: "string", width: 130 },
    { key: "status", label: "Status", type: "badge", width: 100, badgeMap: projectStatusBadgeMap },
    { key: "contractValue", label: "Contract Value", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "actualCost", label: "Actual Cost", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "actualProfit", label: "Profit", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "marginPct", label: "Margin %", type: "percent", align: "right", width: 90, fixed: 1 },
    { key: "burnRatePct", label: "Burn %", type: "percent", align: "right", width: 80, fixed: 1 },
  ],
  query: async (ctx) => {
    const where: any = { deletedAt: null };
    if (ctx.user.role === "PROJECT_MANAGER") where.pmId = ctx.user.sub;
    if (ctx.filters.status) where.status = ctx.filters.status;
    if (ctx.filters.pmId && ctx.user.role === "MANAGEMENT") where.pmId = ctx.filters.pmId;
    if (ctx.filters.clientId) where.clientId = ctx.filters.clientId;
    const from = parseDateOrUndefined(ctx.filters.startFrom);
    const to = parseDateOrUndefined(ctx.filters.startTo);
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = from;
      if (to) where.startDate.lte = to;
    }
    const projects = await prisma.project.findMany({ where, include: projectInclude, orderBy: { createdAt: "desc" } });
    const rows: ReportRow[] = projects.map((p) => {
      const m = computeMetrics(p as any);
      return {
        code: p.code,
        name: p.name,
        clientName: (p as any).client?.name ?? "-",
        pmName: (p as any).pm?.name ?? "Unassigned",
        status: p.status,
        contractValue: p.contractValue,
        actualCost: m.actualCost,
        actualProfit: m.actualProfit,
        marginPct: m.marginPct,
        burnRatePct: m.burnRatePct,
      };
    });
    rows.sort((a, b) => Number(a.marginPct) - Number(b.marginPct));
    return { rows, totals: sumColumns(rows, ["contractValue", "actualCost", "actualProfit"]) };
  },
};

// =====================================================================
// 2. MARGIN TREND BY BUSINESS UNIT (monthly)
// =====================================================================
const marginTrendByBu: ReportDefinition = {
  id: "margin-trend-by-bu",
  name: "Margin Trend per Business Unit",
  description: "Monthly margin & profit trend per Business Unit (grouped by the project PM's BU).",
  category: "profitability",
  scope: ["MANAGEMENT", "FINANCE"],
  filters: [
    { key: "year", label: "Year", type: "year", optionsSource: "yearList", defaultValue: String(new Date().getFullYear()) },
    { key: "businessUnitId", label: "Business Unit", type: "select", optionsSource: "businessUnits" },
  ],
  columns: [
    { key: "month", label: "Month", type: "month", width: 90 },
    { key: "businessUnit", label: "Business Unit", type: "string", width: 160 },
    { key: "activeProjects", label: "# Active", type: "number", align: "right", width: 80 },
    { key: "revenueNet", label: "Revenue (DPP)", type: "currency", align: "right", width: 140, total: "sum" },
    { key: "actualCost", label: "Cost", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "profit", label: "Profit", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "marginPct", label: "Margin %", type: "percent", align: "right", width: 90, fixed: 1 },
  ],
  chart: { type: "line", xKey: "month", yKey: "marginPct", yLabel: "Margin %" },
  query: async (ctx) => {
    const year = yearOrCurrent(ctx.filters.year);
    const buFilter = ctx.filters.businessUnitId;
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, status: { not: "DRAFT" } },
      include: { ...projectInclude, pm: { include: { businessUnit: true } } } as any,
    });
    // Map: month-bu -> {revenueNet, cost, profit, count}
    const map = new Map<string, { month: string; bu: string; revenueNet: number; cost: number; profit: number; projectIds: Set<string> }>();
    for (const p of projects as any[]) {
      const buId = p.pm?.businessUnitId ?? null;
      const buName = p.pm?.businessUnit?.name ?? "Unassigned";
      if (buFilter && buId !== buFilter) continue;
      const m = computeMetrics(p);
      // Distribute project across active months in the year
      const start = p.startDate ? new Date(p.startDate) : null;
      const end = p.endDate ? new Date(p.endDate) : null;
      if (!start || !end) continue;
      const months: string[] = [];
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const stop = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor.getTime() <= stop.getTime()) {
        if (cursor.getFullYear() === year) {
          months.push(`${year}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (months.length === 0) continue;
      const monthlyRevenue = m.revenueNet / months.length;
      const monthlyCost = m.actualCost / months.length;
      for (const month of months) {
        const key = `${month}|${buName}`;
        const cur = map.get(key) ?? { month, bu: buName, revenueNet: 0, cost: 0, profit: 0, projectIds: new Set() };
        cur.revenueNet += monthlyRevenue;
        cur.cost += monthlyCost;
        cur.profit += monthlyRevenue - monthlyCost;
        cur.projectIds.add(p.id);
        map.set(key, cur);
      }
    }
    const rows: ReportRow[] = Array.from(map.values())
      .sort((a, b) => (a.month + a.bu).localeCompare(b.month + b.bu))
      .map((v) => ({
        month: v.month,
        businessUnit: v.bu,
        activeProjects: v.projectIds.size,
        revenueNet: v.revenueNet,
        actualCost: v.cost,
        profit: v.profit,
        marginPct: v.revenueNet > 0 ? (v.profit / v.revenueNet) * 100 : 0,
      }));
    return { rows, totals: sumColumns(rows, ["revenueNet", "actualCost", "profit"]) };
  },
};

// =====================================================================
// 3. PROFITABILITY PER CLIENT
// =====================================================================
const profitabilityPerClient: ReportDefinition = {
  id: "profitability-per-client",
  name: "Profitability per Client",
  description: "Total revenue, cost, profit, and margin per client. Sorted by largest profit first.",
  category: "profitability",
  scope: ["MANAGEMENT", "FINANCE"],
  filters: [
    { key: "status", label: "Project Status", type: "select", optionsSource: "projectStatuses" },
    { key: "startFrom", label: "Start From", type: "date" },
    { key: "startTo", label: "Start To", type: "date" },
  ],
  columns: [
    { key: "clientName", label: "Client", type: "string", width: 200 },
    { key: "projectCount", label: "# Projects", type: "number", align: "right", width: 100, total: "sum" },
    { key: "totalContract", label: "Total Contract", type: "currency", align: "right", width: 150, total: "sum" },
    { key: "totalCost", label: "Total Cost", type: "currency", align: "right", width: 140, total: "sum" },
    { key: "totalProfit", label: "Total Profit", type: "currency", align: "right", width: 140, total: "sum" },
    { key: "avgMarginPct", label: "Avg Margin %", type: "percent", align: "right", width: 110, fixed: 1 },
    { key: "lastProjectAt", label: "Last Project", type: "date", width: 110 },
  ],
  chart: { type: "bar", xKey: "clientName", yKey: "totalProfit", yLabel: "Total Profit" },
  query: async (ctx) => {
    const where: any = { deletedAt: null };
    if (ctx.filters.status) where.status = ctx.filters.status;
    const from = parseDateOrUndefined(ctx.filters.startFrom);
    const to = parseDateOrUndefined(ctx.filters.startTo);
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = from;
      if (to) where.startDate.lte = to;
    }
    const projects = await prisma.project.findMany({ where, include: projectInclude });
    const map = new Map<string, { clientName: string; count: number; contract: number; cost: number; profit: number; marginSum: number; marginCnt: number; last: Date | null }>();
    for (const p of projects as any[]) {
      const m = computeMetrics(p);
      const cid = p.clientId;
      const cur = map.get(cid) ?? { clientName: p.client?.name ?? "-", count: 0, contract: 0, cost: 0, profit: 0, marginSum: 0, marginCnt: 0, last: null };
      cur.count += 1;
      cur.contract += p.contractValue;
      cur.cost += m.actualCost;
      cur.profit += m.actualProfit;
      if (p.contractValue > 0) {
        cur.marginSum += m.marginPct;
        cur.marginCnt += 1;
      }
      const ts = p.startDate ? new Date(p.startDate) : null;
      if (ts && (!cur.last || ts > cur.last)) cur.last = ts;
      map.set(cid, cur);
    }
    const rows: ReportRow[] = Array.from(map.values())
      .map((v) => ({
        clientName: v.clientName,
        projectCount: v.count,
        totalContract: v.contract,
        totalCost: v.cost,
        totalProfit: v.profit,
        avgMarginPct: v.marginCnt > 0 ? v.marginSum / v.marginCnt : 0,
        lastProjectAt: v.last ? v.last.toISOString() : null,
      }))
      .sort((a, b) => Number(b.totalProfit) - Number(a.totalProfit));
    return { rows, totals: sumColumns(rows, ["projectCount", "totalContract", "totalCost", "totalProfit"]) };
  },
};

// =====================================================================
// 4. RESOURCE UTILIZATION
// =====================================================================
const resourceUtilization: ReportDefinition = {
  id: "resource-utilization",
  name: "Resource Utilization",
  description: "Consultant / Technical Writer utilization for a given period — planned vs actual mandays plus active project count.",
  category: "operations",
  scope: ["MANAGEMENT", "PROJECT_MANAGER", "FINANCE"],
  filters: [
    { key: "from", label: "Period From", type: "date", defaultValue: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10) },
    { key: "to", label: "Period To", type: "date", defaultValue: new Date().toISOString().slice(0, 10) },
    { key: "businessUnitId", label: "Business Unit", type: "select", optionsSource: "businessUnits" },
    { key: "role", label: "Role", type: "select", options: [
      { value: "KONSULTAN", label: "Consultant" },
      { value: "TECHNICAL_WRITER", label: "Technical Writer" },
    ] },
  ],
  columns: [
    { key: "userName", label: "Name", type: "string", width: 160 },
    { key: "role", label: "Role", type: "string", width: 120 },
    { key: "buName", label: "Business Unit", type: "string", width: 130 },
    { key: "seniority", label: "Seniority", type: "string", width: 100 },
    { key: "dailyRate", label: "Daily Rate", type: "currency", align: "right", width: 130 },
    { key: "plannedMandays", label: "Planned MD", type: "number", align: "right", width: 100, fixed: 1, total: "sum" },
    { key: "actualMandays", label: "Actual MD", type: "number", align: "right", width: 100, fixed: 1, total: "sum" },
    { key: "utilizationPct", label: "Utilization %", type: "percent", align: "right", width: 110, fixed: 1 },
    { key: "activeProjects", label: "# Active Proj", type: "number", align: "right", width: 100 },
  ],
  query: async (ctx) => {
    const from = parseDateOrUndefined(ctx.filters.from) ?? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const to = parseDateOrUndefined(ctx.filters.to) ?? new Date();
    const roleFilter = ctx.filters.role;
    const buFilter = ctx.filters.businessUnitId;
    const userWhere: any = { isActive: true, role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } };
    if (roleFilter) userWhere.role = roleFilter;
    if (buFilter) userWhere.businessUnitId = buFilter;
    const users = await prisma.user.findMany({
      where: userWhere,
      include: { businessUnit: true },
    });
    const userIds = users.map((u) => u.id);
    if (ctx.user.role === "PROJECT_MANAGER") {
      const pmProjects = await prisma.project.findMany({ where: { pmId: ctx.user.sub, deletedAt: null }, select: { id: true } });
      const projectIds = pmProjects.map((p) => p.id);
      // Filter users to only those who have resource on PM's projects
      const resources = await prisma.projectResource.findMany({ where: { projectId: { in: projectIds }, userId: { in: userIds } }, select: { userId: true } });
      const allowed = new Set(resources.map((r) => r.userId));
      for (let i = users.length - 1; i >= 0; i--) {
        if (!allowed.has(users[i]!.id)) users.splice(i, 1);
      }
    }
    const filteredIds = users.map((u) => u.id);
    let allowedProjectIds: string[] | null = null;
    if (ctx.user.role === "PROJECT_MANAGER") {
      const pmProjects = await prisma.project.findMany({ where: { pmId: ctx.user.sub, deletedAt: null }, select: { id: true } });
      allowedProjectIds = pmProjects.map((p) => p.id);
    }
    const tsWhere: any = {
      userId: { in: filteredIds },
      status: "APPROVED",
      workDate: { gte: from, lte: to },
    };
    if (allowedProjectIds) tsWhere.projectId = { in: allowedProjectIds };
    const timesheets = await prisma.timesheet.findMany({
      where: tsWhere,
      select: { userId: true, hours: true, projectId: true },
    });
    const resourceWhere: any = { userId: { in: filteredIds } };
    if (allowedProjectIds) resourceWhere.projectId = { in: allowedProjectIds };
    const resources = await prisma.projectResource.findMany({
      where: resourceWhere,
      include: { project: { select: { status: true, deletedAt: true } } },
    });
    const tsByUser = new Map<string, { hours: number; projectIds: Set<string> }>();
    for (const t of timesheets) {
      const c = tsByUser.get(t.userId) ?? { hours: 0, projectIds: new Set() };
      c.hours += t.hours;
      c.projectIds.add(t.projectId);
      tsByUser.set(t.userId, c);
    }
    const plannedByUser = new Map<string, number>();
    const activeByUser = new Map<string, Set<string>>();
    for (const r of resources as any[]) {
      if (r.project?.deletedAt) continue;
      plannedByUser.set(r.userId, (plannedByUser.get(r.userId) ?? 0) + (r.plannedMandays ?? 0));
      if (r.project?.status === "ACTIVE" || r.project?.status === "OBSERVATION") {
        const set = activeByUser.get(r.userId) ?? new Set();
        set.add(r.projectId);
        activeByUser.set(r.userId, set);
      }
    }
    // Working days in range (Mon-Fri)
    let workdays = 0;
    const cur = new Date(from);
    while (cur <= to) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) workdays += 1;
      cur.setDate(cur.getDate() + 1);
    }
    const rows: ReportRow[] = users.map((u) => {
      const ts = tsByUser.get(u.id) ?? { hours: 0, projectIds: new Set() };
      const actual = ts.hours / 8;
      const planned = plannedByUser.get(u.id) ?? 0;
      const utilizationPct = workdays > 0 ? (actual / workdays) * 100 : 0;
      return {
        userName: u.name,
        role: u.role,
        buName: (u as any).businessUnit?.name ?? "-",
        seniority: u.seniority ?? "-",
        dailyRate: u.dailyRate ?? 0,
        plannedMandays: planned,
        actualMandays: actual,
        utilizationPct,
        activeProjects: activeByUser.get(u.id)?.size ?? 0,
      };
    }).sort((a, b) => Number(a.utilizationPct) - Number(b.utilizationPct));
    return { rows, totals: { plannedMandays: rows.reduce((s, r) => s + Number(r.plannedMandays), 0), actualMandays: rows.reduce((s, r) => s + Number(r.actualMandays), 0) } };
  },
};

// =====================================================================
// 5. PROJECT BURN RATE & MANDAYS VARIANCE
// =====================================================================
const projectBurnRate: ReportDefinition = {
  id: "project-burn-rate",
  name: "Project Burn Rate & Mandays Variance",
  description: "Planned vs actual mandays variance per active project. Ranked by variance (over-budget first).",
  category: "operations",
  scope: ["MANAGEMENT", "PROJECT_MANAGER", "FINANCE"],
  filters: [
    { key: "status", label: "Status", type: "select", optionsSource: "projectStatuses", defaultValue: "ACTIVE" },
    { key: "pmId", label: "PM", type: "select", optionsSource: "pms", scope: ["MANAGEMENT", "FINANCE"] },
  ],
  columns: [
    { key: "code", label: "Code", type: "string", width: 90 },
    { key: "name", label: "Project", type: "string", width: 200 },
    { key: "pmName", label: "PM", type: "string", width: 130 },
    { key: "status", label: "Status", type: "badge", width: 100, badgeMap: projectStatusBadgeMap },
    { key: "plannedMandays", label: "Planned MD", type: "number", align: "right", width: 100, fixed: 1, total: "sum" },
    { key: "actualMandays", label: "Actual MD", type: "number", align: "right", width: 100, fixed: 1, total: "sum" },
    { key: "varianceMd", label: "Variance MD", type: "number", align: "right", width: 110, fixed: 1, total: "sum" },
    { key: "variancePct", label: "Variance %", type: "percent", align: "right", width: 100, fixed: 1 },
    { key: "burnRatePct", label: "Burn %", type: "percent", align: "right", width: 90, fixed: 1 },
    { key: "daysRemaining", label: "Days Left", type: "number", align: "right", width: 90 },
  ],
  query: async (ctx) => {
    const where: any = { deletedAt: null };
    if (ctx.user.role === "PROJECT_MANAGER") where.pmId = ctx.user.sub;
    where.status = ctx.filters.status || "ACTIVE";
    if (ctx.filters.pmId && ctx.user.role === "MANAGEMENT") where.pmId = ctx.filters.pmId;
    const projects = await prisma.project.findMany({ where, include: projectInclude });
    const today = new Date();
    const rows: ReportRow[] = (projects as any[]).map((p) => {
      const m = computeMetrics(p);
      const planned = p.plannedMandays ?? 0;
      const actual = m.actualMandays;
      const variance = actual - planned;
      const variancePct = planned > 0 ? (variance / planned) * 100 : 0;
      const end = p.endDate ? new Date(p.endDate) : null;
      const daysLeft = end ? Math.ceil((end.getTime() - today.getTime()) / (24 * 3600 * 1000)) : 0;
      return {
        code: p.code,
        name: p.name,
        pmName: p.pm?.name ?? "-",
        status: p.status,
        plannedMandays: planned,
        actualMandays: actual,
        varianceMd: variance,
        variancePct,
        burnRatePct: m.burnRatePct,
        daysRemaining: daysLeft,
      };
    }).sort((a, b) => Number(b.variancePct) - Number(a.variancePct));
    return { rows, totals: sumColumns(rows, ["plannedMandays", "actualMandays", "varianceMd"]) };
  },
};

// =====================================================================
// 6. PM WORKLOAD & ALLOCATION
// =====================================================================
const pmWorkload: ReportDefinition = {
  id: "pm-workload",
  name: "PM Workload & Allocation",
  description: "Workload per PM — projects by status, total contract value, average margin.",
  category: "operations",
  scope: ["MANAGEMENT", "FINANCE"],
  filters: [],
  columns: [
    { key: "pmName", label: "PM", type: "string", width: 160 },
    { key: "draft", label: "Draft", type: "number", align: "right", width: 70, total: "sum" },
    { key: "observation", label: "Observation", type: "number", align: "right", width: 100, total: "sum" },
    { key: "active", label: "Active", type: "number", align: "right", width: 70, total: "sum" },
    { key: "pause", label: "Pause", type: "number", align: "right", width: 70, total: "sum" },
    { key: "complete", label: "Complete", type: "number", align: "right", width: 90, total: "sum" },
    { key: "totalInflight", label: "Total In-flight", type: "number", align: "right", width: 100, total: "sum" },
    { key: "totalContract", label: "Total Contract", type: "currency", align: "right", width: 150, total: "sum" },
    { key: "avgMarginPct", label: "Avg Margin %", type: "percent", align: "right", width: 110, fixed: 1 },
  ],
  chart: { type: "bar", xKey: "pmName", yKey: "totalInflight", yLabel: "In-flight Projects" },
  query: async () => {
    const pms = await prisma.user.findMany({ where: { role: "PROJECT_MANAGER", isActive: true } });
    const projects = await prisma.project.findMany({ where: { deletedAt: null, pmId: { in: pms.map((p) => p.id) } }, include: projectInclude });
    const map = new Map<string, any>();
    for (const pm of pms) {
      map.set(pm.id, { pmName: pm.name, draft: 0, observation: 0, active: 0, pause: 0, complete: 0, totalContract: 0, marginSum: 0, marginCnt: 0 });
    }
    for (const p of projects as any[]) {
      const cur = map.get(p.pmId);
      if (!cur) continue;
      const status = String(p.status).toLowerCase();
      if (status in cur) cur[status] += 1;
      cur.totalContract += p.contractValue;
      const m = computeMetrics(p);
      if (p.contractValue > 0) {
        cur.marginSum += m.marginPct;
        cur.marginCnt += 1;
      }
    }
    const rows: ReportRow[] = Array.from(map.values()).map((v) => ({
      pmName: v.pmName,
      draft: v.draft,
      observation: v.observation,
      active: v.active,
      pause: v.pause,
      complete: v.complete,
      totalInflight: v.draft + v.observation + v.active + v.pause,
      totalContract: v.totalContract,
      avgMarginPct: v.marginCnt > 0 ? v.marginSum / v.marginCnt : 0,
    })).sort((a, b) => Number(b.totalInflight) - Number(a.totalInflight));
    return { rows, totals: sumColumns(rows, ["draft", "observation", "active", "pause", "complete", "totalInflight", "totalContract"]) };
  },
};

// =====================================================================
// 7. BILLING STATUS AGING
// =====================================================================
const billingAging: ReportDefinition = {
  id: "billing-aging",
  name: "Billing Status Aging",
  description: "Billing milestones with overdue aging buckets. Longest unpaid sorted first.",
  category: "cashflow",
  scope: ["MANAGEMENT", "PROJECT_MANAGER", "FINANCE"],
  filters: [
    { key: "status", label: "Status", type: "select", optionsSource: "billingStatuses" },
    { key: "agingBucket", label: "Aging Bucket", type: "select", optionsSource: "agingBuckets" },
  ],
  columns: [
    { key: "projectCode", label: "Project", type: "string", width: 90 },
    { key: "projectName", label: "Name", type: "string", width: 180 },
    { key: "clientName", label: "Client", type: "string", width: 140 },
    { key: "milestoneName", label: "Milestone", type: "string", width: 160 },
    { key: "dueDate", label: "Due Date", type: "date", width: 100 },
    { key: "status", label: "Status", type: "badge", width: 100, badgeMap: billingStatusBadgeMap },
    { key: "daysOverdue", label: "Days Overdue", type: "number", align: "right", width: 110 },
    { key: "dpp", label: "DPP", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "vat", label: "VAT", type: "currency", align: "right", width: 110, total: "sum" },
    { key: "total", label: "Total", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "invoiceNumber", label: "Invoice #", type: "string", width: 110 },
  ],
  query: async (ctx) => {
    const projectWhere: any = { deletedAt: null };
    if (ctx.user.role === "PROJECT_MANAGER") projectWhere.pmId = ctx.user.sub;
    const projects = await prisma.project.findMany({ where: projectWhere, select: { id: true, code: true, name: true, contractValue: true, vatPercent: true, contractValueIncludesVat: true, client: { select: { name: true } } } });
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const milestones = await prisma.billingMilestone.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, orderBy: { dueDate: "asc" } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let rows: ReportRow[] = milestones.map((m) => {
      const p = projectMap.get(m.projectId)!;
      const gross = m.amount ?? (p.contractValue * (m.percentage ?? 0)) / 100;
      const vatPct = p.vatPercent ?? 11;
      const includesVat = p.contractValueIncludesVat ?? true;
      const dpp = includesVat ? gross / (1 + vatPct / 100) : gross;
      const vat = includesVat ? gross - dpp : gross * (vatPct / 100);
      const total = dpp + vat;
      const due = m.dueDate ? new Date(m.dueDate) : null;
      const isOpen = m.status === "PLANNED" || m.status === "INVOICED";
      const daysOverdue = due && isOpen ? Math.max(0, Math.ceil((today.getTime() - due.getTime()) / (24 * 3600 * 1000))) : 0;
      return {
        projectCode: p.code,
        projectName: p.name,
        clientName: p.client?.name ?? "-",
        milestoneName: m.name,
        dueDate: m.dueDate ? m.dueDate.toISOString() : null,
        status: m.status,
        daysOverdue,
        dpp,
        vat,
        total,
        invoiceNumber: m.invoiceNumber ?? "",
      };
    });
    if (ctx.filters.status) rows = rows.filter((r) => r.status === ctx.filters.status);
    if (ctx.filters.agingBucket) {
      const b = ctx.filters.agingBucket;
      rows = rows.filter((r) => {
        const d = Number(r.daysOverdue);
        if (b === "0-30") return d > 0 && d <= 30;
        if (b === "31-60") return d > 30 && d <= 60;
        if (b === "61-90") return d > 60 && d <= 90;
        if (b === "90+") return d > 90;
        return true;
      });
    }
    rows.sort((a, b) => Number(b.daysOverdue) - Number(a.daysOverdue));
    return { rows, totals: sumColumns(rows, ["dpp", "vat", "total"]) };
  },
};

// =====================================================================
// 8. CASH INFLOW FORECAST
// =====================================================================
const cashInflowForecast: ReportDefinition = {
  id: "cash-inflow-forecast",
  name: "Cash Inflow Forecast",
  description: "Monthly cash inflow forecast based on billing milestones (PLANNED + INVOICED).",
  category: "cashflow",
  scope: ["MANAGEMENT", "FINANCE"],
  filters: [
    { key: "year", label: "Year", type: "year", optionsSource: "yearList", defaultValue: String(new Date().getFullYear()) },
    { key: "clientId", label: "Client", type: "select", optionsSource: "clients" },
  ],
  columns: [
    { key: "month", label: "Month", type: "month", width: 90 },
    { key: "milestoneCount", label: "# Milestones", type: "number", align: "right", width: 110, total: "sum" },
    { key: "expectedDpp", label: "Expected DPP", type: "currency", align: "right", width: 150, total: "sum" },
    { key: "expectedVat", label: "Expected VAT", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "expectedTotal", label: "Expected Total", type: "currency", align: "right", width: 150, total: "sum" },
    { key: "invoicedTotal", label: "Already Invoiced", type: "currency", align: "right", width: 150, total: "sum" },
    { key: "plannedTotal", label: "Still Planned", type: "currency", align: "right", width: 150, total: "sum" },
  ],
  chart: { type: "bar", xKey: "month", yKey: "expectedTotal", yLabel: "Expected Cash Inflow", stacked: false },
  query: async (ctx) => {
    const year = yearOrCurrent(ctx.filters.year);
    const projectWhere: any = { deletedAt: null };
    if (ctx.filters.clientId) projectWhere.clientId = ctx.filters.clientId;
    const projects = await prisma.project.findMany({ where: projectWhere, select: { id: true, contractValue: true, vatPercent: true, contractValueIncludesVat: true } });
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const milestones = await prisma.billingMilestone.findMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        dueDate: { gte: yearStart, lte: yearEnd },
        status: { in: ["PLANNED", "INVOICED"] },
      },
    });
    const monthly: Record<string, { count: number; dpp: number; vat: number; total: number; invoiced: number; planned: number }> = {};
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      monthly[key] = { count: 0, dpp: 0, vat: 0, total: 0, invoiced: 0, planned: 0 };
    }
    for (const ms of milestones) {
      const p = projectMap.get(ms.projectId);
      if (!p || !ms.dueDate) continue;
      const key = `${ms.dueDate.getFullYear()}-${String(ms.dueDate.getMonth() + 1).padStart(2, "0")}`;
      const slot = monthly[key];
      if (!slot) continue;
      const gross = ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100;
      const vatPct = p.vatPercent ?? 11;
      const includesVat = p.contractValueIncludesVat ?? true;
      const dpp = includesVat ? gross / (1 + vatPct / 100) : gross;
      const vat = includesVat ? gross - dpp : gross * (vatPct / 100);
      const total = dpp + vat;
      slot.count += 1;
      slot.dpp += dpp;
      slot.vat += vat;
      slot.total += total;
      if (ms.status === "INVOICED") slot.invoiced += total;
      else slot.planned += total;
    }
    const rows: ReportRow[] = Object.entries(monthly).map(([month, v]) => ({
      month,
      milestoneCount: v.count,
      expectedDpp: v.dpp,
      expectedVat: v.vat,
      expectedTotal: v.total,
      invoicedTotal: v.invoiced,
      plannedTotal: v.planned,
    }));
    return { rows, totals: sumColumns(rows, ["milestoneCount", "expectedDpp", "expectedVat", "expectedTotal", "invoicedTotal", "plannedTotal"]) };
  },
};

// =====================================================================
// 9. EXPENSE REPORT
// =====================================================================
const expenseReport: ReportDefinition = {
  id: "expense-report",
  name: "Expense Report per Project",
  description: "Full expense list with submitter, category, approval status and approver.",
  category: "cashflow",
  scope: ["MANAGEMENT", "PROJECT_MANAGER", "FINANCE"],
  filters: [
    { key: "from", label: "From", type: "date" },
    { key: "to", label: "To", type: "date" },
    { key: "category", label: "Category", type: "select", optionsSource: "expenseCategories" },
    { key: "status", label: "Status", type: "select", optionsSource: "expenseStatuses" },
    { key: "projectId", label: "Project", type: "select", optionsSource: "projects" },
  ],
  columns: [
    { key: "spentAt", label: "Date", type: "date", width: 100 },
    { key: "projectCode", label: "Project", type: "string", width: 90 },
    { key: "projectName", label: "Name", type: "string", width: 180 },
    { key: "category", label: "Category", type: "string", width: 100 },
    { key: "description", label: "Description", type: "string", width: 200 },
    { key: "submitter", label: "Submitter", type: "string", width: 130 },
    { key: "amount", label: "Amount", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "status", label: "Status", type: "badge", width: 100, badgeMap: expenseStatusBadgeMap },
    { key: "approver", label: "Approver", type: "string", width: 130 },
    { key: "approvedAt", label: "Approved At", type: "date", width: 110 },
  ],
  query: async (ctx) => {
    const where: any = {};
    let allowedProjectIds: string[] | null = null;
    if (ctx.user.role === "PROJECT_MANAGER") {
      const myProjects = await prisma.project.findMany({ where: { pmId: ctx.user.sub }, select: { id: true } });
      allowedProjectIds = myProjects.map((p) => p.id);
    }
    if (ctx.filters.projectId) {
      if (allowedProjectIds && !allowedProjectIds.includes(ctx.filters.projectId)) {
        return { rows: [] };
      }
      where.projectId = ctx.filters.projectId;
    } else if (allowedProjectIds) {
      where.projectId = { in: allowedProjectIds };
    }
    if (ctx.filters.category) where.category = ctx.filters.category;
    if (ctx.filters.status) where.status = ctx.filters.status;
    const from = parseDateOrUndefined(ctx.filters.from);
    const to = parseDateOrUndefined(ctx.filters.to);
    if (from || to) {
      where.spentAt = {};
      if (from) where.spentAt.gte = from;
      if (to) where.spentAt.lte = to;
    }
    const expenses = await prisma.projectExpense.findMany({
      where,
      include: { project: { select: { code: true, name: true } }, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
      orderBy: { spentAt: "desc" },
    });
    const rows: ReportRow[] = expenses.map((e: any) => ({
      spentAt: e.spentAt ? e.spentAt.toISOString() : null,
      projectCode: e.project?.code ?? "-",
      projectName: e.project?.name ?? "-",
      category: e.category,
      description: e.description,
      submitter: e.createdBy?.name ?? "-",
      amount: e.amount,
      status: e.status,
      approver: e.approvedBy?.name ?? "",
      approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
    }));
    return { rows, totals: sumColumns(rows, ["amount"]) };
  },
};

// =====================================================================
// 10. PPN DETAIL PER INVOICE
// =====================================================================
const ppnDetail: ReportDefinition = {
  id: "ppn-detail",
  name: "VAT Detail per Invoice",
  description: "DPP & VAT 11% breakdown per invoice for monthly VAT tax filing. Filter by year / month / status.",
  category: "compliance",
  scope: ["MANAGEMENT", "FINANCE"],
  filters: [
    { key: "year", label: "Year", type: "year", optionsSource: "yearList", defaultValue: String(new Date().getFullYear()) },
    { key: "month", label: "Month", type: "select", options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]! })) },
    { key: "status", label: "Status", type: "select", options: [
      { value: "INVOICED", label: "Invoiced (unpaid)" },
      { value: "PAID", label: "Paid" },
    ] },
    { key: "clientId", label: "Client", type: "select", optionsSource: "clients" },
  ],
  columns: [
    { key: "invoicedAt", label: "Invoice Date", type: "date", width: 100 },
    { key: "invoiceNumber", label: "Invoice #", type: "string", width: 130 },
    { key: "projectCode", label: "Project", type: "string", width: 90 },
    { key: "projectName", label: "Name", type: "string", width: 180 },
    { key: "clientName", label: "Client", type: "string", width: 140 },
    { key: "milestoneName", label: "Milestone", type: "string", width: 160 },
    { key: "dpp", label: "DPP", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "vat", label: "VAT 11%", type: "currency", align: "right", width: 110, total: "sum" },
    { key: "total", label: "Total", type: "currency", align: "right", width: 130, total: "sum" },
    { key: "status", label: "Status", type: "badge", width: 100, badgeMap: billingStatusBadgeMap },
    { key: "paidAt", label: "Paid Date", type: "date", width: 100 },
  ],
  query: async (ctx) => {
    const year = yearOrCurrent(ctx.filters.year);
    const monthFilter = ctx.filters.month ? Number(ctx.filters.month) : null;
    const statusFilter = ctx.filters.status;
    const clientFilter = ctx.filters.clientId;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const projectWhere: any = { deletedAt: null };
    if (clientFilter) projectWhere.clientId = clientFilter;
    const projects = await prisma.project.findMany({ where: projectWhere, select: { id: true, code: true, name: true, contractValue: true, vatPercent: true, contractValueIncludesVat: true, client: { select: { name: true } } } });
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const milestones = await prisma.billingMilestone.findMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        invoicedAt: { gte: yearStart, lte: yearEnd },
        status: statusFilter ? (statusFilter as any) : { in: ["INVOICED", "PAID"] },
      },
      orderBy: { invoicedAt: "asc" },
    });
    const rows: ReportRow[] = milestones
      .filter((m) => !monthFilter || (m.invoicedAt && m.invoicedAt.getMonth() + 1 === monthFilter))
      .map((m) => {
        const p = projectMap.get(m.projectId)!;
        const gross = m.amount ?? (p.contractValue * (m.percentage ?? 0)) / 100;
        const vatPct = p.vatPercent ?? 11;
        const includesVat = p.contractValueIncludesVat ?? true;
        const dpp = includesVat ? gross / (1 + vatPct / 100) : gross;
        const vat = includesVat ? gross - dpp : gross * (vatPct / 100);
        return {
          invoicedAt: m.invoicedAt ? m.invoicedAt.toISOString() : null,
          invoiceNumber: m.invoiceNumber ?? "-",
          projectCode: p.code,
          projectName: p.name,
          clientName: p.client?.name ?? "-",
          milestoneName: m.name,
          dpp,
          vat,
          total: dpp + vat,
          status: m.status,
          paidAt: m.paidAt ? m.paidAt.toISOString() : null,
        };
      });
    return { rows, totals: sumColumns(rows, ["dpp", "vat", "total"]) };
  },
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  profitabilityPerProject,
  marginTrendByBu,
  profitabilityPerClient,
  resourceUtilization,
  projectBurnRate,
  pmWorkload,
  billingAging,
  cashInflowForecast,
  expenseReport,
  ppnDetail,
];

export function getReportById(id: string): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((r) => r.id === id);
}
