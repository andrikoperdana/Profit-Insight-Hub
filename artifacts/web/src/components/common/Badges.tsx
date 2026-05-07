import { ProjectStatus, TimesheetStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const config: Record<ProjectStatus, { label: string; className: string }> = {
    [ProjectStatus.DRAFT]: { label: "Draft", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    [ProjectStatus.OBSERVATION]: { label: "Observation", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    [ProjectStatus.ACTIVE]: { label: "Active", className: "bg-primary/10 text-primary border-primary/20" },
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
    [TimesheetStatus.APPROVED]: { label: "Approved", className: "bg-primary/10 text-primary border-primary/20" },
    [TimesheetStatus.REJECTED]: { label: "Rejected", className: "bg-red-500/10 text-red-500 border-red-500/20" },
  };

  const current = config[status] || { label: status, className: "bg-gray-500/10 text-gray-500 border-gray-500/20" };

  return (
    <Badge variant="outline" className={cn("font-medium", current.className, className)}>
      {current.label}
    </Badge>
  );
}

export function MarginBadge({ marginPct, className }: { marginPct: number | undefined | null; className?: string }) {
  if (marginPct == null) return <span className="text-muted-foreground">-</span>;
  
  let colorClass = "bg-red-500/10 text-red-500 border-red-500/20"; // < 15%
  if (marginPct >= 30) {
    colorClass = "bg-primary/10 text-primary border-primary/20";
  } else if (marginPct >= 15) {
    colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }

  return (
    <Badge variant="outline" className={cn("font-bold", colorClass, className)}>
      {marginPct.toFixed(1)}%
    </Badge>
  );
}
