import { prisma, Prisma, type UserRole } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  computeMetrics,
  computeHealthScore,
  projectMetricsSelect,
  type ProjectWithRelations,
} from "./serializers.js";
import { buildUtilizationFacts } from "./executive-copilot.js";
import { fetchOpenMilestones, sumAmounts, type OpenMilestoneRow } from "./billing-facts.js";

/**
 * AI Data Assistant ("ask your data" chat).
 *
 * Same trust model as the Executive Copilot: the LLM NEVER computes or invents
 * figures — it can only call the read-only tools below, and every tool applies
 * the caller's role scope server-side (default-deny: unknown roles see only
 * their own rows). The model then phrases the tool results as an answer.
 */

const MODEL = "gpt-5.4";
const MAX_TOOL_ROUNDS = 4;
const TOOL_RESULT_CHAR_CAP = 12_000;

export interface AssistantUser {
  id: string;
  role: UserRole;
  name: string;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

// Roles that may see money figures for EVERY project. Everyone else gets
// financials only on projects they lead (PM / Admin Project), never as a
// portfolio view. This mirrors the dashboard/serializer visibility rules.
const PORTFOLIO_MONEY_ROLES: UserRole[] = ["MANAGEMENT", "SUPER_ADMIN", "FINANCE"];
// Roles that may browse all projects (non-financial fields).
const ALL_PROJECTS_ROLES: UserRole[] = ["MANAGEMENT", "SUPER_ADMIN", "FINANCE", "HR"];
// Roles that may see workforce-wide utilization.
const UTILIZATION_ROLES: UserRole[] = ["MANAGEMENT", "SUPER_ADMIN", "HR"];

function isPrincipal(role: UserRole): boolean {
  return String(role).startsWith("PRINCIPAL_");
}

/** Which projects is this user allowed to SEE at all? (default-deny) */
function projectScopeWhere(user: AssistantUser): Prisma.ProjectWhereInput {
  if (ALL_PROJECTS_ROLES.includes(user.role)) return {};
  if (user.role === "PROJECT_MANAGER") return { pmId: user.id };
  if (user.role === "ADMIN_PROJECT") return { adminProjectId: user.id };
  if (user.role === "TECHNICAL_WRITER") return { technicalWriterId: user.id };
  if (isPrincipal(user.role)) {
    // Principals: projects where they or one of their direct reports are staffed.
    return { resources: { some: { user: { OR: [{ id: user.id }, { principalId: user.id }] } } } };
  }
  // KONSULTAN, SALES, SITE_ADMIN, and any future role: only projects they are staffed on.
  return { resources: { some: { userId: user.id } } };
}

/** May this user see money figures for this particular project row? */
function canSeeMoney(user: AssistantUser, p: { pmId: string | null; adminProjectId: string | null }): boolean {
  if (PORTFOLIO_MONEY_ROLES.includes(user.role)) return true;
  if (user.role === "PROJECT_MANAGER" && p.pmId === user.id) return true;
  if (user.role === "ADMIN_PROJECT" && p.adminProjectId === user.id) return true;
  return false;
}

function fmtIDR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)} B`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(0)} M`;
  return `${sign}Rp ${Math.round(abs).toLocaleString("en-US")}`;
}

function parseDay(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? fallback : d;
}

// ---------------------------------------------------------------------------
// Tool: list_projects
// ---------------------------------------------------------------------------

const listProjectsSelect = {
  ...projectMetricsSelect,
  projectId: true,
  code: true,
  name: true,
  kind: true,
  startDate: true,
  endDate: true,
  pmId: true,
  adminProjectId: true,
  pm: { select: { name: true } },
  client: { select: { name: true } },
} as const;

