import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Gauge,
} from "lucide-react";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectFinancialsEvm } from "@workspace/api-client-react";

export type EvmData = NonNullable<ProjectFinancialsEvm>;

type Tone = "good" | "neutral" | "bad" | "warn";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-500",
  neutral: "text-foreground",
  bad: "text-red-500",
  warn: "text-amber-500",
};

const TONE_BADGE: Record<Tone, string> = {
  good: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  neutral: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  bad: "bg-red-500/10 text-red-500 border-red-500/30",
  warn: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

function costMeta(status: EvmData["costStatus"]): { label: string; tone: Tone } {
  switch (status) {
    case "UNDER":
      return { label: "Under budget", tone: "good" };
    case "OVER":
      return { label: "Over budget", tone: "bad" };
    case "ON_TARGET":
      return { label: "On budget", tone: "neutral" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

function scheduleMeta(status: EvmData["scheduleStatus"]): { label: string; tone: Tone } {
  switch (status) {
    case "AHEAD":
      return { label: "Ahead of schedule", tone: "good" };
    case "BEHIND":
      return { label: "Behind schedule", tone: "bad" };
    case "ON_TARGET":
      return { label: "On schedule", tone: "neutral" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

function fmtIndex(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(2);
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function fmtMoney(n: number | null | undefined): string {
  return n == null ? "—" : formatIDR(n);
}

function IndexCard({
  label,
  value,
  status,
  tone,
  formula,
}: {
  label: string;
  value: string;
  status: string;
  tone: Tone;
  formula: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold font-mono tabular-nums", TONE_TEXT[tone])}>{value}</p>
      <Badge variant="outline" className={cn("gap-1 font-semibold", TONE_BADGE[tone])}>
        {status}
      </Badge>
      <p className="text-[11px] text-muted-foreground">{formula}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-mono tabular-nums mt-1", tone ? TONE_TEXT[tone] : "text-foreground")}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

/**
 * Earned Value Management — PMP-standard cost & schedule performance. Compares
 * the value of work physically completed (EV) against money spent (AC) and
 * planned progress (PV), then projects the final cost (EAC) and the efficiency
 * needed to finish on budget (TCPI). All values are read directly from the
 * server; the panel renders an explanatory notice when EVM data is insufficient.
 */
export function EvmPanel({ evm }: { evm: EvmData }) {
  if (evm.insufficientData) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Earned Value Management</CardTitle>
              <CardDescription>
                Cost &amp; schedule performance from physical task progress vs spend.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("gap-1 font-semibold", TONE_BADGE.neutral)}>
              <HelpCircle className="h-3.5 w-3.5" />
              Not enough data
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {evm.reason ??
              "EVM needs an estimated cost, scheduled tasks with dates, and a project start/end date."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const cost = costMeta(evm.costStatus);
  const schedule = scheduleMeta(evm.scheduleStatus);

  // Overall headline: worst of the two performance signals.
  const overallBad = cost.tone === "bad" || schedule.tone === "bad";
  const overall: { label: string; tone: Tone; icon: React.ReactNode } = overallBad
    ? { label: "Needs Attention", tone: "bad", icon: <AlertTriangle className="h-3.5 w-3.5" /> }
    : { label: "On Track", tone: "good", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };

  const vacTone: Tone = (evm.vac ?? 0) >= 0 ? "good" : "bad";
  // TCPI > 1 means the remaining work must be done more efficiently than planned
  // to still land on budget; well above 1 is a stretch.
  const tcpiTone: Tone = evm.tcpi == null ? "neutral" : evm.tcpi > 1.1 ? "warn" : "neutral";

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              Earned Value Management
            </CardTitle>
            <CardDescription>
              Cost &amp; schedule performance from physical task progress vs spend (PMP / EVM).
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("gap-1 font-semibold", TONE_BADGE[overall.tone])}>
            {overall.icon}
            {overall.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IndexCard
            label="Cost Performance (CPI)"
            value={fmtIndex(evm.cpi)}
            status={cost.label}
            tone={cost.tone}
            formula="EV ÷ AC · above 1.00 is under budget"
          />
          <IndexCard
            label="Schedule Performance (SPI)"
            value={fmtIndex(evm.spi)}
            status={schedule.label}
            tone={schedule.tone}
            formula="EV ÷ PV · above 1.00 is ahead of schedule"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <MiniStat label="Budget at Completion (BAC)" value={fmtMoney(evm.bac)} hint="Estimated cost" />
          <MiniStat label="Earned Value (EV)" value={fmtMoney(evm.ev)} hint="Value of work done" />
          <MiniStat label="Planned Value (PV)" value={fmtMoney(evm.pv)} hint="Value planned by now" />
          <MiniStat label="Actual Cost (AC)" value={fmtMoney(evm.ac)} hint="Spent so far" />
          <MiniStat
            label="Forecast Cost (EAC)"
            value={fmtMoney(evm.eac)}
            hint="Projected final cost"
          />
          <MiniStat label="To Complete (ETC)" value={fmtMoney(evm.etc)} hint="Cost left to finish" />
          <MiniStat
            label="Variance at Completion (VAC)"
            value={fmtMoney(evm.vac)}
            tone={vacTone}
            hint={vacTone === "good" ? "Projected under budget" : "Projected overrun"}
          />
          <MiniStat
            label="To-Complete Index (TCPI)"
            value={fmtIndex(evm.tcpi)}
            tone={tcpiTone}
            hint="Efficiency needed to hit budget"
          />
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Physical completion {fmtPct(evm.percentComplete)} · planned {fmtPct(evm.plannedPct)}
            </span>
            {evm.percentComplete != null && evm.plannedPct != null && (
              <span
                className={cn(
                  "font-medium",
                  evm.percentComplete >= evm.plannedPct ? "text-emerald-500" : "text-amber-500",
                )}
              >
                {evm.percentComplete >= evm.plannedPct ? (
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> On or ahead of plan
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> Behind plan
                  </span>
                )}
              </span>
            )}
          </div>
          <Progress value={Math.min(evm.percentComplete ?? 0, 100)} className="h-1.5" />
        </div>

        {evm.reason && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{evm.reason}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
