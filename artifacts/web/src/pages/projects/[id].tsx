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
  Pencil, AlertTriangle, Paperclip, X, PauseCircle,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { ClientShareDialog } from "@/pages/projects/ClientShareDialog";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials, canViewRaid, isSuperAdmin } from "@/lib/roles";
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
import ChangeRequestsTab from "./tabs/ChangeRequestsTab";
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

  const updateNote = useUpdateProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        qc.invalidateQueries({ queryKey: ["/projects"] });
      },
      onError: (e: any) => toast({ title: "Failed to update note", description: e?.message, variant: "destructive" }),
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

  const [noteDialog, setNoteDialog] = useState<{ open: boolean; value: string }>(
    { open: false, value: "" },
  );

  function openNoteDialog() {
    setNoteDialog({ open: true, value: project?.lastStatusReason ?? "" });
  }

  function saveNote() {
    updateNote.mutate(
      { id, data: { statusChangeReason: noteDialog.value.trim() } as any },
      {
        onSuccess: () => {
          setNoteDialog({ open: false, value: "" });
          toast({ title: "Note saved" });
        },
      },
    );
  }

  function clearNote() {
    updateNote.mutate(
      { id, data: { statusChangeReason: "" } as any },
      { onSuccess: () => toast({ title: "Note cleared" }) },
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

  const canChangeStatus = (user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) || user?.role === "PROJECT_MANAGER";
  const isCommercial = project.kind === "CLIENT";
  // While the project is PAUSE or COMPLETE the reason is required context (the
  // pause banner says it is shown below), so allow editing but not clearing it.
  const reasonLocked =
    project.status === ProjectStatus.PAUSE ||
    project.status === ProjectStatus.COMPLETE;

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
            {!project.lastStatusReason && (
              <Button
                variant="outline"
                size="sm"
                onClick={openNoteDialog}
                data-testid="button-add-note"
              >
                <Plus className="h-4 w-4 mr-1" /> Add note
              </Button>
            )}
          </div>
        )}
      </div>

      {project.status === ProjectStatus.PAUSE && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          <div className="flex items-start gap-3">
            <PauseCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="font-semibold">This project is paused</p>
                <p className="text-amber-200/80">
                  Work on this project is temporarily on hold. The team can keep
                  viewing data, but the project is not progressing while paused.
                  When you are ready to continue, change the status back to{" "}
                  <span className="font-medium">Active</span> using the Change
                  Status selector above. The reason for pausing is shown below.
                </p>
              </div>
              <div className="space-y-1 border-t border-amber-500/20 pt-2">
                <p className="font-semibold">Project ini sedang dijeda (Pause)</p>
                <p className="text-amber-200/80">
                  Pekerjaan pada project ini dihentikan sementara. Tim masih bisa
                  melihat data, tetapi project tidak berjalan selama dijeda. Bila
                  sudah siap melanjutkan, ubah status kembali ke{" "}
                  <span className="font-medium">Active</span> melalui pilihan
                  Change Status di atas. Alasan penjedaan ditampilkan di bawah.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isCommercial && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-200">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="font-semibold">Internal project &mdash; no client billing</p>
                <p className="text-sky-200/80">
                  This is an internal / non-commercial project, so client
                  billing, invoicing, and the signed handover document (BAST)
                  are not required to activate or complete it. The Financials
                  tab tracks internal cost only (no revenue or margin).
                </p>
              </div>
              <div className="space-y-1 border-t border-sky-500/20 pt-2">
                <p className="font-semibold">Project internal &mdash; tanpa tagihan klien</p>
                <p className="text-sky-200/80">
                  Ini project internal / non-komersial, sehingga Billing,
                  invoice, dan dokumen serah-terima (BAST) tidak diwajibkan
                  untuk mengaktifkan atau menyelesaikan project. Tab Financials
                  hanya memantau biaya internal (tanpa pendapatan atau margin).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {project.lastStatusReason && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="font-semibold">Last status change reason: </span>
              {project.lastStatusReason}
            </div>
            {canChangeStatus && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
                  onClick={openNoteDialog}
                  data-testid="button-edit-note"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                {!reasonLocked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
                    onClick={clearNote}
                    disabled={updateNote.isPending}
                    data-testid="button-clear-note"
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                )}
              </div>
            )}
          </div>
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

      <Dialog
        open={noteDialog.open}
        onOpenChange={(o) => setNoteDialog((s) => ({ ...s, open: o }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {project.lastStatusReason ? "Edit note" : "Add note"}
            </DialogTitle>
            <DialogDescription>
              This note shows on the project as the "Last status change reason".
              Update or clear it at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Note</Label>
            <Textarea
              value={noteDialog.value}
              onChange={(e) =>
                setNoteDialog((s) => ({ ...s, value: e.target.value }))
              }
              placeholder="e.g. Resumed after client confirmed scope"
              className="resize-none h-24"
              data-testid="note-textarea"
            />
          </div>
          <DialogFooter className="gap-2">
            {project.lastStatusReason && !reasonLocked && (
              <Button
                variant="outline"
                onClick={() => {
                  setNoteDialog({ open: false, value: "" });
                  clearNote();
                }}
                disabled={updateNote.isPending}
              >
                Remove note
              </Button>
            )}
            <Button
              onClick={saveNote}
              disabled={updateNote.isPending}
              data-testid="note-save"
            >
              {updateNote.isPending ? "Saving..." : "Save"}
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
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) || user?.role === "PROJECT_MANAGER") && (
            <TabsTrigger value="timesheets" data-testid="tab-trigger-timesheets">Timesheets</TabsTrigger>
          )}
          {isCommercial && canViewProjectFinancials(user?.role) && (
            <TabsTrigger value="billing" data-testid="tab-trigger-billing">Billing</TabsTrigger>
          )}
          {isCommercial && ((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
            (user?.role === "TECHNICAL_WRITER" && project.technicalWriterId === user?.id) ||
            (user?.role === "ADMIN_PROJECT" && project.adminProjectId === user?.id)) && (
            <TabsTrigger value="report" data-testid="tab-trigger-report">Report</TabsTrigger>
          )}
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
            (user?.role === "ADMIN_PROJECT" && project.adminProjectId === user?.id)) && (
            <TabsTrigger value="documents">Documents</TabsTrigger>
          )}
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) || user?.role === "PROJECT_MANAGER") && (
            <TabsTrigger value="survey">Customer Survey</TabsTrigger>
          )}
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id)) && (
            <TabsTrigger value="activity" data-testid="tab-trigger-activity">Activity</TabsTrigger>
          )}
          {canViewRaid(user?.role) && (
            <TabsTrigger value="raid" data-testid="tab-trigger-raid">RAID</TabsTrigger>
          )}
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id)) && (
            <TabsTrigger value="change-requests" data-testid="tab-trigger-change-requests">
              Change Requests
            </TabsTrigger>
          )}
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
            (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id)) && (
            <TabsTrigger value="workstreams" data-testid="tab-trigger-workstreams">
              Workstreams
            </TabsTrigger>
          )}
          {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
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
            <FinancialsTab projectId={id} isCommercial={isCommercial} />
          </TabsContent>
        )}
        <TabsContent value="resources" className="pt-4 m-0">
          <ResourcesTab projectId={id} project={project} />
        </TabsContent>
        <TabsContent value="expenses" className="pt-4 m-0">
          <ExpensesTab projectId={id} project={project} />
        </TabsContent>
        {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) || user?.role === "PROJECT_MANAGER") && (
          <TabsContent value="timesheets" className="pt-4 m-0">
            <TimesheetsTab projectId={id} project={project} />
          </TabsContent>
        )}
        {isCommercial && canViewProjectFinancials(user?.role) && (
          <TabsContent value="billing" className="pt-4 m-0">
            <BillingTab projectId={id} project={project} />
          </TabsContent>
        )}
        {isCommercial && (
          <TabsContent value="report" className="pt-4 m-0">
            <ReportTab projectId={id} project={project} />
          </TabsContent>
        )}
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
        {((user?.role === "MANAGEMENT" || isSuperAdmin(user?.role)) ||
          (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id)) && (
          <TabsContent value="change-requests" className="pt-4 m-0">
            <ChangeRequestsTab projectId={id} project={project} />
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

