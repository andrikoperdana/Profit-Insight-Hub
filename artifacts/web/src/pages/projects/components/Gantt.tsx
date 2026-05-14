import { useParams, Link } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  useGetProject,
  useUpdateTask,
  getListProjectTasksQueryKey,
  useGetProjectFinancials,
  useUpdateProject,
  useUpdateProjectReport,
  useListProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
  useListProjectResources,
  useAddProjectResource,
  useProposeProjectResource,
  useRemoveProjectResource,
  getListProjectResourcesQueryKey,
  useListAvailableUsers,
  useListActiveAllUsers,
  useListUsersUnderSupervision,
  useListClients,
  useListTimesheets,
  useListProjectTasks,
  useListProjectExpenses,
  useAddProjectExpense,
  useRemoveProjectExpense,
  useApproveProjectExpense,
  useRejectProjectExpense,
  getListProjectExpensesQueryKey,
  getListClientsQueryKey,
  getGetProjectQueryKey,
  getGetProjectFinancialsQueryKey,
  getListProjectDocumentsQueryKey,
  ProjectStatus,
  DocumentType,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Building2, User, Calendar, DollarSign, TrendingUp, TrendingDown,
  Activity, Flame, Upload, FileText, Trash2, CheckCircle2, AlertCircle, Plus,
  Pencil, AlertTriangle, Paperclip, X,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";


export type GanttTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  startDate?: string | null;
  endDate?: string | null;
  assigneeName?: string | null;
  loggedHours?: number;
  dependencies?: { taskId: string; dependsOnTaskId: string }[];
  parentTaskId?: string | null;
};

const TASK_STATUS_BAR: Record<GanttTask["status"], string> = {
  TODO: "bg-slate-500/70 border-slate-400",
  IN_PROGRESS: "bg-primary/80 border-primary",
  BLOCKED: "bg-destructive/80 border-destructive",
  DONE: "bg-emerald-500/80 border-emerald-500",
};

const TASK_STATUS_LABEL: Record<GanttTask["status"], string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

