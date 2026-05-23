import { useState, useMemo } from "react";
import {
  useListProjectTasks,
  useCreateProjectTask,
  useUpdateTask,
  useDeleteTask,
  useLogTaskTime,
  useListProjectResources,
  useListTaskTimeLogs,
  useListTaskTemplates,
  useApplyTaskTemplate,
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
  Plus, Trash2, Clock, Pencil, ListChecks, Loader2, CalendarRange, Download, FileStack,
} from "lucide-react";

function ApplyTemplateButton({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: templates } = useListTaskTemplates(undefined, { query: { enabled: open, queryKey: ["task-templates", { open }] as const } });
  const apply = useApplyTaskTemplate({
    mutation: {
      onSuccess: (res) => {
        toast({ title: `${res.created} tasks created from template` });
        qc.invalidateQueries({ queryKey: getListProjectTasksQueryKey(projectId) });
        setOpen(false);
        setTemplateId("");
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to apply", description: e?.message }),
    },
  });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-apply-template">
        <FileStack className="h-4 w-4 mr-2" /> Apply Template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Task Template</DialogTitle>
            <DialogDescription>The template will create tasks automatically with dates relative to the start date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger data-testid="select-template"><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates?.length === 0 && <SelectItem value="__none" disabled>No templates yet</SelectItem>}
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.tasks.length} tasks)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">The first task starts from this date.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => apply.mutate({ id: projectId, data: { templateId, startDate } })} disabled={!templateId || apply.isPending} data-testid="button-apply-template-confirm">
              {apply.isPending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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

  // Build a tree-ordered list (DFS) so children render directly under parents.
  // Root tasks come from items whose parentTaskId is null OR points to a task
  // that doesn't exist in the current list (orphans treated as roots).
  const orderedTasks = useMemo(() => {
    const list = (tasks ?? []) as Array<Task & { parentTaskId?: string | null }>;
    if (list.length === 0) return list;
    const ids = new Set(list.map((t) => t.id));
    const childrenByParent = new Map<string, typeof list>();
    const roots: typeof list = [];
    for (const t of list) {
      const pid = (t as any).parentTaskId as string | null | undefined;
      if (pid && ids.has(pid)) {
        const arr = childrenByParent.get(pid) ?? [];
        arr.push(t);
        childrenByParent.set(pid, arr);
      } else {
        roots.push(t);
      }
    }
    const out: Array<typeof list[number] & { __depth: number }> = [];
    function walk(node: typeof list[number], depth: number) {
      out.push(Object.assign(node, { __depth: depth }));
      const kids = childrenByParent.get(node.id) ?? [];
      for (const k of kids) walk(k, depth + 1);
    }
    for (const r of roots) walk(r, 0);
    return out;
  }, [tasks]);

  const pager = usePagination(orderedTasks, { resetKey: projectId });

  function handleExportCsv() {
    const rows = (tasks ?? []).map((t) => {
      const names =
        ((t as any).assignees as { name: string }[] | undefined)?.map((a) => a.name) ??
        (t.assigneeName ? [t.assigneeName] : []);
      return {
        Title: t.title,
        Description: t.description ?? "",
        Status: STATUS_LABELS[t.status],
        Progress: `${(t as any).progressPercent ?? 0}%`,
        Assignees: names.join(", "),
        StartDate: t.startDate ?? "",
        EndDate: t.endDate ?? "",
        LoggedHours: Number((t.loggedHours ?? 0).toFixed(2)),
      };
    });
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
              <>
                <ApplyTemplateButton projectId={projectId} />
                <Button onClick={() => setCreateOpen(true)} data-testid="button-new-task">
                  <Plus className="h-4 w-4 mr-2" /> New Task
                </Button>
              </>
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
                  <TableHead>Assignees</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]">Progress</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((t) => {
                  const depth = ((t as any).__depth as number | undefined) ?? 0;
                  const allAssignees =
                    ((t as any).assignees as { userId: string; name: string }[] | undefined) ??
                    (t.assigneeId && t.assigneeName
                      ? [{ userId: t.assigneeId, name: t.assigneeName }]
                      : []);
                  const isAssignee = allAssignees.some((a) => a.userId === user?.id);
                  const canEdit = isManager;
                  const canChangeStatus = isManager || isAssignee;
                  const canLog = isAssignee;
                  return (
                    <TableRow key={t.id} className="hover:bg-muted/30 align-top">
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium flex items-center gap-2" style={{ paddingLeft: depth * 18 }}>
                          {depth > 0 && (
                            <span className="text-muted-foreground/60 select-none" aria-hidden>
                              └
                            </span>
                          )}
                          <span>{t.title}</span>
                          {(t as any).billable === false && (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]"
                              title="Non-billable: hours don't count toward revenue/margin"
                            >
                              Non-billable
                            </Badge>
                          )}
                        </div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {t.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {allAssignees.length === 0 ? (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {allAssignees.map((a) => (
                              <Badge
                                key={a.userId}
                                variant="outline"
                                className="bg-muted/40 font-normal"
                              >
                                {a.name}
                              </Badge>
                            ))}
                          </div>
                        )}
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
                      <TableCell>
                        <ProgressBar value={(t as any).progressPercent ?? 0} />
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
          allTasks={tasks ?? []}
          onClose={() => setCreateOpen(false)}
          onSaved={invalidate}
        />
      )}
      {editTask && (
        <TaskFormDialog
          projectId={projectId}
          resources={resources ?? []}
          allTasks={tasks ?? []}
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

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    v >= 100 ? "bg-emerald-500" : v >= 50 ? "bg-primary" : v > 0 ? "bg-amber-500" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs font-mono w-9 text-right tabular-nums">{v}%</span>
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
  allTasks,
  onClose,
  onSaved,
}: {
  projectId: string;
  resources: { userId: string; userName: string }[];
  task?: Task;
  allTasks?: Task[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>((task?.status as TaskStatus) ?? "TODO");
  const [progressPercent, setProgressPercent] = useState<number>(((task as any)?.progressPercent ?? 0));
  const [startDate, setStartDate] = useState(task?.startDate ? task.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(task?.endDate ? task.endDate.slice(0, 10) : "");
  const initialAssigneeIds: string[] = (() => {
    const list = (task as any)?.assignees as { userId: string }[] | undefined;
    if (list && list.length > 0) return list.map((a) => a.userId);
    if (task?.assigneeId) return [task.assigneeId];
    return [];
  })();
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds);
  const [billable, setBillable] = useState<boolean>(((task as any)?.billable ?? true) as boolean);
  const [parentTaskId, setParentTaskId] = useState<string>(((task as any)?.parentTaskId as string | null) ?? "");
  const initialDependencyIds: string[] = (() => {
    const list = (task as any)?.dependencies as { dependsOnTaskId: string }[] | undefined;
    return Array.isArray(list) ? list.map((d) => d.dependsOnTaskId) : [];
  })();
  const [dependencyTaskIds, setDependencyTaskIds] = useState<string[]>(initialDependencyIds);
  function toggleDependency(taskId: string) {
    setDependencyTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((x) => x !== taskId) : [...prev, taskId],
    );
  }

  // Compute the set of descendants of the editing task so we can exclude
  // them from the Parent and Depends-On pickers (the server would 400 on
  // such cycles anyway).
  const forbiddenIds = useMemo(() => {
    const forbidden = new Set<string>();
    if (!task || !allTasks?.length) return forbidden;
    const childrenByParent = new Map<string, string[]>();
    for (const t of allTasks) {
      const pid = (t as any).parentTaskId as string | null | undefined;
      if (pid) {
        const arr = childrenByParent.get(pid) ?? [];
        arr.push(t.id);
        childrenByParent.set(pid, arr);
      }
    }
    const stack: string[] = [task.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const child of childrenByParent.get(cur) ?? []) {
        if (!forbidden.has(child)) {
          forbidden.add(child);
          stack.push(child);
        }
      }
    }
    return forbidden;
  }, [task, allTasks]);

  function toggleAssignee(uid: string) {
    setAssigneeIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
    );
  }

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
    const effectivePct = status === "DONE" ? 100 : status === "TODO" ? 0 : progressPercent;
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      progressPercent: effectivePct,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      assigneeIds,
      billable,
      parentTaskId: parentTaskId || undefined,
      dependencyTaskIds,
    };
    if (editing && task) {
      // PATCH allows nulls to clear
      update.mutate({
        taskId: task.id,
        data: {
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          status,
          progressPercent: effectivePct,
          startDate: startDate || null,
          endDate: endDate || null,
          assigneeIds,
          billable,
          parentTaskId: parentTaskId || null,
          dependencyTaskIds,
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Assignees</Label>
              <span className="text-xs text-muted-foreground">
                {assigneeIds.length === 0 ? "Unassigned" : `${assigneeIds.length} selected`}
              </span>
            </div>
            {resources.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1">
                No resources on this project yet. Add a resource first on the Resources tab.
              </p>
            ) : (
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {resources.map((r) => {
                  const checked = assigneeIds.includes(r.userId);
                  return (
                    <label
                      key={r.userId}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer"
                      data-testid={`checkbox-assignee-${r.userId}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignee(r.userId)}
                      />
                      <span>{r.userName}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Select more than one for tasks worked on by multiple people at the same time.
            </p>
          </div>
          <div>
            <Label>Parent Task (WBS)</Label>
            <Select
              value={parentTaskId || "__none"}
              onValueChange={(v) => setParentTaskId(v === "__none" ? "" : v)}
            >
              <SelectTrigger data-testid="select-parent-task">
                <SelectValue placeholder="None (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None (top-level)</SelectItem>
                {(allTasks ?? [])
                  .filter((t) => (!task || t.id !== task.id) && !forbiddenIds.has(t.id))
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick a parent task to create a sub-task (Work Breakdown Structure).
            </p>
          </div>
          <div>
            <Label>Depends On (predecessors)</Label>
            {(() => {
              const candidates = (allTasks ?? []).filter(
                (t) => (!task || t.id !== task.id) && !forbiddenIds.has(t.id),
              );
              if (candidates.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground italic px-2 py-3 border rounded-md">
                    No other tasks in this project to depend on yet.
                  </p>
                );
              }
              return (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {candidates.map((t) => {
                    const checked = dependencyTaskIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer"
                        data-testid={`checkbox-dependency-${t.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDependency(t.id)}
                        />
                        <span>{t.title}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
            <p className="text-[11px] text-muted-foreground mt-1">
              This task can only start after all predecessors are complete. Arrows are drawn automatically on the Gantt.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <input
              id="task-billable"
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              data-testid="checkbox-task-billable"
            />
            <Label htmlFor="task-billable" className="cursor-pointer text-sm font-medium">
              Billable (hours count toward revenue/margin)
            </Label>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Default: on. Turn off for internal/training/non-billable tasks — hours are still recorded but won't count toward revenue.
            </span>
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
          <div>
            <div className="flex items-center justify-between">
              <Label>Progress</Label>
              <span className="text-xs font-mono text-muted-foreground">
                {status === "DONE" ? 100 : status === "TODO" ? 0 : progressPercent}%
              </span>
            </div>
            <Input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progressPercent}
              onChange={(e) => setProgressPercent(Number(e.target.value))}
              disabled={status === "DONE" || status === "TODO"}
              data-testid="input-task-progress"
            />
            {(status === "DONE" || status === "TODO") && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Progress is locked automatically based on status ({status === "DONE" ? "100%" : "0%"}). Change status to In Progress / Blocked to set it manually.
              </p>
            )}
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
