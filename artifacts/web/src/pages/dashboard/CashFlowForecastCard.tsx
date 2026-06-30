import { useMemo, useState } from "react";
import { useGetInvoicePlanning, getGetInvoicePlanningQueryKey, type DashboardCashFlowMonth } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { Link } from "wouter";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

function compactIDR(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

export default function CashFlowForecastCard({ months: monthsProp }: { months?: DashboardCashFlowMonth[] } = {}) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const defaultMonth1 = `${y}-${m}-01`;
  const [metric, setMetric] = useState<"dpp" | "total">("total");

  // When the parent (executive dashboard) already loaded the aggregated
  // overview, it hands us the precomputed monthly cash-flow buckets so we skip
  // the standalone invoice-planning fetch. Other callers fall back to fetching.
  const query = useGetInvoicePlanning(
    { mode: "month", startDate: defaultMonth1, periods: 6 },
    {
      query: {
        enabled: monthsProp === undefined,
        queryKey: getGetInvoicePlanningQueryKey({ mode: "month", startDate: defaultMonth1, periods: 6 }),
      },
    },
  );
  const isLoading = monthsProp === undefined && query.isLoading;

  const rows = useMemo(() => {
    if (monthsProp) {
      return monthsProp.map((mm) => ({
        month: formatMonthLabel(mm.periodStart),
        paid: metric === "dpp" ? mm.paidDpp : mm.paidTotal,
        invoiced: metric === "dpp" ? mm.invoicedDpp : mm.invoicedTotal,
        planned: metric === "dpp" ? mm.plannedDpp : mm.plannedTotal,
      }));
    }
    const data = query.data;
    if (!data) return [];
    return data.periodStarts.map((iso) => {
      let paid = 0, invoiced = 0, planned = 0;
      for (const g of data.groups) {
        for (const r of g.rows) {
          const cellIdx = r.cells.findIndex((c) => c.periodStart === iso);
          const cell = cellIdx >= 0 ? r.cells[cellIdx] : null;
          if (!cell) continue;
          for (const ms of cell.milestones) {
            const v = metric === "dpp" ? ms.dpp : ms.total;
            if (ms.status === "PAID") paid += v;
            else if (ms.status === "INVOICED") invoiced += v;
            else if (ms.status === "PLANNED") planned += v;
          }
        }
      }
      return { month: formatMonthLabel(iso), paid, invoiced, planned };
    });
  }, [monthsProp, query.data, metric]);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (s, r) => ({ paid: s.paid + r.paid, invoiced: s.invoiced + r.invoiced, planned: s.planned + r.planned }),
      { paid: 0, invoiced: 0, planned: 0 },
    );
    return { ...t, all: t.paid + t.invoiced + t.planned };
  }, [rows]);

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-primary mt-1" />
          <div>
            <CardTitle className="text-base">Cash Flow Forecast (6 months)</CardTitle>
            <CardDescription>
              Projected billing inflow from milestones — Paid, Invoiced (outstanding), and Planned combined.
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={metric === "dpp" ? "default" : "outline"} onClick={() => setMetric("dpp")} data-testid="button-cashflow-dpp">DPP</Button>
          <Button size="sm" variant={metric === "total" ? "default" : "outline"} onClick={() => setMetric("total")} data-testid="button-cashflow-total">Total</Button>
          <Link href="/invoice-planning">
            <Button size="sm" variant="ghost">Detail</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs">
          <div className="rounded border border-border bg-muted/20 px-3 py-2">
            <div className="text-muted-foreground">Total 6 months</div>
            <div className="text-base font-bold">{compactIDR(totals.all)}</div>
          </div>
          <div className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2">
            <div className="text-blue-300">Paid</div>
            <div className="text-base font-bold text-blue-200">{compactIDR(totals.paid)}</div>
          </div>
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <div className="text-amber-300">Invoiced</div>
            <div className="text-base font-bold text-amber-200">{compactIDR(totals.invoiced)}</div>
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <div className="text-emerald-300">Planned</div>
            <div className="text-base font-bold text-emerald-200">{compactIDR(totals.planned)}</div>
          </div>
        </div>
        <div className="h-64">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={compactIDR} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(value: any) => compactIDR(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="paid" stackId="cf" fill="#60a5fa" name="Paid" />
                <Bar dataKey="invoiced" stackId="cf" fill="#fbbf24" name="Invoiced" />
                <Bar dataKey="planned" stackId="cf" fill="#34d399" name="Planned" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
