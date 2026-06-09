import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIDR, formatPct } from "@/lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { TrendingUp, TrendingDown, Award, AlertTriangle, Activity, CalendarRange, Target, Users2 } from "lucide-react";

type BIResp = {
  period: { label: string; from: string; to: string };
  filters: { principals: { id: string; name: string; role: string }[]; projectTypes: string[] };
  profitabilityByType: { type: string; revenue: number; cost: number; profit: number; projectCount: number; avgMarginPct: number }[];
  topTypes: { type: string; avgMarginPct: number; profit: number }[];
  teamPerformance: { principalId: string; principalName: string; principalRole: string; revenue: number; cost: number; profit: number; avgMarginPct: number; projectCount: number; teamSize: number; avgUtilizationPct: number }[];
  forecast: { month: string; label: string; junior: number; senior: number; writer: number; admin: number; pm: number; totalDemandMandays: number; capacityMandays: number; shortage: number }[];
  forecastCapacity: { junior: number; senior: number; writer: number; admin: number; pm: number };
  health: {
    monthMarginPct: number;
    quarterMarginPct: number;
    avgProjectDurationDays: number;
    utilizationTrend: { month: string; label: string; utilizationPct: number; hours: number }[];
    projectSuccessRatePct: number;
    closedProjectCount: number;
    successfulClosedCount: number;
    topProjects: { id: string; code: string; name: string; clientName: string; type: string; revenue: number; cost: number; profit: number; marginPct: number }[];
  };
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ef4444", "#eab308", "#06b6d4", "#ec4899", "#84cc16", "#f43f5e", "#8b5cf6", "#14b8a6"];

export default function BusinessIntelligencePage() {
  const [period, setPeriod] = useState<string>("year");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [principalId, setPrincipalId] = useState<string>("all");
  const [projectType, setProjectType] = useState<string>("all");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period", period);
    if (period === "custom") {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
    }
    if (principalId !== "all") p.set("principalId", principalId);
    if (projectType !== "all") p.set("projectType", projectType);
    return p.toString();
  }, [period, from, to, principalId, projectType]);

  const { data, isLoading } = useQuery({
    queryKey: ["bi-overview", qs],
    queryFn: () => customFetch<BIResp>(`/api/bi/overview?${qs}`),
  });

  const monthMargin = data?.health.monthMarginPct ?? 0;
  const quarterMargin = data?.health.quarterMarginPct ?? 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Business Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">Decision support analytics for executive management</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger data-testid="bi-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === "custom" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Principal</Label>
              <Select value={principalId} onValueChange={setPrincipalId}>
                <SelectTrigger data-testid="bi-principal"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Principals</SelectItem>
                  {data?.filters.principals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project Type</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger data-testid="bi-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {(data?.filters.projectTypes ?? []).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <HealthCard icon={<Target className="h-4 w-4" />} label="Margin (Month)" value={formatPct(monthMargin)} positive={monthMargin >= 0} />
        <HealthCard icon={<Target className="h-4 w-4" />} label="Margin (Quarter)" value={formatPct(quarterMargin)} positive={quarterMargin >= 0} />
        <HealthCard icon={<CalendarRange className="h-4 w-4" />} label="Avg Project Duration" value={`${Math.round(data?.health.avgProjectDurationDays ?? 0)} days`} positive />
        <HealthCard icon={<Award className="h-4 w-4" />} label="Project Success Rate" value={formatPct(data?.health.projectSuccessRatePct ?? 0)} positive={(data?.health.projectSuccessRatePct ?? 0) >= 70} subtitle={`${data?.health.successfulClosedCount ?? 0} / ${data?.health.closedProjectCount ?? 0} closed`} />
        <HealthCard icon={<Activity className="h-4 w-4" />} label="Util. Trend (3mo avg)" value={formatPct(((data?.health.utilizationTrend ?? []).reduce((s, r) => s + r.utilizationPct, 0)) / Math.max(1, (data?.health.utilizationTrend ?? []).length))} positive />
      </div>

      {/* Profitability by Project Type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Profitability by Project Type</CardTitle>
          <CardDescription>Revenue, profit and average margin per service category</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (data?.profitabilityByType.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">No data for the selected filters.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data!.profitabilityByType} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="type" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 12 }} formatter={(v: any, n: any) => n === "avgMarginPct" ? `${(v as number).toFixed(1)}%` : formatIDR(v as number)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" />
                    <Bar dataKey="profit" name="Profit" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data!.profitabilityByType} dataKey="profit" nameKey="type" outerRadius={90} label={(e: any) => `${e.type}`}>
                      {data!.profitabilityByType.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatIDR(v as number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data && data.topTypes.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {data.topTypes.map((t, i) => (
                <div key={t.type} className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">#{i + 1}</div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Top {i === 0 ? "Most" : ""} Profitable</p>
                    <p className="font-semibold">{t.type}</p>
                    <p className="text-xs text-muted-foreground">Margin {formatPct(t.avgMarginPct)} · Profit {formatIDR(t.profit)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && data.profitabilityByType.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Type</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Avg Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.profitabilityByType.map((r) => (
                    <TableRow key={r.type}>
                      <TableCell className="font-medium">{r.type}</TableCell>
                      <TableCell className="text-right">{r.projectCount}</TableCell>
                      <TableCell className="text-right">{formatIDR(r.revenue)}</TableCell>
                      <TableCell className="text-right">{formatIDR(r.cost)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatIDR(r.profit)}</TableCell>
                      <TableCell className={`text-right ${r.avgMarginPct >= 20 ? "text-success" : r.avgMarginPct >= 0 ? "text-amber-400" : "text-destructive"}`}>{formatPct(r.avgMarginPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users2 className="h-4 w-4 text-primary" /> Team Performance by Principal</CardTitle>
          <CardDescription>Profit, utilization and team size per Principal / PM</CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.teamPerformance.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">No principals match the selected filters.</div>
          ) : (
            <>
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data!.teamPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="principalName" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 12 }} formatter={(v: any) => formatIDR(v as number)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" />
                    <Bar dataKey="profit" name="Profit" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Projects</TableHead>
                      <TableHead className="text-right">Team</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Avg Margin</TableHead>
                      <TableHead className="text-right">Avg Util.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.teamPerformance.map((t, i) => (
                      <TableRow key={t.principalId} data-testid={`team-row-${i}`}>
                        <TableCell><Badge variant={i === 0 ? "default" : "secondary"}>#{i + 1}</Badge></TableCell>
                        <TableCell className="font-medium">{t.principalName}</TableCell>
                        <TableCell><Badge variant="outline">{t.principalRole}</Badge></TableCell>
                        <TableCell className="text-right">{t.projectCount}</TableCell>
                        <TableCell className="text-right">{t.teamSize}</TableCell>
                        <TableCell className="text-right">{formatIDR(t.revenue)}</TableCell>
                        <TableCell className={`text-right font-semibold ${t.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatIDR(t.profit)}</TableCell>
                        <TableCell className={`text-right ${t.avgMarginPct >= 20 ? "text-success" : "text-amber-400"}`}>{formatPct(t.avgMarginPct)}</TableCell>
                        <TableCell className="text-right">{formatPct(t.avgUtilizationPct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Resource Demand Forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-primary" /> Resource Demand Forecast (Next 3 Months)</CardTitle>
          <CardDescription>Projected mandays needed across active and observation projects</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.forecast ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="junior" name="Junior" stackId="a" fill="#60a5fa" />
                <Bar dataKey="senior" name="Senior / Consultant" stackId="a" fill="#22c55e" />
                <Bar dataKey="writer" name="Tech Writer" stackId="a" fill="#a855f7" />
                <Bar dataKey="admin" name="Admin Project" stackId="a" fill="#f59e0b" />
                <Bar dataKey="pm" name="Project Manager" stackId="a" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {(data?.forecast ?? []).map((m) => (
              <div key={m.month} className={`rounded-lg border p-3 ${m.shortage > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{m.label}</p>
                  {m.shortage > 0 ? (
                    <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Shortage</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-success"><TrendingUp className="h-3 w-3" /> OK</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Demand: {m.totalDemandMandays.toFixed(1)} md · Capacity: {m.capacityMandays} md</p>
                {m.shortage > 0 && <p className="text-xs text-destructive mt-1">Short by {m.shortage.toFixed(1)} mandays</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Utilization trend & Top projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Utilization Trend (3 months)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.health.utilizationTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937", borderRadius: 6, fontSize: 12 }} formatter={(v: any) => `${(v as number).toFixed(1)}%`} />
                <Line type="monotone" dataKey="utilizationPct" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="h-4 w-4 text-primary" /> Top 5 Most Profitable Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.health.topProjects ?? []).map((p, i) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded bg-primary/15 text-primary font-bold flex items-center justify-center text-sm shrink-0">#{i + 1}</div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.clientName} · {p.type}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold ${p.profit >= 0 ? "text-success" : "text-destructive"}`}>{formatIDR(p.profit)}</p>
                    <p className="text-xs text-muted-foreground">{formatPct(p.marginPct)}</p>
                  </div>
                </div>
              ))}
              {(data?.health.topProjects ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No projects in selected scope.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthCard({ icon, label, value, positive, subtitle }: { icon: React.ReactNode; label: string; value: string; positive: boolean; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          {icon} {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <p className={`text-xl md:text-2xl font-bold ${positive ? "text-success" : "text-destructive"}`}>{value}</p>
          {positive ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
