import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, MinusCircle } from "lucide-react";
import { formatIDR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ProfitOutlook = {
  status: "PROFIT" | "THIN" | "LOSS_RISK";
  contractValue: number;
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
  actualCost: number;
  actualProfit: number;
  actualMarginPct: number;
  forecastCost: number;
  forecastProfit: number;
  forecastMarginPct: number;
};

const STATUS_META: Record<
  ProfitOutlook["status"],
  { label: string; badgeClass: string; icon: React.ReactNode }
> = {
  PROFIT: {
    label: "On Track for Profit",
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
  THIN: {
    label: "Thin Margin",
    badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  LOSS_RISK: {
    label: "Loss Risk",
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/30",
    icon: <TrendingDown className="h-3.5 w-3.5" />,
  },
};

function StatusBadge({ status }: { status: ProfitOutlook["status"] }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold", meta.badgeClass)}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

function profitTone(profit: number) {
  return profit >= 0 ? "text-emerald-500" : "text-red-500";
}

function OutlookColumn({
  title,
  subtitle,
  cost,
  profit,
  marginPct,
  highlight,
}: {
  title: string;
  subtitle: string;
  cost: number;
  profit: number;
  marginPct: number;
  highlight?: boolean;
}) {
  const isLoss = profit < 0;
  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-2",
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {isLoss ? "Loss" : "Profit"}
        </p>
        <p className={cn("text-xl font-bold font-mono tabular-nums", profitTone(profit))}>
          {formatIDR(profit)}
        </p>
        <p className={cn("text-xs font-medium", profitTone(profit))}>
          {formatPct(marginPct)} margin
        </p>
      </div>
      <div className="pt-1 border-t border-border/60">
        <p className="text-[11px] text-muted-foreground">Cost</p>
        <p className="text-sm font-mono tabular-nums text-foreground">{formatIDR(cost)}</p>
      </div>
    </div>
  );
}

/**
 * Profit Outlook — answers "will this project make a profit?" without waiting
 * for completion, by comparing the initial estimate, the actual result so far,
 * and the projected final result. Rupiah profit/loss amounts are shown for each.
 */
export function ProfitOutlookPanel({ outlook }: { outlook: ProfitOutlook }) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Profit Outlook</CardTitle>
            <CardDescription>
              Will this project make a profit? Compare the initial plan, the result so far, and the
              projected final outcome.
            </CardDescription>
          </div>
          <StatusBadge status={outlook.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OutlookColumn
            title="Initial Estimate"
            subtitle="Captured at intake"
            cost={outlook.estimatedCost}
            profit={outlook.estimatedProfit}
            marginPct={outlook.estimatedMarginPct}
          />
          <OutlookColumn
            title="Actual (so far)"
            subtitle="Approved cost to date"
            cost={outlook.actualCost}
            profit={outlook.actualProfit}
            marginPct={outlook.actualMarginPct}
          />
          <OutlookColumn
            title="Projected (final)"
            subtitle="Forecast at completion"
            cost={outlook.forecastCost}
            profit={outlook.forecastProfit}
            marginPct={outlook.forecastMarginPct}
            highlight
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact one-row variant for the project Overview sidebar.
 */
export function ProfitOutlookCompact({ outlook }: { outlook: ProfitOutlook }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Profit Outlook</p>
        <StatusBadge status={outlook.status} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <MinusCircle className="h-3 w-3" />
          Projected {outlook.forecastProfit < 0 ? "Loss" : "Profit"}
        </span>
        <span className={cn("font-mono text-sm font-semibold", profitTone(outlook.forecastProfit))}>
          {formatIDR(outlook.forecastProfit)} ({formatPct(outlook.forecastMarginPct)})
        </span>
      </div>
    </div>
  );
}
