import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListTimesheets,
  useCreateTimesheet,
  useListProjects,
  useListMyTasks,
  useListProjectReports,
  useCreateProjectReport,
  getListTimesheetsQueryKey,
  getListMyTasksQueryKey,
  getListProjectsQueryKey,
  getListProjectReportsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, CheckCircle2, AlertCircle, Calendar, Zap, Loader2, FileText, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { TimesheetStatusBadge } from "@/components/common/Badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import MyExpensesCard from "@/components/dashboard/MyExpensesCard";
import MyTasksCard from "@/components/dashboard/MyTasksCard";
import WeeklyEntryDialog from "@/pages/timesheets/WeeklyEntryDialog";
import WorkHoursCard from "@/components/WorkHoursCard";
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

      <WorkHoursCard />

      <QuickLogCard loggedToday={loggedToday} />

      <MyExpensesCard />

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

      <MyTasksCard />

      <MyReportAssignmentsCard />

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
  const { user } = useAuth();
  // Delivery roles must clock hours against an assigned task (server enforces
  // with code TASK_REQUIRED); mirror it here for a clear UX.
  const taskRequired = ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"].includes(user?.role ?? "");
  const { data: projects } = useListProjects({ status: "ACTIVE" });
  const { data: myTasks } = useListMyTasks({ query: { queryKey: getListMyTasksQueryKey() } });
  const [projectId, setProjectId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [hours, setHours] = useState<number>(8);
  const [description, setDescription] = useState("");

  const tasksForProject = useMemo(
    () => (myTasks ?? []).filter((t) => t.projectId === projectId && t.status !== "DONE"),
    [myTasks, projectId],
  );

  const createTs = useCreateTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet submitted", description: "Awaiting PM approval." });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "mine" }) });
        queryClient.invalidateQueries({ queryKey: getListMyTasksQueryKey() });
        setDescription("");
        setTaskId("");
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
  const canSubmit =
    projectId && hours > 0 && description.trim().length >= 5 && (!taskRequired || !!taskId);

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
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="relative h-2 w-32 sm:w-40 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
                  style={{ width: `${target8}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{target8.toFixed(0)}% of 8h</p>
            </div>
            <WeeklyEntryDialog isAutoApprove={false} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Project
            </label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTaskId(""); }}>
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
              Task {taskRequired ? <span className="normal-case">*</span> : <span className="text-muted-foreground/70 normal-case">(optional)</span>}
            </label>
            <Select
              value={taskId || "__none__"}
              onValueChange={(v) => setTaskId(v === "__none__" ? "" : v)}
              disabled={!projectId}
            >
              <SelectTrigger className="h-12 text-base bg-background" data-testid="select-quicklog-task">
                <SelectValue placeholder={projectId ? (taskRequired ? "Select a task" : "No task (general project work)") : "Select a project first"} />
              </SelectTrigger>
              <SelectContent>
                {!taskRequired && <SelectItem value="__none__">No task (general project work)</SelectItem>}
                {tasksForProject.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
                {projectId && tasksForProject.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">No open tasks assigned to you on this project.</div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <div />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Hours
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[2, 4, 6, 8, 10, 12].map((h) => (
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
              <Input
                type="number"
                min={1}
                max={12}
                step={0.5}
                value={hours}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!isFinite(v)) return;
                  setHours(Math.max(1, Math.min(12, v)));
                }}
                className="h-12 w-20 bg-background text-base font-bold text-center"
                data-testid="input-hours-custom"
                aria-label="Custom hours (1-12)"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Overtime allowed up to 12h.</p>
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
                data: {
                  projectId,
                  workDate,
                  hours,
                  description: description.trim(),
                  ...(taskId ? { taskId } : {}),
                },
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

const REPORT_TYPE_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "INTERIM", label: "Interim" },
  { value: "FINAL", label: "Final" },
];

const REPORT_TYPE_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  INTERIM: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  FINAL: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
};

type ReportFormState = {
  title: string;
  reportNumber: string;
  version: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  author: string;
  coverUrl: string;
  link: string;
  note: string;
};

function safeHttpUrl(value: unknown): string | null {
  if (!value) return null;
  try {
    const u = new URL(String(value));
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {
    /* ignore */
  }
  return null;
}

const EMPTY_REPORT_FORM: ReportFormState = {
  title: "",
  reportNumber: "",
  version: "",
  reportType: "",
  periodStart: "",
  periodEnd: "",
  author: "",
  coverUrl: "",
  link: "",
  note: "",
};

function MyReportAssignmentsCard() {
  const { user } = useAuth();
  const isWriter = user?.role === "TECHNICAL_WRITER";
  const { data: projects } = useListProjects(
    {},
    { query: { queryKey: getListProjectsQueryKey({}), enabled: isWriter } },
  );

  const myProjects = useMemo(
    () => (projects ?? []).filter((p: any) => p.technicalWriterId === user?.id),
    [projects, user?.id],
  );

  const [openProject, setOpenProject] = useState<{ id: string; code: string; name: string } | null>(null);

  if (!isWriter) return null;

  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> My Report Assignments
        </CardTitle>
        <CardDescription>
          Projects where you are the assigned Technical Writer. Upload each report with type, version, and reporting period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {myProjects.length === 0 ? (
          <EmptyState title="No report assignments" description="The PM will assign you on the project's Resources tab." />
        ) : (
          <div className="space-y-2">
            {myProjects.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="min-w-0">
                  <Link href={`/projects/${p.id}`} className="text-primary hover:underline font-medium text-sm">
                    {p.code} · {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Click "Manage Reports" to add or view this project's reports.
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setOpenProject({ id: p.id, code: p.code, name: p.name })}
                  data-testid={`button-tw-upload-${p.id}`}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" /> Manage Reports
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {openProject && (
        <ReportsDialog
          project={openProject}
          onClose={() => setOpenProject(null)}
        />
      )}
    </Card>
  );
}

function ReportsDialog({
  project,
  onClose,
}: {
  project: { id: string; code: string; name: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const params = { page: 1, pageSize: 50 };
  const { data, isLoading } = useListProjectReports(project.id, params, {
    query: { queryKey: getListProjectReportsQueryKey(project.id, params) },
  });
  const reports = (data as any)?.items ?? [];

  const [form, setForm] = useState<ReportFormState>(EMPTY_REPORT_FORM);

  const create = useCreateProjectReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report added" });
        qc.invalidateQueries({ queryKey: getListProjectReportsQueryKey(project.id, params) });
        setForm(EMPTY_REPORT_FORM);
      },
      onError: (e: any) =>
        toast({ title: "Failed to add report", description: e?.message ?? "Could not save", variant: "destructive" }),
    },
  });

  const update = (k: keyof ReportFormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const canSubmit = form.title.trim().length > 0 && !create.isPending;

  const handleSubmit = () => {
    const body: any = { title: form.title.trim() };
    if (form.reportNumber.trim()) body.reportNumber = form.reportNumber.trim();
    if (form.version.trim()) body.version = form.version.trim();
    if (form.reportType) body.reportType = form.reportType;
    if (form.periodStart) body.periodStart = form.periodStart;
    if (form.periodEnd) body.periodEnd = form.periodEnd;
    if (form.author.trim()) body.author = form.author.trim();
    if (form.coverUrl) body.coverUrl = form.coverUrl;
    if (form.link.trim()) body.link = form.link.trim();
    if (form.note.trim()) body.note = form.note.trim();
    create.mutate({ id: project.id, data: body });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reports — {project.code}</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Existing Reports ({reports.length})
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-3">Loading reports…</div>
          ) : reports.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No reports yet. Add the first one below.</div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {reports.map((r: any) => (
                <div key={r.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {r.reportType && (
                        <Badge variant="outline" className={REPORT_TYPE_BADGE[r.reportType] ?? ""}>
                          {r.reportType}
                        </Badge>
                      )}
                      {r.version && <span className="text-xs text-muted-foreground">v{r.version}</span>}
                      {r.reportNumber && <span className="text-xs text-muted-foreground">· {r.reportNumber}</span>}
                      {r.author && <span className="text-xs text-muted-foreground">· {r.author}</span>}
                    </div>
                    {(r.periodStart || r.periodEnd) && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Period: {r.periodStart ? formatDate(r.periodStart) : "—"} → {r.periodEnd ? formatDate(r.periodEnd) : "—"}
                      </div>
                    )}
                  </div>
                  {(() => {
                    const safe = safeHttpUrl(r.link);
                    return safe ? (
                      <a href={safe} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline whitespace-nowrap mt-0.5">
                        Open
                      </a>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-4 border-t border-border">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add New Report</div>

          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Final Pentest Report"
              data-testid="input-report-title"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Report Number</Label>
              <Input
                value={form.reportNumber}
                onChange={(e) => update("reportNumber", e.target.value)}
                placeholder="e.g. RPT-2026-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) => update("version", e.target.value)}
                placeholder="e.g. 1.0"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.reportType || "__none__"} onValueChange={(v) => update("reportType", v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {REPORT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Author</Label>
              <Input
                value={form.author}
                onChange={(e) => update("author", e.target.value)}
                placeholder="e.g. Ayu Wulandari"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Period Start</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => update("periodStart", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Period End</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => update("periodEnd", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cover photo</Label>
            {form.coverUrl && (
              <img src={form.coverUrl} alt="cover" className="w-full h-32 object-cover rounded-md border border-border" />
            )}
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 4 * 1024 * 1024) {
                  toast({ title: "File too large", description: "Max 4 MB", variant: "destructive" });
                  return;
                }
                const r = new FileReader();
                r.onload = () => update("coverUrl", String(r.result || ""));
                r.readAsDataURL(f);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Report link</Label>
            <Input
              placeholder="https://drive.google.com/..."
              value={form.link}
              onChange={(e) => update("link", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={2}
              placeholder="Optional notes about this report"
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-testid="button-tw-add-report">
            {create.isPending ? "Saving..." : "Add Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
