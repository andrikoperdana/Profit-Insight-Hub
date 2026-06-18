import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { useGetInvoicePlanning, getGetInvoicePlanningQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { FileBarChart, ShieldAlert, Download, ChevronRight, ChevronDown } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { useLocation } from "wouter";
import { exportCsv } from "@/lib/exports";

type Mode = "week" | "month";
type Metric = "dpp" | "total";

const STATUS_COLOR: Record<string, string> = {
  PLANNED: "text-emerald-300",
  INVOICED: "text-amber-300",
  PAID: "text-blue-300",
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatHeader(iso: string, mode: Mode): string {
  // ISO is YYYY-MM-DD UTC-anchored; parse strictly to avoid timezone drift.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  if (mode === "month") {
    return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
  }
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

function compactIDR(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

export default function InvoicePlanningPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const allowed =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    user?.role === "FINANCE" ||
    user?.role === "PROJECT_MANAGER" ||
    user?.role === "ADMIN_PROJECT" ||
    user?.role === "SALES";

  const today = new Date();
  const day = today.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const defaultMon = new Date(today);
  defaultMon.setDate(today.getDate() + monOffset);
  const defaultMonIso = defaultMon.toISOString().slice(0, 10);
  const defaultMonth1 = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const [mode, setMode] = useState<Mode>("week");
  const [metric, setMetric] = useState<Metric>("dpp");
  const [startDate, setStartDate] = useState<string>(defaultMonIso);
  const [periods, setPeriods] = useState<number>(8);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useGetInvoicePlanning({ startDate, periods, mode });

  const isManagement = isSuperAdmin(user?.role) || user?.role === "MANAGEMENT";
  const hasMilestones = useMemo(() => {
    if (!data) return false;
    for (const g of data.groups) for (const r of g.rows) for (const c of r.cells) if (c.milestones.length) return true;
    return false;
  }, [data]);

  async function handleSeedSample() {
    if (seeding) return;
    setSeeding(true);
    try {
      const r = (await customFetch("/api/invoice-planning/seed-sample", { method: "POST" })) as {
        created: number; projectsSeeded: number; skipped: number;
      };
      toast({
        title: "Sample data created",
        description: `${r.created} milestones across ${r.projectsSeeded} project${r.projectsSeeded === 1 ? "" : "s"}. ${r.skipped} skipped (already had milestones).`,
      });
      await queryClient.invalidateQueries({ queryKey: getGetInvoicePlanningQueryKey({ startDate, periods, mode }) });
    } catch (e: any) {
      toast({ title: "Failed to seed sample", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }

  const headers = useMemo(() => {
    if (!data?.periodStarts) return [];
    return data.periodStarts.map((iso) => ({ iso, label: formatHeader(iso, mode) }));
  }, [data, mode]);

  const summary = useMemo(() => {
    if (!data) return null;
    let plannedDpp = 0, invoicedDpp = 0, paidDpp = 0;
    let plannedTotal = 0, invoicedTotal = 0, paidTotal = 0;
    let count = 0;
    for (const g of data.groups ?? []) {
      for (const r of g.rows) {
        for (const c of r.cells) {
          for (const m of c.milestones) {
            count++;
            if (m.status === "PLANNED") { plannedDpp += m.dpp; plannedTotal += m.total; }
            else if (m.status === "INVOICED") { invoicedDpp += m.dpp; invoicedTotal += m.total; }
            else if (m.status === "PAID") { paidDpp += m.dpp; paidTotal += m.total; }
          }
        }
      }
    }
    return {
      count,
      plannedDpp, invoicedDpp, paidDpp,
      plannedTotal, invoicedTotal, paidTotal,
    };
  }, [data]);

  // Per-BU roll-up: totals for each period column + BU grand total, plus the
  // grand totals across all BUs. Recomputes when the metric (DPP/Total) flips.
  const rollup = useMemo(() => {
    if (!data) return null;
    const n = data.periodStarts.length;
    const pick = (c: { dpp: number; total: number }) => (metric === "dpp" ? c.dpp : c.total);
    const groups = data.groups.map((g) => {
      const key = g.businessUnitId ?? "_none";
      const perPeriod = new Array(n).fill(0);
      let total = 0;
      for (const r of g.rows) {
        r.cells.forEach((c, i) => { perPeriod[i] += pick(c); });
        total += metric === "dpp" ? r.rowTotalDpp : r.rowTotalTotal;
      }
      return { key, name: g.businessUnitName, projectCount: g.rows.length, perPeriod, total };
    });
    const grandPerPeriod = (data.periodTotals ?? []).map((pt) => (metric === "dpp" ? pt.dpp : pt.total));
    const grandTotal = grandPerPeriod.reduce((s, v) => s + v, 0);
    return { groups, grandPerPeriod, grandTotal };
  }, [data, metric]);

  if (!allowed) {
    return (
      <EmptyState
        title="Access denied"
        description="Invoice Planning is available to Management, Project Managers (own projects), and Admin Project (own projects)."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    if (next === "month") {
      setStartDate(defaultMonth1);
      setPeriods(6);
    } else {
      setStartDate(defaultMonIso);
      setPeriods(8);
    }
  }

  function handleExport() {
    if (!data) return;
    const rows: Record<string, any>[] = [];
    for (const g of data.groups) {
      for (const r of g.rows) {
        const row: Record<string, any> = {
          BusinessUnit: g.businessUnitName,
          ProjectCode: r.projectCode ?? "",
          Project: r.projectName,
          Client: r.clientName ?? "",
          PM: r.pmName ?? "",
          Status: r.projectStatus,
        };
        r.cells.forEach((c, i) => {
          const h = headers[i]?.label ?? c.periodStart;
          row[h] = metric === "dpp" ? c.dpp : c.total;
        });
        row["Row Total"] = metric === "dpp" ? r.rowTotalDpp : r.rowTotalTotal;
        rows.push(row);
      }
    }
    exportCsv(`invoice-planning-${mode}-${data.startDate}-${metric}`, rows);
  }

  const maxPeriods = mode === "month" ? 12 : 26;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Invoice Planning</h1>
        <p className="text-muted-foreground">
          Cash inflow plan rolled up per Business Unit, with totals per week or month. Drill into a unit to see its projects. Each cell aggregates billing milestones by their due date.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>
            Switch between weekly (up to 26 weeks) and monthly (up to 12 months) view. Toggle DPP (Net) vs Total (incl. VAT).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label>Period Mode</Label>
              <Select value={mode} onValueChange={(v) => handleModeChange(v as Mode)}>
                <SelectTrigger data-testid="select-ip-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                <SelectTrigger data-testid="select-ip-metric"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dpp">DPP (Net)</SelectItem>
                  <SelectItem value="total">Total (incl. VAT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ip-start">{mode === "month" ? "Start (1st of month)" : "Start (Monday)"}</Label>
              <Input id="ip-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-ip-start" />
            </div>
            <div>
              <Label htmlFor="ip-periods">Number of {mode === "month" ? "Months" : "Weeks"}</Label>
              <Input
                id="ip-periods"
                type="number"
                min={1}
                max={maxPeriods}
                value={periods}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setPeriods(Math.min(maxPeriods, Math.max(1, Math.floor(v))));
                }}
                data-testid="input-ip-periods"
              />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <Button variant="outline" onClick={handleExport} disabled={!data?.groups?.length} data-testid="button-ip-export">
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
              {isManagement && !hasMilestones && data?.groups?.length ? (
                <Button onClick={handleSeedSample} disabled={seeding} data-testid="button-ip-seed">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {seeding ? "Seeding…" : "Seed Sample Data"}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {data?.unscheduledCount ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {data.unscheduledCount} billing milestone{data.unscheduledCount === 1 ? "" : "s"} in scope have no due date and are not shown in the matrix. Set their due dates in each project's Billing tab to plan them.
        </div>
      ) : null}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border">
            <CardHeader className="pb-2"><CardDescription>Milestones in range</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{summary.count}</div></CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2"><CardDescription>Planned ({metric === "dpp" ? "DPP" : "Total"})</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-400">{formatIDR(metric === "dpp" ? summary.plannedDpp : summary.plannedTotal)}</div></CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2"><CardDescription>Invoiced — Outstanding</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold text-amber-400">{formatIDR(metric === "dpp" ? summary.invoicedDpp : summary.invoicedTotal)}</div></CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2"><CardDescription>Paid</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-400">{formatIDR(metric === "dpp" ? summary.paidDpp : summary.paidTotal)}</div></CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton columns={6} rows={5} />
      ) : !data?.groups?.length ? (
        <EmptyState
          title="No projects in scope"
          description="There are no active/paused/observation projects you can view in this date range."
          icon={<FileBarChart className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <div className="space-y-6">
          {/* Roll-up: total per period per Business Unit, with grand total. */}
          {rollup && rollup.groups.length ? (
            <Card className="border-border overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="text-base">All Business Units</CardTitle>
                <CardDescription>
                  Total {metric === "dpp" ? "DPP (Net)" : "Total (incl. VAT)"} per {mode === "month" ? "month" : "week"} per Business Unit. Click a unit to drill into its projects below.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Business Unit</th>
                      {headers.map((w) => (
                        <th key={w.iso} className="text-right p-2 font-mono whitespace-nowrap min-w-[80px]">{w.label}</th>
                      ))}
                      <th className="text-right p-2 font-mono border-l border-border/40 min-w-[100px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollup.groups.map((g) => (
                      <tr key={g.key} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="p-2 sticky left-0 bg-background font-medium">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-left hover:text-primary"
                            onClick={() => toggleGroup(g.key)}
                            data-testid={`button-ip-bu-${g.key}`}
                          >
                            {expanded.has(g.key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span className="font-semibold">{g.name}</span>
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                              {g.projectCount}
                            </Badge>
                          </button>
                        </td>
                        {g.perPeriod.map((v, i) => (
                          <td key={i} className="p-2 text-right font-mono">{v > 0 ? compactIDR(v) : "—"}</td>
                        ))}
                        <td className="p-2 text-right font-mono font-semibold border-l border-border/40">
                          {g.total > 0 ? compactIDR(g.total) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/40 font-semibold border-t-2 border-primary/30">
                    <tr>
                      <td className="p-2 sticky left-0 bg-muted/40">Grand total</td>
                      {rollup.grandPerPeriod.map((v, i) => (
                        <td key={i} className="p-2 text-right font-mono">{v > 0 ? compactIDR(v) : "—"}</td>
                      ))}
                      <td className="p-2 text-right font-mono border-l border-border/40">
                        {rollup.grandTotal > 0 ? compactIDR(rollup.grandTotal) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          ) : null}

          {data.groups.map((g) => {
            const groupKey = g.businessUnitId ?? "_none";
            const isOpen = expanded.has(groupKey);
            const groupSum = rollup?.groups.find((x) => x.key === groupKey);
            return (
            <Card key={groupKey} className="border-border overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  className="flex items-center gap-2 w-full text-left"
                  data-testid={`button-ip-group-${groupKey}`}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <CardTitle className="text-base flex items-center gap-2 flex-1">
                    <span>{g.businessUnitName}</span>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                      {g.rows.length} project{g.rows.length === 1 ? "" : "s"}
                    </Badge>
                  </CardTitle>
                  <span className="font-mono font-semibold text-sm">
                    {groupSum && groupSum.total > 0 ? formatIDR(groupSum.total) : "—"}
                  </span>
                </button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Project</th>
                      <th className="text-left p-2 min-w-[140px]">Client</th>
                      <th className="text-left p-2 min-w-[80px]">Status</th>
                      {headers.map((w) => (
                        <th key={w.iso} className="text-right p-2 font-mono whitespace-nowrap min-w-[80px]">{w.label}</th>
                      ))}
                      <th className="text-right p-2 font-mono border-l border-border/40 min-w-[100px]">Row Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isOpen && g.rows.map((r) => {
                      const rowTotal = metric === "dpp" ? r.rowTotalDpp : r.rowTotalTotal;
                      return (
                        <tr key={r.projectId} className="border-t border-border/40 hover:bg-muted/20" data-testid={`row-ip-${r.projectId}`}>
                          <td className="p-2 sticky left-0 bg-background font-medium">
                            <button
                              type="button"
                              className="text-left hover:text-primary"
                              onClick={() => navigate(`/projects/${r.projectId}`)}
                            >
                              <div className="font-semibold">{r.projectName}</div>
                              {r.projectCode && (
                                <div className="text-[10px] text-muted-foreground font-mono">{r.projectCode}</div>
                              )}
                            </button>
                          </td>
                          <td className="p-2 text-muted-foreground">{r.clientName ?? "—"}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-[9px]">{r.projectStatus}</Badge>
                          </td>
                          {r.cells.map((c, idx) => {
                            const v = metric === "dpp" ? c.dpp : c.total;
                            // Tone by dominant milestone status in this cell
                            let tone = "text-muted-foreground/50";
                            if (c.milestones.length) {
                              const hasPaid = c.milestones.some(m => m.status === "PAID");
                              const hasInvoiced = c.milestones.some(m => m.status === "INVOICED");
                              const hasPlanned = c.milestones.some(m => m.status === "PLANNED");
                              if (hasInvoiced && !hasPaid) tone = "bg-amber-500/15 text-amber-300 font-semibold";
                              else if (hasPaid && !hasInvoiced && !hasPlanned) tone = "bg-blue-500/15 text-blue-300 font-semibold";
                              else if (hasPlanned) tone = "bg-emerald-500/15 text-emerald-300";
                              else tone = "bg-muted text-foreground";
                            }
                            const tooltip = c.milestones.length
                              ? c.milestones.map((m) => `${m.status} • ${m.name}: ${formatIDR(metric === "dpp" ? m.dpp : m.total)}${m.dueDate ? ` (due ${m.dueDate})` : ""}${m.invoiceNumber ? ` [${m.invoiceNumber}]` : ""}`).join("\n")
                              : "No milestones in this period";
                            return (
                              <td
                                key={`${r.projectId}-${idx}`}
                                className={`p-2 text-right font-mono ${tone} cursor-pointer`}
                                title={tooltip}
                                onClick={() => navigate(`/projects/${r.projectId}`)}
                              >
                                {v > 0 ? compactIDR(v) : "—"}
                              </td>
                            );
                          })}
                          <td className="p-2 text-right font-mono font-semibold border-l border-border/40">
                            {rowTotal > 0 ? compactIDR(rowTotal) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {groupSum ? (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2 sticky left-0 bg-muted/30" colSpan={3}>{g.businessUnitName} total</td>
                        {groupSum.perPeriod.map((v, idx) => (
                          <td key={idx} className="p-2 text-right font-mono">
                            {v > 0 ? compactIDR(v) : "—"}
                          </td>
                        ))}
                        <td className="p-2 text-right font-mono border-l border-border/40">
                          {groupSum.total > 0 ? compactIDR(groupSum.total) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3">
        <span>Legend:</span>
        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Planned</span>
        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">Invoiced (outstanding)</span>
        <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">Paid</span>
        <span className="text-muted-foreground/70">Values displayed in compact form (M = million, B = billion). Hover a cell for details.</span>
      </div>
    </div>
  );
}
