import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import type { ReactElement } from "react";
import { formatIDR } from "@/lib/format";

interface Props {
  budget: number;
  actualCost: number;
  kind: "INTERNAL" | "PRESALES" | "TRAINING" | string;
}

const KIND_LABEL: Record<string, string> = {
  INTERNAL: "Internal Initiative",
  PRESALES: "Pre-Sales Effort",
  TRAINING: "Training Program",
};

export default function BudgetConsumptionCard({ budget, actualCost, kind }: Props) {
  const noBudget = budget <= 0;
  const usedPct = noBudget ? (actualCost > 0 ? 100 : 0) : (actualCost / budget) * 100;
  const remaining = budget - actualCost;
  const overBudget = noBudget ? actualCost > 0 : actualCost > budget;

  let status: { label: string; color: string; barClass: string; icon: ReactElement };
  if (noBudget && actualCost > 0) {
    status = {
      label: "Unbudgeted Spend",
      color: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      barClass: "[&>div]:bg-rose-500",
      icon: <AlertTriangle className="h-4 w-4 text-rose-400" />,
    };
  } else if (overBudget) {
    status = {
      label: "Over Budget",
      color: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      barClass: "[&>div]:bg-rose-500",
      icon: <AlertTriangle className="h-4 w-4 text-rose-400" />,
    };
  } else if (usedPct >= 90) {
    status = {
      label: "Critical",
      color: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      barClass: "[&>div]:bg-rose-500",
      icon: <AlertTriangle className="h-4 w-4 text-rose-400" />,
    };
  } else if (usedPct >= 70) {
    status = {
      label: "Watch",
      color: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      barClass: "[&>div]:bg-amber-500",
      icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    };
  } else {
    status = {
      label: "On Track",
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      barClass: "[&>div]:bg-emerald-500",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    };
  }

  return (
    <Card className="border-border shadow-sm" data-testid="card-budget-consumption">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Budget Consumption
            </CardTitle>
            <CardDescription>
              {KIND_LABEL[kind] ?? kind} — internal budget vs actual spend
            </CardDescription>
          </div>
          <Badge variant="outline" className={status.color}>
            <span className="inline-flex items-center gap-1">{status.icon} {status.label}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget</p>
            <p className="font-mono text-sm text-foreground mt-1">{formatIDR(budget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Used</p>
            <p className="font-mono text-sm text-foreground mt-1">{formatIDR(actualCost)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {overBudget ? "Overrun" : "Remaining"}
            </p>
            <p className={`font-mono text-sm mt-1 ${overBudget ? "text-rose-400" : "text-foreground"}`}>
              {overBudget ? `−${formatIDR(Math.abs(remaining))}` : formatIDR(remaining)}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{usedPct.toFixed(1)}% of budget used</span>
            {budget === 0 && (
              <span className="text-amber-400">Budget not set</span>
            )}
          </div>
          <Progress value={Math.min(usedPct, 100)} className={`h-2.5 ${status.barClass}`} />
        </div>
        {noBudget && actualCost > 0 && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            Spend has been logged but no budget is set on this project. Set Contract Value to act as the internal budget cap, otherwise spend cannot be governed.
          </div>
        )}
        {overBudget && !noBudget && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            This initiative has exceeded its budget by {formatIDR(Math.abs(remaining))}. Consider closing the project, requesting additional budget, or reviewing approved expenses.
          </div>
        )}
        {!overBudget && usedPct >= 70 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Budget utilization is high. Monitor new expenses and timesheet allocations closely.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
