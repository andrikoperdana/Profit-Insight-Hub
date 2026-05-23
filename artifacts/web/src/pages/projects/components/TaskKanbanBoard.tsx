import { useState, useMemo } from "react";
import {
  useUpdateTask,
  getListProjectTasksQueryKey,
  getListMyTasksQueryKey,
  type Task,
  type TaskStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { Clock, GripVertical, Pencil } from "lucide-react";

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "To Do", accent: "border-t-slate-500" },
  { status: "IN_PROGRESS", label: "In Progress", accent: "border-t-blue-500" },
  { status: "BLOCKED", label: "Blocked", accent: "border-t-amber-500" },
  { status: "DONE", label: "Done", accent: "border-t-emerald-500" },
];

interface Props {
  projectId: string;
  tasks: Task[];
  isManager: boolean;
  currentUserId?: string;
  onEditTask?: (task: Task) => void;
}

export function TaskKanbanBoard({ projectId, tasks, isManager, currentUserId, onEditTask }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  const update = useUpdateTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectTasksQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getListMyTasksQueryKey() });
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Failed to update status", description: e?.message });
        qc.invalidateQueries({ queryKey: getListProjectTasksQueryKey(projectId) });
      },
    },
  });

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], BLOCKED: [], DONE: [] };
    for (const t of tasks) {
      const s = (t.status as TaskStatus) ?? "TODO";
      if (map[s]) map[s].push(t);
    }
    return map;
  }, [tasks]);

  function canDragTask(t: Task): boolean {
    if (isManager) return true;
    const assignees =
      ((t as any).assignees as { userId: string }[] | undefined) ??
      (t.assigneeId ? [{ userId: t.assigneeId }] : []);
    return assignees.some((a) => a.userId === currentUserId);
  }

  function handleDrop(targetStatus: TaskStatus) {
    setDragOverCol(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === targetStatus) return;
    if (!canDragTask(task)) {
      toast({ variant: "destructive", title: "Not allowed", description: "Only assignees or the project manager can change status." });
      return;
    }
    // Optimistic update of the React Query cache so the card jumps immediately.
    qc.setQueryData<Task[]>(getListProjectTasksQueryKey(projectId), (prev) =>
      prev?.map((t) => (t.id === id ? { ...t, status: targetStatus } : t)) ?? prev,
    );
    update.mutate({ taskId: id, data: { status: targetStatus } });
  }

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 p-4">
      {COLUMNS.map((col) => {
        const colTasks = grouped[col.status];
        const isOver = dragOverCol === col.status;
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverCol !== col.status) setDragOverCol(col.status);
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the column itself (not its children)
              if (e.currentTarget === e.target) setDragOverCol((s) => (s === col.status ? null : s));
            }}
            onDrop={() => handleDrop(col.status)}
            className={`rounded-lg border-2 border-t-4 ${col.accent} bg-muted/20 flex flex-col min-h-[300px] transition-colors ${isOver ? "border-primary/60 bg-primary/5" : "border-border"}`}
            data-testid={`kanban-col-${col.status}`}
          >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between sticky top-0 bg-muted/40 backdrop-blur-sm rounded-t-md">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{col.label}</span>
              <Badge variant="outline" className="text-[10px] h-5 px-2 font-mono">{colTasks.length}</Badge>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {colTasks.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground/60 italic py-6 select-none">Drop tasks here</div>
              ) : (
                colTasks.map((t) => {
                  const draggable = canDragTask(t);
                  const assignees =
                    ((t as any).assignees as { userId: string; name: string }[] | undefined) ??
                    (t.assigneeId && t.assigneeName ? [{ userId: t.assigneeId, name: t.assigneeName }] : []);
                  const progress = (t as any).progressPercent ?? 0;
                  const overdue =
                    t.endDate &&
                    col.status !== "DONE" &&
                    new Date(t.endDate) < new Date(new Date().toDateString());
                  return (
                    <div
                      key={t.id}
                      draggable={draggable}
                      onDragStart={() => setDraggingId(t.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverCol(null);
                      }}
                      className={`group rounded-md border bg-card p-3 shadow-sm transition-all ${draggable ? "cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow" : "cursor-not-allowed opacity-90"} ${draggingId === t.id ? "opacity-40" : ""}`}
                      data-testid={`kanban-card-${t.id}`}
                    >
                      <div className="flex items-start gap-1.5">
                        {draggable && (
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0" aria-hidden />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm leading-snug break-words">{t.title}</div>
                            {isManager && onEditTask && (
                              <button
                                type="button"
                                onClick={() => onEditTask(t)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary shrink-0"
                                aria-label="Edit task"
                                data-testid={`kanban-edit-${t.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {(t as any).billable === false && (
                            <Badge variant="outline" className="mt-1 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[9px] h-4 px-1.5">
                              Non-billable
                            </Badge>
                          )}
                          {assignees.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {assignees.slice(0, 3).map((a) => (
                                <Badge key={a.userId} variant="outline" className="bg-muted/40 font-normal text-[10px] h-5 px-1.5">
                                  {a.name}
                                </Badge>
                              ))}
                              {assignees.length > 3 && (
                                <Badge variant="outline" className="bg-muted/40 font-normal text-[10px] h-5 px-1.5">
                                  +{assignees.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                            <span className={overdue ? "text-destructive font-medium" : ""}>
                              {t.endDate ? formatDate(t.endDate) : "No due date"}
                            </span>
                            {(t.loggedHours ?? 0) > 0 && (
                              <span className="flex items-center gap-0.5 font-mono">
                                <Clock className="h-2.5 w-2.5" />
                                {(t.loggedHours ?? 0).toFixed(1)}h
                              </span>
                            )}
                          </div>
                          {progress > 0 && progress < 100 && (
                            <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full transition-all ${progress >= 50 ? "bg-primary" : "bg-amber-500"}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
