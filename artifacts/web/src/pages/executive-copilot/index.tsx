import {
  useGetExecutiveBriefing,
  getGetExecutiveBriefingQueryKey,
  useGenerateExecutiveBriefing,
  type ExecutiveBriefingResult,
  type ExecutiveCopilotFacts,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatIDR, formatPct, formatDateTime } from "@/lib/format";
import { downloadAuthed } from "@/lib/exports";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles,
  RefreshCw,
  Download,
  TrendingUp,
  Percent,
  Users,
  Wallet,
  FileText,
  UserCheck,
  Clock,
  AlertTriangle,
  ListChecks,
} from "lucide-react";

function healthColor(label: string): string {
  switch (label) {
    case "HEALTHY":
      return "text-emerald-400";
    case "AT_RISK":
      return "text-amber-400";
    default:
      return "text-red-400";
  }
}

function healthRing(label: string): string {
  switch (label) {
    case "HEALTHY":
      return "ring-emerald-500/40 bg-emerald-500/10";
    case "AT_RISK":
      return "ring-amber-500/40 bg-amber-500/10";
    default:
      return "ring-red-500/40 bg-red-500/10";
  }
}

function priorityClass(priority: string): string {
  switch (priority.toUpperCase()) {
    case "HIGH":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "MEDIUM":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    default:
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-sm font-semibold tabular-nums ${className ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  narrative,
  children,
}: {
  icon: typeof TrendingUp;
  title: string;
  narrative: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {children && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {narrative}
        </p>
      </CardContent>
    </Card>
  );
}

function Briefing({ result }: { result: ExecutiveBriefingResult }) {
  const facts: ExecutiveCopilotFacts = result.facts;
  const b = result.briefing;
  const p = facts.portfolio;

  return (
    <div className="space-y-6">
      {/* Health hero + headline */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <div
            className={`flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full ring-2 ${healthRing(
              p.healthLabel,
            )}`}
          >
            <span
              className={`text-4xl font-bold tabular-nums ${healthColor(
                p.healthLabel,
              )}`}
            >
              {p.portfolioHealthScore}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Health
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`${priorityClass(
                  p.healthLabel === "HEALTHY"
                    ? "LOW"
                    : p.healthLabel === "AT_RISK"
                      ? "MEDIUM"
                      : "HIGH",
                )} uppercase`}
              >
                {p.healthLabel.replace("_", " ")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {p.activeProjects} active / {p.totalProjects} total projects
              </span>
            </div>
            <p className="text-lg font-semibold leading-snug">{b.headline}</p>
          </div>
        </CardContent>
      </Card>

      {/* Section narratives + facts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          icon={TrendingUp}
          title="Revenue"
          narrative={b.revenueSummary}
        >
          <Metric label="Contract Value" value={formatIDR(p.totalContractValue)} />
          <Metric
            label="Recognized"
            value={formatIDR(p.totalRecognizedRevenue)}
          />
          <Metric label="Actual Cost" value={formatIDR(p.totalActualCost)} />
          <Metric
            label="Actual Profit"
            value={formatIDR(p.totalActualProfit)}
            className={
              p.totalActualProfit >= 0 ? "text-emerald-400" : "text-red-400"
            }
          />
        </SectionCard>

        <SectionCard icon={Percent} title="Margin" narrative={b.marginSummary}>
          <Metric
            label="Weighted Margin"
            value={formatPct(p.weightedMarginPct)}
            className={
              p.weightedMarginPct >= 0 ? "text-emerald-400" : "text-red-400"
            }
          />
          <Metric label="Client Projects" value={String(p.clientProjects)} />
          <Metric
            label="Portfolio Health"
            value={`${p.portfolioHealthScore} / 100`}
          />
        </SectionCard>

        <SectionCard
          icon={Users}
          title="Utilization"
          narrative={b.utilizationSummary}
        >
          <Metric
            label="Utilization"
            value={formatPct(facts.utilization.utilizationPct)}
          />
          <Metric label="Headcount" value={String(facts.utilization.headcount)} />
          <Metric
            label="Billable Active"
            value={String(facts.utilization.billableActive)}
          />
          <Metric
            label="Overloaded"
            value={String(facts.utilization.overloaded)}
            className={
              facts.utilization.overloaded > 0 ? "text-amber-400" : undefined
            }
          />
        </SectionCard>

        <SectionCard
          icon={UserCheck}
          title="Consultant Availability"
          narrative={b.consultantAvailabilitySummary}
        >
          <Metric label="Idle" value={String(facts.utilization.idle)} />
          <Metric
            label="Idle > 5 days"
            value={String(facts.utilization.idleLong)}
            className={
              facts.utilization.idleLong > 0 ? "text-amber-400" : undefined
            }
          />
          <Metric
            label="Active"
            value={String(facts.utilization.billableActive)}
          />
        </SectionCard>

        <SectionCard
          icon={Wallet}
          title="Cash Flow"
          narrative={b.cashFlowSummary}
        >
          <Metric
            label="Due in 30 days"
            value={formatIDR(facts.cashFlow.plannedNext30Days)}
          />
          <Metric
            label="Due in 90 days"
            value={formatIDR(facts.cashFlow.plannedNext90Days)}
          />
          <Metric
            label="Outstanding"
            value={formatIDR(facts.cashFlow.outstandingInvoicedAmount)}
            className={
              facts.cashFlow.outstandingInvoicedAmount > 0
                ? "text-amber-400"
                : undefined
            }
          />
          <Metric
            label="Paid (90d)"
            value={formatIDR(facts.cashFlow.paidLast90Days)}
            className="text-emerald-400"
          />
        </SectionCard>

        <SectionCard
          icon={FileText}
          title="Outstanding Invoices"
          narrative={b.outstandingInvoicesSummary}
        >
          <Metric
            label="Invoiced"
            value={formatIDR(facts.invoices.invoicedAmount)}
          />
          <Metric
            label="Paid"
            value={formatIDR(facts.invoices.paidAmount)}
            className="text-emerald-400"
          />
          <Metric
            label="Outstanding"
            value={formatIDR(facts.invoices.outstandingAmount)}
            className={
              facts.invoices.outstandingAmount > 0 ? "text-amber-400" : undefined
            }
          />
          <Metric
            label="Planned"
            value={formatIDR(facts.invoices.plannedAmount)}
          />
        </SectionCard>
      </div>

      {/* Delayed projects */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Delayed Projects
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {b.delayedProjectsSummary}
          </p>
          {facts.delayedProjects.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {facts.delayedProjects.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{d.code}</span>{" "}
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                  >
                    {d.daysOverdue} days overdue
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* High-risk projects */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-primary" />
            High-Risk Projects
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {b.highRiskProjectsSummary}
          </p>
          {facts.highRiskProjects.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {facts.highRiskProjects.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{r.code}</span>{" "}
                    <span className="text-muted-foreground">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.openCritical > 0 && (
                      <Badge
                        variant="outline"
                        className="border-red-500/40 bg-red-500/10 text-red-300"
                      >
                        {r.openCritical} critical
                      </Badge>
                    )}
                    {r.openHigh > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                      >
                        {r.openHigh} high
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommended actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            Top 5 Recommended Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {b.recommendedActions.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border p-3"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{a.title}</p>
                  <Badge
                    variant="outline"
                    className={`${priorityClass(a.priority)} uppercase`}
                  >
                    {a.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{a.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ExecutiveCopilotPage() {
  const queryClient = useQueryClient();
  const queryKey = getGetExecutiveBriefingQueryKey();

  const { data: state, isLoading } = useGetExecutiveBriefing({
    query: {
      queryKey,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  });

  const generate = useGenerateExecutiveBriefing({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(queryKey, { hasBriefing: true, result });
        toast({
          title: "Briefing generated",
          description:
            "Executive briefing refreshed from the latest portfolio data.",
        });
      },
      onError: () => {
        toast({
          title: "Generation failed",
          description:
            "Could not generate the executive briefing. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const result = state?.result ?? null;
  const generating = generate.isPending;

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadAuthed(
        "/api/executive-copilot/briefing/export.pdf",
        `executive-briefing-${stamp}.pdf`,
      );
    } catch {
      toast({
        title: "Export failed",
        description: "Could not export the briefing PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Executive Copilot
          </h1>
          <p className="text-sm text-muted-foreground">
            An AI-narrated executive briefing of portfolio health, financials,
            utilization, cash flow, and recommended actions. Figures are computed
            from live data; the AI provides the narrative.
          </p>
          {result && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Generated {formatDateTime(result.generatedAt)} · {result.model}
              </span>
              {result.stale && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                >
                  Stale
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={exporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting..." : "Export PDF"}
            </Button>
          )}
          <Button onClick={() => generate.mutate()} disabled={generating}>
            {result ? (
              <RefreshCw
                className={`mr-2 h-4 w-4 ${generating ? "animate-spin" : ""}`}
              />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generating
              ? "Generating..."
              : result
                ? "Refresh Briefing"
                : "Generate Briefing"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      ) : result ? (
        <Briefing result={result} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No briefing yet</CardTitle>
            <CardDescription>
              Generate an AI executive briefing from your current portfolio data.
              Generating incurs an AI call and may take a few seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => generate.mutate()} disabled={generating}>
              <Sparkles className="mr-2 h-4 w-4" />
              {generating ? "Generating..." : "Generate Briefing"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
