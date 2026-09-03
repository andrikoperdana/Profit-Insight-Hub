import { Prisma, type UserRole } from "@workspace/db";
import { AI_MODEL as MODEL, openai } from "@workspace/integrations-openai-ai-server";
import { GenerateAiReportDraftResponse } from "@workspace/api-zod";
import {
  computeMetrics,
  projectMetricsSelect,
  type ProjectWithRelations,
} from "./serializers.js";

/**
 * AI report draft: turns one project's period facts into a monthly status
 * report draft (executive summary / achievements / issues & risks / next
 * plans). Deterministic facts first, LLM only phrases them — same trust model
 * as the Executive Copilot. Drafts are never persisted; the PM copies the text
 * into their formal report.
 */


export const reportDraftProjectSelect = {
  ...projectMetricsSelect,
  code: true,
  name: true,
  kind: true,
  startDate: true,
  endDate: true,
  pmId: true,
  adminProjectId: true,
  technicalWriterId: true,
  pm: { select: { name: true } },
  adminProject: { select: { name: true } },
  technicalWriter: { select: { name: true } },
  client: { select: { name: true } },
  workstreams: { select: { code: true, name: true, status: true } },
  raidItems: { select: { title: true, type: true, impact: true, status: true } },
  billingMilestones: {
    select: { name: true, status: true, amount: true, percentage: true, dueDate: true, paidAt: true },
  },
  resources: {
    select: {
      userId: true,
      dailyRate: true,
      rates: { select: { costRate: true, effectiveFrom: true } },
      user: { select: { name: true, role: true } },
    },
  },
  expenses: {
    select: {
      amount: true,
      status: true,
      settledAmount: true,
      spentAt: true,
      category: true,
      description: true,
    },
  },
} as const;

export type ReportDraftProject = Prisma.ProjectGetPayload<{ select: typeof reportDraftProjectSelect }>;

/** PM / Admin Project / Technical Writer of the project, or management. */
export function canDraftReport(
  user: { id: string; role: UserRole },
  p: { pmId: string | null; adminProjectId: string | null; technicalWriterId: string | null },
): boolean {
  if (user.role === "MANAGEMENT" || user.role === "SUPER_ADMIN") return true;
  return p.pmId === user.id || p.adminProjectId === user.id || p.technicalWriterId === user.id;
}

/** Money figures go into the draft only for roles that may see them. */
export function canSeeProjectMoney(
  user: { id: string; role: UserRole },
  p: { pmId: string | null; adminProjectId: string | null },
): boolean {
  if (user.role === "MANAGEMENT" || user.role === "SUPER_ADMIN" || user.role === "FINANCE") return true;
  return p.pmId === user.id || p.adminProjectId === user.id;
}

