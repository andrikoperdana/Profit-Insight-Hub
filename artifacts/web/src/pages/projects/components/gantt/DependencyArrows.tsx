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



import { type GanttTask, startOfDay, addDays, diffDays } from "./utils";
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



export { DependencyArrows };
