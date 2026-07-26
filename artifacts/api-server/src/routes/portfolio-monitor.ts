import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { computeMetrics } from "../lib/serializers.js";
import type { ProjectWithRelations } from "../lib/serializers.js";
import { TtlCache } from "../lib/ttlCache.js";

const router: IRouter = Router();

// Read-only portfolio aggregation (margins, costs, hours, invoice forecast) over
// every commercial project. Re-scans projects + timesheets + milestones on each
// call; cache per year for a short window matching the frontend staleTime (30s).
// Intentionally per-instance (in-memory): absorbs request herds on a single
// instance; cross-instance staleness is bounded by the 30s TTL.
const portfolioCache = new TtlCache<unknown>(30_000);

// --- date helpers (UTC-anchored to avoid timezone drift) --------------------
function startOfIsoWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}
function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// ISO 8601 week number for a (Monday-anchored) date.
function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

// Project shape needed: enough for computeMetrics PLUS portfolio-only fields.
// Defined locally (not the shared projectMetricsSelect) so widening this never
// adds joins to the hot dashboard aggregation endpoints.
const portfolioMonitorSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  contractValue: true,
  plannedMandays: true,
  estimatedCost: true,
  vatPercent: true,
  contractValueIncludesVat: true,
  currency: true,
  exchangeRate: true,
  pm: { select: { name: true, businessUnit: { select: { name: true } } } },
  client: { select: { name: true } },
  resources: {
    select: {
      userId: true,
      dailyRate: true,
      user: { select: { businessUnit: { select: { name: true } } } },
    },
  },
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
  billingMilestones: {
    select: { amount: true, percentage: true, status: true, dueDate: true },
  },
} as const;

type PortfolioProject = Awaited<
  ReturnType<
    typeof prisma.project.findMany<{ select: typeof portfolioMonitorSelect }>
  >
>[number];

// "Type" column: dominant Business Unit among assigned consultants, falling back
// to the PM's Business Unit (BU is a user attribute, not a project field).
function deriveType(p: PortfolioProject): string | null {
  const counts = new Map<string, number>();
  for (const r of p.resources) {
    const name = r.user?.businessUnit?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best ?? p.pm?.businessUnit?.name ?? null;
}

/**
 * PMO Portfolio & Invoice Forecast.
 *
 * One row per commercial (CLIENT) project that is past intake and not archived
 * (status NOT IN DRAFT/CLOSED), with financials derived from the same
 * `computeMetrics` engine the rest of the app uses, plus a weekly "to be
 * invoiced" forecast (PLANNED billing milestones bucketed by dueDate ISO-week
 * across the requested year).
 *
 * Access: MANAGEMENT only (SUPER_ADMIN bypasses requireRole).
 */
router.get(
  "/portfolio-monitor",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const nowYear = new Date().getUTCFullYear();
    let year = Number(req.query.year);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) year = nowYear;

    const cacheKey = `pm:${year}`;
    const cached = portfolioCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Weekly columns covering the whole year: first ISO-week Monday on/before
    // Jan 1 through the week containing Dec 31.
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEndExcl = new Date(Date.UTC(year + 1, 0, 1));
    const firstWeekStart = startOfIsoWeek(yearStart);
    const weekStarts: Date[] = [];
    for (let cur = firstWeekStart; cur < yearEndExcl; cur = addDaysUtc(cur, 7)) {
      weekStarts.push(cur);
    }
    const weeks = weekStarts.map((cur) => {
      const end = addDaysUtc(cur, 6);
      return {
        key: isoDate(cur),
        label: `W${isoWeekNumber(cur)} (${cur.getUTCDate()}-${end.getUTCDate()})`,
        start: isoDate(cur),
      };
    });
    function weekIndex(due: Date): number {
      const diffDays = Math.floor((due.getTime() - firstWeekStart.getTime()) / 86400000);
      const idx = Math.floor(diffDays / 7);
      return idx >= 0 && idx < weekStarts.length ? idx : -1;
    }

    const projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        kind: "CLIENT",
        status: { in: ["OBSERVATION", "ACTIVE", "PAUSE", "COMPLETE"] },
      },
      select: portfolioMonitorSelect,
      orderBy: { name: "asc" },
    });

    const weeklyTotals = new Array<number>(weeks.length).fill(0);

    const rows = projects.map((p) => {
      const m = computeMetrics(p as unknown as ProjectWithRelations);

      const estimatedMargin =
        p.contractValue > 0
          ? ((p.contractValue - p.estimatedCost) / p.contractValue) * 100
          : 0;
      const actualMargin = m.marginPct;
      const deltaMargin = actualMargin - estimatedMargin;

      const usedHours = m.actualMandays * 8;
      const budgetHours = p.plannedMandays * 8;
      const usedCosts = m.actualCost;
      const budgetCosts = p.estimatedCost;

      let invoiced = 0;
      for (const ms of p.billingMilestones) {
        if (ms.status === "INVOICED" || ms.status === "PAID") {
          invoiced += ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100;
        }
      }

      const weeklyForecast = new Array<number>(weeks.length).fill(0);
      let forecastTotal = 0;
      for (const ms of p.billingMilestones) {
        if (ms.status !== "PLANNED" || !ms.dueDate) continue;
        if (ms.dueDate < yearStart || ms.dueDate >= yearEndExcl) continue;
        const idx = weekIndex(ms.dueDate);
        if (idx < 0) continue;
        const gross = ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100;
        weeklyForecast[idx] += gross;
        weeklyTotals[idx] += gross;
        forecastTotal += gross;
      }

      const zeroBudget = p.estimatedCost <= 0;
      const unusualMargin =
        p.estimatedCost > 0 &&
        p.contractValue > 0 &&
        Math.abs(actualMargin - estimatedMargin) >= 15;

      return {
        projectId: p.id,
        projectCode: p.code ?? null,
        projectName: p.name,
        clientName: p.client?.name ?? null,
        pmName: p.pm?.name ?? null,
        startDate: p.startDate ? isoDate(p.startDate) : null,
        endDate: p.endDate ? isoDate(p.endDate) : null,
        type: deriveType(p),
        stage: p.status,
        sellingAmount: p.contractValue,
        invoiced,
        remainingInvoice: p.contractValue - invoiced,
        usedHours,
        budgetHours,
        deltaHours: usedHours - budgetHours,
        usedCosts,
        budgetCosts,
        deltaCosts: usedCosts - budgetCosts,
        estimatedMargin,
        actualMargin,
        deltaMargin,
        currency: m.currency,
        unusualMargin,
        zeroBudget,
        weeklyForecast,
        forecastTotal,
      };
    });

    const payload = {
      year,
      generatedAt: new Date().toISOString(),
      weeks,
      rows,
      weeklyTotals,
      forecastGrandTotal: weeklyTotals.reduce((s, v) => s + v, 0),
    };
    portfolioCache.set(cacheKey, payload);
    res.json(payload);
  },
);

export default router;
