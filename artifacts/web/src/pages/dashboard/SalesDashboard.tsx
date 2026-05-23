import { useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useListProjects, ProjectStatus, useGetLeadsAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Wallet, TrendingUp, Target, Activity, FilePlus2, Clock, AlertTriangle, FileText, Kanban } from "lucide-react";
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
import { formatIDR, formatPct } from "@/lib/format";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart,
} from "recharts";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  [ProjectStatus.DRAFT]: "hsl(280, 60%, 60%)",
  [ProjectStatus.OBSERVATION]: "hsl(var(--chart-2))",
  [ProjectStatus.ACTIVE]: "hsl(var(--chart-1))",
  [ProjectStatus.PAUSE]: "hsl(var(--chart-3))",
  [ProjectStatus.COMPLETE]: "hsl(var(--chart-4))",
  [ProjectStatus.CLOSED]: "hsl(var(--chart-5))",
  [ProjectStatus.NO_NEED_CONSULTANT]: "hsl(25, 95%, 53%)",
};

const LOST_LABELS: Record<string, string> = {
  PRICE: "Price", TIMELINE: "Timeline", COMPETITOR: "Competitor",
  NO_BUDGET: "No Budget", NO_DECISION: "No Decision", OTHER: "Other",
};

export default function SalesDashboard() {
  const { user } = useAuth();
  const { data: allProjects, isLoading } = useListProjects();
  const { data: leadAnalytics } = useGetLeadsAnalytics();

  const myProjects = useMemo(
    () => (allProjects ?? []).filter((p) => p.salesId === user?.id),
    [allProjects, user]
  );

  const myProjectsLatest = useMemo(() => {
    const ts = (p: any) => {
      const v = p.updatedAt ?? p.createdAt ?? p.startDate ?? 0;
      const t = typeof v === "string" ? Date.parse(v) : Number(v);
      return Number.isFinite(t) ? t : 0;
    };
    return [...myProjects].sort((a, b) => ts(b) - ts(a)).slice(0, 15);
  }, [myProjects]);

  const myDrafts = useMemo(
    () => myProjects.filter((p) => p.status === ProjectStatus.DRAFT),
    [myProjects]
  );

  const stats = useMemo(() => {
    const totalRevenue = myProjects.reduce((s, p) => s + p.contractValue, 0);
    const totalProfit = myProjects.reduce((s, p) => s + (p.actualProfit ?? 0), 0);
    const active = myProjects.filter((p) => p.status === ProjectStatus.ACTIVE).length;
    const observation = myProjects.filter((p) => p.status === ProjectStatus.OBSERVATION).length;
    const pipelineValue = myProjects
      .filter((p) => p.status === ProjectStatus.OBSERVATION || p.status === ProjectStatus.ACTIVE)
      .reduce((s, p) => s + p.contractValue, 0);
    const weightedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { totalRevenue, totalProfit, active, observation, pipelineValue, weightedMargin };
  }, [myProjects]);

  const statusChart = useMemo(() => {
    const m = new Map<ProjectStatus, number>();
    for (const p of myProjects) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return Array.from(m.entries()).map(([status, count]) => ({ status, count }));
  }, [myProjects]);

  const monthlyTrend = useMemo(() => {
    const months: { key: string; label: string; revenue: number; profit: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      months.push({ key, label, revenue: 0, profit: 0 });
    }
    for (const p of myProjects) {
      const ref = p.startDate ? new Date(p.startDate) : new Date(p.createdAt);
      const key = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) {
        bucket.revenue += p.contractValue;
        bucket.profit += p.actualProfit ?? 0;
      }
    }
    return months;
  }, [myProjects]);

  const revenueByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of myProjects) {
      m.set(p.clientName ?? "Unknown", (m.get(p.clientName ?? "Unknown") ?? 0) + p.contractValue);
    }
    return Array.from(m.entries())
      .map(([clientName, revenue]) => ({ clientName, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [myProjects]);

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle="Pipeline and performance for engagements you own." />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary font-semibold">Daftarkan Project Baru</p>
            <p className="text-sm text-muted-foreground mt-1">
              Manual (isi 4 field) atau pilih dari Sales Pipeline — lead yang menang otomatis terisi datanya. PMO akan menugaskan PM.
            </p>
          </div>
          <Link href="/projects/new">
            <Button data-testid="button-new-project">
              <FilePlus2 className="h-4 w-4 mr-2" /> New Project
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/leads">
          <Card className="hover:border-primary/50 transition cursor-pointer border-border" data-testid="card-shortcut-leads">
            <CardContent className="flex items-center gap-3 py-4">
              <Kanban className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold text-sm">Sales Pipeline</div>
                <div className="text-xs text-muted-foreground">Manage leads from prospect to close</div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/invoice-planning">
          <Card className="hover:border-primary/50 transition cursor-pointer border-border" data-testid="card-shortcut-invoice-planning">
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold text-sm">Invoice Planning</div>
                <div className="text-xs text-muted-foreground">Track billing milestones across your projects</div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {myDrafts.length > 0 && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <Clock className="h-5 w-5 text-purple-400" />
            <div className="flex-1">
              <CardTitle className="text-base">
                {myDrafts.length} project(s) awaiting PM assignment
              </CardTitle>
              <CardDescription>
                Forwarded to the PMO Director — a PM will be assigned and complete the details.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="text-sm divide-y divide-border">
              {myDrafts.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">
                      <span className="inline-flex items-center gap-1.5">
                        {p.name}
                        {!p.spkFileUrl && <SpkMissingIcon />}
                      </span>
                    </Link>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{p.code}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.clientName ?? "-"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard icon={<Briefcase className="h-4 w-4 text-primary" />} label="My Projects" value={String(myProjects.length)} sub={`${stats.active} active · ${stats.observation} in observation`} />
            <KpiCard icon={<Wallet className="h-4 w-4 text-primary" />} label="Total Revenue" value={formatIDR(stats.totalRevenue)} sub="Sum of contract value" mono />
            <KpiCard icon={<Target className="h-4 w-4 text-primary" />} label="Pipeline Value" value={formatIDR(stats.pipelineValue)} sub="Active + Observation" mono />
            <KpiCard icon={<TrendingUp className="h-4 w-4 text-primary" />} label="Weighted Margin" value={formatPct(stats.weightedMargin)} sub={`Σ profit ÷ Σ revenue · ${formatIDR(stats.totalProfit)}`} />
          </>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Revenue by Client</CardTitle>
            <CardDescription>Top clients by contract value</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
            ) : revenueByClient.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No projects yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByClient} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1_000_000).toFixed(0)}M`} />
                  <YAxis dataKey="clientName" type="category" width={130} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                    formatter={(v: number) => formatIDR(v)}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>Your pipeline breakdown</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
            ) : statusChart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No projects yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChart} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="count" nameKey="status">
                    {statusChart.map((e, i) => (
                      <Cell key={i} fill={STATUS_COLORS[e.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    formatter={(value: number, _name, props: any) => [`${value} project${value === 1 ? "" : "s"}`, props?.payload?.status ?? props?.name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <CrmInsights data={leadAnalytics} />

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Profitability Trend (6 Months)</CardTitle>
          <CardDescription>Revenue vs realised profit on your projects, by start month.</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `Rp ${(v / 1_000_000).toFixed(0)}M`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => formatIDR(v)} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>My Project List</CardTitle>
          <CardDescription>
            {myProjects.length > 15
              ? `Showing latest 15 of ${myProjects.length} engagements where you are the assigned Sales`
              : "All engagements where you are the assigned Sales"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={6} rows={5} /></div>
          ) : myProjects.length === 0 ? (
            <EmptyState title="No projects assigned" description="You are not yet assigned as Sales on any project." />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Actual Profit</TableHead>
                  <TableHead className="text-center">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myProjectsLatest.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30">
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="block">
                        <div className="font-medium text-foreground hover:text-primary transition-colors">
                          <span className="inline-flex items-center gap-1.5">
                            {p.name}
                            {!p.spkFileUrl && <SpkMissingIcon />}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                      </Link>
                    </TableCell>
                    <TableCell>{p.clientName ?? "-"}</TableCell>
                    <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatIDR(p.contractValue)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${(p.actualProfit ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>{formatIDR(p.actualProfit ?? 0)}</TableCell>
                    <TableCell className="text-center"><MarginBadge marginPct={p.marginPct} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CrmInsights({ data }: { data?: any }) {
  const stages = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];
  const weightedTotal = useMemo(() => {
    if (!data?.weightedPipelineByStage) return 0;
    return stages.reduce((s, k) => s + (data.weightedPipelineByStage[k]?.weighted ?? 0), 0);
  }, [data]);
  const funnelChart = useMemo(() => {
    if (!data?.funnel) return [];
    return ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"].map((k) => ({ stage: k, count: data.funnel[k] ?? 0 }));
  }, [data]);
  const lostRows = useMemo(() => {
    if (!data?.lostReasonBreakdown) return [];
    return Object.entries(data.lostReasonBreakdown).map(([reason, v]: any) => ({ reason, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Kanban className="h-4 w-4 text-primary" />} label="Weighted Pipeline" value={formatIDR(weightedTotal)} sub="Σ value × probability (open stages)" mono />
        <KpiCard icon={<Target className="h-4 w-4 text-primary" />} label="Expected This Quarter" value={formatIDR(data?.expectedRevenueThisQuarter ?? 0)} sub="Weighted, by expected close date" mono />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-primary" />} label="Active Leads" value={String(stages.reduce((s, k) => s + (data?.weightedPipelineByStage?.[k]?.count ?? 0), 0))} sub="Across open stages" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-primary" />} label="Lost (6mo)" value={String((data?.lostReasonBreakdown ? Object.values(data.lostReasonBreakdown) : []).reduce((s: number, v: any) => s + v.count, 0))} sub="Deals lost in last 6 months" />
      </div>
      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>Leads reaching each stage (last 6 months)</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {funnelChart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No lead data.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelChart} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="stage" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {data?.conversionRates && data.conversionRates.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                {data.conversionRates.map((c: any) => (
                  <span key={`${c.from}-${c.to}`} className="px-2 py-1 rounded bg-muted/50 text-muted-foreground">
                    {c.from} → {c.to}: <span className="text-foreground font-semibold">{c.rate.toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Win/Loss Analysis</CardTitle>
            <CardDescription>Lost reasons in last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {lostRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No lost deals recorded.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Value lost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lostRows.map((r) => (
                    <TableRow key={r.reason}>
                      <TableCell>{LOST_LABELS[r.reason] ?? r.reason}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatIDR(r.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, mono }: { icon: React.ReactNode; label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
