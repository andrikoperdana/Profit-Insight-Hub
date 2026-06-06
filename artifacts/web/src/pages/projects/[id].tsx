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
import { ClientShareDialog } from "@/pages/projects/ClientShareDialog";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials, canViewRaid } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SurveyTab from "./SurveyTab";
import TasksTab from "./TasksTab";
import BillingTab from "./BillingTab";
import OverviewTab from "./tabs/OverviewTab";
import TimelineTab from "./tabs/TimelineTab";
import FinancialsTab from "./tabs/FinancialsTab";
import ResourcesTab from "./tabs/ResourcesTab";
import ExpensesTab from "./tabs/ExpensesTab";
import TimesheetsTab from "./tabs/TimesheetsTab";
import ReportTab from "./tabs/ReportTab";
import DocumentsTab from "./tabs/DocumentsTab";
import ActivityTab from "./tabs/ActivityTab";
import RaidTab from "./tabs/RaidTab";
import WorkstreamsTab from "./tabs/WorkstreamsTab";
import ClosingTab from "./tabs/ClosingTab";
import DraftCompletionCard from "./components/DraftCompletionCard";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: project, isLoading } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !!id }
  });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        qc.invalidateQueries({ queryKey: ["/projects"] });
        toast({ title: "Status updated" });
      },
      onError: (e: any) => toast({ title: "Failed to update status", description: e?.message, variant: "destructive" }),
    },
  });

  const [reasonDialog, setReasonDialog] = useState<{
    open: boolean;
    target: ProjectStatus | null;
    reason: string;
  }>({ open: false, target: null, reason: "" });

  function handleStatusChange(next: ProjectStatus) {
    if (!project || next === project.status) return;
    if (next === ProjectStatus.PAUSE || next === ProjectStatus.COMPLETE) {
      setReasonDialog({ open: true, target: next, reason: "" });
      return;
    }
    updateProject.mutate({ id, data: { status: next } as any });
  }

  function confirmStatusChange() {
    if (!reasonDialog.target) return;
    const reason = reasonDialog.reason.trim();
    if (!reason) return;
    updateProject.mutate(
      {
        id,
        data: { status: reasonDialog.target, statusChangeReason: reason } as any,
      },
      {
        onSuccess: () =>
          setReasonDialog({ open: false, target: null, reason: "" }),
      },
    );
  }

  if (isLoading) return <LoadingPage />;
  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="The project you are looking for does not exist or you do not have access."
      />
    );
  }

  const canChangeStatus = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span className="text-muted-foreground/40">/</span>
        <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-none">{project.code}</span>
      </nav>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild className="rounded-lg">
            <Link href="/projects" aria-label="Back to Projects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-1">SPK/PO: {project.code}</p>
          </div>
        </div>
        {canChangeStatus && (
          <div className="flex items-center gap-2 flex-wrap">
            {project.status !== ProjectStatus.DRAFT && <ClientShareDialog projectId={project.id} />}
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Change Status</span>
            <Select
              value={project.status}
              onValueChange={(v) => handleStatusChange(v as ProjectStatus)}
              disabled={updateProject.isPending || project.status === ProjectStatus.CLOSED}
            >
              <SelectTrigger className="w-[180px]" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProjectStatus.OBSERVATION}>Observation</SelectItem>
                <SelectItem value={ProjectStatus.ACTIVE}>Active</SelectItem>
                <SelectItem value={ProjectStatus.PAUSE}>Pause</SelectItem>
                <SelectItem value={ProjectStatus.COMPLETE}>Complete</SelectItem>
                <SelectItem value={ProjectStatus.NO_NEED_CONSULTANT}>No Need Consultant</SelectItem>
                <SelectItem value={ProjectStatus.CLOSED} disabled>Closed (auto)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {project.lastStatusReason && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          <span className="font-semibold">Last status change reason: </span>
          {project.lastStatusReason}
        </div>
      )}

      <Dialog
        open={reasonDialog.open}
        onOpenChange={(o) =>
          setReasonDialog((s) => ({ ...s, open: o, reason: o ? s.reason : "" }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change status to {reasonDialog.target}
            </DialogTitle>
            <DialogDescription>
              Provide a reason. This will be visible on the project and recorded
              in activity history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason *</Label>
            <Textarea
              value={reasonDialog.reason}
              onChange={(e) =>
                setReasonDialog((s) => ({ ...s, reason: e.target.value }))
              }
              placeholder={
                reasonDialog.target === "PAUSE"
                  ? "e.g. Waiting for client clarification on scope"
                  : "e.g. All deliverables accepted by client"
              }
              className="resize-none h-24"
              data-testid="status-reason-textarea"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setReasonDialog({ open: false, target: null, reason: "" })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={confirmStatusChange}
              disabled={
                !reasonDialog.reason.trim() || updateProject.isPending
              }
              data-testid="status-reason-confirm"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {project.status === ProjectStatus.DRAFT && canChangeStatus && (
        <DraftCompletionCard project={project} />
      )}

      <Tabs defaultValue={(() => {
        if (typeof window === "undefined") return "overview";
        const allowed = new Set([
          "overview", "timeline", "tasks", "financials", "resources",
          "expenses", "billing", "report", "documents", "survey",
          "activity", "raid", "workstreams", "closing", "timesheets",
        ]);
        const t = new URLSearchParams(window.location.search).get("tab");
        return t && allowed.has(t) ? t : "overview";
      })()}>
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-trigger-tasks">Tasks</TabsTrigger>
          {canViewProjectFinancials(user?.role) && (
            <TabsTrigger value="financials">Financials</TabsTrigger>
          )}
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-trigger-expenses">Expenses</TabsTrigger>
          {(user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER") && (
            <TabsTrigger value="timesheets" data-testid="tab-trigger-timesheets">Timesheets</TabsTrigger>
          )}
          {canViewProjectFinancials(user?.role) && (
            <TabsTrigger value="billing" data-testid="tab-trigger-billing">Billing</TabsTrigger>
          )}
          {(user?.role === "MANAGEMENT" ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
            (user?.role === "TECHNICAL_WRITER" && project.technicalWriterId === user?.id) ||
            (user?.role === "ADMIN_PROJECT" && project.adminProjectId === user?.id)) && (
            <TabsTrigger value="report" data-testid="tab-trigger-report">Report</TabsTrigger>
          )}
          {(user?.role === "MANAGEMENT" ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
            (user?.role === "ADMIN_PROJECT" && project.adminProjectId === user?.id)) && (
            <TabsTrigger value="documents">Documents</TabsTrigger>
          )}
          {(user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER") && (
            <TabsTrigger value="survey">Customer Survey</TabsTrigger>
          )}
          {(user?.role === "MANAGEMENT" ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id)) && (
            <TabsTrigger value="activity" data-testid="tab-trigger-activity">Activity</TabsTrigger>
          )}
          {canViewRaid(user?.role) && (
            <TabsTrigger value="raid" data-testid="tab-trigger-raid">RAID</TabsTrigger>
          )}
          {(user?.role === "MANAGEMENT" ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id)) && (
            <TabsTrigger value="workstreams" data-testid="tab-trigger-workstreams">
              Workstreams
            </TabsTrigger>
          )}
          {(user?.role === "MANAGEMENT" ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
            (user?.role === "ADMIN_PROJECT" && project.adminProjectId === user?.id)) && (
            <TabsTrigger value="closing" data-testid="tab-trigger-closing">Closing</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="pt-4 m-0">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="timeline" className="pt-4 m-0">
          <TimelineTab projectId={id} project={project} />
        </TabsContent>
        <TabsContent value="tasks" className="pt-4 m-0">
          <TasksTab projectId={id} project={project} />
        </TabsContent>
        {canViewProjectFinancials(user?.role) && (
          <TabsContent value="financials" className="pt-4 m-0">
            <FinancialsTab projectId={id} />
          </TabsContent>
        )}
        <TabsContent value="resources" className="pt-4 m-0">
          <ResourcesTab projectId={id} project={project} />
        </TabsContent>
        <TabsContent value="expenses" className="pt-4 m-0">
          <ExpensesTab projectId={id} project={project} />
        </TabsContent>
        {(user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER") && (
          <TabsContent value="timesheets" className="pt-4 m-0">
            <TimesheetsTab projectId={id} project={project} />
          </TabsContent>
        )}
        {canViewProjectFinancials(user?.role) && (
          <TabsContent value="billing" className="pt-4 m-0">
            <BillingTab projectId={id} project={project} />
          </TabsContent>
        )}
        <TabsContent value="report" className="pt-4 m-0">
          <ReportTab projectId={id} project={project} />
        </TabsContent>
        <TabsContent value="documents" className="pt-4 m-0">
          <DocumentsTab projectId={id} projectStatus={project.status} />
        </TabsContent>
        <TabsContent value="survey" className="pt-4 m-0">
          <SurveyTab projectId={id} />
        </TabsContent>
        <TabsContent value="activity" className="pt-4 m-0">
          <ActivityTab projectId={id} />
        </TabsContent>
        {canViewRaid(user?.role) && (
          <TabsContent value="raid" className="pt-4 m-0">
            <RaidTab projectId={id} project={project} />
          </TabsContent>
        )}
        <TabsContent value="workstreams" className="pt-4 m-0">
          <WorkstreamsTab projectId={id} project={project} />
        </TabsContent>
        <TabsContent value="closing" className="pt-4 m-0">
          <ClosingTab projectId={id} project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

