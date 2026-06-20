import { useParams, Link } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  useGetProject,
  useUpdateTask,
  getListProjectTasksQueryKey,
  useGetProjectFinancials,
  useUpdateProject,
  useUpdateProjectReport,
  useListProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
  useListProjectResources,
  useAddProjectResource,
  useProposeProjectResource,
  useRemoveProjectResource,
  getListProjectResourcesQueryKey,
  useListAvailableUsers,
  useListActiveAllUsers,
  useListUsersUnderSupervision,
  useListClients,
  useListTimesheets,
  useListProjectTasks,
  useListProjectExpenses,
  useAddProjectExpense,
  useRemoveProjectExpense,
  useApproveProjectExpense,
  useRejectProjectExpense,
  getListProjectExpensesQueryKey,
  getListClientsQueryKey,
  getGetProjectQueryKey,
  getGetProjectFinancialsQueryKey,
  getListProjectDocumentsQueryKey,
  ProjectStatus,
  DocumentType,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Building2, User, Calendar, DollarSign, TrendingUp, TrendingDown,
  Activity, Flame, Upload, FileText, Trash2, CheckCircle2, AlertCircle, Plus,
  Pencil, AlertTriangle, Paperclip, X,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { ProfitOutlookPanel, type ProfitOutlook } from "@/components/projects/ProfitOutlookPanel";
import { EvmPanel, type EvmData } from "@/components/projects/EvmPanel";
import {
  BaselineVariancePanel,
  type BaselineData,
  type BaselineVarianceData,
} from "@/components/projects/BaselineVariancePanel";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";


type WhatIfResp = {
  projectId: string;
  addMandays: number;
  avgDailyRate: number;
  base: { mandays: number; cost: number; profit: number; marginPct: number };
  scenario: { mandays: number; cost: number; profit: number; marginPct: number };
  deltaCost: number;
  deltaProfit: number;
};

