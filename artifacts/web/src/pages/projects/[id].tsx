import { useParams, Link } from "wouter";
import { useGetProject, useGetProjectFinancials } from "@workspace/api-client-react";
import { getGetProjectQueryKey, getGetProjectFinancialsQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Building2, User, Calendar, FileText, DollarSign, TrendingUp, TrendingDown, Activity, Flame } from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;

  const { data: project, isLoading } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !!id }
  });

  if (isLoading) return <LoadingPage />;
  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="The project you are looking for does not exist or you do not have access."
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/projects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-1">SPK/PO: {project.code}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4 m-0">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="financials" className="pt-4 m-0">
          <FinancialsTab projectId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ project }: { project: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Project Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="Client" value={project.clientName ?? "-"} />
          <InfoRow icon={<User className="h-4 w-4" />} label="Sales" value={project.salesName ?? "-"} />
          <InfoRow icon={<User className="h-4 w-4" />} label="Project Manager" value={project.pmName ?? "-"} />
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Timeline"
            value={
              project.startDate || project.endDate
                ? `${project.startDate ? formatDate(project.startDate) : "?"} → ${project.endDate ? formatDate(project.endDate) : "?"}`
                : "Not set"
            }
          />
          {project.description && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Financial Estimation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Stat label="Revenue (Harga Jual)" value={formatIDR(project.contractValue)} />
          <Stat label="Estimated Operational Cost" value={formatIDR(project.estimatedCost)} muted />
          <Stat label="Estimated Profit" value={formatIDR(project.estimatedProfit)} highlight />
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Margin</p>
            <MarginBadge marginPct={project.marginPct} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Planned Mandays</p>
            <p className="font-mono text-sm">{project.plannedMandays.toFixed(1)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialsTab({ projectId }: { projectId: string }) {
  const { data: f, isLoading } = useGetProjectFinancials(projectId, {
    query: { queryKey: getGetProjectFinancialsQueryKey(projectId), enabled: !!projectId },
  });

  if (isLoading) return <LoadingPage />;
  if (!f) return <EmptyState title="No financial data" description="Financial data is unavailable for this project." />;

  const profitPositive = f.actualProfit >= 0;
  const forecastPositive = f.forecastProfit >= 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FinancialCard
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Revenue"
          value={formatIDR(f.contractValue)}
          subtitle="Contract value (Harga Jual)"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          label="Estimated Cost"
          value={formatIDR(f.estimatedCost)}
          subtitle="Planned operational cost"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-amber-500" />}
          label="Actual Cost"
          value={formatIDR(f.actualCost)}
          subtitle="From approved timesheets × rate"
        />
        <FinancialCard
          icon={profitPositive ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Actual Profit / Loss"
          value={formatIDR(f.actualProfit)}
          subtitle={`${formatPct(f.marginPct)} margin`}
          tone={profitPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={forecastPositive ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Forecasted Final Profit"
          value={formatIDR(f.forecastProfit)}
          subtitle={`Projected cost: ${formatIDR(f.forecastCost)}`}
          tone={forecastPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={<Flame className="h-4 w-4 text-amber-500" />}
          label="Burn Rate"
          value={`${f.burnRatePct.toFixed(1)}%`}
          subtitle={`${f.actualMandays.toFixed(1)} / ${f.plannedMandays.toFixed(1)} mandays`}
          progress={Math.min(f.burnRatePct, 100)}
        />
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Monthly Cost vs Revenue</CardTitle>
          <CardDescription>Approved timesheet cost compared to amortized revenue per month.</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          {!f.monthly?.length ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No approved timesheets yet — chart will populate as cost accrues.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={f.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="finRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="finCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1_000_000).toFixed(0)}M`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(v: number) => formatIDR(v)}
                />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#finRev)" />
                <Area type="monotone" dataKey="cost" name="Cost" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#finCost)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialCard({ icon, label, value, subtitle, tone, progress }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "good" | "bad";
  progress?: number;
}) {
  const valueColor =
    tone === "good" ? "text-primary" :
    tone === "bad" ? "text-destructive" :
    "text-foreground";
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-xl md:text-2xl font-bold font-mono ${valueColor}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {progress != null && <Progress value={progress} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-sm ${highlight ? "text-primary font-semibold" : muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
