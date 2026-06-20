import { useMemo } from "react";
import {
  useGetProjectFinancials,
  getGetProjectFinancialsQueryKey,
  useListBillingMilestones,
  getListBillingMilestonesQueryKey,
  useListProjectTasks,
  getListProjectTasksQueryKey,
  useListProjectResources,
  getListProjectResourcesQueryKey,
  useListProjectExpenses,
  getListProjectExpensesQueryKey,
  useListTimesheets,
  getListTimesheetsQueryKey,
  useListProjectDocuments,
  getListProjectDocumentsQueryKey,
  useListProjectRaidItems,
  getListProjectRaidItemsQueryKey,
  useListProjectChangeRequests,
  getListProjectChangeRequestsQueryKey,
} from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR, formatMoney, formatDate, formatPct } from "@/lib/format";
import {
  HealthBadge,
  MarginBadge,
  ProjectStatusBadge,
  TimesheetStatusBadge,
} from "@/components/common/Badges";
import { ProfitOutlookPanel, type ProfitOutlook } from "@/components/projects/ProfitOutlookPanel";
import { EvmPanel, type EvmData } from "@/components/projects/EvmPanel";
import {
  BaselineVariancePanel,
  type BaselineData,
  type BaselineVarianceData,
} from "@/components/projects/BaselineVariancePanel";
import { RoleLabels } from "@/lib/roles";
import {
  FileText,
  DollarSign,
  Calendar,
  ListChecks,
  Users,
  Receipt,
  Clock,
  CreditCard,
  FolderOpen,
  ShieldAlert,
  GitBranch,
} from "lucide-react";
import { SectionShell, AsyncState, KeyVal, MiniStat, Pill, prettify } from "./parts";

const MUTED_PILL = "bg-muted text-muted-foreground border-border";

/* ----------------------------- Overview ----------------------------- */

