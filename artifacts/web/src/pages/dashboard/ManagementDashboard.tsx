import { useGetDashboardOverview, customFetch, useListUsers, getListUsersQueryKey, useUpdateProject, getListProjectsQueryKey, getListNotificationsQueryKey, UserRole, type DashboardCsat, type LeadAnalytics, type PmAllocationRow } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatIDR, formatPct } from "@/lib/format";
import { Briefcase, Wallet, TrendingUp, Clock, Activity, AlarmClock, Download, UserPlus } from "lucide-react";
import { exportSheets, downloadAuthed } from "@/lib/exports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarginBadge } from "@/components/common/Badges";
import ResourceUtilizationSection from "@/components/dashboard/ResourceUtilizationSection";
import BillableUtilizationCard from "@/components/dashboard/BillableUtilizationCard";
import CashFlowForecastCard from "./CashFlowForecastCard";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { ProjectStatus } from "@workspace/api-client-react";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { AlertTriangle } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";

function SpkMissingIcon() {
  return (
    <TooltipProvider delayDuration={150}>
      <UITooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" data-testid="icon-spk-missing">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent>This project does not have an SPK/PO Number yet</TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isFinance = user?.role === UserRole.FINANCE;
  const dashQc = useQueryClient();
  useEffect(() => {
    customFetch("/api/notifications/run-checks", { method: "POST" })
      .then(() => dashQc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }))
      .catch(() => {});
  }, [dashQc]);
  // Single aggregated first-load fetch replaces ~12 separate dashboard calls
  // (summary, profit trend, status breakdown, top/losing projects, recent
  // activity, pending aging, billable + resource utilization, cash flow, CRM,
  // CSAT, PM allocation, pending assignment, project-type stats). Collapsing the
  // fan-out keeps a cold autoscale instance + remote Neon from being saturated
  // on the first load after idle.
  const { data: overview, isLoading: loadingOverview } = useGetDashboardOverview();

  const summary = overview?.summary;
  const trend = overview?.profitTrend;
  const statusBreakdown = overview?.statusBreakdown;
  const topProjects = overview?.topProjects;
  const recentActivity = overview?.recentActivity ?? undefined;
  const aging = overview?.pendingAging ?? undefined;
  const losingProjects = overview?.losingProjects ?? [];
  const pendingAssignment = overview?.pendingAssignment ?? [];
  const projectTypeStats = overview?.projectTypeStats ?? [];
  const loadingSummary = loadingOverview;
  const loadingTrend = loadingOverview;
  const loadingStatus = loadingOverview;
  const loadingTop = loadingOverview;
  const loadingActivity = loadingOverview;

  // Match the colors used by ProjectStatusBadge across the app so the donut
  // legend reads the same as every status badge users see elsewhere.
  // (chart-4 = orange and chart-5 = red — wrong for COMPLETE/CLOSED.)
  const STATUS_COLORS: Record<ProjectStatus, string> = {
    [ProjectStatus.DRAFT]: "hsl(271, 81%, 56%)",        // purple-500
    [ProjectStatus.OBSERVATION]: "hsl(217, 91%, 60%)",  // blue-500
    [ProjectStatus.ACTIVE]: "hsl(var(--primary))",      // primary green
    [ProjectStatus.PAUSE]: "hsl(38, 92%, 50%)",         // amber-500
    [ProjectStatus.COMPLETE]: "hsl(160, 84%, 39%)",     // emerald-500
    [ProjectStatus.CLOSED]: "hsl(215, 16%, 47%)",       // slate-500
    [ProjectStatus.NO_NEED_CONSULTANT]: "hsl(25, 95%, 53%)",
  };

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle={isFinance ? "Executive snapshot: portfolio health & profitability." : "Executive snapshot: portfolio health, profitability, and team utilization."} />

      <div className={isFinance ? "grid gap-3 md:grid-cols-2" : ""}>
        <Link href="/reports">
          <Card className="cursor-pointer border-primary/30 bg-primary/5 hover:border-primary/60 transition h-full" data-testid="card-reports-shortcut">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <div className="text-sm font-medium text-primary">Reports</div>
                <CardDescription className="text-xs">10 ready-to-use reports: profitability, utilization, cash inflow, billing aging, VAT. Export CSV / Excel / PDF.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">Open</Button>
            </CardContent>
          </Card>
        </Link>
        {isFinance && (
          <Link href="/invoice-planning">
            <Card className="cursor-pointer border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 transition h-full" data-testid="card-invoice-planning-shortcut">
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div>
                  <div className="text-sm font-medium text-amber-300">Invoice Planning</div>
                  <CardDescription className="text-xs">Read-only weekly/monthly billing milestone matrix per project. Drill into Planned, Invoiced, and Paid amounts.</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10">Open</Button>
              </CardContent>
            </Card>
          </Link>
        )}
        {isFinance && (
          <Link href="/invoice-settings">
            <Card className="cursor-pointer border-sky-500/30 bg-sky-500/5 hover:border-sky-500/60 transition h-full" data-testid="card-invoice-settings-shortcut">
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div>
                  <div className="text-sm font-medium text-sky-300">Invoice Settings</div>
                  <CardDescription className="text-xs">Edit the company and bank details printed on every generated invoice.</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10">Open</Button>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {!isFinance && pendingAssignment.length > 0 && (
        <PendingAssignmentSection projects={pendingAssignment} />
      )}

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
                <CardTitle className="text-sm font-medium text-muted-foreground">Weighted Margin</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatPct((summary as any).weightedMarginPct ?? summary.avgMarginPct)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Σ profit ÷ Σ revenue · Net {formatPct((summary as any).weightedNetMarginPct ?? 0)}
                </p>
              </CardContent>
            </Card>
            {!isFinance && (
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
            )}
          </>
        )}
      </div>

      {overview && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BillableUtilizationCard days={30} data={overview.billableUtilization} />
          <SatisfactionWidget data={overview.csat} />
        </div>
      )}

      {/* PM Reminder: pending timesheet aging */}
      {!isFinance && aging && (aging.buckets.gt48h > 0 || aging.buckets.gt72h > 0 || aging.buckets.h24to48 > 0) && (
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

      {/* Cash Flow Forecast: 6-month billing inflow projection */}
      {overview && <CashFlowForecastCard months={overview.cashFlow.months} />}

      {/* PM Allocation: managers reporting up to PMO */}
      {overview && <CrmSummaryCard data={overview.crm} />}
      {!isFinance && overview && <PMAllocationCard rows={overview.pmAllocation ?? []} />}

      {/* Resource Utilization */}
      {!isFinance && overview && (
        <ResourceUtilizationSection
          detail={overview.resourceUtilizationDetail ?? undefined}
          trend={overview.utilizationTrend ?? undefined}
        />
      )}

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
        {!isFinance && (
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
                  {recentActivity.slice(0, 10).map((activity) => (
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
        )}
      </div>

    </div>
  );
}

function PendingAssignmentSection({ projects }: { projects: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [pmId, setPmId] = useState<string>("");
  const { data: users } = useListUsers({ query: { enabled: !!selected, queryKey: getListUsersQueryKey() } });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: async () => {
        toast({ title: "PM assigned", description: "Project forwarded to the Project Manager." });
        await qc.refetchQueries({ queryKey: getListProjectsQueryKey() });
        setSelected(null);
        setPmId("");
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to assign PM", description: err?.message ?? "Unknown error" });
      },
    },
  });

  const pms = (users ?? []).filter((u) => u.role === UserRole.PROJECT_MANAGER || u.role === UserRole.MANAGEMENT);

  function openAssign(project: any) {
    setSelected(project);
    setPmId("");
  }

  function handleAssign() {
    if (!selected || !pmId) return;
    updateProject.mutate({ id: selected.id, data: { pmId } });
  }

  return (
    <>
      <Card className="border-purple-500/40 bg-purple-500/5">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <UserPlus className="h-5 w-5 text-purple-400" />
          <div className="flex-1">
            <CardTitle className="text-base">
              {projects.length} project(s) awaiting PM assignment
            </CardTitle>
            <CardDescription>
              New projects from Sales — assign a Project Manager to complete the details.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="text-sm divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary truncate block">
                    <span className="inline-flex items-center gap-1.5">
                      {p.name}
                      {!p.spkFileUrl && <SpkMissingIcon />}
                    </span>
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{p.code}</span>
                    <span className="mx-1">·</span>
                    {p.clientName ?? "-"}
                    {p.salesName && <><span className="mx-1">·</span>Sales: {p.salesName}</>}
                  </p>
                </div>
                <Button size="sm" onClick={() => openAssign(p)} data-testid={`button-assign-pm-${p.id}`}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Assign PM
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setPmId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Project Manager</DialogTitle>
            <DialogDescription>
              {selected ? <>For <span className="font-mono">{selected.code}</span> — {selected.name}</> : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Select PM</label>
            <Select value={pmId} onValueChange={setPmId}>
              <SelectTrigger data-testid="select-pm-assignment"><SelectValue placeholder="Select Project Manager" /></SelectTrigger>
              <SelectContent>
                {pms.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The PM will receive this project on their dashboard and can complete the details (revenue, mandays, team, schedule).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelected(null); setPmId(""); }}>Cancel</Button>
            <Button
              onClick={handleAssign}
              disabled={!pmId || updateProject.isPending}
              data-testid="button-confirm-assign-pm"
            >
              {updateProject.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SatisfactionWidget({ data }: { data: DashboardCsat | null }) {
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);
  const onSeed = async () => {
    if (!confirm("Load CSAT demo data? This will close a few projects and create ~11 survey responses. Run once only.")) return;
    setSeeding(true);
    try {
      const r = await customFetch("/api/survey/seed-demo", { method: "POST" }) as { responses: number; projectsClosed?: string[] };
      alert(`Success. ${r.responses} responses created, ${r.projectsClosed?.length ?? 0} projects closed.`);
      queryClient.invalidateQueries();
    } catch (e: unknown) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };
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
            {!import.meta.env.PROD && (
              <Button size="sm" variant="outline" onClick={onSeed} disabled={seeding} data-testid="button-seed-csat-demo">
                {seeding ? "Seeding…" : "Load demo data"}
              </Button>
            )}
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

function CrmSummaryCard({ data }: { data: LeadAnalytics | null }) {
  const stages = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];
  const weightedTotal = stages.reduce(
    (s, k) => s + (data?.weightedPipelineByStage?.[k]?.weighted ?? 0),
    0,
  );
  const countTotal = stages.reduce(
    (s, k) => s + (data?.weightedPipelineByStage?.[k]?.count ?? 0),
    0,
  );
  const lostCount = data?.lostReasonBreakdown
    ? Object.values(data.lostReasonBreakdown).reduce((s: number, v: any) => s + v.count, 0)
    : 0;
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Sales Pipeline Snapshot</CardTitle>
        <CardDescription>
          Read-only summary of CRM leads across the company.{" "}
          <Link href="/leads" className="text-primary hover:underline">Open full pipeline →</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Weighted Pipeline (open)</div>
          <div className="text-lg font-bold font-mono">{formatIDR(weightedTotal)}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Expected This Quarter</div>
          <div className="text-lg font-bold font-mono">{formatIDR(data?.expectedRevenueThisQuarter ?? 0)}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Active Leads</div>
          <div className="text-lg font-bold">{countTotal}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Lost (6 months)</div>
          <div className="text-lg font-bold">{lostCount}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PMAllocationCard({ rows: serverRows }: { rows: PmAllocationRow[] }) {
  // Server already aggregates + sorts by in-flight; we only add the tone class.
  const rows = serverRows.map((r) => ({
    ...r,
    tone: r.inFlight >= 6 ? "text-destructive" : r.inFlight >= 4 ? "text-amber-500" : "text-emerald-500",
  }));

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">PM Allocation</CardTitle>
        <CardDescription>
          Project Managers reporting to PMO and how many in-flight projects each is carrying.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No active Project Managers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Project Manager</th>
                  <th className="py-2 pr-3 font-medium text-right">In-flight</th>
                  <th className="py-2 pr-3 font-medium text-right">Active</th>
                  <th className="py-2 pr-3 font-medium text-right">Observation</th>
                  <th className="py-2 pr-3 font-medium text-right">Draft</th>
                  <th className="py-2 pr-3 font-medium text-right">In-flight Contract Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{r.name}</p>
                      {r.title && <p className="text-xs text-muted-foreground">{r.title}</p>}
                    </td>
                    <td className={`py-2 pr-3 text-right font-mono font-semibold ${r.tone}`}>{r.inFlight}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.active}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.observation}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r.draft}</td>
                    <td className="py-2 pr-3 text-right font-mono">{formatIDR(r.totalActiveValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