function FinancialsTab({ projectId, isCommercial = true }: { projectId: string; isCommercial?: boolean }) {
  const { data: f, isLoading } = useGetProjectFinancials(projectId, {
    query: { queryKey: getGetProjectFinancialsQueryKey(projectId), enabled: !!projectId },
  });

  if (isLoading) return <LoadingPage />;
  if (!f) return <EmptyState title="No financial data" description="Financial data is unavailable for this project." />;

  if (!isCommercial) {
    const budget = f.estimatedCost ?? 0;
    const actual = f.actualCost ?? 0;
    const remaining = budget - actual;
    const remainingPositive = remaining >= 0;
    const usedPct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
    return (
      <div className="space-y-6">
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-200">
          Internal project &mdash; cost tracking only. This project has no client
          revenue, so the figures below monitor internal cost against the planned
          budget (no profit or margin).
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FinancialCard
            icon={<DollarSign className="h-4 w-4 text-primary" />}
            label="Budget (Estimated Cost)"
            value={formatIDR(budget)}
            subtitle="Planned internal cost"
          />
          <FinancialCard
            icon={<Activity className="h-4 w-4 text-amber-500" />}
            label="Actual Cost"
            value={formatIDR(actual)}
            subtitle="From approved timesheets × rate + expenses"
          />
          <FinancialCard
            icon={<Activity className="h-4 w-4 text-amber-500" />}
            label="Accrued Cost"
            value={formatIDR(f.accruedCost ?? 0)}
            subtitle="Includes SUBMITTED + APPROVED timesheets"
          />
          <FinancialCard
            icon={remainingPositive ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            label="Remaining Budget"
            value={formatIDR(remaining)}
            subtitle={remainingPositive ? "Within budget" : "Over budget"}
            tone={remainingPositive ? "good" : "bad"}
            progress={usedPct}
          />
          <FinancialCard
            icon={<Flame className="h-4 w-4 text-amber-500" />}
            label="Burn Rate"
            value={`${(f.burnRatePct ?? 0).toFixed(1)}%`}
            subtitle={`${(f.actualMandays ?? 0).toFixed(1)} / ${(f.plannedMandays ?? 0).toFixed(1)} mandays`}
            progress={Math.min(f.burnRatePct ?? 0, 100)}
          />
          <FinancialCard
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            label="Forecasted Final Cost"
            value={formatIDR(f.forecastCost ?? 0)}
            subtitle="Projected cost at completion"
          />
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Monthly Cost</CardTitle>
            <CardDescription>Approved timesheet cost per month.</CardDescription>
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
                    <linearGradient id="finCostOnly" x1="0" y1="0" x2="0" y2="1">
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
                  <Area type="monotone" dataKey="cost" name="Cost" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#finCostOnly)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const profitPositive = (f.actualProfit ?? 0) >= 0;
  const forecastPositive = (f.forecastProfit ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {f.profitOutlook && (
        <ProfitOutlookPanel outlook={f.profitOutlook as ProfitOutlook} />
      )}
      {f.evm && <EvmPanel evm={f.evm as EvmData} />}
      {f.baseline && (
        <BaselineVariancePanel
          baseline={f.baseline as BaselineData}
          variance={(f.baselineVariance ?? null) as BaselineVarianceData | null}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FinancialCard
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Revenue (Gross)"
          value={formatIDR(f.contractValue)}
          subtitle={
            f.contractValueIncludesVat
              ? `Includes VAT ${(f.vatPercent ?? 0)}%`
              : `Excludes VAT ${(f.vatPercent ?? 0)}%`
          }
        />
        <FinancialCard
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Revenue Net (DPP)"
          value={formatIDR(f.revenueNet ?? f.contractValue)}
          subtitle={`VAT: ${formatIDR(f.vatAmount ?? 0)} (PSAK 72 base)`}
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-primary" />}
          label="Recognized Revenue"
          value={formatIDR(f.recognizedRevenue ?? 0)}
          subtitle={`PoC ${(f.burnRatePct ?? 0).toFixed(1)}% × Net Revenue (PSAK 72 / ASC 606)`}
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
          value={formatIDR(f.actualCost ?? 0)}
          subtitle="From approved timesheets × rate + expenses"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-amber-500" />}
          label="Accrued Cost"
          value={formatIDR(f.accruedCost ?? 0)}
          subtitle="Includes SUBMITTED + APPROVED timesheets"
        />
        <FinancialCard
          icon={profitPositive ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Actual Profit / Loss"
          value={formatIDR(f.actualProfit ?? 0)}
          subtitle={`${formatPct(f.marginPct ?? 0)} gross margin`}
          tone={profitPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={(f.netActualProfit ?? 0) >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Net Profit (after overhead)"
          value={formatIDR(f.netActualProfit ?? 0)}
          subtitle={`Loaded cost: ${formatIDR(f.netActualCost ?? 0)} (overhead ×${(f.overheadMultiplier ?? 1).toFixed(2)})`}
          tone={(f.netActualProfit ?? 0) >= 0 ? "good" : "bad"}
        />
        <FinancialCard
          icon={(f.netMarginPct ?? 0) >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Net Margin"
          value={formatPct(f.netMarginPct ?? 0)}
          subtitle={`Net profit ÷ DPP · overhead ×${(f.overheadMultiplier ?? 1).toFixed(2)}`}
          tone={(f.netMarginPct ?? 0) >= 0 ? "good" : "bad"}
        />
        <FinancialCard
          icon={forecastPositive ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Forecasted Final Profit"
          value={formatIDR(f.forecastProfit ?? 0)}
          subtitle={`Projected cost: ${formatIDR(f.forecastCost ?? 0)}`}
          tone={forecastPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={<Flame className="h-4 w-4 text-amber-500" />}
          label="Burn Rate"
          value={`${(f.burnRatePct ?? 0).toFixed(1)}%`}
          subtitle={`${(f.actualMandays ?? 0).toFixed(1)} / ${(f.plannedMandays ?? 0).toFixed(1)} mandays`}
          progress={Math.min(f.burnRatePct ?? 0, 100)}
        />
        <FinancialCard
          icon={(f.marginPct ?? 0) >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Gross Margin"
          value={formatPct(f.marginPct ?? 0)}
          subtitle="Actual profit ÷ gross revenue"
          tone={(f.marginPct ?? 0) >= 0 ? "good" : "bad"}
        />
      </div>

      <WhatIfCard
        projectId={projectId}
        avgRateHint={
          (f.actualMandays ?? 0) > 0
            ? (f.actualCost ?? 0) / (f.actualMandays ?? 1)
            : 0
        }
      />

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
    tone === "good" ? "text-success" :
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

function WhatIfCard({ projectId, avgRateHint }: { projectId: string; avgRateHint: number }) {
  const [add, setAdd] = useState<number>(5);
  const { data, isFetching } = useQuery<WhatIfResp>({
    queryKey: ["project-whatif", projectId, add],
    queryFn: () =>
      customFetch<WhatIfResp>(`/api/projects/${projectId}/whatif?addMandays=${add}`),
    enabled: !!projectId && add >= 0,
    staleTime: 0,
  });

  const baseMargin = data?.base.marginPct ?? 0;
  const scenarioMargin = data?.scenario.marginPct ?? 0;
  const delta = scenarioMargin - baseMargin;
  const tone = scenarioMargin >= 0 ? "text-success" : "text-destructive";

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          What-If Scenario
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Project the impact on profit if more mandays are needed beyond what's already logged.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Additional mandays
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={add}
                onChange={(e) => setAdd(Math.max(0, Number(e.target.value) || 0))}
                className="w-32"
                data-testid="whatif-input"
              />
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={add}
                onChange={(e) => setAdd(Number(e.target.value))}
                className="w-48 accent-primary"
                data-testid="whatif-slider"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Avg cost/manday: <span className="font-mono text-foreground">{formatIDR(data?.avgDailyRate ?? avgRateHint ?? 0)}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Extra Cost</p>
            <p className="text-lg font-mono text-foreground mt-1">
              {formatIDR(data?.deltaCost ?? 0)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Projected Profit</p>
            <p className={`text-lg font-mono mt-1 ${tone}`}>
              {formatIDR(data?.scenario.profit ?? 0)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Projected Margin</p>
            <p className={`text-lg font-mono mt-1 ${tone}`}>
              {formatPct(scenarioMargin)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              vs base {formatPct(baseMargin)} ·{" "}
              <span className={delta >= 0 ? "text-success" : "text-destructive"}>
                {delta >= 0 ? "+" : ""}
                {formatPct(delta)}
              </span>
            </p>
          </div>
        </div>
        {isFetching && (
          <p className="text-xs text-muted-foreground">Recalculating…</p>
        )}
      </CardContent>
    </Card>
  );
}

export function Stat({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-sm ${highlight ? "text-primary font-semibold" : muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}


export default FinancialsTab;
