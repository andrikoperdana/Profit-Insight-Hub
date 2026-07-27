import { prisma } from "@workspace/db";
import {
  computeMetrics,
  computeHealthScore,
  type ProjectWithRelations,
} from "./serializers.js";

// Deterministic facts that power the AI Executive Copilot briefing. Every number
// surfaced in the UI is computed here from authoritative serializer helpers — the
// LLM only narrates these facts, it never invents figures. See routes/executive-copilot.ts.

export interface ExecutiveCopilotPortfolioFacts {
  totalProjects: number;
  activeProjects: number;
  clientProjects: number;
  totalContractValue: number;
  totalRecognizedRevenue: number;
  totalActualCost: number;
  totalActualProfit: number;
  weightedMarginPct: number;
  portfolioHealthScore: number;
  healthLabel: string;
}

export interface ExecutiveCopilotUtilizationFacts {
  headcount: number;
  billableActive: number;
  idle: number;
  overloaded: number;
  idleLong: number;
  utilizationPct: number;
}

export interface ExecutiveCopilotCashFlowFacts {
  plannedNext30Days: number;
  plannedNext90Days: number;
  outstandingInvoicedAmount: number;
  paidLast90Days: number;
}

export interface ExecutiveCopilotInvoiceFacts {
  invoicedCount: number;
  invoicedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  plannedCount: number;
  plannedAmount: number;
}

export interface ExecutiveCopilotDelayedProject {
  id: string;
  code: string;
  name: string;
  status: string;
  endDate: string | null;
  daysOverdue: number;
}

export interface ExecutiveCopilotRiskProject {
  id: string;
  code: string;
  name: string;
  openCritical: number;
  openHigh: number;
  healthScore: number | null;
}

export interface ExecutiveCopilotFacts {
  portfolio: ExecutiveCopilotPortfolioFacts;
  utilization: ExecutiveCopilotUtilizationFacts;
  cashFlow: ExecutiveCopilotCashFlowFacts;
  invoices: ExecutiveCopilotInvoiceFacts;
  delayedProjects: ExecutiveCopilotDelayedProject[];
  highRiskProjects: ExecutiveCopilotRiskProject[];
}

const DAY_MS = 86_400_000;

// Superset of projectMetricsSelect plus the relations computeHealthScore needs
// (RAID + billing milestones) and the identity/schedule fields used for the
// delayed/high-risk lists. Avoids loading full user rows / documents.
const copilotProjectSelect = {
  id: true,
  code: true,
  name: true,
  kind: true,
  status: true,
  endDate: true,
  contractValue: true,
  plannedMandays: true,
  estimatedCost: true,
  vatPercent: true,
  contractValueIncludesVat: true,
  currency: true,
  exchangeRate: true,
  resources: { select: { userId: true, dailyRate: true } },
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
  raidItems: { select: { status: true, impact: true } },
  billingMilestones: {
    select: {
      status: true,
      amount: true,
      percentage: true,
      dueDate: true,
      paidAt: true,
    },
  },
} as const;

function healthLabelFor(score: number): string {
  return score >= 80 ? "HEALTHY" : score >= 60 ? "AT_RISK" : "CRITICAL";
}

function milestoneAmount(
  ms: { amount: number | null; percentage: number | null },
  contractValue: number,
): number {
  return ms.amount ?? (contractValue * (ms.percentage ?? 0)) / 100;
}

