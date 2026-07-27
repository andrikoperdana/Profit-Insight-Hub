import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { canViewProjectFinancials } from "../lib/serializers.js";
import { isPrincipalRole } from "../lib/roles.js";
import { TtlCache } from "../lib/ttlCache.js";
import * as dash from "../lib/dashboard/compute.js";
import { computeLeadsAnalytics } from "./leads.js";
import { computeSurveySummary } from "./surveys.js";
import { GetDashboardOverviewResponse } from "@workspace/api-zod";

const router: IRouter = Router();
router.use(requireAuth);

// Resource-utilization detail is expensive (loads recent timesheets + active
// assignments for the whole eligible workforce). Cache per caller scope for a
// short window; 30s matches the frontend React Query staleTime.
// NOTE: all TtlCaches in this file are intentionally per-instance (in-memory):
// they absorb request herds on a single instance; a shared/DB cache would add
// a remote round-trip per hit and cross-instance staleness is bounded by the
// 30s TTL anyway.
const utilizationDetailCache = new TtlCache<unknown>(30_000);

// Read-only portfolio aggregations (summary KPIs, profit trend, status mix,
// approval aging, utilization trend). These re-scan the whole project/timesheet
// set on every call and are hit by every dashboard load. Cache per caller scope
// for a short window matching the frontend React Query staleTime (30s). Keys
// MUST encode any scope that changes the result (role, pmId, query params) so
// one caller never serves another's payload.
const aggregationCache = new TtlCache<unknown>(30_000);

// Roles that must NOT see commercial portfolio figures via dashboard endpoints.
// Mirrors the financials masking in serializers.ts.
function requireFinancialView(req: any, res: any): boolean {
  if (!canViewProjectFinancials(req.user?.role)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.get("/dashboard/summary", async (req, res) => {
  if (!requireFinancialView(req, res)) return;
  // Portfolio totals are identical for every financial-viewer role.
  const cached = aggregationCache.get("summary");
  if (cached) {
    res.json(cached);
    return;
  }
  const payload = await dash.computeSummary();
  aggregationCache.set("summary", payload);
  res.json(payload);
});

router.get("/dashboard/profit-trend", async (req, res) => {
  if (!requireFinancialView(req, res)) return;
  const cachedTrend = aggregationCache.get("profit-trend");
  if (cachedTrend) {
    res.json(cachedTrend);
    return;
  }
  const trendPayload = await dash.computeProfitTrend();
  aggregationCache.set("profit-trend", trendPayload);
  res.json(trendPayload);
});

router.get("/dashboard/status-breakdown", async (req, res) => {
  if (!requireFinancialView(req, res)) return;
  const cachedBreakdown = aggregationCache.get("status-breakdown");
  if (cachedBreakdown) {
    res.json(cachedBreakdown);
    return;
  }
  const breakdownPayload = await dash.computeStatusBreakdown();
  aggregationCache.set("status-breakdown", breakdownPayload);
  res.json(breakdownPayload);
});

router.get("/dashboard/top-projects", async (req, res) => {
  if (!requireFinancialView(req, res)) return;
  const insights = await dash.computeProjectInsights(req.user?.role);
  res.json(insights.topProjects);
});

router.get("/dashboard/recent-activity", async (_req, res) => {
  res.json(await dash.computeRecentActivity());
});

router.get("/dashboard/pending-aging", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "SUPER_ADMIN" && role !== "PROJECT_MANAGER" && role !== "FINANCE") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const pmScoped = role === "PROJECT_MANAGER";
  const agingKey = `pending-aging:${role}:${pmScoped ? req.user!.sub : "all"}`;
  const cachedAging = aggregationCache.get(agingKey);
  if (cachedAging) {
    res.json(cachedAging);
    return;
  }
  const agingPayload = await dash.computePendingAging(pmScoped ? req.user!.sub : null);
  aggregationCache.set(agingKey, agingPayload);
  res.json(agingPayload);
});

// Per-PM count of timesheets awaiting approval (status SUBMITTED), grouped by
// the owning project's PM. MANAGEMENT/SUPER_ADMIN only — powers the PM
// Dashboards monitor so a PMO Director can see each PM's outstanding approval
// queue without impersonating them.
router.get("/dashboard/pm-pending-timesheets", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const ppKey = "pm-pending-timesheets:all";
  const cachedPp = aggregationCache.get(ppKey);
  if (cachedPp) {
    res.json(cachedPp);
    return;
  }
  const submitted = await prisma.timesheet.findMany({
    where: { status: "SUBMITTED", project: { deletedAt: null } },
    select: { project: { select: { pmId: true, pm: { select: { name: true } } } } },
  });
  const byPm = new Map<string, { pmId: string; pmName: string; pendingCount: number }>();
  for (const t of submitted) {
    const pmId = t.project?.pmId;
    if (!pmId) continue;
    const existing = byPm.get(pmId);
    if (existing) existing.pendingCount += 1;
    else byPm.set(pmId, { pmId, pmName: t.project?.pm?.name ?? "Unknown", pendingCount: 1 });
  }
  const ppPayload = Array.from(byPm.values()).sort((a, b) => b.pendingCount - a.pendingCount);
  aggregationCache.set(ppKey, ppPayload);
  res.json(ppPayload);
});

router.get("/dashboard/utilization-trend", async (req, res) => {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? 30), 10) || 30, 7), 90);
  const utilKey = `utilization-trend:${days}`;
  const cachedUtil = aggregationCache.get(utilKey);
  if (cachedUtil) {
    res.json(cachedUtil);
    return;
  }
  const utilPayload = await dash.computeUtilizationTrend(days);
  aggregationCache.set(utilKey, utilPayload);
  res.json(utilPayload);
});

