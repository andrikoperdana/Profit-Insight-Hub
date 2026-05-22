import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListTimesheets,
  useCreateTimesheet,
  useDeleteTimesheet,
  useListProjects,
  useListMyTasks,
} from "@workspace/api-client-react";
import { getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { UserRole } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDate } from "@/lib/format";
import { exportCsv } from "@/lib/exports";
import { Clock, Plus, Trash2, Calendar, AlertCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TimesheetStatusBadge } from "@/components/common/Badges";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { Button as UIButton } from "@/components/ui/button";
import WeeklyEntryDialog from "./WeeklyEntryDialog";
import LeaveDialog from "./LeaveDialog";

function earliestAllowedWorkDate(today: Date, businessDays: number): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  let remaining = businessDays;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

const today = new Date();
const minDate = earliestAllowedWorkDate(today, 5).toISOString().slice(0, 10);
const maxDate = today.toISOString().slice(0, 10);

const logTimeSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  taskId: z.string().optional(),
  workDate: z.string().min(1, "Date is required"),
  hours: z.coerce.number().min(0.5, "Minimum 0.5 hours").max(24, "Maximum 24 hours"),
  description: z.string().min(5, "Description must be at least 5 characters"),
});

export default function TimesheetsWorkspace() {
  const { user } = useAuth();
  const isAutoApprove = user?.role === UserRole.PROJECT_MANAGER || user?.role === UserRole.MANAGEMENT;
  const canSeeTeam = user?.role === UserRole.PROJECT_MANAGER || user?.role === UserRole.MANAGEMENT;
  const [tab, setTab] = useState<"mine" | "team">("mine");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Time Tracking</h1>
          <p className="text-muted-foreground">
            {isAutoApprove
              ? "Log your hours — entries you submit are auto-approved."
              : "Log your hours. Submissions go to your Project Manager for approval."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LeaveDialog />
          <WeeklyEntryDialog isAutoApprove={isAutoApprove} />
          <LogTimeDialog isAutoApprove={isAutoApprove} />
        </div>
      </div>

      {canSeeTeam && (
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("mine")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "mine"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-my-timesheets"
          >
            My Timesheets
          </button>
          <button
            onClick={() => setTab("team")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "team"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-team-timesheets"
          >
            Team Timesheets
          </button>
        </div>
      )}

      {(!canSeeTeam || tab === "mine") && (
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">My Timesheets</CardTitle>
            <CardDescription>Only approved entries count toward project cost calculations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <MyTimesheetsTable />
          </CardContent>
        </Card>
      )}

      {canSeeTeam && tab === "team" && (
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Team Timesheets</CardTitle>
            <CardDescription>
              All timesheets across every project{user?.role === UserRole.PROJECT_MANAGER ? " you manage" : ""}. Filter by project and export to CSV.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <TeamTimesheetsTable />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LogTimeDialog({ isAutoApprove }: { isAutoApprove: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: projects } = useListProjects({ status: "ACTIVE" });
  // The user's own assigned tasks across all projects, fetched once and
  // filtered client-side per chosen project so the dropdown updates instantly.
  const { data: myTasks } = useListMyTasks();

  const form = useForm({
    resolver: zodResolver(logTimeSchema),
    defaultValues: { projectId: "", taskId: "", workDate: maxDate, hours: 8, description: "" },
  });

  const selectedProjectId = form.watch("projectId");
  const tasksForProject = (myTasks ?? []).filter(
    (t) => t.projectId === selectedProjectId && t.status !== "DONE",
  );

  const createTs = useCreateTimesheet({
    mutation: {
      onSuccess: () => {
        toast({
          title: isAutoApprove ? "Timesheet logged & approved" : "Timesheet submitted for approval",
        });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "mine" }) });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "approval" }) });
        setOpen(false);
        form.reset({ projectId: "", taskId: "", workDate: maxDate, hours: 8, description: "" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to save", description: err?.message ?? "Unknown error" });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0"><Plus className="h-4 w-4 mr-2" /> Log Time</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Log Time</DialogTitle>
          <DialogDescription>
            Record your hours. Date must be within the last 5 working days.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) =>
              createTs.mutate({
                data: {
                  ...d,
                  // Empty taskId means "no task linkage". Strip it before sending
                  // so the server keeps the column NULL.
                  ...(d.taskId ? { taskId: d.taskId } : { taskId: undefined }),
                } as any,
              }),
            )}
            className="space-y-4 pt-4"
          >
            <FormField control={form.control} name="projectId" render={({ field }) => (
              <FormItem>
                <FormLabel>Project *</FormLabel>
                <Select onValueChange={(v) => { field.onChange(v); form.setValue("taskId", ""); }} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="taskId" render={({ field }) => (
              <FormItem>
                <FormLabel>Task (optional)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__none" ? "" : v)}
                  value={field.value || "__none"}
                  disabled={!selectedProjectId}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-timesheet-task">
                      <SelectValue placeholder={selectedProjectId ? "Select task (optional)" : "Select project first"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none">Not linked to a task</SelectItem>
                    {tasksForProject.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs">
                  {selectedProjectId && tasksForProject.length === 0
                    ? "You aren't assigned to any active tasks on this project yet."
                    : "Pick a task to link these hours to a specific piece of work."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="workDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" min={minDate} max={maxDate} {...field} /></FormControl>
                  <FormDescription className="text-xs">Min {minDate}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hours" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours *</FormLabel>
                  <FormControl><Input type="number" step="0.5" min="0.5" max="24" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Task Description *</FormLabel>
                <FormControl><Textarea placeholder="What did you work on?" className="resize-none h-24" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createTs.isPending}>
                {createTs.isPending ? "Saving..." : isAutoApprove ? "Save (Auto-approved)" : "Submit for Approval"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MyTimesheetsTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = { scope: "mine" as const };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });

  const deleteTs = useDeleteTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet deleted" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(params) });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Cannot delete", description: err?.message });
      },
    },
  });

  const pager = usePagination(timesheets);

  function handleExportCsv() {
    const rows = (timesheets ?? []).map((ts) => ({
      Date: ts.workDate ?? "",
      Project: ts.projectName ?? "",
      Task: (ts as any).taskTitle ?? "",
      Hours: ts.hours ?? 0,
      Description: ts.description ?? "",
      Status: ts.status,
      RejectionReason: ts.rejectionReason ?? "",
      SubmittedAt: ts.createdAt ?? "",
    }));
    exportCsv("my-timesheets", rows);
  }

  if (isLoading) return <div className="p-6"><TableSkeleton columns={5} rows={6} /></div>;

  if (!timesheets?.length) {
    return (
      <EmptyState
        title="No timesheets yet"
        description='Click "Log Time" to record your first entry.'
        icon={<Clock className="h-10 w-10 text-muted-foreground/50" />}
      />
    );
  }

  return (
    <>
    <div className="flex justify-end px-4 pt-3">
      <UIButton
        variant="outline"
        size="sm"
        onClick={handleExportCsv}
        data-testid="button-export-timesheets-csv"
      >
        <Download className="h-4 w-4 mr-2" /> Export CSV
      </UIButton>
    </div>
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Task</TableHead>
          <TableHead className="text-right">Hours</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pager.pageItems.map((ts) => (
          <TableRow key={ts.id}>
            <TableCell className="whitespace-nowrap">
              <div className="flex items-center text-sm">
                <Calendar className="h-3 w-3 mr-2 text-muted-foreground" />
                {formatDate(ts.workDate)}
              </div>
            </TableCell>
            <TableCell>
              <Link href={`/projects/${ts.projectId}`} className="text-primary hover:underline">
                {ts.projectName}
              </Link>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={(ts as any).taskTitle ?? ""}>
              {(ts as any).taskTitle ?? <span className="italic">—</span>}
            </TableCell>
            <TableCell className="text-right font-mono">{ts.hours}</TableCell>
            <TableCell className="max-w-md">
              <p className="text-sm text-foreground/90 line-clamp-2" title={ts.description ?? ""}>
                {ts.description || <span className="text-muted-foreground italic">no description</span>}
              </p>
              {ts.status === "REJECTED" && ts.rejectionReason && (
                <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Reason: {ts.rejectionReason}</span>
                </div>
              )}
            </TableCell>
            <TableCell><TimesheetStatusBadge status={ts.status} /></TableCell>
            <TableCell className="text-right">
              {(ts.status === "REJECTED" || ts.status === "DRAFT" || ts.status === "SUBMITTED") && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Delete"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => deleteTs.mutate({ id: ts.id })}
                  disabled={deleteTs.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <Pagination
      page={pager.page}
      pageSize={pager.pageSize}
      total={pager.total}
      totalPages={pager.totalPages}
      onPageChange={pager.setPage}
      onPageSizeChange={pager.setPageSize}
      testId="timesheets-pagination"
    />
    </>
  );
}

function TeamTimesheetsTable() {
  const params = { scope: "all" as const };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });
  const { data: projects } = useListProjects();

  const [projectFilter, setProjectFilter] = useState<string>("__all");
  const [statusFilter, setStatusFilter] = useState<string>("__all");

  const filtered = (timesheets ?? []).filter((ts) => {
    if (projectFilter !== "__all" && ts.projectId !== projectFilter) return false;
    if (statusFilter !== "__all" && ts.status !== statusFilter) return false;
    return true;
  });

  const pager = usePagination(filtered, { resetKey: `${projectFilter}|${statusFilter}` });

  function handleExportCsv() {
    const rows = filtered.map((ts) => ({
      Date: ts.workDate ?? "",
      Consultant: (ts as any).userName ?? "",
      Project: ts.projectName ?? "",
      Task: (ts as any).taskTitle ?? "",
      Hours: ts.hours ?? 0,
      Description: ts.description ?? "",
      Status: ts.status,
      RejectionReason: ts.rejectionReason ?? "",
      SubmittedAt: ts.createdAt ?? "",
    }));
    exportCsv("team-timesheets", rows);
  }

  if (isLoading) return <div className="p-6"><TableSkeleton columns={6} rows={6} /></div>;

  const totalHours = filtered.reduce((s, t) => s + (t.hours ?? 0), 0);
  const approvedHours = filtered.filter(t => t.status === "APPROVED").reduce((s, t) => s + (t.hours ?? 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Project</span>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-8 w-[220px]" data-testid="filter-team-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All projects</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[150px]" data-testid="filter-team-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-mono text-foreground">{totalHours.toFixed(1)}h</span>
            <span className="mx-2">·</span>
            Approved: <span className="font-mono text-emerald-500">{approvedHours.toFixed(1)}h</span>
            <span className="mx-2">·</span>
            <span>{filtered.length} entries</span>
          </div>
        </div>
        <UIButton
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={!filtered.length}
          data-testid="button-export-team-timesheets-csv"
        >
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </UIButton>
      </div>

      {!filtered.length ? (
        <div className="p-6">
          <EmptyState
            title="No timesheets"
            description="No entries match the current filters."
            icon={<Clock className="h-10 w-10 text-muted-foreground/50" />}
          />
        </div>
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Consultant</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Task</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageItems.map((ts: any) => (
              <TableRow key={ts.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-2 text-muted-foreground" />
                    {formatDate(ts.workDate)}
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium">{ts.userName ?? "—"}</TableCell>
                <TableCell>
                  <Link href={`/projects/${ts.projectId}`} className="text-primary hover:underline text-sm">
                    {ts.projectName}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={ts.taskTitle ?? ""}>
                  {ts.taskTitle ?? <span className="italic">—</span>}
                </TableCell>
                <TableCell className="text-right font-mono">{ts.hours}</TableCell>
                <TableCell className="max-w-md">
                  <p className="text-sm text-foreground/90 line-clamp-2" title={ts.description ?? ""}>
                    {ts.description || <span className="text-muted-foreground italic">no description</span>}
                  </p>
                </TableCell>
                <TableCell><TimesheetStatusBadge status={ts.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {filtered.length > 0 && (
        <Pagination
          page={pager.page}
          pageSize={pager.pageSize}
          total={pager.total}
          totalPages={pager.totalPages}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
          testId="team-timesheets-pagination"
        />
      )}
    </>
  );
}
