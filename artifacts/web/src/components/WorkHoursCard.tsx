import {
  useGetWorkHoursMe,
  getGetWorkHoursMeQueryKey,
  type WorkHoursPeriod,
  type WorkHoursPeriodStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CalendarClock } from "lucide-react";
import LeaveDialog from "@/pages/timesheets/LeaveDialog";

const STATUS_META: Record<WorkHoursPeriodStatus, { label: string; tone: string }> = {
  MET: { label: "On Target", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ON_TRACK: { label: "On Track", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  BEHIND: { label: "Slightly Behind", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  AT_RISK: { label: "Behind", tone: "bg-destructive/15 text-destructive border-destructive/30" },
};

function barColor(status: WorkHoursPeriodStatus): string {
  if (status === "MET" || status === "ON_TRACK") return "bg-emerald-500";
  if (status === "BEHIND") return "bg-amber-500";
  return "bg-destructive";
}

function PeriodBlock({ title, period }: { title: string; period: WorkHoursPeriod }) {
  const pct =
    period.targetHours > 0
      ? Math.min(100, Math.round((period.loggedHours / period.targetHours) * 100))
      : 100;
  const meta = STATUS_META[period.status];
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2" data-testid={`work-hours-${title.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{title}</p>
        <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold font-mono">{period.loggedHours.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground font-mono">/ {period.targetHours.toFixed(0)}h</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
        <div className={`h-full rounded-full transition-all ${barColor(period.status)}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {period.remainingHours > 0
            ? `${period.remainingHours.toFixed(1)}h remaining`
            : "Target reached"}
        </span>
        {period.pendingHours > 0 && (
          <span className="text-blue-400">{period.pendingHours.toFixed(1)}h pending approval</span>
        )}
      </div>
      {period.leaveDays > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <CalendarClock className="h-3 w-3" />
          {period.leaveDays} leave day{period.leaveDays === 1 ? "" : "s"} — target reduced
        </p>
      )}
    </div>
  );
}

export default function WorkHoursCard() {
  const { data, isLoading } = useGetWorkHoursMe({
    query: { queryKey: getGetWorkHoursMeQueryKey() },
  });

  // Only required roles have a weekly hours obligation. Exempt users see nothing.
  if (!isLoading && (!data || !data.required)) return null;

  return (
    <Card data-testid="card-work-hours">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Work Hours Compliance
            </CardTitle>
            <CardDescription>
              You are expected to log 40 hours per week. Recorded leave lowers your target.
            </CardDescription>
          </div>
          <LeaveDialog />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <PeriodBlock title="This Week" period={data.week} />
            <PeriodBlock title="This Month" period={data.month} />
            <PeriodBlock title="This Year" period={data.year} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
