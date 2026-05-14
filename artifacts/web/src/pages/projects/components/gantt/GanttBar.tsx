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



import { type GanttTask, type DragMode, TASK_STATUS_BAR, TASK_STATUS_LABEL, startOfDay, addDays, diffDays } from "./utils";
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


export { GanttBar };
