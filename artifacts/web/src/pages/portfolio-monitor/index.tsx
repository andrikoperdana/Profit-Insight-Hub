import { useMemo, useState } from "react";
import {
  useGetPortfolioMonitor,
  type PortfolioMonitorRow,
  type ProjectStatus,
} from "@workspace/api-client-react";
import { formatIDR, formatPct } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { ProjectStatusBadge } from "@/components/common/Badges";
import { exportSheets } from "@/lib/exports";
import { Download, FileBarChart, AlertTriangle, Wallet, TrendingUp } from "lucide-react";

// Neutralize spreadsheet formula injection for user-controlled text cells that
// flow into the XLSX export (json_to_sheet does not escape leading =,+,-,@).
function safeText(v: string | null | undefined): string {
  const s = v ?? "";
  return s.length > 0 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function compactIDR(n: number): string {
  if (!n) return "—";
  const neg = n < 0;
  const a = Math.abs(n);
  let out: string;
  if (a >= 1_000_000_000) out = `${(a / 1_000_000_000).toFixed(1)}B`;
  else if (a >= 1_000_000) out = `${(a / 1_000_000).toFixed(0)}M`;
  else if (a >= 1_000) out = `${(a / 1_000).toFixed(0)}K`;
  else out = a.toFixed(0);
  return neg ? `(${out})` : out;
}

function deltaClass(delta: number, goodWhenPositive: boolean): string {
  if (delta === 0) return "text-muted-foreground";
  const good = goodWhenPositive ? delta > 0 : delta < 0;
  return good ? "text-emerald-400" : "text-red-400";
}

export default function PortfolioMonitorPage() {
  const nowYear = new Date().getUTCFullYear();
  const [year, setYear] = useState<number>(nowYear);
  const yearOptions = useMemo(
    () => [nowYear - 2, nowYear - 1, nowYear, nowYear + 1],
    [nowYear],
  );

  const { data, isLoading } = useGetPortfolioMonitor({ year });

  const summary = useMemo(() => {
    const rows = data?.rows ?? [];
    let selling = 0;
    let invoiced = 0;
    let remaining = 0;
    let unusual = 0;
    let zero = 0;
    for (const r of rows) {
      selling += r.sellingAmount;
      invoiced += r.invoiced;
      remaining += r.remainingInvoice;
      if (r.unusualMargin) unusual++;
      if (r.zeroBudget) zero++;
    }
    return {
      count: rows.length,
      selling,
      invoiced,
      remaining,
      unusual,
      zero,
      forecast: data?.forecastGrandTotal ?? 0,
    };
  }, [data]);

  function handleExport() {
    if (!data) return;
    const portfolio = data.rows.map((r) => ({
      Project: safeText(r.projectName),
      Code: safeText(r.projectCode),
      Client: safeText(r.clientName),
      Type: safeText(r.type),
      Stage: safeText(r.stage),
      Start: r.startDate ?? "",
      End: r.endDate ?? "",
      "Selling Amount": r.sellingAmount,
      Invoiced: r.invoiced,
      "Remaining to Invoice": r.remainingInvoice,
      "Used Hours": r.usedHours,
      "Budget Hours": r.budgetHours,
      "Delta Hours": r.deltaHours,
      "Used Costs": r.usedCosts,
      "Budget Costs": r.budgetCosts,
      "Delta Costs": r.deltaCosts,
      "Estimated Margin %": Number(r.estimatedMargin.toFixed(2)),
      "Actual Margin %": Number(r.actualMargin.toFixed(2)),
      "Delta Margin (pp)": Number(r.deltaMargin.toFixed(2)),
      Currency: safeText(r.currency),
      "Unusual Margin": r.unusualMargin ? "Yes" : "No",
      "Zero Budget": r.zeroBudget ? "Yes" : "No",
    }));

    const forecast = data.rows.map((r) => {
      const row: Record<string, string | number> = {
        Project: safeText(r.projectName),
        Client: safeText(r.clientName),
      };
      data.weeks.forEach((w, i) => {
        row[w.label] = r.weeklyForecast[i] ?? 0;
      });
      row["Total"] = r.forecastTotal;
      return row;
    });
    const totalRow: Record<string, string | number> = {
      Project: "TOTAL",
      Client: "",
    };
    data.weeks.forEach((w, i) => {
      totalRow[w.label] = data.weeklyTotals[i] ?? 0;
    });
    totalRow["Total"] = data.forecastGrandTotal;
    forecast.push(totalRow);

    exportSheets(`portfolio-monitor-${year}`, [
      { name: "Portfolio", rows: portfolio },
      { name: "Invoice Forecast", rows: forecast },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Portfolio Monitor
          </h1>
          <p className="text-muted-foreground">
            PMO-wide view of every commercial project — billing, hours vs budget,
            estimated vs actual margin, anomaly flags, and a weekly invoice
            forecast. Read-only.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-32">
            <Label htmlFor="pm-year">Forecast Year</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
            >
              <SelectTrigger id="pm-year" className="bg-card" data-testid="select-pm-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!data?.rows?.length}
            data-testid="button-pm-export"
          >
            <Download className="h-4 w-4 mr-2" /> Export Excel
          </Button>
        </div>
      </div>

      {!isLoading && data?.rows?.length ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription>Projects</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.count}</div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" /> Selling
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{formatIDR(summary.selling)}</div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription>Invoiced</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-400">{formatIDR(summary.invoiced)}</div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription>Remaining</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-amber-400">{formatIDR(summary.remaining)}</div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> Forecast {year}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-emerald-400">{formatIDR(summary.forecast)}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {(summary.unusual > 0 || summary.zero > 0) && !isLoading ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {summary.unusual > 0 && (
            <span>
              {summary.unusual} project{summary.unusual === 1 ? "" : "s"} with an
              unusual margin variance (≥ 15 pp from estimate).
            </span>
          )}
          {summary.zero > 0 && (
            <span>
              {summary.zero} project{summary.zero === 1 ? "" : "s"} with a zero
              cost budget.
            </span>
          )}
        </div>
      ) : null}

      {isLoading ? (
        <TableSkeleton columns={8} rows={6} />
      ) : !data?.rows?.length ? (
        <EmptyState
          title="No projects in scope"
          description="There are no commercial projects past intake to monitor."
          icon={<FileBarChart className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <>
          <PortfolioTable rows={data.rows} />
          <ForecastMatrix
            rows={data.rows}
            weeks={data.weeks}
            weeklyTotals={data.weeklyTotals}
            grandTotal={data.forecastGrandTotal}
          />
        </>
      )}
    </div>
  );
}

