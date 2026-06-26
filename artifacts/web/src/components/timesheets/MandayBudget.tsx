import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { wouldExceedPlan } from "./MandayBudget.logic";

export { wouldExceedPlan, countCumulativeOverPlan } from "./MandayBudget.logic";
export type { MandayRow } from "./MandayBudget.logic";

/**
 * Compact "consumed / planned md" readout. Turns red with a warning icon when
 * the pending entry would exceed the plan; shows a muted "no plan" state when
 * there is no allocation.
 */
export function MandayUsage({
  label,
  consumedMandays,
  plannedMandays,
  pendingHours = 0,
  className,
}: {
  label: string;
  consumedMandays: number | null | undefined;
  plannedMandays: number | null | undefined;
  pendingHours?: number;
  className?: string;
}) {
  const hasPlan = plannedMandays != null && plannedMandays > 0;
  const consumed = consumedMandays ?? 0;
  const over = wouldExceedPlan(consumedMandays, plannedMandays, pendingHours);
  return (
    <div className={cn("text-[11px] leading-tight whitespace-nowrap", className)}>
      <span className="text-muted-foreground">{label}: </span>
      {hasPlan ? (
        <span className={cn("font-mono", over ? "text-destructive font-semibold" : "text-foreground")}>
          {consumed.toFixed(1)} / {plannedMandays.toFixed(1)} md
        </span>
      ) : (
        <span className="font-mono text-muted-foreground">{consumed.toFixed(1)} md · no plan</span>
      )}
      {over && <AlertTriangle className="inline-block h-3 w-3 ml-1 -mt-0.5 text-destructive" />}
    </div>
  );
}

export function OverPlanBadge({ children = "Over plan" }: { children?: ReactNode }) {
  return (
    <Badge variant="destructive" className="text-[10px] ml-1 gap-1">
      <AlertTriangle className="h-3 w-3" /> {children}
    </Badge>
  );
}
