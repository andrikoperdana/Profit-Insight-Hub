import { TaskGanttChart, type GanttTask } from "../components/Gantt";
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


function TimelineTab({ projectId, project }: { projectId: string; project: any }) {
  const { data: resources, isLoading: loadingRes } = useListProjectResources(projectId);
  const { data: timesheets, isLoading: loadingTs } = useListTimesheets({
    projectId,
    status: "APPROVED",
  });
  const { data: tasks, isLoading: loadingTasks } = useListProjectTasks(projectId, {});

  if (loadingRes || loadingTs || loadingTasks) return <LoadingPage />;

  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate = project.endDate ? new Date(project.endDate) : null;
  const today = new Date();

  // Aggregate approved hours per resource
  const hoursByUser = new Map<string, number>();
  for (const t of timesheets ?? []) {
    hoursByUser.set(t.userId, (hoursByUser.get(t.userId) ?? 0) + (t.hours ?? 0));
  }

  const hasTimeline = !!(startDate && endDate);
  const totalSpan = hasTimeline ? Math.max(1, endDate!.getTime() - startDate!.getTime()) : 1;

  const overdueProject =
    endDate &&
    today.getTime() > endDate.getTime() &&
    project.status !== "CLOSED" &&
    project.status !== "COMPLETE";

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Project Schedule</CardTitle>
          <CardDescription>
            {hasTimeline
              ? `${formatDate(project.startDate)} → ${formatDate(project.endDate)}`
              : "Set start and end dates to enable Gantt visualization."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasTimeline ? (
            <div className="space-y-3">
              {/* Project bar with milestone markers */}
              <div className="relative h-10 rounded-md bg-muted/40 border border-border overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 bg-primary/40"
                  style={{
                    left: 0,
                    width: `${Math.min(100, Math.max(0, ((today.getTime() - startDate!.getTime()) / totalSpan) * 100))}%`,
                  }}
                />
                <div className="relative h-full flex items-center justify-between px-3 text-xs">
                  <span className="font-medium">{project.code}</span>
                  <span className="text-muted-foreground">{project.name}</span>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Start · {formatDate(project.startDate)}</span>
                <span>Today</span>
                <span>End · {formatDate(project.endDate)}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  Milestone: Complete @ {formatDate(project.endDate)}
                </Badge>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                  Milestone: Closed (after BAST + Invoice)
                </Badge>
                {overdueProject && (
                  <Badge variant="destructive">
                    <AlertCircle className="h-3 w-3 mr-1" /> Past target end date
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No schedule set.</p>
          )}
        </CardContent>
      </Card>

      <TaskGanttChart
        projectId={projectId}
        tasks={(tasks ?? []) as unknown as GanttTask[]}
        projectStart={startDate}
        projectEnd={endDate}
      />

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Resource Assignments</CardTitle>
          <CardDescription>
            Per-individual progress: approved hours vs estimated mandays
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(resources ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources assigned to this project yet.</p>
          ) : (
            <div className="space-y-4">
              {(resources ?? []).map((r: any) => {
                const planned = r.plannedMandays ?? 0;
                const actualHours = hoursByUser.get(r.userId) ?? 0;
                const actualMd = actualHours / 8;
                const pct = planned > 0 ? Math.min(200, (actualMd / planned) * 100) : 0;
                const overrun = pct > 100;
                const barColor = overrun ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";

                return (
                  <div key={r.id ?? r.userId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{r.userName ?? "—"}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {r.roleInProject ?? r.userRole ?? ""}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {actualMd.toFixed(1)} / {planned.toFixed(1)} md
                        <span className={`ml-2 font-semibold ${overrun ? "text-destructive" : "text-foreground"}`}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`absolute top-0 bottom-0 left-0 ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                      {overrun && (
                        <div
                          className="absolute top-0 bottom-0 bg-destructive/40"
                          style={{ left: "100%", width: `${Math.min(100, pct - 100)}%` }}
                        />
                      )}
                    </div>
                    {overrun && (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Assignment exceeded planned mandays by {(pct - 100).toFixed(0)}%
                      </p>
                    )}
                    {endDate && actualMd < planned && today > endDate && (
                      <p className="text-[11px] text-amber-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Past target end date with {(planned - actualMd).toFixed(1)} md remaining
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TimelineTab;
