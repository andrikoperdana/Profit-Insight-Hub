import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const HOURS_PER_MANDAY = 8;

/**
 * True when counting a still-pending entry's hours would push consumed mandays
 * past the plan. Only meaningful when a positive plan exists; missing or zero
 * plans are treated as "no plan" (never an alert).
 */
export function wouldExceedPlan(
  consumedMandays: number | null | undefined,
  plannedMandays: number | null | undefined,
  pendingHours: number,
): boolean {
  if (plannedMandays == null || plannedMandays <= 0) return false;
  const after = (consumedMandays ?? 0) + pendingHours / HOURS_PER_MANDAY;
  return after > plannedMandays + 1e-6;
}

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

const HAS_PLAN_EPS = 1e-6;

export type MandayRow = {
  projectId: string;
  userId: string;
  hours: number;
  userConsumedMandays?: number | null;
  userPlannedMandays?: number | null;
  projectConsumedMandays?: number | null;
  projectPlannedMandays?: number | null;
};

/**
 * Counts how many of `entries` would push a person or the project over plan
 * when approved together. Unlike a per-row check, this accumulates the pending
 * hours by (project,user) and by project on top of the already-approved
 * baseline, so a batch that is safe individually but unsafe in aggregate is
 * still flagged. Each row carries the same approved baseline for its keys, so
 * we seed the running total once per key, then add each entry's hours.
 */
export function countCumulativeOverPlan(entries: MandayRow[]): number {
  const userRunning = new Map<string, { consumed: number; planned: number | null }>();
  const projectRunning = new Map<string, { consumed: number; planned: number | null }>();
  let count = 0;
  for (const t of entries) {
    const ukey = `${t.projectId}:${t.userId}`;
    if (!userRunning.has(ukey)) {
      userRunning.set(ukey, {
        consumed: t.userConsumedMandays ?? 0,
        planned: t.userPlannedMandays ?? null,
      });
    }
    if (!projectRunning.has(t.projectId)) {
      projectRunning.set(t.projectId, {
        consumed: t.projectConsumedMandays ?? 0,
        planned: t.projectPlannedMandays ?? null,
      });
    }
    const u = userRunning.get(ukey)!;
    const p = projectRunning.get(t.projectId)!;
    u.consumed += t.hours / HOURS_PER_MANDAY;
    p.consumed += t.hours / HOURS_PER_MANDAY;
    const overUser = u.planned != null && u.planned > 0 && u.consumed > u.planned + HAS_PLAN_EPS;
    const overProject = p.planned != null && p.planned > 0 && p.consumed > p.planned + HAS_PLAN_EPS;
    if (overUser || overProject) count += 1;
  }
  return count;
}

export function OverPlanBadge({ children = "Over plan" }: { children?: ReactNode }) {
  return (
    <Badge variant="destructive" className="text-[10px] ml-1 gap-1">
      <AlertTriangle className="h-3 w-3" /> {children}
    </Badge>
  );
}
