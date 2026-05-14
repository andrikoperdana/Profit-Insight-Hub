import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingPage } from "@/components/common/Loading";
import { useAuth } from "@/lib/auth";
import { useListReports, useGetReportOptions, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, FileSpreadsheet, FileType2, AlertCircle } from "lucide-react";
import { formatIDR } from "@/lib/format";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

type FilterSpec = {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[] | null;
  optionsSource?: string | null;
  defaultValue?: string | null;
  placeholder?: string | null;
};
type ColumnSpec = {
  key: string;
  label: string;
  type: string;
  align?: string | null;
  total?: string | null;
  fixed?: number | null;
  badgeMap?: Record<string, string> | null;
};

function FilterField({ filter, value, onChange }: { filter: FilterSpec; value: string; onChange: (v: string) => void }) {
  const { data: dynamicOptions } = useGetReportOptions(
    { source: filter.optionsSource ?? "" },
    { query: { enabled: !!filter.optionsSource, queryKey: ["report-options", filter.optionsSource ?? ""] } },
  );
  const opts = (filter.options ?? dynamicOptions ?? []) as { value: string; label: string }[];

  if (filter.type === "date") {
    return <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`filter-${filter.key}`} />;
  }
  if (filter.type === "select" || filter.type === "year") {
    return (
      <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
        <SelectTrigger data-testid={`filter-${filter.key}`}>
          <SelectValue placeholder={filter.placeholder ?? "Semua"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Semua</SelectItem>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={filter.placeholder ?? ""} data-testid={`filter-${filter.key}`} />;
}

function formatCell(value: unknown, col: ColumnSpec): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (col.type) {
    case "currency":
      return formatIDR(Number(value) || 0);
    case "percent":
      return `${(Number(value) || 0).toFixed(col.fixed ?? 1)}%`;
    case "number":
      return col.fixed !== undefined && col.fixed !== null ? (Number(value) || 0).toFixed(col.fixed) : String(value);
    case "date": {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    }
    default:
      return String(value);
  }
}

const BADGE_VARIANT_CLASSES: Record<string, string> = {
  default: "bg-primary/10 text-primary border-primary/30",
  secondary: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  outline: "",
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export default function ReportRunner() {
  const [, params] = useRoute("/reports/:id");
  const reportId = params?.id ?? "";
  const { user } = useAuth();
  const allowed = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";

  const { data: meta } = useListReports({ query: { enabled: allowed, queryKey: ["reports"] } });
  const reportMeta = useMemo(() => (meta as any[] | undefined)?.find((r) => r.id === reportId), [meta, reportId]);

  const [filters, setFilters] = useState<Record<string, string>>({});

  // Initialize filter defaults when report meta loads
  useEffect(() => {
    if (!reportMeta) return;
    const init: Record<string, string> = {};
    for (const f of reportMeta.filters as FilterSpec[]) {
      if (f.defaultValue) init[f.key] = f.defaultValue;
    }
    setFilters(init);
  }, [reportMeta]);

  const queryParams: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) if (v) queryParams[k] = v;

  const { data: result, isLoading: isExecuting, refetch, isFetching } = useQuery({
    queryKey: ["report-result", reportId, JSON.stringify(filters)],
    enabled: !!reportMeta && allowed,
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) qs.set(k, String(v));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return customFetch<any>(`/api/reports/${reportId}${suffix}`, { method: "GET" });
    },
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="rounded-xl border-destructive/40">
          <CardContent className="p-6 flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Hanya Management dan Project Manager yang dapat membuka laporan.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!meta || !reportMeta) return <LoadingPage />;

  const columns = reportMeta.columns as ColumnSpec[];
  const rows = (result as any)?.rows ?? [];
  const totals = (result as any)?.totals as Record<string, unknown> | null | undefined;
  const chart = (result as any)?.chart;

  function downloadExport(format: "csv" | "xlsx" | "pdf") {
    const params = new URLSearchParams();
    params.set("format", format);
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    const token = localStorage.getItem("auth_token");
    fetch(`/api/reports/${reportId}/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error("export failed");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${reportId}-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("Gagal mengunduh laporan."));
  }

  return (
    <div className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="icon" data-testid="button-back-reports">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{reportMeta.name}</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">{reportMeta.description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadExport("csv")} data-testid="button-export-csv">
              <FileText className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadExport("xlsx")} data-testid="button-export-xlsx">
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadExport("pdf")} data-testid="button-export-pdf">
              <FileType2 className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        </div>

        {(reportMeta.filters as FilterSpec[]).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {(reportMeta.filters as FilterSpec[]).map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs">{f.label}</Label>
                    <FilterField
                      filter={f}
                      value={filters[f.key] ?? ""}
                      onChange={(v) => setFilters((s) => ({ ...s, [f.key]: v }))}
                    />
                  </div>
                ))}
                <div className="flex items-end">
                  <Button onClick={() => refetch()} disabled={isFetching} data-testid="button-apply-filters">
                    {isFetching ? "Memproses..." : "Terapkan"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {chart && rows.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Visualisasi</CardTitle>
            </CardHeader>
            <CardContent style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                {(() => {
                  if (chart.type === "pie") {
                    return (
                      <PieChart>
                        <Pie data={rows} dataKey={Array.isArray(chart.yKey) ? chart.yKey[0] : chart.yKey} nameKey={chart.xKey} cx="50%" cy="50%" outerRadius={110} label>
                          {rows.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    );
                  }
                  if (chart.type === "line") {
                    const yKeys = Array.isArray(chart.yKey) ? chart.yKey : [chart.yKey];
                    return (
                      <LineChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey={chart.xKey} fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip />
                        <Legend />
                        {yKeys.map((k: string, i: number) => (
                          <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]!} strokeWidth={2} />
                        ))}
                      </LineChart>
                    );
                  }
                  const yKeys = Array.isArray(chart.yKey) ? chart.yKey : [chart.yKey];
                  return (
                    <BarChart data={rows}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey={chart.xKey} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend />
                      {yKeys.map((k: string, i: number) => (
                        <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]!} stackId={chart.stacked ? "a" : undefined} />
                      ))}
                    </BarChart>
                  );
                })()}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">
              Hasil <Badge variant="secondary" className="ml-2">{rows.length} baris</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isExecuting ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Tidak ada data untuk filter ini.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c.key} className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}>
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any, i: number) => (
                    <TableRow key={i} data-testid={`report-row-${i}`}>
                      {columns.map((c) => {
                        const v = row[c.key];
                        const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "";
                        if (c.type === "badge") {
                          const variant = c.badgeMap?.[String(v)] ?? "secondary";
                          const cls = BADGE_VARIANT_CLASSES[variant] ?? "";
                          return (
                            <TableCell key={c.key} className={align}>
                              <Badge variant="outline" className={`text-[10px] ${cls}`}>{String(v ?? "—")}</Badge>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={c.key} className={`${align} ${c.type === "currency" || c.type === "number" || c.type === "percent" ? "font-mono text-xs" : ""}`}>
                            {formatCell(v, c)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {totals && (
                    <TableRow className="font-semibold border-t-2 bg-muted/40">
                      {columns.map((c, i) => {
                        const v = totals[c.key];
                        const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "";
                        if (i === 0) return <TableCell key={c.key} className={align}>TOTAL</TableCell>;
                        if (!c.total || v === undefined || v === null) return <TableCell key={c.key} className={align}></TableCell>;
                        return (
                          <TableCell key={c.key} className={`${align} font-mono text-xs`}>
                            {formatCell(v, c)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