async function toolListProjects(
  user: AssistantUser,
  args: { status?: string; margin_below_pct?: number; limit?: number },
): Promise<unknown> {
  const statusFilter =
    args.status && ["DRAFT", "OBSERVATION", "ACTIVE", "PAUSE", "CLOSED"].includes(args.status)
      ? args.status
      : undefined;
  const rows = await prisma.project.findMany({
    where: {
      deletedAt: null, archivedAt: null,
      ...(statusFilter ? { status: statusFilter as never } : {}),
      ...projectScopeWhere(user),
    },
    select: listProjectsSelect,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 200,
  });

  const marginBelow = typeof args.margin_below_pct === "number" ? args.margin_below_pct : undefined;
  const portfolioMoney = PORTFOLIO_MONEY_ROLES.includes(user.role);

  const mapped = rows.map((p) => {
    const metrics = computeMetrics(p as unknown as ProjectWithRelations);
    const money = canSeeMoney(user, p);
    const base: Record<string, unknown> = {
      projectId: p.projectId ?? null,
      code: p.code,
      name: p.name,
      status: p.status,
      kind: p.kind,
      client: p.client?.name ?? null,
      pm: p.pm?.name ?? null,
      link: `/projects/${p.id}`,
      actualMandays: Math.round(metrics.actualMandays * 10) / 10,
      plannedMandays: p.plannedMandays,
      progressPct: p.plannedMandays > 0 ? Math.round((metrics.actualMandays / p.plannedMandays) * 100) : null,
    };
    if (money) {
      base.contractValue = fmtIDR(p.contractValue);
      base.actualCost = fmtIDR(metrics.actualCost);
      base.actualProfit = fmtIDR(metrics.actualProfit);
      base.marginPct = Math.round(metrics.marginPct * 10) / 10;
    }
    return { row: base, marginPct: metrics.marginPct, money };
  });

  let out = mapped;
  let note: string | undefined;
  if (marginBelow !== undefined) {
    if (!portfolioMoney) {
      note =
        "Margin filtering is only available for management/finance roles; showing the unfiltered list the user may access.";
    } else {
      out = mapped
        .filter((m) => m.money && m.marginPct < marginBelow && (m.row.status as string) !== "DRAFT")
        .sort((a, b) => a.marginPct - b.marginPct);
    }
  }
  const limit = Math.min(Math.max(args.limit ?? 15, 1), 30);
  return {
    totalMatching: out.length,
    shown: Math.min(limit, out.length),
    note,
    projects: out.slice(0, limit).map((m) => m.row),
  };
}

// ---------------------------------------------------------------------------
// Tool: get_project_detail
// ---------------------------------------------------------------------------

const projectDetailSelect = {
  ...projectMetricsSelect,
  projectId: true,
  code: true,
  name: true,
  kind: true,
  startDate: true,
  endDate: true,
  pmId: true,
  adminProjectId: true,
  pm: { select: { name: true } },
  adminProject: { select: { name: true } },
  technicalWriter: { select: { name: true } },
  client: { select: { name: true } },
  resources: {
    select: {
      userId: true,
      dailyRate: true,
      rates: { select: { costRate: true, effectiveFrom: true } },
      user: { select: { name: true, role: true } },
    },
  },
  raidItems: { select: { title: true, type: true, impact: true, status: true } },
  billingMilestones: {
    select: { name: true, status: true, amount: true, percentage: true, dueDate: true, paidAt: true },
  },
} as const;

