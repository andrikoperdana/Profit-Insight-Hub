import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListTimesheets,
  useCreateTimesheet,
  useListProjects,
  getListTimesheetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, CheckCircle2, AlertCircle, Calendar, Zap, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { TimesheetStatusBadge } from "@/components/common/Badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ConsultantDashboard() {
  const params = { scope: "mine" as const };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });

  const localKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const stats = useMemo(() => {
    const list = timesheets ?? [];
    const approvedHours = list.filter((t) => t.status === "APPROVED").reduce((s, t) => s + t.hours, 0);
    const submittedHours = list.filter((t) => t.status === "SUBMITTED").reduce((s, t) => s + t.hours, 0);
    const rejected = list.filter((t) => t.status === "REJECTED").length;
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const last30Approved = list
      .filter((t) => t.status === "APPROVED" && new Date(t.workDate) >= monthAgo)
      .reduce((s, t) => s + t.hours, 0);
    return { approvedHours, submittedHours, rejected, last30Approved };
  }, [timesheets]);

  const weeklyChart = useMemo(() => {
    const buckets: Record<string, number> = {};
    const list = timesheets ?? [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets[localKey(d)] = 0;
    }
    for (const t of list) {
      if (t.status !== "APPROVED") continue;
      const key = localKey(new Date(t.workDate));
      if (key in buckets) buckets[key] += t.hours;
    }
    return Object.entries(buckets).map(([date, hours]) => ({ date: date.slice(5), hours }));
  }, [timesheets]);

  const todayKey = localKey(new Date());
  const loggedToday = (timesheets ?? [])
    .filter((t) => localKey(new Date(t.workDate)) === todayKey)
    .reduce((s, t) => s + t.hours, 0);

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle="Log today's hours so your PM can approve them quickly." />

      <QuickLogCard loggedToday={loggedToday} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard color="success" icon={<CheckCircle2 className="h-4 w-4" />} label="Approved (30d)" value={`${stats.last30Approved.toFixed(1)} h`} sub={`${stats.approvedHours.toFixed(1)} h all-time`} />
            <KpiCard color="warning" icon={<Clock className="h-4 w-4" />} label="Pending Approval" value={`${stats.submittedHours.toFixed(1)} h`} sub="Awaiting PM" />
            <KpiCard color="destructive" icon={<AlertCircle className="h-4 w-4" />} label="Rejected" value={String(stats.rejected)} sub="Need revision" />
            <KpiCard color="primary" icon={<Calendar className="h-4 w-4" />} label="Total Entries" value={String(timesheets?.length ?? 0)} sub="All-time" />
          </>
        )}
      </div>

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader>
          <CardTitle>Approved Hours — Last 14 Days</CardTitle>
          <CardDescription>Daily approved hours trend</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "10px",
                    fontSize: "12px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                  }}
                />
                <Bar dataKey="hours" fill="url(#hoursGradient)" radius={[6, 6, 0, 0]}>
                  {weeklyChart.map((entry, i) => (
                    <Cell key={i} fill={entry.hours === 0 ? "hsl(var(--muted))" : "url(#hoursGradient)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader>
          <CardTitle>Recent Timesheets</CardTitle>
          <CardDescription>Your latest 10 submissions</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={4} rows={5} /></div>
          ) : !timesheets?.length ? (
            <EmptyState title="No timesheets yet" description="Use the quick-log card above to record your first entry." />
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timesheets.slice(0, 10).map((ts) => (
                  <TableRow key={ts.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm">{formatDate(ts.workDate)}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${ts.projectId}`} className="text-primary hover:underline">
                        {ts.projectName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">{ts.hours}</TableCell>
                    <TableCell><TimesheetStatusBadge status={ts.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLogCard({ loggedToday }: { loggedToday: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: projects } = useListProjects({ status: "ACTIVE" });
  const [projectId, setProjectId] = useState<string>("");
  const [hours, setHours] = useState<number>(8);
  const [description, setDescription] = useState("");

  const createTs = useCreateTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet submitted", description: "Awaiting PM approval." });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "mine" }) });
        setDescription("");
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Failed to save",
          description: err?.message ?? "Unknown error",
        });
      },
    },
  });

  const today = new Date();
  const workDate = (() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const canSubmit = projectId && hours > 0 && description.trim().length >= 5;

  const remaining = Math.max(0, 8 - loggedToday);
  const target8 = Math.min(100, (loggedToday / 8) * 100);

  return (
    <Card className="rounded-xl border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm overflow-hidden">
      <CardContent className="p-5 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
              <Zap className="h-3.5 w-3.5" />
              <span>Quick Log · {formatDate(today.toISOString())}</span>
            </div>
            <p className="text-2xl md:text-3xl font-bold text-foreground mt-1">
              {loggedToday > 0 ? `${loggedToday.toFixed(1)} h logged today` : "No entry yet today"}
            </p>
            <p className="text-sm text-muted-foreground">
              {loggedToday < 8
                ? `${remaining.toFixed(1)} h remaining for an 8-hour shift.`
                : "Daily target reached. Great work!"}
            </p>
          </div>
          <div className="text-right">
            <div className="relative h-2 w-32 sm:w-40 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
                style={{ width: `${target8}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{target8.toFixed(0)}% of 8h</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Project
            </label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-12 text-base bg-background" data-testid="select-quicklog-project">
                <SelectValue placeholder="Select an active project" />
              </SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Hours
            </label>
            <div className="flex gap-1.5">
              {[2, 4, 6, 8].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  data-testid={`button-hours-${h}`}
                  className={cn(
                    "h-12 w-12 rounded-lg text-sm font-bold transition-all border",
                    hours === h
                      ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105"
                      : "bg-background text-foreground border-border hover:border-primary/50"
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            What did you work on? (min 5 chars)
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Vulnerability scan on staging, finalized executive summary…"
            className="resize-none h-20 bg-background"
            data-testid="textarea-quicklog-description"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Logging {hours}h to today ({workDate}). Goes to PM for approval.
          </p>
          <Button
            size="lg"
            disabled={!canSubmit || createTs.isPending}
            onClick={() =>
              createTs.mutate({
                data: { projectId, workDate, hours, description: description.trim() },
              })
            }
            className="h-12 text-base font-semibold shadow-sm"
            data-testid="button-quicklog-submit"
          >
            {createTs.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" /> Log {hours}h Now
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "primary" | "warning" | "destructive" | "success";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-500",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-emerald-500/10 text-emerald-500",
  };
  return (
    <Card className="rounded-xl border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", colorMap[color])}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xl sm:text-2xl font-bold text-foreground">{value}</div>
        {sub && <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
