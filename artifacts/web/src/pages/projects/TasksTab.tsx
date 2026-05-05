import { useState, useMemo } from "react";
import {
  useListProjectTasks,
  useCreateProjectTask,
  useUpdateTask,
  useDeleteTask,
  useLogTaskTime,
  useListProjectResources,
  useListTaskTimeLogs,
  getListProjectTasksQueryKey,
  getListMyTasksQueryKey,
  getListTaskTimeLogsQueryKey,
  type Task,
  type TaskStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { exportCsv } from "@/lib/exports";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Pagination, usePagination } from "@/components/common/Pagination";
import {
  Plus, Trash2, Clock, Pencil, ListChecks, Loader2, CalendarRange, Download,
} from "lucide-react";

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  TODO: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  IN_PROGRESS: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BLOCKED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DONE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLE[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

interface TasksTabProps {
  projectId: string;
  project: { pmId?: string | null; status?: string };
}

export default function TasksTab({ projectId, project }: TasksTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tasks, isLoading } = useListProjectTasks(projectId, {
    query: { queryKey: getListProjectTasksQueryKey(projectId) },
  });
  const { data: resources } = useListProjectResources(projectId);

  const isManager =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [logTask, setLogTask] = useState<Task | null>(null);
  const [logsTask, setLogsTask] = useState<Task | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProjectTasksQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getListMyTasksQueryKey() });
  };

  const deleteMutation = useDeleteTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Task deleted" });
        invalidate();
      },
      onError: (e: any) =>
        toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
    },
  });

  const summary = useMemo(() => {
    const list = tasks ?? [];
    const total = list.length;
    const done = list.filter((t) => t.status === "DONE").length;
    const inProgress = list.filter((t) => t.status === "IN_PROGRESS").length;
    const totalHours = list.reduce((s, t) => s + (t.loggedHours ?? 0), 0);
    return { total, done, inProgress, totalHours };
  }, [tasks]);

  const pager = usePagination(tasks ?? [], { resetKey: projectId });

  function handleExportCsv() {
    const rows = (tasks ?? []).map((t) => ({
      Title: t.title,
      Description: t.description ?? "",
      Status: STATUS_LABELS[t.status],
      Assignee: t.assigneeName ?? "",
      StartDate: t.startDate ?? "",
      EndDate: t.endDate ?? "",
      LoggedHours: Number((t.loggedHours ?? 0).toFixed(2)),
    }));
    exportCsv(`tasks-${projectId}`, rows);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryCard label="Total Tasks" value={String(summary.total)} icon={<ListChecks className="h-4 w-4" />} />
        <SummaryCard label="In Progress" value={String(summary.inProgress)} tone="info" />
        <SummaryCard label="Completed" value={String(summary.done)} tone="success" />
        <SummaryCard label="Hours Logged" value={`${summary.totalHours.toFixed(1)}h`} tone="primary" icon={<Clock className="h-4 w-4" />} />
      </div>

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Project Tasks</CardTitle>
            <CardDescription>
              Assign work to project resources and track clocked-in hours.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!tasks?.length}
              data-testid="button-export-tasks-csv"
            >
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            {isManager && (
              <Button onClick={() => setCreateOpen(true)} data-testid="button-new-task">
                <Plus className="h-4 w-4 mr-2" /> New Task
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={6} rows={4} /></div>
          ) : !tasks?.length ? (
            <EmptyState
              title="No tasks yet"
              description={
                isManager
                  ? "Create the first task to break this project down for the team."
                  : "Your PM hasn't assigned any tasks on this project yet."
              }
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((t) => {
                  const isAssignee = t.assigneeId === user?.id;
                  const canEdit = isManager;
                  const canChangeStatus = isManager || isAssignee;
                  const canLog = isAssignee;
                  return (
                    <TableRow key={t.id} className="hover:bg-muted/30 align-top">
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium">{t.title}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {t.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.assigneeName ?? <span className="text-muted-foreground italic">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {t.startDate ? formatDate(t.startDate) : "—"}
                        <span className="mx-1">→</span>
                        {t.endDate ? formatDate(t.endDate) : "—"}
                      </TableCell>
                      <TableCell>
                        {canChangeStatus ? (
                          <InlineStatusSelect task={t} onSaved={invalidate} />
                        ) : (
                          <StatusBadge status={t.status} />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setLogsTask(t)}
                        >
                          {(t.loggedHours ?? 0).toFixed(1)}h
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {canLog && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setLogTask(t)}
                              data-testid={`button-log-hours-${t.id}`}
                            >
                              <Clock className="h-3.5 w-3.5 mr-1" /> Log
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <Button size="icon" variant="ghost" onClick={() => setEditTask(t)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete task "${t.title}"?`)) {
                                    deleteMutation.mutate({ taskId: t.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {tasks && tasks.length > 0 && (
            <Pagination
              page={pager.page}
              pageSize={pager.pageSize}
              total={pager.total}
              totalPages={pager.totalPages}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
              testId="tasks-pagination"
            />
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <TaskFormDialog
          projectId={projectId}
          resources={resources ?? []}
          onClose={() => setCreateOpen(false)}
          onSaved={invalidate}
        />
      )}
      {editTask && (
        <TaskFormDialog
          projectId={projectId}
          resources={resources ?? []}
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={invalidate}
        />
      )}
      {logTask && (
        <LogHoursDialog
          task={logTask}
          onClose={() => setLogTask(null)}
          onSaved={invalidate}
        />
      )}
      {logsTask && (
        <TimeLogsDialog
          task={logsTask}
          onClose={() => setLogsTask(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "muted",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "muted" | "primary" | "success" | "info";
}) {
  const toneMap = {
    muted: "text-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    info: "text-blue-400",
  };
  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wide">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function InlineStatusSelect({ task, onSaved }: { task: Task; onSaved: () => void }) {
  const { toast } = useToast();
  const update = useUpdateTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status updated" });
        onSaved();
      },
      onError: (e: any) =>
        toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
    },
  });
  return (
    <Select
      value={task.status}
      onValueChange={(v) =>
        update.mutate({ taskId: task.id, data: { status: v as TaskStatus } })
      }
    >
      <SelectTrigger className="h-7 w-[140px] text-xs" data-testid={`select-status-${task.id}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TaskFormDialog({
  projectId,
  resources,
  task,
  onClose,
  onSaved,
}: {
  projectId: string;
  resources: { userId: string; userName: string }[];
  task?: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>((task?.status as TaskStatus) ?? "TODO");
  const [startDate, setStartDate] = useState(task?.startDate ? task.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(task?.endDate ? task.endDate.slice(0, 10) : "");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId ?? "");

  const create = useCreateProjectTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Task created" });
        onSaved();
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Create failed", description: e?.message, variant: "destructive" }),
    },
  });
  const update = useUpdateTask({
    mutation: {
      onSuccess: () => {
        toast({ title: "Task updated" });
        onSaved();
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
    },
  });

  const submitting = create.isPending || update.isPending;

  // HTML <input type="date"> happily emits e.g. "82026-05-05" if the user
  // typed extra digits in the year — JS Date accepts it but Prisma 500s on
  // the resulting extended-year ISO ("+082026-05-05"). Block it here so the
  // user gets a clear error before round-tripping.
  function isValidDate(s: string): boolean {
    if (!s) return true;
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(s);
    if (!m) return false;
    const y = Number(m[1]);
    return y >= 1900 && y <= 9999;
  }
  const startDateValid = isValidDate(startDate);
  const endDateValid = isValidDate(endDate);
  const datesValid = startDateValid && endDateValid;
  const canSubmit = title.trim().length > 0 && datesValid && !submitting;

  function handleSubmit() {
    if (!canSubmit) {
      if (!datesValid) {
        toast({
          title: "Invalid date",
          description: "Year must be between 1900 and 9999 (use YYYY-MM-DD).",
          variant: "destructive",
        });
      }
      return;
    }
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      assigneeId: assigneeId || undefined,
    };
    if (editing && task) {
      // PATCH allows nulls to clear
      update.mutate({
        taskId: task.id,
        data: {
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          status,
          startDate: startDate || null,
          endDate: endDate || null,
          assigneeId: assigneeId || null,
        } as any,
      });
    } else {
      create.mutate({ id: projectId, data: payload as any });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            Define the work and assign it to a project resource. Hours are clocked-in by the assignee.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Run external port scan"
              data-testid="input-task-title"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details, deliverables, acceptance criteria…"
              className="resize-none h-20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-invalid={!startDateValid}
                className={!startDateValid ? "border-destructive" : ""}
              />
              {!startDateValid && (
                <p className="mt-1 text-xs text-destructive">Use a 4-digit year (YYYY-MM-DD).</p>
              )}
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-invalid={!endDateValid}
                className={!endDateValid ? "border-destructive" : ""}
              />
              {!endDateValid && (
                <p className="mt-1 text-xs text-destructive">Use a 4-digit year (YYYY-MM-DD).</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Assignee</Label>
              <Select value={assigneeId || "__none"} onValueChange={(v) => setAssigneeId(v === "__none" ? "" : v)}>
                <SelectTrigger data-testid="select-task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {resources.map((r) => (
                    <SelectItem key={r.userId} value={r.userId}>{r.userName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-testid="button-save-task">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {editing ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogHoursDialog({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [hours, setHours] = useState<string>("1");
  const [note, setNote] = useState("");
  const [loggedAt, setLoggedAt] = useState(new Date().toISOString().slice(0, 10));

  const log = useLogTaskTime({
    mutation: {
      onSuccess: () => {
        toast({ title: `Logged ${hours}h on "${task.title}"` });
        qc.invalidateQueries({ queryKey: getListTaskTimeLogsQueryKey(task.id) });
        onSaved();
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Log failed", description: e?.message, variant: "destructive" }),
    },
  });

  const h = Number(hours);
  const canSubmit = isFinite(h) && h > 0 && h <= 24 && !log.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Hours</DialogTitle>
          <DialogDescription className="text-xs">{task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Hours *</Label>
            <Input
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              data-testid="input-log-hours"
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on? (optional)"
              className="resize-none h-16"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => log.mutate({
              taskId: task.id,
              data: { hours: h, note: note.trim() || undefined, loggedAt },
            })}
            data-testid="button-confirm-log-hours"
          >
            {log.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
            Log {h || 0}h
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeLogsDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data: logs, isLoading } = useListTaskTimeLogs(task.id, {
    query: { queryKey: getListTaskTimeLogsQueryKey(task.id) },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarRange className="h-4 w-4" /> Time Logs</DialogTitle>
          <DialogDescription className="text-xs">{task.title}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !logs?.length ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No hours clocked yet.</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">
                      {formatDate(l.loggedAt)}
                      {l.note && <div className="text-xs text-muted-foreground mt-0.5">{l.note}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{l.userName}</TableCell>
                    <TableCell className="text-right font-mono">{l.hours.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
