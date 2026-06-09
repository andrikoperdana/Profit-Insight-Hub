import { ProjectStatus, TimesheetStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const config: Record<ProjectStatus, { label: string; className: string }> = {
    [ProjectStatus.DRAFT]: { label: "Draft", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    [ProjectStatus.OBSERVATION]: { label: "Observation", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    [ProjectStatus.ACTIVE]: { label: "Active", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    [ProjectStatus.PAUSE]: { label: "Pause", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    [ProjectStatus.COMPLETE]: { label: "Complete", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    [ProjectStatus.CLOSED]: { label: "Closed", className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
    [ProjectStatus.NO_NEED_CONSULTANT]: { label: "No Need Consultant", className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  };

  const current = config[status] || { label: status, className: "bg-gray-500/10 text-gray-500 border-gray-500/20" };

  return (
    <Badge variant="outline" className={cn("font-medium", current.className, className)}>
      {current.label}
    </Badge>
  );
}

export function TimesheetStatusBadge({ status, className }: { status: TimesheetStatus; className?: string }) {
  const config: Record<TimesheetStatus, { label: string; className: string }> = {
    [TimesheetStatus.DRAFT]: { label: "Draft", className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
    [TimesheetStatus.SUBMITTED]: { label: "Submitted", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    [TimesheetStatus.APPROVED]: { label: "Approved", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    [TimesheetStatus.REJECTED]: { label: "Rejected", className: "bg-red-500/10 text-red-500 border-red-500/20" },
  };

  const current = config[status] || { label: status, className: "bg-gray-500/10 text-gray-500 border-gray-500/20" };

  return (
    <Badge variant="outline" className={cn("font-medium", current.className, className)}>
      {current.label}
    </Badge>
  );
}

export interface HealthComponents {
  margin: number;
  raid: number;
  expenses: number;
  billing: number;
  schedule: number;
}

const HEALTH_MAX: HealthComponents = { margin: 30, raid: 20, expenses: 15, billing: 20, schedule: 15 };
const HEALTH_LABELS: Record<keyof HealthComponents, string> = {
  margin: "Margin",
  raid: "RAID",
  expenses: "Expenses",
  billing: "Billing",
  schedule: "Schedule",
};

const HEALTH_FRIENDLY: Record<"HEALTHY" | "AT_RISK" | "CRITICAL", string> = {
  HEALTHY: "Healthy",
  AT_RISK: "At Risk",
  CRITICAL: "Critical",
};

export function HealthBadge({
  score,
  label,
  reasons,
  components,
  className,
  showLabel,
}: {
  score: number | null | undefined;
  label?: "HEALTHY" | "AT_RISK" | "CRITICAL" | null;
  reasons?: string[] | null;
  components?: HealthComponents | null;
  className?: string;
  showLabel?: boolean;
}) {
  if (score == null) return <span className="text-muted-foreground">-</span>;
  const colorClass =
    label === "HEALTHY"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
      : label === "AT_RISK"
        ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
        : "bg-red-500/10 text-red-500 border-red-500/30";
  const friendly = label ? HEALTH_FRIENDLY[label] : null;

  const rows = components
    ? (Object.keys(HEALTH_MAX) as (keyof HealthComponents)[]).map((k) => ({
        key: k,
        label: HEALTH_LABELS[k],
        got: components[k],
        max: HEALTH_MAX[k],
      }))
    : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex"
          data-testid="button-health-badge"
        >
          <Badge
            variant="outline"
            className={cn(
              "font-bold tabular-nums cursor-pointer hover:opacity-90",
              showLabel && "gap-1.5",
              colorClass,
              className,
            )}
          >
            {showLabel && friendly ? (
              <>
                <span>{friendly}</span>
                <span className="font-mono opacity-70">{score}/100</span>
              </>
            ) : (
              score
            )}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="center" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">Project Health</p>
            <span className="text-xs text-muted-foreground">
              {label ?? "—"} · {score}/100
            </span>
          </div>

          {rows.length > 0 ? (
            <div className="space-y-1.5">
              {rows.map((r) => {
                const pct = r.max > 0 ? (r.got / r.max) * 100 : 0;
                const bar =
                  pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={r.key} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-mono tabular-nums">
                        {r.got}/{r.max}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Breakdown not available for this view.
            </p>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold mb-1">Reasons</p>
            {reasons && reasons.length > 0 ? (
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-400">No deductions — all signals healthy.</p>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
            Score = Margin (30) + RAID (20) + Expenses (15) + Billing (20) + Schedule (15).
            Labels: ≥80 Healthy · 60–79 At Risk · &lt;60 Critical.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MarginBadge({ marginPct, className }: { marginPct: number | undefined | null; className?: string }) {
  if (marginPct == null) return <span className="text-muted-foreground">-</span>;
  
  let colorClass = "bg-red-500/10 text-red-500 border-red-500/20"; // < 15%
  if (marginPct >= 30) {
    colorClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  } else if (marginPct >= 15) {
    colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }

  return (
    <Badge variant="outline" className={cn("font-bold", colorClass, className)}>
      {marginPct.toFixed(1)}%
    </Badge>
  );
}