export async function buildUtilizationFacts(
  now: Date,
): Promise<ExecutiveCopilotUtilizationFacts> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recentSince = new Date(startOfDay);
  recentSince.setDate(recentSince.getDate() - 30);
  const last7Since = new Date(startOfDay);
  last7Since.setDate(last7Since.getDate() - 6);

  // Lightweight version of dashboard resource-utilization-detail: we only need
  // the workforce-wide counts, not the per-row breakdown.
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: {
        in: ["KONSULTAN", "TECHNICAL_WRITER", "PROJECT_MANAGER", "ADMIN_PROJECT"],
      },
    },
    select: {
      id: true,
      resources: { select: { project: { select: { status: true } } } },
      timesheets: {
        where: { status: "APPROVED", workDate: { gte: recentSince } },
        select: {
          hours: true,
          workDate: true,
          project: { select: { status: true } },
        },
      },
    },
  });

  let billableActive = 0;
  let idle = 0;
  let overloaded = 0;
  let idleLong = 0;

  for (const u of users) {
    const liveResources = u.resources.filter(
      (r) => r.project.status === "ACTIVE" || r.project.status === "PAUSE",
    );
    const recentProjectIds = new Set(
      u.timesheets
        .filter(
          (t) => t.project.status === "ACTIVE" || t.project.status === "PAUSE",
        )
        .map(() => true),
    );
    const isActive = liveResources.length > 0 || recentProjectIds.size > 0;

    let hours7 = 0;
    let lastTsDate: Date | null = null;
    for (const t of u.timesheets) {
      if (t.workDate >= last7Since) hours7 += t.hours;
      if (!lastTsDate || t.workDate > lastTsDate) lastTsDate = t.workDate;
    }
    const isOverloaded = hours7 / 7 > 8;

    let daysSinceLastActivity: number | null = null;
    if (lastTsDate) {
      daysSinceLastActivity = Math.floor(
        (startOfDay.getTime() - lastTsDate.getTime()) / DAY_MS,
      );
    }
    if (!isActive && (daysSinceLastActivity ?? 999) > 5) idleLong++;

    if (isOverloaded) {
      overloaded++;
      billableActive++;
    } else if (isActive) {
      billableActive++;
    } else {
      idle++;
    }
  }

  const headcount = users.length;
  return {
    headcount,
    billableActive,
    idle,
    overloaded,
    idleLong,
    utilizationPct: headcount > 0 ? (billableActive / headcount) * 100 : 0,
  };
}

