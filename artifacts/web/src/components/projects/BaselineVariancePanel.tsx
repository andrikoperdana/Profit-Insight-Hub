import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ProjectFinancialsBaseline,
  ProjectFinancialsBaselineVariance,
} from "@workspace/api-client-react";

export type BaselineData = NonNullable<ProjectFinancialsBaseline>;
export type BaselineVarianceData = NonNullable<ProjectFinancialsBaselineVariance>;

const SOURCE_LABELS: Record<BaselineData["source"], string> = {
  ACTIVATION: "Set at activation",
  CHANGE_REQUEST: "Re-baselined by change request",
  MANUAL: "Set manually",
};

function fmtBaselineDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// Derive the current date as the baseline date shifted by the server-computed
// day delta, so the panel can show both endpoints without a second payload.
function addDaysIso(value: string | null | undefined, days: number | null): string | null {
  if (!value || days == null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setTime(d.getTime() + days * 86_400_000);
  return d.toISOString();
}

// A growth in cost/mandays/duration is unfavorable (over the committed plan);
// a reduction is favorable. Contract value growth is favorable (more revenue).
type Direction = "higherIsBad" | "higherIsGood";

function VarianceRow({
  label,
  baselineText,
  currentText,
  delta,
  deltaText,
  direction,
}: {
  label: string;
  baselineText: string;
  currentText: string;
  delta: number | null;
  deltaText: string;
  direction: Direction;
}) {
  const noChange = delta == null || Math.abs(delta) < 1e-9;
  const grew = (delta ?? 0) > 0;
  const tone = noChange
    ? "text-muted-foreground"
    : (direction === "higherIsBad") === grew
      ? "text-red-500"
      : "text-emerald-500";
  const Icon = noChange ? Minus : grew ? TrendingUp : TrendingDown;

  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{baselineText}</span>
      <span className="font-mono tabular-nums text-foreground">{currentText}</span>
      <span className={cn("font-mono tabular-nums inline-flex items-center gap-1 justify-end", tone)}>
        <Icon className="h-3.5 w-3.5" />
        {noChange ? "No change" : deltaText}
      </span>
    </div>
  );
}

/**
 * Baseline variance — compares the project's current scope/schedule/cost against
 * the committed baseline snapshot (set at activation, updated by applied change
 * requests). Drift from the baseline is the early-warning signal for scope creep,
 * schedule slippage, and budget growth. All values come straight from the server.
 */
export function BaselineVariancePanel({
  baseline,
  variance,
}: {
  baseline: BaselineData;
  variance: BaselineVarianceData | null;
}) {
  const startDays = variance?.startDateDays ?? null;
  const endDays = variance?.endDateDays ?? null;
  const mandaysDelta = variance?.plannedMandays ?? null;
  const costDelta = variance?.estimatedCost ?? null;
  const contractDelta = variance?.contractValue ?? null;

  const fmtDays = (n: number | null): string => {
    if (n == null) return "—";
    if (n === 0) return "0 days";
    const abs = Math.abs(n);
    return `${n > 0 ? "+" : "-"}${abs} day${abs === 1 ? "" : "s"}`;
  };
  const fmtMandays = (n: number | null): string => {
    if (n == null) return "—";
    return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n)} md`;
  };
  const fmtMoneyDelta = (n: number | null): string => {
    if (n == null) return "—";
    return `${n > 0 ? "+" : n < 0 ? "-" : ""}${formatIDR(Math.abs(n))}`;
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              Baseline Variance
            </CardTitle>
            <CardDescription>
              Current plan vs. the committed baseline (v{baseline.version}) — scope, schedule &amp; cost drift.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-medium">
            {SOURCE_LABELS[baseline.source]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
          <span>Metric</span>
          <span>Baseline</span>
          <span>Current</span>
          <span className="text-right">Variance</span>
        </div>
        <VarianceRow
          label="Start date"
          baselineText={fmtBaselineDate(baseline.startDate)}
          currentText={fmtBaselineDate(addDaysIso(baseline.startDate, startDays))}
          delta={startDays}
          deltaText={fmtDays(startDays)}
          direction="higherIsBad"
        />
        <VarianceRow
          label="End date"
          baselineText={fmtBaselineDate(baseline.endDate)}
          currentText={fmtBaselineDate(addDaysIso(baseline.endDate, endDays))}
          delta={endDays}
          deltaText={fmtDays(endDays)}
          direction="higherIsBad"
        />
        <VarianceRow
          label="Planned mandays"
          baselineText={`${baseline.plannedMandays} md`}
          currentText={`${baseline.plannedMandays + (mandaysDelta ?? 0)} md`}
          delta={mandaysDelta}
          deltaText={fmtMandays(mandaysDelta)}
          direction="higherIsBad"
        />
        <VarianceRow
          label="Estimated cost"
          baselineText={formatIDR(baseline.estimatedCost)}
          currentText={formatIDR(baseline.estimatedCost + (costDelta ?? 0))}
          delta={costDelta}
          deltaText={fmtMoneyDelta(costDelta)}
          direction="higherIsBad"
        />
        <VarianceRow
          label="Contract value"
          baselineText={formatIDR(baseline.contractValue)}
          currentText={formatIDR(baseline.contractValue + (contractDelta ?? 0))}
          delta={contractDelta}
          deltaText={fmtMoneyDelta(contractDelta)}
          direction="higherIsGood"
        />
        <p className="text-[11px] text-muted-foreground pt-2">
          Baseline captured {fmtBaselineDate(baseline.capturedAt)}. EVM Planned Value is measured
          against the baseline schedule when baseline dates are set.
        </p>
      </CardContent>
    </Card>
  );
}
