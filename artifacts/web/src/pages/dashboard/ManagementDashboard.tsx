import { useGetDashboardSummary, useGetProfitTrend, useGetStatusBreakdown, useGetTopProjects, useGetRecentActivity, useGetUtilization, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatIDR, formatPct } from "@/lib/format";
import { Briefcase, Wallet, TrendingUp, Clock, AlertCircle, Activity, AlarmClock, Download } from "lucide-react";
import { exportSheets, downloadAuthed } from "@/lib/exports";
import { classifyProject, type ProjectType } from "@/lib/projectType";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import ResourceUtilizationSection from "@/components/dashboard/ResourceUtilizationSection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { ProjectStatus, useListProjects } from "@workspace/api-client-react";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: trend, isLoading: loadingTrend } = useGetProfitTrend();
  const { data: statusBreakdown, isLoading: loadingStatus } = useGetStatusBreakdown();
  const { data: topProjects, isLoading: loadingTop } = useGetTopProjects();
  const { data: recentActivity, isLoading: loadingActivity } = useGetRecentActivity();
  const { data: utilization, isLoading: loadingUtil } = useGetUtilization();
  const { data: allProjects } = useListProjects();
  const losingProjects = (allProjects ?? [])
    .filter(
      (p) =>
        (p.status === ProjectStatus.ACTIVE || p.status === ProjectStatus.PAUSE) &&
        p.marginPct !== null &&
        p.marginPct !== undefined &&
        (p.actualMandays ?? 0) > 0 &&
        p.marginPct < 10,
    )
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, 5);
  const { data: aging } = useQuery<{ buckets: { lt24h: number; h24to48: number; gt48h: number; gt72h: number }; oldestHours: number; samples: any[] }>({
    queryKey: ["dashboard-pending-aging"],
    queryFn: () => customFetch<any>("/api/dashboard/pending-aging"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const STATUS_COLORS: Record<ProjectStatus, string> = {
    [ProjectStatus.OBSERVATION]: "hsl(var(--chart-2))", // Blue
    [ProjectStatus.ACTIVE]: "hsl(var(--chart-1))",      // Green
    [ProjectStatus.PAUSE]: "hsl(var(--chart-3))",       // Amber
    [ProjectStatus.COMPLETE]: "hsl(var(--chart-4))",    // Emerald
    [ProjectStatus.CLOSED]: "hsl(var(--chart-5))",      // Slate
  };

  // Project Type Analysis: classify projects by type and compute profitability per type
  const projectTypeStats = (() => {
    const map = new Map<ProjectType, { type: ProjectType; count: number; revenue: number; cost: number; profit: number }>();
    for (const p of allProjects ?? []) {
      const t = classifyProject({ name: p.name, code: p.code });
      const cur = map.get(t) ?? { type: t, count: 0, revenue: 0, cost: 0, profit: 0 };
      cur.count += 1;
      cur.revenue += p.contractValue ?? 0;
      const ac = (p as any).actualCost ?? 0;
      const ap = (p as any).actualProfit ?? ((p.contractValue ?? 0) - ac);
      cur.cost += ac;
      cur.profit += ap;
      map.set(t, cur);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, marginPct: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);
  })();

  function handleExportUtilization() {
    const utilRows = (utilization ?? []).map((u: any) => ({
      Resource: u.userName,
      Role: u.role,
      PlannedMandays: Number((u.plannedMandays ?? 0).toFixed(2)),
      ActualMandays: Number((u.actualMandays ?? 0).toFixed(2)),
      UtilizationPct: Number((u.utilizationPct ?? 0).toFixed(1)),
    }));
    const summaryRows = summary
      ? [{
          ActiveProjects: summary.activeProjects,
          TotalProjects: summary.totalProjects,
          TotalContractValue: summary.totalContractValue,
          TotalActualCost: summary.totalActualCost,
          TotalActualProfit: summary.totalActualProfit,
          AvgMarginPct: Number((summary.avgMarginPct ?? 0).toFixed(2)),
          PendingTimesheets: summary.pendingTimesheets,
          TotalMandays: Number((summary.totalMandays ?? 0).toFixed(2)),
        }]
      : [];
    const projTypeRows = projectTypeStats.map((t) => ({
      Type: t.type,
      Count: t.count,
      Revenue: t.revenue,
      ActualCost: t.cost,
      Profit: t.profit,
      MarginPct: Number(t.marginPct.toFixed(2)),
    }));
    exportSheets("dashboard-overview", [
      { name: "Summary", rows: summaryRows },
      { name: "Utilization", rows: utilRows },
      { name: "By Project Type", rows: projTypeRows },
    ]);
  }

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle="Executive snapshot: portfolio health, profitability, and team utilization." />

      {losingProjects.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <CardTitle className="text-base">
                {losingProjects.length} project(s) at risk · margin below 10%
              </CardTitle>
              <CardDescription>
                Consider re-scoping, renegotiating, or reallocating resources.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-sm space-y-1">
              {losingProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <Link href={`/projects/${p.id}`} className="text-primary hover:underline font-medium">
                    {p.code} · {p.name}
                  </Link>
                  <MarginBadge marginPct={p.marginPct} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingSummary || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
                <Briefcase className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{summary.activeProjects}</div>
                <p className="text-xs text-muted-foreground mt-1">Out of {summary.totalProjects} total</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground font-mono">{formatIDR(summary.totalContractValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Contract value</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Average Margin</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatPct(summary.avgMarginPct)}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all active</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{summary.pendingTimesheets}</div>
                <p className="text-xs text-muted-foreground mt-1">Timesheets</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <SatisfactionWidget />

      {/* PM Reminder: pending timesheet aging */}
      {aging && (aging.buckets.gt48h > 0 || aging.buckets.gt72h > 0 || aging.buckets.h24to48 > 0) && (
        <Card className={`shadow-sm ${aging.buckets.gt48h + aging.buckets.gt72h > 0 ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <AlarmClock className={`h-5 w-5 ${aging.buckets.gt48h + aging.buckets.gt72h > 0 ? "text-destructive" : "text-amber-400"}`} />
            <div className="flex-1">
              <CardTitle className="text-base">Pending Approval Reminder</CardTitle>
              <CardDescription>
                Oldest pending timesheet has been waiting {aging.oldestHours.toFixed(0)}h.
                {" "}
                {aging.buckets.gt48h + aging.buckets.gt72h > 0
                  ? "Submitters are blocked — please review now."
                  : "Action soon to keep things on track."}
              </CardDescription>
            </div>
            <Link href="/approvals">
              <Button size="sm" variant="outline">Open Inbox</Button>
            </Link>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">&lt; 24h: {aging.buckets.lt24h}</Badge>
            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40">24–48h: {aging.buckets.h24to48}</Badge>
            <Badge variant="destructive">&gt; 48h: {aging.buckets.gt48h}</Badge>
            {aging.buckets.gt72h > 0 && (
              <Badge variant="destructive" className="bg-destructive/80">&gt; 72h: {aging.buckets.gt72h}</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resource Utilization */}
      <ResourceUtilizationSection />

      <div className="grid gap-6 md:grid-cols-7 lg:grid-cols-7">
        {/* Profit Trend Chart */}
        <Card className="md:col-span-4 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Profit Margin Trend</CardTitle>
            <CardDescription>Monthly cost vs revenue tracking</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loadingTrend || !trend ? (
              <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rp ${value / 1000000}M`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatIDR(value)}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#colorRevenue)" />
                  <Area type="monotone" dataKey="cost" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorCost)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card className="md:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Project Status</CardTitle>
            <CardDescription>Current pipeline distribution</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            {loadingStatus || !statusBreakdown ? (
              <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="status"
                  >
                    {statusBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    formatter={(value: number, _name, props: any) => [`${value} project${value === 1 ? '' : 's'}`, props?.payload?.status ?? props?.name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Project Type Analysis */}
      {projectTypeStats.length > 0 && (
        <div className="grid gap-6 md:grid-cols-7">
          <Card className="md:col-span-4 border-border shadow-sm">
            <CardHeader>
              <CardTitle>Profitability by Project Type</CardTitle>
              <CardDescription>Total profit and revenue grouped by service line</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectTypeStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1_000_000).toFixed(0)}M`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => formatIDR(v)}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Profit" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="md:col-span-3 border-border shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle>Top 5 Most Profitable Types</CardTitle>
              <CardDescription>Ranked by total profit</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3">
                {projectTypeStats.slice(0, 5).map((t) => (
                  <div key={t.type} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{t.type}</p>
                      <p className="text-xs text-muted-foreground">{t.count} project{t.count === 1 ? "" : "s"} · {formatIDR(t.revenue)} revenue</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-mono text-sm font-semibold ${t.profit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                        {formatIDR(t.profit)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{formatPct(t.marginPct)} margin</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Projects */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Top Projects by Margin</CardTitle>
            <CardDescription>Highest performing active engagements</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {loadingTop || !topProjects ? (
              <TableSkeleton columns={3} rows={5} />
            ) : (
              <div className="space-y-4">
                {topProjects.map((project) => (
                  <div key={project.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Link href={`/projects/${project.id}`} className="font-medium hover:text-primary transition-colors">
                        {project.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{project.clientName}</p>
                    </div>
                    <MarginBadge marginPct={project.marginPct} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {loadingActivity || !recentActivity ? (
              <TableSkeleton columns={1} rows={5} />
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-4">
                    <div className="mt-0.5 bg-muted p-1.5 rounded-full border border-border">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{activity.message}</p>
                      <div className="flex items-center text-xs text-muted-foreground space-x-2">
                        {activity.userName && <span>{activity.userName}</span>}
                        {activity.userName && activity.projectName && <span>•</span>}
                        {activity.projectName && <span>{activity.projectName}</span>}
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function SatisfactionWidget() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{
    monthStart: string;
    responseCount: number;
    overallAverage: number;
    perQuestion: { key: string; text: string; average: number; responseCount: number }[];
  }>({
    queryKey: ["/survey/summary"],
    queryFn: () => customFetch("/api/survey/summary"),
  });
  const [seeding, setSeeding] = useState(false);
  const onSeed = async () => {
    if (!confirm("Load CSAT demo data? This will close a few projects and create ~11 survey responses. Run once only.")) return;
    setSeeding(true);
    try {
      const r = await customFetch("/api/survey/seed-demo", { method: "POST" });
      alert(`Success. ${r.responses} responses created, ${r.projectsClosed?.length ?? 0} projects closed.`);
      queryClient.invalidateQueries();
    } catch (e: unknown) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };
  if (isLoading) return <SkeletonCard />;
  if (!data) return null;
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium text-muted-foreground">Average Client Satisfaction (this month)</CardTitle>
          <CardDescription>{data.responseCount} response{data.responseCount === 1 ? "" : "s"} since {new Date(data.monthStart).toLocaleDateString()}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {data.responseCount > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => downloadAuthed(`${import.meta.env.BASE_URL}api/survey/summary/export.xlsx`, `csat-summary.xlsx`).catch((e) => alert(`Download failed: ${e.message}`))}>
                <Download className="h-3.5 w-3.5 mr-1" />Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadAuthed(`${import.meta.env.BASE_URL}api/survey/summary/export.pdf`, `csat-summary.pdf`).catch((e) => alert(`Download failed: ${e.message}`))}>
                <Download className="h-3.5 w-3.5 mr-1" />PDF
              </Button>
            </>
          )}
          <Activity className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {data.responseCount === 0 ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">No survey responses received yet this month.</div>
            <Button size="sm" variant="outline" onClick={onSeed} disabled={seeding} data-testid="button-seed-csat-demo">
              {seeding ? "Seeding…" : "Load demo data"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-3xl font-bold text-primary font-mono">{data.overallAverage.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">out of 5.00</div>
            </div>
            <div className="flex-1 min-w-[200px] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.perQuestion.map((q) => (
                <div key={q.key} className="text-xs">
                  <div className="text-muted-foreground truncate">{q.text.split("—")[0].trim()}</div>
                  <div className="font-mono text-foreground">{q.average.toFixed(2)} <span className="text-muted-foreground">({q.responseCount})</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
