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



import { type GanttTask, type DragMode, TASK_STATUS_BAR, TASK_STATUS_LABEL, startOfDay, addDays, diffDays } from "./gantt/utils";
import { GanttBar } from "./gantt/GanttBar";
import { DependencyArrows } from "./gantt/DependencyArrows";
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



export { TaskGanttChart };
export type { GanttTask };
export { GanttBar, DependencyArrows };