function PortfolioTable({ rows }: { rows: PortfolioMonitorRow[] }) {
  return (
    <Card className="border-border overflow-hidden">
      <CardHeader className="pb-2 bg-muted/30">
        <CardTitle className="text-base">Portfolio</CardTitle>
        <CardDescription>
          One row per project. Costs and margins are derived from approved
          timesheets and expenses; budgets are the intake estimates.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Project</th>
              <th className="text-left p-2 min-w-[140px]">Client</th>
              <th className="text-left p-2 min-w-[110px]">Type</th>
              <th className="text-left p-2 min-w-[110px]">Stage</th>
              <th className="text-right p-2 min-w-[110px]">Selling</th>
              <th className="text-right p-2 min-w-[110px]">Invoiced</th>
              <th className="text-right p-2 min-w-[110px]">Remaining</th>
              <th className="text-right p-2 min-w-[120px]">Hours (Used/Budget)</th>
              <th className="text-right p-2 min-w-[140px]">Costs (Used/Budget)</th>
              <th className="text-right p-2 min-w-[80px]">Est %</th>
              <th className="text-right p-2 min-w-[80px]">Act %</th>
              <th className="text-right p-2 min-w-[80px]">Δ pp</th>
              <th className="text-left p-2 min-w-[120px]">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.projectId}
                className="border-t border-border/40 hover:bg-muted/20"
                data-testid={`row-pm-${r.projectId}`}
              >
                <td className="p-2 sticky left-0 bg-background font-medium">
                  <a
                    href={`/projects/${r.projectId}`}
                    className="block hover:text-primary"
                  >
                    <div className="font-semibold">{r.projectName}</div>
                    {r.projectCode && (
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {r.projectCode}
                      </div>
                    )}
                  </a>
                </td>
                <td className="p-2 text-muted-foreground">{r.clientName ?? "—"}</td>
                <td className="p-2">{r.type ?? "—"}</td>
                <td className="p-2">
                  <ProjectStatusBadge status={r.stage as ProjectStatus} />
                </td>
                <td className="p-2 text-right font-mono">{formatIDR(r.sellingAmount)}</td>
                <td className="p-2 text-right font-mono text-blue-300">{compactIDR(r.invoiced)}</td>
                <td className="p-2 text-right font-mono text-amber-300">{compactIDR(r.remainingInvoice)}</td>
                <td className="p-2 text-right font-mono">
                  <div>
                    {r.usedHours.toFixed(0)} / {r.budgetHours.toFixed(0)}
                  </div>
                  <div className={`text-[10px] ${deltaClass(r.deltaHours, false)}`}>
                    {r.deltaHours > 0 ? "+" : ""}
                    {r.deltaHours.toFixed(0)}
                  </div>
                </td>
                <td className="p-2 text-right font-mono">
                  <div>
                    {compactIDR(r.usedCosts)} / {compactIDR(r.budgetCosts)}
                  </div>
                  <div className={`text-[10px] ${deltaClass(r.deltaCosts, false)}`}>
                    {r.deltaCosts > 0 ? "+" : ""}
                    {compactIDR(r.deltaCosts)}
                  </div>
                </td>
                <td className="p-2 text-right font-mono text-muted-foreground">
                  {formatPct(r.estimatedMargin)}
                </td>
                <td className="p-2 text-right font-mono">{formatPct(r.actualMargin)}</td>
                <td className={`p-2 text-right font-mono ${deltaClass(r.deltaMargin, true)}`}>
                  {r.deltaMargin > 0 ? "+" : ""}
                  {r.deltaMargin.toFixed(1)}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {r.unusualMargin && (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[9px]"
                      >
                        Unusual margin
                      </Badge>
                    )}
                    {r.zeroBudget && (
                      <Badge
                        variant="outline"
                        className="bg-red-500/15 text-red-300 border-red-500/30 text-[9px]"
                      >
                        Zero budget
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ForecastMatrix({
  rows,
  weeks,
  weeklyTotals,
  grandTotal,
}: {
  rows: PortfolioMonitorRow[];
  weeks: { key: string; label: string; start: string }[];
  weeklyTotals: number[];
  grandTotal: number;
}) {
  // Only render weeks that have at least one forecast value to keep the matrix
  // readable (a full year of empty columns is noise).
  const activeIdx = useMemo(
    () => weeks.map((_, i) => i).filter((i) => (weeklyTotals[i] ?? 0) > 0),
    [weeks, weeklyTotals],
  );
  const visibleRows = useMemo(
    () => rows.filter((r) => r.forecastTotal > 0),
    [rows],
  );

  if (activeIdx.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-2 bg-muted/30">
          <CardTitle className="text-base">Invoice Forecast (Weekly)</CardTitle>
          <CardDescription>
            Planned billing milestones bucketed by their due date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No planned milestones to forecast"
            description="No planned billing milestones fall within the selected year. Set due dates in each project's Billing tab to populate this forecast."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border overflow-hidden">
      <CardHeader className="pb-2 bg-muted/30">
        <CardTitle className="text-base">Invoice Forecast (Weekly)</CardTitle>
        <CardDescription>
          Planned billing milestones (to be invoiced) bucketed by their due date.
          Grand total {formatIDR(grandTotal)}. Empty weeks are hidden.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Project</th>
              {activeIdx.map((i) => (
                <th
                  key={weeks[i].key}
                  className="text-right p-2 font-mono whitespace-nowrap min-w-[80px]"
                  title={`Week starting ${weeks[i].start}`}
                >
                  {weeks[i].label}
                </th>
              ))}
              <th className="text-right p-2 font-mono border-l border-border/40 min-w-[100px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr
                key={r.projectId}
                className="border-t border-border/40 hover:bg-muted/20"
              >
                <td className="p-2 sticky left-0 bg-background font-medium">
                  <a href={`/projects/${r.projectId}`} className="hover:text-primary">
                    <span className="font-semibold">{r.projectName}</span>
                    {r.projectCode && (
                      <span className="ml-1 text-[10px] text-muted-foreground font-mono">
                        {r.projectCode}
                      </span>
                    )}
                  </a>
                </td>
                {activeIdx.map((i) => {
                  const v = r.weeklyForecast[i] ?? 0;
                  return (
                    <td
                      key={`${r.projectId}-${i}`}
                      className={`p-2 text-right font-mono ${v > 0 ? "bg-emerald-500/10 text-emerald-300" : "text-muted-foreground/40"}`}
                    >
                      {v > 0 ? compactIDR(v) : "—"}
                    </td>
                  );
                })}
                <td className="p-2 text-right font-mono font-semibold border-l border-border/40">
                  {compactIDR(r.forecastTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 font-semibold border-t-2 border-primary/30">
            <tr>
              <td className="p-2 sticky left-0 bg-muted/40">Grand total</td>
              {activeIdx.map((i) => (
                <td key={weeks[i].key} className="p-2 text-right font-mono">
                  {(weeklyTotals[i] ?? 0) > 0 ? compactIDR(weeklyTotals[i]) : "—"}
                </td>
              ))}
              <td className="p-2 text-right font-mono border-l border-border/40">
                {compactIDR(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}