router.get("/dashboard/resource-utilization-detail", async (req, res) => {
  const role = req.user!.role;
  const isPrincipal = isPrincipalRole(role);
  if (
    role !== "MANAGEMENT" &&
    role !== "SUPER_ADMIN" &&
    role !== "PROJECT_MANAGER" &&
    role !== "FINANCE" &&
    role !== "HR" &&
    !isPrincipal
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const cacheKey = `${role}:${req.user!.sub}`;
  const cached = utilizationDetailCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const payload = await dash.computeResourceUtilizationDetail(role, req.user!.sub);
  utilizationDetailCache.set(cacheKey, payload);
  res.json(payload);
});

/**
 * Billable Utilization KPI.
 *
 * Measures what % of approved working hours are billable (logged against
 * tasks where Task.billable = true). Timesheets with no taskId or
 * billable=true count as billable; only explicit billable=false counts as
 * non-billable.
 *
 * Access: MANAGEMENT, FINANCE, HR, PROJECT_MANAGER.
 */
router.get("/dashboard/billable-utilization", async (req, res) => {
  const role = req.user!.role;
  if (
    role !== "MANAGEMENT" &&
    role !== "SUPER_ADMIN" &&
    role !== "FINANCE" &&
    role !== "HR" &&
    role !== "PROJECT_MANAGER"
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const days = Math.min(Math.max(parseInt(String(req.query.days ?? 30), 10) || 30, 7), 90);
  res.json(await dash.computeBillableUtilization(role, req.user!.sub, days));
});

router.get("/dashboard/utilization", async (req, res) => {
  // Workforce-wide utilization (userIds, planned/actual mandays) is
  // management/HR data. Mirror /dashboard/resource-utilization-detail's gate.
  const utilRole = req.user!.role;
  if (
    utilRole !== "MANAGEMENT" &&
    utilRole !== "SUPER_ADMIN" &&
    utilRole !== "PROJECT_MANAGER" &&
    utilRole !== "FINANCE" &&
    utilRole !== "HR" &&
    !isPrincipalRole(utilRole)
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
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

// Aggregated single-round-trip payload for the MANAGEMENT/FINANCE dashboard.
// Folds the ~12 first-load dashboard calls into one Promise.all so a cold
// autoscale instance + remote Neon isn't saturated by the request herd (which
// previously blocked even Executive Copilot for ~55s). Cached per role for 30s
// (these payloads are user-independent for portfolio-wide financial viewers)
// with single-flight so concurrent first-loads share one computation.
const overviewCache = new TtlCache<unknown>(30_000);
const overviewInflight = new Map<string, Promise<unknown>>();

router.get("/dashboard/overview", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "FINANCE" && role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const sub = req.user!.sub;
  // FINANCE is a read-only commercial viewer with no people-ops / CRM / CSAT
  // visibility (the dedicated endpoints 403 them), so those sections stay null.
  const isMgmt = role === "MANAGEMENT" || role === "SUPER_ADMIN";
  const key = `overview:${role}`;

  const cached = overviewCache.get(key);
  if (cached) {
    res.json(cached);
    return;
  }

  let inflight = overviewInflight.get(key);
  if (!inflight) {
    inflight = (async () => {
      const [
        summary,
        profitTrend,
        statusBreakdown,
        insights,
        billableUtilization,
        cashFlow,
        recentActivity,
        pendingAging,
        utilizationTrend,
        resourceUtilizationDetail,
        crm,
        csat,
      ] = await Promise.all([
        dash.computeSummary(),
        dash.computeProfitTrend(),
        dash.computeStatusBreakdown(),
        dash.computeProjectInsights(role),
        dash.computeBillableUtilization(role, sub, 30),
        dash.computeCashFlowForecast(),
        isMgmt ? dash.computeRecentActivity() : Promise.resolve(null),
        isMgmt ? dash.computePendingAging(null) : Promise.resolve(null),
        isMgmt ? dash.computeUtilizationTrend(30) : Promise.resolve(null),
        isMgmt
          ? dash.computeResourceUtilizationDetail(role, sub)
          : Promise.resolve(null),
        isMgmt ? computeLeadsAnalytics({}) : Promise.resolve(null),
        isMgmt ? computeSurveySummary({}) : Promise.resolve(null),
      ]);

      const payload = {
        summary,
        profitTrend,
        statusBreakdown,
        topProjects: insights.topProjects,
        losingProjects: insights.losingProjects,
        projectTypeStats: insights.projectTypeStats,
        billableUtilization,
        cashFlow,
        crm,
        csat,
        recentActivity,
        pendingAging,
        utilizationTrend,
        resourceUtilizationDetail,
        pmAllocation: isMgmt ? insights.pmAllocation : null,
        pendingAssignment: isMgmt ? insights.pendingAssignment : null,
      };

      // Non-fatal contract assertion: warn on drift, never strip or block.
      const parsed = GetDashboardOverviewResponse.safeParse(payload);
      if (!parsed.success) {
        req.log.warn(
          { issues: parsed.error.issues.slice(0, 8) },
          "dashboard overview payload failed schema validation",
        );
      }
      return payload;
    })();
    overviewInflight.set(key, inflight);
    void inflight.finally(() => {
      if (overviewInflight.get(key) === inflight) overviewInflight.delete(key);
    });
  }

  try {
    const payload = await inflight;
    overviewCache.set(key, payload);
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "dashboard overview failed");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

export default router;