function fmtIDR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)} miliar`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(0)} juta`;
  return `${sign}Rp ${Math.round(abs).toLocaleString("en-US")}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildReportDraftFacts(
  p: ReportDraftProject,
  periodMonth: string,
  includeMoney: boolean,
): Record<string, unknown> {
  const start = new Date(`${periodMonth}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const metrics = computeMetrics(p as unknown as ProjectWithRelations);
  const nameByUserId = new Map(p.resources.map((r) => [r.userId, r.user?.name ?? "?"]));

  // Period effort (approved + submitted, flagged separately in dataNotes).
  const hoursByUser = new Map<string, { approved: number; submitted: number }>();
  let approvedHours = 0;
  let submittedHours = 0;
  const workDays = new Set<string>();
  for (const t of p.timesheets) {
    if (t.status !== "APPROVED" && t.status !== "SUBMITTED") continue;
    if (t.workDate < start || t.workDate >= end) continue;
    const g = hoursByUser.get(t.userId) ?? { approved: 0, submitted: 0 };
    if (t.status === "APPROVED") {
      g.approved += t.hours;
      approvedHours += t.hours;
    } else {
      g.submitted += t.hours;
      submittedHours += t.hours;
    }
    hoursByUser.set(t.userId, g);
    workDays.add(t.workDate.toISOString().slice(0, 10));
  }

  const periodExpenses = p.expenses.filter(
    (e) => e.status === "APPROVED" && e.spentAt >= start && e.spentAt < end,
  );
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + e.amount, 0);

  const milestones = p.billingMilestones.map((ms) => {
    const dueInPeriod = !!ms.dueDate && ms.dueDate >= start && ms.dueDate < end;
    const paidInPeriod = !!ms.paidAt && ms.paidAt >= start && ms.paidAt < end;
    const row: Record<string, unknown> = {
      name: ms.name,
      status: ms.status,
      dueDate: ms.dueDate?.toISOString().slice(0, 10) ?? null,
      dueInPeriod,
      paidInPeriod,
    };
    if (includeMoney) {
      row.amount = fmtIDR(ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100);
    }
    return row;
  });

  const openRaid = p.raidItems
    .filter((r) => r.status !== "CLOSED")
    .slice(0, 10)
    .map((r) => ({ title: r.title, type: r.type, impact: r.impact }));

  const facts: Record<string, unknown> = {
    project: {
      code: p.code,
      name: p.name,
      kind: p.kind,
      status: p.status,
      client: p.client?.name ?? null,
      pm: p.pm?.name ?? null,
      adminProject: p.adminProject?.name ?? null,
      technicalWriter: p.technicalWriter?.name ?? null,
      startDate: p.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: p.endDate?.toISOString().slice(0, 10) ?? null,
      workstreams: p.workstreams.map((w) => ({ code: w.code, name: w.name, status: w.status })),
    },
    reportPeriod: periodMonth,
    periodEffort: {
      approvedHours: round1(approvedHours),
      submittedNotYetApprovedHours: round1(submittedHours),
      totalMandays: round1((approvedHours + submittedHours) / 8),
      distinctWorkDays: workDays.size,
      byPerson: [...hoursByUser.entries()]
        .map(([uid, g]) => ({
          name: nameByUserId.get(uid) ?? "Other",
          hours: round1(g.approved + g.submitted),
        }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10),
    },
    overallProgress: {
      actualMandays: round1(metrics.actualMandays),
      plannedMandays: p.plannedMandays,
      progressPct:
        p.plannedMandays > 0 ? Math.round((metrics.actualMandays / p.plannedMandays) * 100) : null,
      remainingMandays:
        p.plannedMandays > 0 ? round1(Math.max(p.plannedMandays - metrics.actualMandays, 0)) : null,
    },
    billingMilestones: milestones,
    openRisksAndIssues: openRaid,
  };
  if (includeMoney) {
    facts.financials = {
      contractValue: fmtIDR(p.contractValue),
      actualCostToDate: fmtIDR(metrics.actualCost),
      marginPct: round1(metrics.marginPct),
      approvedExpensesInPeriod: fmtIDR(periodExpenseTotal),
    };
  }
  return facts;
}

const draftSchema = GenerateAiReportDraftResponse.shape.draft;
export type ReportDraftContent = ReturnType<typeof draftSchema.parse>;

export async function generateReportDraft(
  facts: Record<string, unknown>,
  language: "id" | "en",
): Promise<{ draft: ReportDraftContent; model: string }> {
  const langLine =
    language === "en"
      ? "Write in clear, professional English."
      : "Tulis dalam Bahasa Indonesia yang formal dan profesional (bahasa laporan klien).";
  const system = [
    "You draft the monthly project status report for a cybersecurity consulting firm (ITSEC).",
    langLine,
    "STRICT RULES:",
    "- Use ONLY the facts JSON provided. Never invent activities, deliverables, numbers, names, or dates.",
    "- Money and hour figures must be copied verbatim from the facts.",
    "- If facts are thin, keep sections short — do not pad with generic filler claims.",
    "- Mention submitted-but-not-yet-approved hours in dataNotes when present, plus any other caveat a reviewer should know. If there are none, use null.",
    'Output STRICT JSON only: {"executiveSummary": string (3-5 sentences), "achievements": string[] (1-8 concrete items), "issuesRisks": string[] (0-8 items, from open risks/issues and schedule or budget signals), "nextPlans": string[] (1-8 items grounded in remaining milestones/mandays/workstreams), "dataNotes": string | null}',
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Project FACTS (authoritative, do not alter):\n${JSON.stringify(facts)}` },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw) throw new Error("Empty AI response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI response was not valid JSON");
  }
  // Defensively cap list lengths before schema validation (maxItems: 8).
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["achievements", "issuesRisks", "nextPlans"]) {
      if (Array.isArray(obj[key])) obj[key] = (obj[key] as unknown[]).slice(0, 8);
    }
    if (obj.dataNotes === undefined) obj.dataNotes = null;
  }
  return { draft: draftSchema.parse(parsed), model: MODEL };
}