export function OverviewSection({
  project,
  canFinancials,
}: {
  project: any;
  canFinancials: boolean;
}) {
  const timeline =
    project.startDate || project.endDate
      ? `${project.startDate ? formatDate(project.startDate) : "?"} → ${
          project.endDate ? formatDate(project.endDate) : "?"
        }`
      : "Not set";
  return (
    <SectionShell id="overview" title="Overview" icon={<FileText className="h-4 w-4 text-primary" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
        <div>
          <KeyVal label="Client" value={project.clientName ?? "—"} />
          <KeyVal label="Sales" value={project.salesName ?? "—"} />
          <KeyVal label="Project Manager" value={project.pmName ?? "—"} />
          <KeyVal label="SPK / PO Number" value={project.code ?? "—"} />
          <KeyVal label="Status" value={<ProjectStatusBadge status={project.status} />} />
          <KeyVal label="Timeline" value={timeline} />
          <KeyVal label="Planned Mandays" value={Number(project.plannedMandays ?? 0).toFixed(1)} />
        </div>
        {canFinancials && (
          <div>
            <KeyVal
              label="Revenue (Selling Price)"
              value={formatMoney(project.contractValue ?? 0, project.currency)}
            />
            <KeyVal
              label="Estimated Cost"
              value={formatMoney(project.estimatedCost ?? 0, project.currency)}
            />
            <KeyVal
              label="Estimated Profit"
              value={formatMoney(project.estimatedProfit ?? 0, project.currency)}
            />
            <KeyVal label="Margin" value={<MarginBadge marginPct={project.marginPct} />} />
            {project.healthScore != null && (
              <KeyVal
                label="Health"
                value={
                  <HealthBadge
                    score={project.healthScore}
                    label={project.healthLabel ?? null}
                    reasons={project.healthReasons ?? null}
                    components={project.healthComponents ?? null}
                    showLabel
                  />
                }
              />
            )}
          </div>
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Description</p>
        {project.description ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Not set</p>
        )}
      </div>
    </SectionShell>
  );
}

/* ----------------------------- Timeline ----------------------------- */

function daysBetween(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!isFinite(a) || !isFinite(b)) return "—";
  const d = Math.round((b - a) / 86_400_000) + 1;
  return d > 0 ? `${d}d` : "—";
}

export function TimelineSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useListProjectTasks(projectId, {
    query: { queryKey: getListProjectTasksQueryKey(projectId), enabled: !!projectId },
  });
  const dated = useMemo(() => {
    const list = (data ?? []) as any[];
    return list
      .filter((t) => t.startDate || t.endDate)
      .sort((a, b) => String(a.startDate ?? a.endDate ?? "").localeCompare(String(b.startDate ?? b.endDate ?? "")));
  }, [data]);
  return (
    <SectionShell
      id="timeline"
      title="Timeline"
      icon={<Calendar className="h-4 w-4 text-primary" />}
      description="Scheduled tasks in date order."
    >
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={dated.length === 0}
        emptyText="No scheduled tasks with dates."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dated.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.startDate ? formatDate(t.startDate) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.endDate ? formatDate(t.endDate) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{daysBetween(t.startDate, t.endDate)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(t.progressPercent ?? 0).toFixed(0)}%
                  </TableCell>
                  <TableCell>
                    <Pill className={TASK_STATUS_STYLE[t.status] ?? MUTED_PILL}>
                      {prettify(t.status)}
                    </Pill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ------------------------------- Tasks ------------------------------ */

const TASK_STATUS_STYLE: Record<string, string> = {
  TODO: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  NOT_STARTED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  REVIEW: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
  DONE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function orderTasks(tasks: any[]): { task: any; depth: number }[] {
  const ids = new Set(tasks.map((t) => t.id));
  const byParent = new Map<string | null, any[]>();
  for (const t of tasks) {
    const p = t.parentTaskId && ids.has(t.parentTaskId) ? t.parentTaskId : null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(t);
  }
  const out: { task: any; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (node: any, depth: number) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    out.push({ task: node, depth });
    for (const c of byParent.get(node.id) ?? []) walk(c, depth + 1);
  };
  for (const r of byParent.get(null) ?? []) walk(r, 0);
  for (const t of tasks) if (!seen.has(t.id)) out.push({ task: t, depth: 0 });
  return out;
}

function assigneeText(t: any): string {
  if (Array.isArray(t.assignees) && t.assignees.length) {
    return t.assignees.map((a: any) => a.name ?? a.userName ?? a).join(", ");
  }
  return t.assigneeName ?? "—";
}

export function TasksSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useListProjectTasks(projectId, {
    query: { queryKey: getListProjectTasksQueryKey(projectId), enabled: !!projectId },
  });
  const rows = useMemo(() => orderTasks((data ?? []) as any[]), [data]);
  return (
    <SectionShell
      id="tasks"
      title="Tasks"
      icon={<ListChecks className="h-4 w-4 text-primary" />}
      description="Work breakdown structure."
    >
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No tasks have been created."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead>Assignees</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Logged (h)</TableHead>
                <TableHead>Billable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ task: t, depth }) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <span style={{ paddingLeft: depth * 16 }} className="inline-block">
                      {depth > 0 && <span className="text-muted-foreground mr-1">└</span>}
                      {t.title}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Pill className={TASK_STATUS_STYLE[t.status] ?? MUTED_PILL}>
                      {prettify(t.status)}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(t.progressPercent ?? 0).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-xs">{assigneeText(t)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.startDate ? formatDate(t.startDate) : "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.endDate ? formatDate(t.endDate) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(t.loggedHours ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.billable === false ? "No" : "Yes"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ----------------------------- Financials --------------------------- */

export function FinancialsSection({
  projectId,
  isCommercial,
}: {
  projectId: string;
  isCommercial: boolean;
}) {
  const { data: f, isLoading, isError, error } = useGetProjectFinancials(projectId, {
    query: { queryKey: getGetProjectFinancialsQueryKey(projectId), enabled: !!projectId },
  });
  return (
    <SectionShell id="financials" title="Financials" icon={<DollarSign className="h-4 w-4 text-primary" />}>
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={!f}
        emptyText="Financial data is unavailable for this project."
      >
        {f && (isCommercial ? <CommercialFinancials f={f as any} /> : <CostOnlyFinancials f={f as any} />)}
      </AsyncState>
    </SectionShell>
  );
}

function CommercialFinancials({ f }: { f: any }) {
  const profitPositive = (f.actualProfit ?? 0) >= 0;
  const forecastPositive = (f.forecastProfit ?? 0) >= 0;
  return (
    <div className="space-y-5">
      {f.profitOutlook && <ProfitOutlookPanel outlook={f.profitOutlook as ProfitOutlook} />}
      {f.evm && <EvmPanel evm={f.evm as EvmData} />}
      {f.baseline && (
        <BaselineVariancePanel
          baseline={f.baseline as BaselineData}
          variance={(f.baselineVariance ?? null) as BaselineVarianceData | null}
        />
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat
          label="Revenue (Gross)"
          value={formatIDR(f.contractValue)}
          hint={
            f.contractValueIncludesVat
              ? `Includes VAT ${f.vatPercent ?? 0}%`
              : `Excludes VAT ${f.vatPercent ?? 0}%`
          }
        />
        <MiniStat
          label="Revenue Net (DPP)"
          value={formatIDR(f.revenueNet ?? f.contractValue)}
          hint={`VAT ${formatIDR(f.vatAmount ?? 0)}`}
        />
        <MiniStat
          label="Recognized Revenue"
          value={formatIDR(f.recognizedRevenue ?? 0)}
          hint={`PoC ${(f.burnRatePct ?? 0).toFixed(1)}%`}
        />
        <MiniStat label="Estimated Cost" value={formatIDR(f.estimatedCost)} />
        <MiniStat label="Actual Cost" value={formatIDR(f.actualCost ?? 0)} />
        <MiniStat
          label="Accrued Cost"
          value={formatIDR(f.accruedCost ?? 0)}
          hint="SUBMITTED + APPROVED"
        />
        <MiniStat
          label="Actual Profit / Loss"
          value={formatIDR(f.actualProfit ?? 0)}
          hint={`${formatPct(f.marginPct ?? 0)} gross margin`}
          tone={profitPositive ? "good" : "bad"}
        />
        <MiniStat
          label="Net Profit (after overhead)"
          value={formatIDR(f.netActualProfit ?? 0)}
          hint={`Overhead ×${(f.overheadMultiplier ?? 1).toFixed(2)}`}
          tone={(f.netActualProfit ?? 0) >= 0 ? "good" : "bad"}
        />
        <MiniStat
          label="Net Margin"
          value={formatPct(f.netMarginPct ?? 0)}
          tone={(f.netMarginPct ?? 0) >= 0 ? "good" : "bad"}
        />
        <MiniStat
          label="Forecast Final Profit"
          value={formatIDR(f.forecastProfit ?? 0)}
          hint={`Projected cost ${formatIDR(f.forecastCost ?? 0)}`}
          tone={forecastPositive ? "good" : "bad"}
        />
        <MiniStat
          label="Burn Rate"
          value={`${(f.burnRatePct ?? 0).toFixed(1)}%`}
          hint={`${(f.actualMandays ?? 0).toFixed(1)} / ${(f.plannedMandays ?? 0).toFixed(1)} mandays`}
        />
        <MiniStat
          label="Gross Margin"
          value={formatPct(f.marginPct ?? 0)}
          tone={(f.marginPct ?? 0) >= 0 ? "good" : "bad"}
        />
      </div>
    </div>
  );
}

function CostOnlyFinancials({ f }: { f: any }) {
  const budget = f.estimatedCost ?? 0;
  const actual = f.actualCost ?? 0;
  const remaining = budget - actual;
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-300">
        Internal project — cost tracking only (no client revenue, profit or margin).
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="Budget (Estimated Cost)" value={formatIDR(budget)} />
        <MiniStat label="Actual Cost" value={formatIDR(actual)} />
        <MiniStat label="Accrued Cost" value={formatIDR(f.accruedCost ?? 0)} />
        <MiniStat
          label="Remaining Budget"
          value={formatIDR(remaining)}
          tone={remaining >= 0 ? "good" : "bad"}
        />
        <MiniStat
          label="Burn Rate"
          value={`${(f.burnRatePct ?? 0).toFixed(1)}%`}
          hint={`${(f.actualMandays ?? 0).toFixed(1)} / ${(f.plannedMandays ?? 0).toFixed(1)} mandays`}
        />
        <MiniStat label="Forecast Final Cost" value={formatIDR(f.forecastCost ?? 0)} />
      </div>
    </div>
  );
}

/* ----------------------------- Resources ---------------------------- */

export function ResourcesSection({
  projectId,
  project,
  canRate,
}: {
  projectId: string;
  project: any;
  canRate: boolean;
}) {
  const { data, isLoading, isError, error } = useListProjectResources(projectId, {
    query: { queryKey: getListProjectResourcesQueryKey(projectId), enabled: !!projectId },
  });
  const rows = (data ?? []) as any[];
  return (
    <SectionShell id="resources" title="Resources" icon={<Users className="h-4 w-4 text-primary" />}>
      <div className="mb-3">
        <KeyVal label="Admin Project" value={project.adminProjectName ?? "—"} />
      </div>
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No resources assigned."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Planned MD</TableHead>
                <TableHead className="text-right">Actual MD</TableHead>
                {canRate && <TableHead className="text-right">Daily Rate</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.userName ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.roleInProject ?? (r.userRole ? RoleLabels[r.userRole as keyof typeof RoleLabels] ?? prettify(r.userRole) : "—")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(r.plannedMandays ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(r.actualMandays ?? 0).toFixed(1)}
                  </TableCell>
                  {canRate && (
                    <TableCell className="text-right font-mono text-xs">
                      {formatIDR(r.dailyRate ?? 0)}
                    </TableCell>
                  )}
                  <TableCell>
                    {r.pendingPrincipalApproval ? (
                      <Pill className="bg-amber-500/15 text-amber-300 border-amber-500/30">Pending</Pill>
                    ) : (
                      <Pill className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Active</Pill>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ----------------------------- Expenses ----------------------------- */

const EXPENSE_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function ExpensesSection({
  projectId,
  canFinancials,
}: {
  projectId: string;
  canFinancials: boolean;
}) {
  const { data, isLoading, isError, error } = useListProjectExpenses(projectId, {
    query: { queryKey: getListProjectExpensesQueryKey(projectId), enabled: !!projectId },
  });
  const rows = (data ?? []) as any[];
  return (
    <SectionShell id="expenses" title="Expenses" icon={<Receipt className="h-4 w-4 text-primary" />}>
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No expenses recorded."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Submitted by</TableHead>
                {canFinancials && <TableHead className="text-right">Amount</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {e.spentAt ? formatDate(e.spentAt) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{prettify(e.category)}</TableCell>
                  <TableCell className="text-sm">
                    {e.description ?? "—"}
                    {e.status === "REJECTED" && e.rejectionReason && (
                      <span className="block text-[11px] text-destructive mt-0.5">
                        Rejected: {e.rejectionReason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{e.createdByName ?? "—"}</TableCell>
                  {canFinancials && (
                    <TableCell className="text-right font-mono text-xs">
                      {formatIDR(e.amount ?? 0)}
                    </TableCell>
                  )}
                  <TableCell>
                    <Pill className={EXPENSE_STATUS_STYLE[e.status] ?? MUTED_PILL}>
                      {prettify(e.status)}
                    </Pill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ---------------------------- Timesheets ---------------------------- */

export function TimesheetsSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useListTimesheets(
    { projectId },
    { query: { queryKey: getListTimesheetsQueryKey({ projectId }), enabled: !!projectId } },
  );
  const rows = (data ?? []) as any[];
  const kpis = useMemo(() => {
    let total = 0,
      approved = 0,
      submitted = 0;
    for (const t of rows) {
      const h = Number(t.hours ?? 0);
      total += h;
      if (t.status === "APPROVED") approved += h;
      if (t.status === "SUBMITTED") submitted += h;
    }
    return { total, approved, submitted };
  }, [rows]);
  return (
    <SectionShell id="timesheets" title="Timesheets" icon={<Clock className="h-4 w-4 text-primary" />}>
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No timesheet entries."
      >
        <div className="grid grid-cols-3 gap-3 mb-4">
          <MiniStat label="Total Hours" value={kpis.total.toFixed(1)} />
          <MiniStat label="Approved Hours" value={kpis.approved.toFixed(1)} tone="good" />
          <MiniStat label="Submitted (pending)" value={kpis.submitted.toFixed(1)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.workDate ? formatDate(t.workDate) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{t.userName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{t.taskTitle ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {t.description ?? "—"}
                    {t.status === "REJECTED" && t.rejectionReason && (
                      <span className="block text-[11px] text-destructive mt-0.5">
                        Rejected: {t.rejectionReason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(t.hours ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <TimesheetStatusBadge status={t.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ------------------------------ Billing ----------------------------- */

const BILLING_STATUS_STYLE: Record<string, string> = {
  PLANNED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  INVOICED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  PAID: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  CANCELLED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function splitVat(
  amount: number,
  vatPercent: number,
  includesVat: boolean,
): { dpp: number; vat: number; gross: number } {
  if (!isFinite(amount) || amount <= 0) return { dpp: 0, vat: 0, gross: 0 };
  if (includesVat) {
    const dpp = amount / (1 + vatPercent / 100);
    return { dpp, vat: amount - dpp, gross: amount };
  }
  const vat = amount * (vatPercent / 100);
  return { dpp: amount, vat, gross: amount + vat };
}

export function BillingSection({ projectId, project }: { projectId: string; project: any }) {
  const { data, isLoading, isError, error } = useListBillingMilestones(projectId, {
    query: { queryKey: getListBillingMilestonesQueryKey(projectId), enabled: !!projectId },
  });
  const vatPercent = project.vatPercent ?? 11;
  const includesVat = project.contractValueIncludesVat ?? true;
  const milestones = (data ?? []) as any[];
  const amountFor = (m: any) =>
    m.amount != null ? m.amount : ((project.contractValue ?? 0) * (m.percentage || 0)) / 100;

  const summary = useMemo(() => {
    let totalPct = 0,
      invoicedGross = 0,
      paidGross = 0,
      outstandingVat = 0;
    for (const m of milestones) {
      if (m.status !== "CANCELLED") totalPct += m.percentage || 0;
      if (m.status === "INVOICED" || m.status === "PAID") {
        const { vat, gross } = splitVat(amountFor(m), vatPercent, includesVat);
        invoicedGross += gross;
        if (m.status === "PAID") paidGross += gross;
        else outstandingVat += vat;
      }
    }
    return { totalPct, invoicedGross, paidGross, outstandingVat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, vatPercent, includesVat, project.contractValue]);

  return (
    <SectionShell
      id="billing"
      title="Billing"
      icon={<CreditCard className="h-4 w-4 text-primary" />}
      description="Terms of payment milestones."
    >
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={milestones.length === 0}
        emptyText="No billing milestones."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MiniStat label="% Allocated" value={`${summary.totalPct.toFixed(1)}%`} />
          <MiniStat label="Invoiced (Total)" value={formatIDR(summary.invoicedGross)} />
          <MiniStat label="Paid (Total)" value={formatIDR(summary.paidGross)} tone="good" />
          <MiniStat label={`VAT ${vatPercent}% Outstanding`} value={formatIDR(summary.outstandingVat)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">DPP</TableHead>
                <TableHead className="text-right">VAT {vatPercent}%</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((m, i) => {
                const split = splitVat(amountFor(m), vatPercent, includesVat);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      {m.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(m.percentage ?? 0).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatIDR(split.dpp)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-amber-400">
                      {formatIDR(split.vat)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {formatIDR(split.gross)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {m.dueDate ? formatDate(m.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <Pill className={BILLING_STATUS_STYLE[m.status] ?? MUTED_PILL}>
                        {prettify(m.status)}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{m.invoiceNumber ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ----------------------------- Documents ---------------------------- */

export function DocumentsSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useListProjectDocuments(projectId, undefined, {
    query: { queryKey: getListProjectDocumentsQueryKey(projectId), enabled: !!projectId },
  });
  const rows = (data ?? []) as any[];
  return (
    <SectionShell
      id="documents"
      title="Documents"
      icon={<FolderOpen className="h-4 w-4 text-primary" />}
      description="Document register (metadata only)."
    >
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No documents uploaded."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Version</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.fileName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{prettify(d.type)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{d.version ?? "—"}</TableCell>
                  <TableCell className="text-xs">{d.uploadedByName ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {d.uploadedAt ? formatDate(d.uploadedAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* ------------------------------- RAID ------------------------------- */

const RAID_TYPE_LABEL: Record<string, string> = {
  RISK: "Risk",
  ASSUMPTION: "Assumption",
  ISSUE: "Issue",
  DEPENDENCY: "Dependency",
};

const RAID_STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  IN_PROGRESS: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  MITIGATED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  CLOSED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const STRATEGY_LABEL: Record<string, string> = {
  AVOID: "Avoid",
  MITIGATE: "Mitigate",
  TRANSFER: "Transfer",
  ACCEPT: "Accept",
};

function riskScoreClass(score: number): string {
  if (score >= 12) return "text-red-400";
  if (score >= 6) return "text-amber-400";
  return "text-emerald-400";
}

export function RaidSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useListProjectRaidItems(projectId, {
    query: { queryKey: getListProjectRaidItemsQueryKey(projectId), enabled: !!projectId },
  });
  const rows = (data ?? []) as any[];
  return (
    <SectionShell id="raid" title="RAID" icon={<ShieldAlert className="h-4 w-4 text-primary" />}>
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No RAID items recorded."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Impact</TableHead>
                <TableHead className="text-right">Likelihood</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const score =
                  typeof r.riskScore === "number" && isFinite(r.riskScore) ? r.riskScore : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{RAID_TYPE_LABEL[r.type] ?? prettify(r.type)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">{prettify(r.impact)}</TableCell>
                    <TableCell className="text-right text-xs">{prettify(r.likelihood)}</TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-semibold ${score != null ? riskScoreClass(score) : ""}`}
                    >
                      {score != null ? score : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.responseStrategy ? STRATEGY_LABEL[r.responseStrategy] ?? prettify(r.responseStrategy) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.dueDate ? formatDate(r.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <Pill className={RAID_STATUS_STYLE[r.status] ?? MUTED_PILL}>{prettify(r.status)}</Pill>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}

/* -------------------------- Change Requests ------------------------- */

const CR_TYPE_LABEL: Record<string, string> = {
  SCOPE: "Scope",
  SCHEDULE: "Schedule",
  COST: "Cost",
};

const CR_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  APPROVED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  APPLIED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/30",
};

function proposedChanges(cr: any): string {
  const parts: string[] = [];
  if (cr.proposedStartDate) parts.push(`Start → ${formatDate(cr.proposedStartDate)}`);
  if (cr.proposedEndDate) parts.push(`End → ${formatDate(cr.proposedEndDate)}`);
  if (cr.proposedPlannedMandays != null) parts.push(`Mandays → ${Number(cr.proposedPlannedMandays).toFixed(1)}`);
  if (cr.proposedEstimatedCost != null) parts.push(`Est. Cost → ${formatIDR(cr.proposedEstimatedCost)}`);
  if (cr.proposedContractValue != null) parts.push(`Revenue → ${formatIDR(cr.proposedContractValue)}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function ChangeRequestsSection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useListProjectChangeRequests(projectId, {
    query: { queryKey: getListProjectChangeRequestsQueryKey(projectId), enabled: !!projectId },
  });
  const rows = (data ?? []) as any[];
  return (
    <SectionShell
      id="change-requests"
      title="Change Requests"
      icon={<GitBranch className="h-4 w-4 text-primary" />}
    >
      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        emptyText="No change requests."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Proposed Changes</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((cr) => (
                <TableRow key={cr.id}>
                  <TableCell className="text-xs">{CR_TYPE_LABEL[cr.type] ?? prettify(cr.type)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{cr.title}</div>
                    {cr.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{cr.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{proposedChanges(cr)}</TableCell>
                  <TableCell className="text-xs">{cr.requestedByName ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {cr.createdAt ? formatDate(cr.createdAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Pill className={CR_STATUS_STYLE[cr.status] ?? MUTED_PILL}>{prettify(cr.status)}</Pill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AsyncState>
    </SectionShell>
  );
}
