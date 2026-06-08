import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useListExpenses,
  useListTimesheets,
  ProjectStatus,
  customFetch,
  getListTimesheetsQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatIDR, formatPct, formatDate } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectStatusBadge, MarginBadge } from "@/components/common/Badges";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Activity,
  AlarmClock,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Inbox,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  Users,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import WorkHoursCard from "@/components/WorkHoursCard";
import MyTasksCard from "@/components/dashboard/MyTasksCard";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

type AgingResp = {
  pendingTotal: number;
  overdueCount: number;
  oldestHours: number;
  buckets: { lt24h: number; h24to48: number; gt48h: number; gt72h: number };
};

type UtilDetail = {
  summary: { total: number; active: number; idle: number; overloaded: number };
  resources: {
    userId: string;
    userName: string;
    role: string;
    status: "ACTIVE" | "IDLE" | "OVERLOADED";
    currentProjectId: string | null;
    currentProjectName: string | null;
    avgHoursPerDay7d: number;
    utilizationPctMonth: number;
  }[];
};

export default function PMDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    // PM cannot trigger run-checks (MGMT-only); just refresh own notifications list.
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  }, [qc]);

  const { data: allProjects, isLoading: loadingProjects } = useListProjects();
  const { data: allExpenses } = useListExpenses();
  const pendingExpenses = useMemo(
    () => (allExpenses ?? []).filter((e: any) => e.status === "PENDING"),
    [allExpenses],
  );
  const pendingExpenseTotal = pendingExpenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  const tsParams = { scope: "approval" as const };
  const { data: pendingTimesheets } = useListTimesheets(tsParams, {
    query: { queryKey: getListTimesheetsQueryKey(tsParams) },
  });

  const { data: aging } = useQuery<AgingResp>({
    queryKey: ["dashboard-pending-aging"],
    queryFn: () => customFetch<AgingResp>("/api/dashboard/pending-aging"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: util } = useQuery<UtilDetail>({
    queryKey: ["dashboard-resource-utilization-detail"],
    queryFn: () =>
      customFetch<UtilDetail>("/api/dashboard/resource-utilization-detail"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const myProjects = useMemo(
    () => (allProjects ?? []).filter((p) => p.pmId === user?.id),
    [allProjects, user],
  );
  const myProjectIds = useMemo(
    () => new Set(myProjects.map((p) => p.id)),
    [myProjects],
  );
  const activeMy = myProjects.filter(
    (p) =>
      p.status === ProjectStatus.ACTIVE ||
      p.status === ProjectStatus.OBSERVATION,
  );
  const myDrafts = useMemo(
    () => myProjects.filter((p) => p.status === ProjectStatus.DRAFT),
    [myProjects],
  );

  const myPendingCount = pendingTimesheets?.length ?? 0;
  const myProjectsRevenue = myProjects.reduce(
    (s, p) => s + p.contractValue,
    0,
  );
  const myProfit = myProjects.reduce(
    (s, p) => s + (p.actualProfit ?? 0),
    0,
  );
  const weightedMargin = myProjectsRevenue > 0
    ? (myProfit / myProjectsRevenue) * 100
    : 0;

  const myTeam = useMemo(() => {
    if (!util) return [];
    return util.resources.filter(
      (r) => r.currentProjectId && myProjectIds.has(r.currentProjectId),
    );
  }, [util, myProjectIds]);

  const profitChart = useMemo(() => {
    return myProjects
      .map((p) => ({
        code: p.code,
        revenue: p.contractValue,
        profit: p.actualProfit ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [myProjects]);

  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkApprove = useMutation({
    mutationFn: (ids: string[]) =>
      customFetch<{ approved: number; ids: string[] }>(
        "/api/timesheets/bulk-approve",
        { method: "POST", body: JSON.stringify({ ids }) },
      ),
    onSuccess: (resp) => {
      toast({
        title: `${resp.approved} timesheet(s) approved`,
        description:
          resp.approved < (pendingTimesheets?.length ?? 0)
            ? `${(pendingTimesheets?.length ?? 0) - resp.approved} not approved (no permission or already actioned)`
            : "All caught up!",
      });
      qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey(tsParams) });
      qc.invalidateQueries({ queryKey: ["dashboard-pending-aging"] });
      setBulkBusy(false);
    },
    onError: (e: any) => {
      toast({
        title: "Bulk approve failed",
        description: e?.message,
        variant: "destructive",
      });
      setBulkBusy(false);
    },
  });

  function handleApproveAll() {
    if (!pendingTimesheets?.length) return;
    setBulkBusy(true);
    bulkApprove.mutate(pendingTimesheets.map((t) => t.id));
  }

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle="Snapshot of your active projects, approval queue, and team status." />

      <WorkHoursCard />

      <MyTasksCard />

      <Link href="/reports">
        <Card className="cursor-pointer border-primary/30 bg-primary/5 hover:border-primary/60 transition" data-testid="card-reports-shortcut">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <div className="text-sm font-medium text-primary">Reports</div>
              <div className="text-xs text-muted-foreground">10 ready-to-use reports: profitability, utilization, billing aging, expenses, VAT. Export CSV / Excel / PDF.</div>
            </div>
            <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">Open</Button>
          </CardContent>
        </Card>
      </Link>

      {pendingExpenses.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5" data-testid="card-pending-expenses">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <div className="text-sm font-medium text-amber-400">
                Expenses Awaiting Approval ({pendingExpenses.length})
              </div>
              <div className="text-xs text-muted-foreground">
                Total pending value: <span className="font-mono font-medium text-foreground">{formatIDR(pendingExpenseTotal)}</span>. Review &amp; approve from the Expenses tab on each project; only APPROVED entries count toward margin.
              </div>
            </div>
            <Link href="/expenses">
              <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
                <Inbox className="h-4 w-4 mr-1" /> View
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {myDrafts.length > 0 && (
        <Card className="border-purple-500/40 bg-purple-500/5">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <div className="flex-1">
              <CardTitle className="text-base">
                {myDrafts.length} new project(s) assigned to you
              </CardTitle>
              <CardDescription>
                Complete the details (revenue, mandays, team, schedule) to start the project.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-sm divide-y divide-border">
              {myDrafts.map((p) => (
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
                    </p>
                  </div>
                  <Link href={`/projects/${p.id}`}>
                    <Button size="sm" data-testid={`button-complete-draft-${p.id}`}>
                      Complete Details <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Quick action strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-primary">
                Approval Inbox
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {myPendingCount}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  pending
                </span>
              </p>
            </div>
            <Button
              onClick={handleApproveAll}
              disabled={!myPendingCount || bulkBusy}
              className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950"
              data-testid="button-approve-all"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Approve All
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Inbox detail
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Review one-by-one or by project
              </p>
            </div>
            <Link href="/approvals">
              <Button variant="outline" size="sm">
                <Inbox className="h-4 w-4 mr-1" /> Open Inbox
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Personal time sheet
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Log your own hours
              </p>
            </div>
            <Link href="/timesheets">
              <Button variant="outline" size="sm">
                <FilePlus2 className="h-4 w-4 mr-1" /> New Time Sheet
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Aging warning */}
      {aging && (aging.buckets.gt48h > 0 || aging.buckets.gt72h > 0) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <AlarmClock className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <CardTitle className="text-base">
                {aging.buckets.gt48h + aging.buckets.gt72h} timesheet(s) waiting
                more than 48 hours
              </CardTitle>
              <CardDescription>
                Your consultants/writers are blocked — take action now.
              </CardDescription>
            </div>
            <Link href="/approvals">
              <Button size="sm" variant="outline">
                Review Now
              </Button>
            </Link>
          </CardHeader>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Briefcase className="h-4 w-4 text-primary" />}
          label="My Active Projects"
          value={String(activeMy.length)}
          sub={`${myProjects.length} total under your name`}
        />
        <Kpi
          icon={<Users className="h-4 w-4 text-primary" />}
          label="My Team Size"
          value={String(myTeam.length)}
          sub={`${myTeam.filter((r) => r.status === "OVERLOADED").length} overloaded`}
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          label="Weighted Margin"
          value={formatPct(weightedMargin)}
          sub={`Σ profit ÷ Σ revenue · ${formatIDR(myProfit)}`}
        />
        <Kpi
          icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
          label="Total Revenue"
          value={formatIDR(myProjectsRevenue)}
          sub="Contract value"
          mono
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Profitability by project */}
        <Card className="lg:col-span-4 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Revenue vs Profit (your projects)</CardTitle>
            <CardDescription>
              Compare contract value and realised profit by project.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            {loadingProjects ? (
              <div className="h-full flex items-center justify-center">
                <Activity className="animate-pulse text-muted" />
              </div>
            ) : profitChart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                You aren't assigned as PM on any project yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={profitChart}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="code"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `Rp ${(v / 1_000_000).toFixed(0)}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(v: number) => formatIDR(v)}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="profit"
                    name="Actual Profit"
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* My team utilization */}
        <Card className="lg:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle>My Team Utilization</CardTitle>
            <CardDescription>
              Resources currently working on your projects
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!util ? (
              <div className="h-[260px] flex items-center justify-center">
                <Activity className="animate-pulse text-muted" />
              </div>
            ) : myTeam.length === 0 ? (
              <EmptyState
                title="No active assignments"
                description="No resources are currently logging time against your projects."
              />
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">7d Avg</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myTeam.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-medium">
                          {r.userName}
                        </TableCell>
                        <TableCell>
                          {r.currentProjectId && (
                            <Link
                              href={`/projects/${r.currentProjectId}`}
                              className="text-primary hover:underline text-sm"
                            >
                              {r.currentProjectName}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm ${r.avgHoursPerDay7d > 8 ? "text-orange-400 font-semibold" : ""}`}
                        >
                          {r.avgHoursPerDay7d.toFixed(1)}h
                        </TableCell>
                        <TableCell>
                          {r.status === "OVERLOADED" ? (
                            <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/40">
                              Overloaded
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My projects table */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>My Active Projects</CardTitle>
          <CardDescription>
            Projects where you are assigned as PM. Tap a row to drill in.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingProjects ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : myProjects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="You haven't been assigned as PM on any project."
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-center">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myProjects.map((p) => {
                  const lossAlert =
                    (p.marginPct ?? 0) < 0 ||
                    (p.actualProfit ?? 0) < 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell>
                        <Link
                          href={`/projects/${p.id}`}
                          className="block"
                        >
                          <div className="font-medium text-foreground hover:text-primary">
                            <span className="inline-flex items-center gap-1.5">
                              {p.name}
                              {!p.spkFileUrl && <SpkMissingIcon />}
                            </span>
                            {lossAlert && (
                              <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {p.code}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.clientName ?? "-"}
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.endDate ? formatDate(p.endDate) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatIDR(p.contractValue)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${(p.actualProfit ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}
                      >
                        {formatIDR(p.actualProfit ?? 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <MarginBadge marginPct={p.marginPct} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold text-foreground ${mono ? "font-mono" : ""}`}
        >
          {value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