export async function buildExecutiveCopilotFacts(): Promise<ExecutiveCopilotFacts> {
  const now = new Date();
  const nowMs = now.getTime();
  const in30 = nowMs + 30 * DAY_MS;
  const in90 = nowMs + 90 * DAY_MS;
  const since90 = nowMs - 90 * DAY_MS;

  const projects = (await prisma.project.findMany({
    where: { deletedAt: null },
    select: copilotProjectSelect,
  })) as unknown as ProjectWithRelations[];

  let totalContractValue = 0;
  let totalRecognizedRevenue = 0;
  let totalActualCost = 0;
  let totalActualProfit = 0;
  let activeProjects = 0;
  let clientProjects = 0;

  // Weighted portfolio health: Σ(score × weight) / Σ(weight). Weight basis is
  // contractValue when the cohort has any, else plannedMandays, else equal.
  let weightedScoreByContract = 0;
  let weightedScorePlanned = 0;
  let scoreSum = 0;
  let healthCohortContract = 0;
  let healthCohortPlanned = 0;
  let healthCohortCount = 0;

  const cashFlow: ExecutiveCopilotCashFlowFacts = {
    plannedNext30Days: 0,
    plannedNext90Days: 0,
    outstandingInvoicedAmount: 0,
    paidLast90Days: 0,
  };
  const invoices: ExecutiveCopilotInvoiceFacts = {
    invoicedCount: 0,
    invoicedAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    plannedCount: 0,
    plannedAmount: 0,
  };

  const delayedProjects: ExecutiveCopilotDelayedProject[] = [];
  const highRiskProjects: ExecutiveCopilotRiskProject[] = [];

  for (const p of projects) {
    const anyP = p as unknown as {
      kind: string;
      code: string;
      name: string;
      endDate: Date | null;
    };
    if (p.status === "ACTIVE") activeProjects++;
    const isClient = anyP.kind === "CLIENT";
    if (isClient) clientProjects++;

    const metrics = computeMetrics(p);
    const health = computeHealthScore(p, metrics);

    // Commercial portfolio financials are CLIENT-only (mirrors dashboard summary).
    if (isClient) {
      totalContractValue += p.contractValue;
      totalRecognizedRevenue += metrics.recognizedRevenue;
      totalActualCost += metrics.actualCost;
      totalActualProfit += metrics.actualProfit;

      if (health) {
        scoreSum += health.score;
        healthCohortCount++;
        weightedScoreByContract += health.score * p.contractValue;
        healthCohortContract += p.contractValue;
        weightedScorePlanned += health.score * p.plannedMandays;
        healthCohortPlanned += p.plannedMandays;
      }

      for (const ms of p.billingMilestones ?? []) {
        const amount = milestoneAmount(ms, p.contractValue);
        if (ms.status === "CANCELLED") continue;
        if (ms.status === "PAID") {
          invoices.paidAmount += amount;
          invoices.invoicedAmount += amount;
          invoices.invoicedCount++;
          if (ms.paidAt && ms.paidAt.getTime() >= since90) {
            cashFlow.paidLast90Days += amount;
          }
        } else if (ms.status === "INVOICED") {
          invoices.invoicedAmount += amount;
          invoices.invoicedCount++;
          invoices.outstandingAmount += amount;
          cashFlow.outstandingInvoicedAmount += amount;
        } else {
          // PLANNED
          invoices.plannedAmount += amount;
          invoices.plannedCount++;
        }
        // Expected inflow: not-yet-paid milestones with a due date in the window.
        if (ms.status !== "PAID" && ms.dueDate) {
          const due = ms.dueDate.getTime();
          if (due >= nowMs && due <= in30) cashFlow.plannedNext30Days += amount;
          if (due >= nowMs && due <= in90) cashFlow.plannedNext90Days += amount;
        }
      }
    }

    // Delayed: live delivery projects past their end date.
    if (
      anyP.endDate &&
      (p.status === "ACTIVE" || p.status === "PAUSE") &&
      anyP.endDate.getTime() < nowMs
    ) {
      delayedProjects.push({
        id: p.id,
        code: anyP.code,
        name: anyP.name,
        status: p.status,
        endDate: anyP.endDate.toISOString(),
        daysOverdue: Math.floor((nowMs - anyP.endDate.getTime()) / DAY_MS),
      });
    }

    // High-risk: any non-archived project carrying open critical/high RAID items.
    if (p.status !== "CLOSED" && p.status !== "DRAFT") {
      let openCritical = 0;
      let openHigh = 0;
      for (const r of p.raidItems ?? []) {
        if (r.status === "CLOSED") continue;
        if (r.impact === "CRITICAL") openCritical++;
        else if (r.impact === "HIGH") openHigh++;
      }
      if (openCritical > 0 || openHigh > 0) {
        highRiskProjects.push({
          id: p.id,
          code: anyP.code,
          name: anyP.name,
          openCritical,
          openHigh,
          healthScore: health ? health.score : null,
        });
      }
    }
  }

  let portfolioHealthScore = 0;
  if (healthCohortCount > 0) {
    if (healthCohortContract > 0) {
      portfolioHealthScore = weightedScoreByContract / healthCohortContract;
    } else if (healthCohortPlanned > 0) {
      portfolioHealthScore = weightedScorePlanned / healthCohortPlanned;
    } else {
      portfolioHealthScore = scoreSum / healthCohortCount;
    }
  }
  portfolioHealthScore = Math.round(portfolioHealthScore);

  delayedProjects.sort((a, b) => b.daysOverdue - a.daysOverdue);
  highRiskProjects.sort(
    (a, b) =>
      b.openCritical - a.openCritical ||
      b.openHigh - a.openHigh ||
      (a.healthScore ?? 100) - (b.healthScore ?? 100),
  );

  return {
    portfolio: {
      totalProjects: projects.length,
      activeProjects,
      clientProjects,
      totalContractValue,
      totalRecognizedRevenue,
      totalActualCost,
      totalActualProfit,
      weightedMarginPct:
        totalContractValue > 0
          ? (totalActualProfit / totalContractValue) * 100
          : 0,
      portfolioHealthScore,
      healthLabel: healthLabelFor(portfolioHealthScore),
    },
    utilization: await buildUtilizationFacts(now),
    cashFlow,
    invoices,
    delayedProjects: delayedProjects.slice(0, 10),
    highRiskProjects: highRiskProjects.slice(0, 10),
  };
}