function TaskGanttChart({
  projectId,
  tasks,
  projectStart,
  projectEnd,
}: {
  projectId: string;
  tasks: GanttTask[];
  projectStart: Date | null;
  projectEnd: Date | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isManager = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectTasksQueryKey(projectId) });
      },
      onError: (e: any) =>
        toast({
          title: "Failed to update task",
          description: e?.message ?? "Please try again",
          variant: "destructive",
        }),
    },
  });

  // Local override of dates while a drag/resize is in flight, keyed by task id.
  const [localDates, setLocalDates] = useState<Record<string, { start: string; end: string }>>({});
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const taskRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [arrowTick, setArrowTick] = useState(0);

  const effectiveTask = (t: GanttTask): GanttTask => {
    const o = localDates[t.id];
    if (!o) return t;
    return { ...t, startDate: o.start, endDate: o.end };
  };

  const tasksEffective = tasks.map(effectiveTask);
  const scheduled = tasksEffective.filter((t) => t.startDate && t.endDate);
  const unscheduled = tasksEffective.filter((t) => !t.startDate || !t.endDate);

  // Compute date range that contains all task bars + project bounds
  const allDates: Date[] = [];
  if (projectStart) allDates.push(projectStart);
  if (projectEnd) allDates.push(projectEnd);
  for (const t of scheduled) {
    allDates.push(new Date(t.startDate!));
    allDates.push(new Date(t.endDate!));
  }
  const today = new Date();
  allDates.push(today);

  const hasRange = allDates.length > 0 && scheduled.length > 0;
  const rangeStart = hasRange
    ? startOfDay(new Date(Math.min(...allDates.map((d) => d.getTime()))))
    : startOfDay(today);
  const rangeEndRaw = hasRange
    ? startOfDay(new Date(Math.max(...allDates.map((d) => d.getTime()))))
    : startOfDay(today);
  // Pad 1 day so end-day bars don't sit flush against the right edge
  const rangeEnd = addDays(rangeEndRaw, 1);
  const totalDays = Math.max(1, diffDays(rangeEnd, rangeStart));

  // Pick gridline interval: weekly if span ≤ ~12 weeks, else monthly
  const useWeekly = totalDays <= 90;
  const gridLines: { date: Date; label: string }[] = [];
  if (hasRange) {
    if (useWeekly) {
      // Snap to next Monday
      const cursor = new Date(rangeStart);
      const dow = cursor.getDay();
      const offsetToMon = (8 - dow) % 7;
      cursor.setDate(cursor.getDate() + offsetToMon);
      while (cursor < rangeEnd) {
        gridLines.push({
          date: new Date(cursor),
          label: cursor.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        });
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
      while (cursor < rangeEnd) {
        gridLines.push({
          date: new Date(cursor),
          label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  function pctFromStart(d: Date): number {
    return (diffDays(d, rangeStart) / totalDays) * 100;
  }

  const todayPct = hasRange ? pctFromStart(today) : 0;
  const todayInRange = hasRange && today >= rangeStart && today < rangeEnd;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Task Gantt</CardTitle>
        <CardDescription>
          {tasks.length === 0
            ? "Create tasks in the Tasks tab with start and end dates to see them here."
            : `${scheduled.length} scheduled · ${unscheduled.length} without dates · view ${useWeekly ? "weekly" : "monthly"}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks have both a start and end date yet. Set dates on the Tasks tab to plot them on the Gantt.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Header axis */}
              <div className="flex border-b border-border pb-1 mb-2 text-[10px] text-muted-foreground">
                <div className="shrink-0 w-[260px] pr-3 font-medium uppercase tracking-wide">
                  Task
                </div>
                <div className="relative flex-1 h-5">
                  {gridLines.map((g, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/60 pl-1"
                      style={{ left: `${pctFromStart(g.date)}%` }}
                    >
                      <span className="whitespace-nowrap">{g.label}</span>
                    </div>
                  ))}
                  <div className="absolute left-0 top-0 text-[10px]">
                    {rangeStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </div>
                </div>
              </div>

              {/* Task rows */}
              <div className="space-y-1.5 relative" ref={lanesRef}>
                {/* Today vertical line spanning all rows */}
                {todayInRange && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-amber-400/80 z-10 pointer-events-none"
                    style={{ left: `calc(260px + (100% - 260px) * ${todayPct / 100})` }}
                    title={`Today · ${formatDate(today.toISOString())}`}
                  />
                )}

                {scheduled
                  .slice()
                  .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())
                  .map((t) => {
                    const s = new Date(t.startDate!);
                    const e = new Date(t.endDate!);
                    const left = pctFromStart(s);
                    const width = Math.max(0.5, pctFromStart(addDays(e, 1)) - left);
                    const overdue = t.status !== "DONE" && e < startOfDay(today);
                    return (
                      <div key={t.id} className="flex items-center text-xs" data-testid={`gantt-row-${t.id}`}>
                        <div className="shrink-0 w-[260px] pr-3 truncate" title={t.title}>
                          <div className="font-medium truncate">{t.title}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {t.assigneeName ?? "Unassigned"} · {TASK_STATUS_LABEL[t.status]}
                          </div>
                        </div>
                        <div
                          className="relative flex-1 h-7 rounded bg-muted/30"
                          ref={(el) => {
                            if (el) taskRowRefs.current.set(t.id, el);
                            else taskRowRefs.current.delete(t.id);
                          }}
                          data-task-track={t.id}
                        >
                          {/* Light gridlines inside */}
                          {gridLines.map((g, i) => (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0 border-l border-border/40"
                              style={{ left: `${pctFromStart(g.date)}%` }}
                            />
                          ))}
                          <GanttBar
                            task={t}
                            left={left}
                            width={width}
                            overdue={overdue}
                            isManager={isManager}
                            rangeStart={rangeStart}
                            totalDays={totalDays}
                            getTrackEl={() => taskRowRefs.current.get(t.id) ?? null}
                            onPreview={(start, end) => {
                              setLocalDates((prev) => ({
                                ...prev,
                                [t.id]: { start, end },
                              }));
                              setArrowTick((x) => x + 1);
                            }}
                            onCommit={(start, end, originalStart, originalEnd) => {
                              if (start === originalStart && end === originalEnd) {
                                setLocalDates((prev) => {
                                  const n = { ...prev };
                                  delete n[t.id];
                                  return n;
                                });
                                return;
                              }
                              // Warn if drop violates a dependency (server doesn't enforce timing).
                              const deps = (t.dependencies ?? []).map((d) => d.dependsOnTaskId);
                              const violated = deps.some((depId) => {
                                const dep = tasks.find((x) => x.id === depId);
                                if (!dep || !dep.endDate) return false;
                                const eff = effectiveTask(dep);
                                if (!eff.endDate) return false;
                                return new Date(start) < addDays(new Date(eff.endDate), 1);
                              });
                              if (violated) {
                                toast({
                                  title: "Schedule violates a dependency",
                                  description: `"${t.title}" now starts before a predecessor finishes. The change was saved — review the dependencies.`,
                                });
                              }
                              updateTask.mutate(
                                {
                                  taskId: t.id,
                                  data: { startDate: start, endDate: end } as any,
                                },
                                {
                                  onSettled: () => {
                                    setLocalDates((prev) => {
                                      const n = { ...prev };
                                      delete n[t.id];
                                      return n;
                                    });
                                    setArrowTick((x) => x + 1);
                                  },
                                },
                              );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}

                {/* Dependency arrows overlay */}
                <DependencyArrows
                  tick={arrowTick}
                  tasks={scheduled}
                  taskRowRefs={taskRowRefs}
                  lanesRef={lanesRef}
                />
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 pt-4 mt-3 border-t border-border text-[10px] text-muted-foreground">
                {(Object.keys(TASK_STATUS_LABEL) as GanttTask["status"][]).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className={`inline-block h-2.5 w-4 rounded-sm border ${TASK_STATUS_BAR[s]}`} />
                    {TASK_STATUS_LABEL[s]}
                  </span>
                ))}
                {todayInRange && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-px bg-amber-400" /> Today
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {unscheduled.length > 0 && (
          <div className="mt-6 rounded-md border border-dashed border-border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Unscheduled ({unscheduled.length}) — set start &amp; end dates on the Tasks tab
            </div>
            <ul className="text-xs space-y-1">
              {unscheduled.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{t.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {t.assigneeName ?? "Unassigned"} · {TASK_STATUS_LABEL[t.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type DragMode = "move" | "resize-start" | "resize-end";

function GanttBar({
  task,
  left,
  width,
  overdue,
  isManager,
  rangeStart,
  totalDays,
  getTrackEl,
  onPreview,
  onCommit,
}: {
  task: GanttTask;
  left: number;
  width: number;
  overdue: boolean;
  isManager: boolean;
  rangeStart: Date;
  totalDays: number;
  getTrackEl: () => HTMLDivElement | null;
  onPreview: (start: string, end: string) => void;
  onCommit: (start: string, end: string, originalStart: string, originalEnd: string) => void;
}) {
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    pxPerDay: number;
    origStart: Date;
    origEnd: Date;
    pointerId: number;
    target: HTMLDivElement;
  } | null>(null);

  function isoDay(d: Date): string {
    const x = startOfDay(d);
    const yy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function pickMode(e: React.PointerEvent<HTMLDivElement>): DragMode {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const HANDLE = 8;
    if (rect.width >= 24 && x <= HANDLE) return "resize-start";
    if (rect.width >= 24 && x >= rect.width - HANDLE) return "resize-end";
    return "move";
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isManager) return;
    if (!task.startDate || !task.endDate) return;
    const track = getTrackEl();
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    if (trackRect.width <= 0) return;
    const pxPerDay = trackRect.width / totalDays;
    const mode = pickMode(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    dragRef.current = {
      mode,
      startX: e.clientX,
      pxPerDay,
      origStart: startOfDay(new Date(task.startDate)),
      origEnd: startOfDay(new Date(task.endDate)),
      pointerId: e.pointerId,
      target: e.currentTarget,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dDays = Math.round(dx / d.pxPerDay);
    let newStart = d.origStart;
    let newEnd = d.origEnd;
    if (d.mode === "move") {
      newStart = addDays(d.origStart, dDays);
      newEnd = addDays(d.origEnd, dDays);
    } else if (d.mode === "resize-start") {
      newStart = addDays(d.origStart, dDays);
      if (newStart > d.origEnd) newStart = d.origEnd;
    } else {
      newEnd = addDays(d.origEnd, dDays);
      if (newEnd < d.origStart) newEnd = d.origStart;
    }
    onPreview(isoDay(newStart), isoDay(newEnd));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    try { d.target.releasePointerCapture(d.pointerId); } catch {}
    const dx = e.clientX - d.startX;
    const dDays = Math.round(dx / d.pxPerDay);
    let newStart = d.origStart;
    let newEnd = d.origEnd;
    if (d.mode === "move") {
      newStart = addDays(d.origStart, dDays);
      newEnd = addDays(d.origEnd, dDays);
    } else if (d.mode === "resize-start") {
      newStart = addDays(d.origStart, dDays);
      if (newStart > d.origEnd) newStart = d.origEnd;
    } else {
      newEnd = addDays(d.origEnd, dDays);
      if (newEnd < d.origStart) newEnd = d.origStart;
    }
    dragRef.current = null;
    onCommit(isoDay(newStart), isoDay(newEnd), isoDay(d.origStart), isoDay(d.origEnd));
  }

  const e = new Date(task.endDate!);
  const s = new Date(task.startDate!);
  const cursor = !isManager
    ? "default"
    : "grab";

  return (
    <div
      className={`absolute top-1 bottom-1 rounded border ${TASK_STATUS_BAR[task.status]} ${overdue ? "ring-1 ring-destructive/60" : ""} group`}
      style={{ left: `${left}%`, width: `${width}%`, cursor, touchAction: "none" }}
      title={`${task.title}\n${formatDate(task.startDate!)} → ${formatDate(task.endDate!)}\nStatus: ${TASK_STATUS_LABEL[task.status]}${overdue ? " (overdue)" : ""}${isManager ? "\nDrag body to shift, edges to resize" : ""}`}
      data-testid={`gantt-bar-${task.id}`}
      data-task-bar={task.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {isManager && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-l"
            style={{ touchAction: "none" }}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-r"
            style={{ touchAction: "none" }}
          />
        </>
      )}
      <div className="h-full px-2 flex items-center text-[10px] font-medium text-white/95 truncate select-none pointer-events-none">
        {Math.max(1, diffDays(addDays(e, 1), s))}d
      </div>
    </div>
  );
}

function DependencyArrows({
  tick,
  tasks,
  taskRowRefs,
  lanesRef,
}: {
  tick: number;
  tasks: GanttTask[];
  taskRowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  lanesRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const [paths, setPaths] = useState<Array<{ d: string; key: string }>>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const lanes = lanesRef.current;
    if (!lanes) return;
    const lanesRect = lanes.getBoundingClientRect();
    const computed: Array<{ d: string; key: string }> = [];
    for (const t of tasks) {
      const deps = t.dependencies ?? [];
      if (deps.length === 0) continue;
      const toTrack = taskRowRefs.current.get(t.id);
      if (!toTrack) continue;
      const toBar = toTrack.querySelector(`[data-task-bar="${t.id}"]`) as HTMLElement | null;
      if (!toBar) continue;
      const toRect = toBar.getBoundingClientRect();
      const toX = toRect.left - lanesRect.left;
      const toY = toRect.top - lanesRect.top + toRect.height / 2;
      for (const d of deps) {
        const fromTrack = taskRowRefs.current.get(d.dependsOnTaskId);
        if (!fromTrack) continue;
        const fromBar = fromTrack.querySelector(`[data-task-bar="${d.dependsOnTaskId}"]`) as HTMLElement | null;
        if (!fromBar) continue;
        const fromRect = fromBar.getBoundingClientRect();
        const fromX = fromRect.right - lanesRect.left;
        const fromY = fromRect.top - lanesRect.top + fromRect.height / 2;
        // Elbow path: from(x,y) → right + 6 → vertical to toY → horizontal to toX-6 → arrow into toX
        const midX = Math.max(fromX + 8, toX - 8);
        const path = `M ${fromX} ${fromY} L ${fromX + 6} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 4} ${toY}`;
        computed.push({ d: path, key: `${d.dependsOnTaskId}->${t.id}` });
      }
    }
    setPaths(computed);
    setSize({ w: lanesRect.width, h: lanesRect.height });
  }, [tick, tasks, lanesRef, taskRowRefs]);

  useEffect(() => {
    const lanes = lanesRef.current;
    if (!lanes) return;
    function bump() {
      const el = lanesRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      // Force a path recompute (paths depend on bar bounding rects, not just size).
      setPaths((prev) => prev.slice());
    }
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(bump) : null;
    ro?.observe(lanes);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      ro?.disconnect();
    };
  }, [lanesRef]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size.w}
      height={size.h}
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="gantt-arrow-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          stroke="hsl(var(--primary))"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          fill="none"
          markerEnd="url(#gantt-arrow-head)"
        />
      ))}
    </svg>
  );
}


export { TaskGanttChart, GanttBar, DependencyArrows };