async function toolGetProjectDetail(user: AssistantUser, args: { query?: string }): Promise<unknown> {
  const q = (args.query ?? "").trim();
  if (!q) return { error: "query is required (project ID, code, or part of its name)" };
  const candidates = await prisma.project.findMany({
    where: {
      deletedAt: null, archivedAt: null,
      ...projectScopeWhere(user),
      OR: [
        { projectId: { equals: q, mode: "insensitive" } },
        { code: { equals: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: projectDetailSelect,
    take: 5,
  });
  if (candidates.length === 0) {
    return { error: `No project matching "${q}" is visible to this user.` };
  }
  const exact = candidates.find(
    (c) =>
      c.projectId?.toLowerCase() === q.toLowerCase() || c.code?.toLowerCase() === q.toLowerCase(),
  );
  if (!exact && candidates.length > 1) {
    return {
      note: "Multiple projects matched — ask the user which one they mean.",
      candidates: candidates.map((c) => ({
        projectId: c.projectId ?? null,
        code: c.code,
        name: c.name,
        status: c.status,
      })),
    };
  }
  const p = exact ?? candidates[0];
  const metrics = computeMetrics(p as unknown as ProjectWithRelations);
  const health = computeHealthScore(p as unknown as ProjectWithRelations, metrics);
  const money = canSeeMoney(user, p);

  const nameByUserId = new Map(p.resources.map((r) => [r.userId, r.user?.name ?? "?"]));
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const hoursByUser = new Map<string, number>();
  let hours30 = 0;
  for (const t of p.timesheets) {
    if (t.status !== "APPROVED" && t.status !== "SUBMITTED") continue;
    if (t.workDate < since30) continue;
    hours30 += t.hours;
    hoursByUser.set(t.userId, (hoursByUser.get(t.userId) ?? 0) + t.hours);
  }
  const openRaid = p.raidItems.filter((r) => r.status !== "CLOSED");

  const detail: Record<string, unknown> = {
    projectId: p.projectId ?? null,
    code: p.code,
    name: p.name,
    status: p.status,
    kind: p.kind,
    client: p.client?.name ?? null,
    pm: p.pm?.name ?? null,
    adminProject: p.adminProject?.name ?? null,
    technicalWriter: p.technicalWriter?.name ?? null,
    startDate: p.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: p.endDate?.toISOString().slice(0, 10) ?? null,
    link: `/projects/${p.id}`,
    team: p.resources.map((r) => ({ name: r.user?.name ?? "?", role: r.user?.role ?? null })),
    actualMandays: Math.round(metrics.actualMandays * 10) / 10,
    plannedMandays: p.plannedMandays,
    progressPct: p.plannedMandays > 0 ? Math.round((metrics.actualMandays / p.plannedMandays) * 100) : null,
    healthScore: health ? health.score : null,
    hoursLast30Days: Math.round(hours30 * 10) / 10,
    hoursLast30DaysByPerson: [...hoursByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, h]) => ({ name: nameByUserId.get(uid) ?? "Other", hours: Math.round(h * 10) / 10 })),
    openRaidItems: openRaid.slice(0, 8).map((r) => ({ title: r.title, type: r.type, impact: r.impact })),
    openRaidCount: openRaid.length,
  };
  if (money) {
    detail.contractValue = fmtIDR(p.contractValue);
    detail.actualCost = fmtIDR(metrics.actualCost);
    detail.actualProfit = fmtIDR(metrics.actualProfit);
    detail.marginPct = Math.round(metrics.marginPct * 10) / 10;
    detail.billingMilestones = p.billingMilestones.map((ms) => ({
      name: ms.name,
      status: ms.status,
      amount: fmtIDR(ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100),
      dueDate: ms.dueDate?.toISOString().slice(0, 10) ?? null,
      paidAt: ms.paidAt?.toISOString().slice(0, 10) ?? null,
    }));
  } else {
    detail.note = "Financial figures are hidden for this user's role.";
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Tool: get_team_hours
// ---------------------------------------------------------------------------

async function toolGetTeamHours(
  user: AssistantUser,
  args: { from_date?: string; to_date?: string; group_by?: string },
): Promise<unknown> {
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultFrom = new Date(todayStart.getTime() - 6 * 86_400_000);
  const from = parseDay(args.from_date, defaultFrom);
  const toInclusive = parseDay(args.to_date, todayStart);
  const to = new Date(toInclusive.getTime() + 86_400_000);
  if (to.getTime() - from.getTime() > 190 * 86_400_000) {
    return { error: "Date range too large — maximum 190 days per query." };
  }

  // Default-deny hours scope: broad roles see all, principals their team,
  // project leads their projects, everyone else ONLY their own rows.
  let scope: Prisma.TimesheetWhereInput;
  if (["MANAGEMENT", "SUPER_ADMIN", "FINANCE", "HR"].includes(user.role)) scope = {};
  else if (isPrincipal(user.role)) scope = { user: { OR: [{ id: user.id }, { principalId: user.id }] } };
  else if (user.role === "PROJECT_MANAGER") scope = { OR: [{ userId: user.id }, { project: { pmId: user.id } }] };
  else if (user.role === "ADMIN_PROJECT")
    scope = { OR: [{ userId: user.id }, { project: { adminProjectId: user.id } }] };
  else scope = { userId: user.id };

  const rows = await prisma.timesheet.findMany({
    where: {
      ...scope,
      status: { in: ["APPROVED", "SUBMITTED"] },
      workDate: { gte: from, lt: to },
    },
    select: {
      hours: true,
      status: true,
      workDate: true,
      user: { select: { name: true } },
      project: { select: { name: true, code: true } },
    },
    take: 20_000,
  });

  const groupBy = args.group_by === "project" ? "project" : "user";
  const groups = new Map<string, { approved: number; submitted: number }>();
  let approvedTotal = 0;
  let submittedTotal = 0;
  for (const t of rows) {
    const key = groupBy === "project" ? `${t.project?.code ?? "?"} ${t.project?.name ?? "?"}` : t.user?.name ?? "?";
    const g = groups.get(key) ?? { approved: 0, submitted: 0 };
    if (t.status === "APPROVED") {
      g.approved += t.hours;
      approvedTotal += t.hours;
    } else {
      g.submitted += t.hours;
      submittedTotal += t.hours;
    }
    groups.set(key, g);
  }
  const list = [...groups.entries()]
    .map(([key, g]) => ({
      [groupBy]: key,
      approvedHours: Math.round(g.approved * 10) / 10,
      submittedHours: Math.round(g.submitted * 10) / 10,
      totalHours: Math.round((g.approved + g.submitted) * 10) / 10,
      mandays: Math.round(((g.approved + g.submitted) / 8) * 10) / 10,
    }))
    .sort((a, b) => (b.totalHours as number) - (a.totalHours as number));
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: toInclusive.toISOString().slice(0, 10),
    groupBy,
    approvedHoursTotal: Math.round(approvedTotal * 10) / 10,
    submittedAwaitingApprovalTotal: Math.round(submittedTotal * 10) / 10,
    groups: list.slice(0, 20),
    groupCount: list.length,
  };
}

// ---------------------------------------------------------------------------
// Tool: get_billing_status
// ---------------------------------------------------------------------------

async function toolGetBillingStatus(
  user: AssistantUser,
  args: { within_days?: number; status?: string },
): Promise<unknown> {
  let projectScope: Prisma.ProjectWhereInput;
  if (PORTFOLIO_MONEY_ROLES.includes(user.role)) projectScope = {};
  else if (user.role === "PROJECT_MANAGER") projectScope = { pmId: user.id };
  else if (user.role === "ADMIN_PROJECT") projectScope = { adminProjectId: user.id };
  else return { error: "Billing data is not available for this user's role." };

  const now = new Date();
  const withinDays = Math.min(Math.max(args.within_days ?? 30, 1), 365);
  const horizon = new Date(now.getTime() + withinDays * 86_400_000);
  const statusArg = (args.status ?? "OPEN").toUpperCase();

  if (statusArg === "PAID") {
    // Display-only list of the most recent payments — no portfolio totals here.
    const paid = await prisma.billingMilestone.findMany({
      where: { status: "PAID", project: { deletedAt: null, archivedAt: null, ...projectScope } },
      select: {
        name: true,
        amount: true,
        percentage: true,
        dueDate: true,
        paidAt: true,
        invoiceNumber: true,
        project: { select: { id: true, name: true, projectId: true, code: true, contractValue: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 25,
    });
    return {
      filter: "PAID",
      note: "Most recent paid milestones (up to 25).",
      milestones: paid.map((ms) => ({
        project: `${ms.project.projectId ?? ms.project.code ?? ""} ${ms.project.name}`,
        link: `/projects/${ms.project.id}?tab=billing`,
        milestone: ms.name,
        status: "PAID",
        amount: fmtIDR(
          ms.amount ?? (ms.project.contractValue * (ms.percentage ?? 0)) / 100,
        ),
        dueDate: ms.dueDate?.toISOString().slice(0, 10) ?? null,
        invoiceNumber: ms.invoiceNumber ?? null,
        paidAt: ms.paidAt?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  // Unpaid views: fetch ALL open milestones in scope (uncapped, shared with the
  // weekly digest) so the totals are exact, then filter and slice for display.
  const all = await fetchOpenMilestones(projectScope);
  let rows: OpenMilestoneRow[];
  if (statusArg === "OVERDUE") rows = all.filter((r) => r.dueDate && r.dueDate < now);
  else if (statusArg === "PLANNED" || statusArg === "INVOICED")
    rows = all.filter((r) => r.status === statusArg);
  else rows = all.filter((r) => r.dueDate && r.dueDate <= horizon); // OPEN: overdue + due soon

  const overdueRows = rows.filter((r) => r.dueDate && r.dueDate < now);
  const overdueAmount = sumAmounts(overdueRows);
  const dueSoonAmount = sumAmounts(rows) - overdueAmount;
  const outstandingInvoiced = sumAmounts(rows.filter((r) => r.status === "INVOICED"));

  return {
    filter: statusArg,
    withinDays,
    totals: {
      overdue: fmtIDR(overdueAmount),
      dueWithinWindowNotOverdue: fmtIDR(dueSoonAmount),
      outstandingInvoiced: fmtIDR(outstandingInvoiced),
    },
    count: rows.length,
    milestones: rows.slice(0, 25).map((r) => {
      const overdueDays =
        r.dueDate && r.dueDate < now
          ? Math.floor((now.getTime() - r.dueDate.getTime()) / 86_400_000)
          : 0;
      return {
        project: `${r.project.code} ${r.project.name}`,
        link: `/projects/${r.project.id}?tab=billing`,
        milestone: r.name,
        status: r.status,
        amount: fmtIDR(r.amount),
        dueDate: r.dueDate?.toISOString().slice(0, 10) ?? null,
        invoiceNumber: r.invoiceNumber,
        daysOverdue: overdueDays || undefined,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tool: get_workforce_utilization
// ---------------------------------------------------------------------------

async function toolGetWorkforceUtilization(user: AssistantUser): Promise<unknown> {
  if (!UTILIZATION_ROLES.includes(user.role)) {
    return { error: "Workforce utilization is only available to management/HR." };
  }
  const facts = await buildUtilizationFacts(new Date());
  return { ...facts, utilizationPct: Math.round(facts.utilizationPct) };
}

// ---------------------------------------------------------------------------
// OpenAI tool definitions + dispatch
// ---------------------------------------------------------------------------

const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "list_projects",
      description:
        "List projects visible to the user, with progress and (when permitted) contract value, actual cost and margin. Supports filtering by status or by margin below a threshold.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["DRAFT", "OBSERVATION", "ACTIVE", "PAUSE", "CLOSED"],
            description: "Optional project status filter.",
          },
          margin_below_pct: {
            type: "number",
            description: "Only projects with margin percentage below this value (management/finance only).",
          },
          limit: { type: "number", description: "Max rows to return (default 15, max 30)." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_detail",
      description:
        "Full detail of ONE project by Project ID, SPK/PO code, or name fragment: team, schedule, progress, health, open risks, recent hours, and (when permitted) financials and billing milestones.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Project code (exact) or part of the project/client name." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_hours",
      description:
        "Aggregate logged timesheet hours (approved + submitted) in a date range, grouped by person or project. Scope is automatic: regular users get only their own hours.",
      parameters: {
        type: "object",
        properties: {
          from_date: { type: "string", description: "Start date YYYY-MM-DD (default: 6 days ago)." },
          to_date: { type: "string", description: "End date YYYY-MM-DD inclusive (default: today)." },
          group_by: { type: "string", enum: ["user", "project"], description: "Grouping (default user)." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_billing_status",
      description:
        "Invoices / billing milestones with amounts and due dates (management, finance, and project leads for their own projects). status OPEN = overdue + due within window; also PLANNED, INVOICED, PAID, OVERDUE.",
      parameters: {
        type: "object",
        properties: {
          within_days: { type: "number", description: "Look-ahead window in days for OPEN (default 30)." },
          status: { type: "string", enum: ["OPEN", "PLANNED", "INVOICED", "PAID", "OVERDUE"] },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_workforce_utilization",
      description:
        "Workforce-wide utilization counts: headcount, billable-active, idle, overloaded (management/HR only).",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function executeTool(user: AssistantUser, name: string, rawArgs: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }
  let result: unknown;
  try {
    switch (name) {
      case "list_projects":
        result = await toolListProjects(user, args);
        break;
      case "get_project_detail":
        result = await toolGetProjectDetail(user, args);
        break;
      case "get_team_hours":
        result = await toolGetTeamHours(user, args);
        break;
      case "get_billing_status":
        result = await toolGetBillingStatus(user, args);
        break;
      case "get_workforce_utilization":
        result = await toolGetWorkforceUtilization(user);
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    result = { error: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
  const text = JSON.stringify(result);
  return text.length > TOOL_RESULT_CHAR_CAP ? `${text.slice(0, TOOL_RESULT_CHAR_CAP)}…(truncated)` : text;
}

function systemPrompt(user: AssistantUser): string {
  const wib = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  return [
    "You are the SecureProfit Hub data assistant (ITSEC's project & profitability workspace).",
    `Current date/time: ${wib} (WIB).`,
    `Signed-in user: ${user.name} — role ${user.role}. Every tool already enforces what this user may see; results are authoritative.`,
    "Rules:",
    "- Answer ONLY from tool results. Never invent numbers, project names, people, or dates. If you did not fetch it, do not state it.",
    "- If a tool returns an error or empty data, say so plainly and suggest a question that would work instead.",
    "- LANGUAGE RULE: detect the language of the user's LATEST message and reply in that exact language. English question => English answer. Pertanyaan Bahasa Indonesia => jawaban Bahasa Indonesia. Never switch languages on your own.",
    '- Money: reuse the pre-formatted values from tool results (e.g. "Rp 1.2 B" = miliar, "Rp 320 M" = juta). Do not recompute.',
    "- 1 manday = 8 hours.",
    "- Be concise: one or two short sentences, then a compact bullet list when listing items. No tables, no headings.",
    "- When a tool result includes a `link` for a project, mention the project as a markdown link, e.g. [ACME Pentest](/projects/abc123). Never fabricate links.",
  ].join("\n");
}

export async function runAssistantChat(
  user: AssistantUser,
  history: AssistantMessage[],
): Promise<{ reply: string; model: string }> {
  type ChatMessage =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "tool"; content: string; tool_call_id: string };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(user) },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  ];

  let toolRounds = 0;
  // Bounded loop: at most MAX_TOOL_ROUNDS tool rounds, then one final forced answer.
  for (let i = 0; i <= MAX_TOOL_ROUNDS + 1; i++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      tools: TOOL_DEFS,
      tool_choice: toolRounds >= MAX_TOOL_ROUNDS ? "none" : "auto",
    });
    const msg = completion.choices[0]?.message;
    if (!msg) break;
    const toolCalls = (msg.tool_calls ?? []).filter((tc) => tc.type === "function");
    if (toolCalls.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages.push(msg as any);
      for (const tc of toolCalls) {
        const out = await executeTool(user, tc.function.name, tc.function.arguments);
        messages.push({ role: "tool", tool_call_id: tc.id, content: out });
      }
      toolRounds++;
      continue;
    }
    const reply = (msg.content ?? "").trim();
    if (reply) return { reply, model: MODEL };
    break;
  }
  return {
    reply: "Sorry — I couldn't put together an answer for that. Try rephrasing the question.",
    model: MODEL,
  };
}
