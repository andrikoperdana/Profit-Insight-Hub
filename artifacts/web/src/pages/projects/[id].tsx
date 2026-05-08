import { useParams, Link } from "wouter";
import { useState, useRef } from "react";
import {
  useGetProject,
  useGetProjectFinancials,
  useUpdateProject,
  useUpdateProjectReport,
  useListProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
  useListProjectResources,
  useAddProjectResource,
  useRemoveProjectResource,
  getListProjectResourcesQueryKey,
  useListAvailableUsers,
  useListClients,
  useListTimesheets,
  useListProjectExpenses,
  useAddProjectExpense,
  useRemoveProjectExpense,
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
  Pencil, AlertTriangle,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
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
import SurveyTab from "./SurveyTab";
import TasksTab from "./TasksTab";
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
          <div className="flex items-center gap-2">
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

      <Tabs defaultValue="overview">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-trigger-tasks">Tasks</TabsTrigger>
          {canViewProjectFinancials(user?.role) && (
            <TabsTrigger value="financials">Financials</TabsTrigger>
          )}
          <TabsTrigger value="resources">Resources</TabsTrigger>
          {(user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER") && (
            <TabsTrigger value="expenses" data-testid="tab-trigger-expenses">Expenses</TabsTrigger>
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
        {(user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER") && (
          <TabsContent value="expenses" className="pt-4 m-0">
            <ExpensesTab projectId={id} project={project} />
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
      </Tabs>
    </div>
  );
}

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "SOFTWARE", label: "Software" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "LICENSE", label: "License" },
  { value: "TRAVEL", label: "Travel" },
  { value: "OTHER", label: "Other" },
];

function expenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function ExpensesTab({ projectId, project }: { projectId: string; project: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: expenses, isLoading } = useListProjectExpenses(projectId);

  const [category, setCategory] = useState<string>("SOFTWARE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState<string>(new Date().toISOString().slice(0, 10));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListProjectExpensesQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetProjectFinancialsQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: ["/projects"] });
  };

  const addMutation = useAddProjectExpense({
    mutation: {
      onSuccess: () => {
        toast({ title: "Expense saved", description: "Project total cost updated." });
        setDescription("");
        setAmount("");
        invalidateAll();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to save expense", description: e?.message ?? "Unknown error" }),
    },
  });

  const removeMutation = useRemoveProjectExpense({
    mutation: {
      onSuccess: () => {
        toast({ title: "Expense removed" });
        invalidateAll();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to remove expense", description: e?.message ?? "Unknown error" }),
    },
  });

  function handleAdd() {
    const amt = Number(amount);
    if (!description.trim()) {
      toast({ variant: "destructive", title: "Description is required" });
      return;
    }
    if (!isFinite(amt) || amt <= 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Amount must be a positive number." });
      return;
    }
    addMutation.mutate({
      id: projectId,
      data: {
        category,
        description: description.trim(),
        amount: amt,
        spentAt: spentAt || undefined,
      },
    });
  }

  if (isLoading) return <LoadingPage />;

  const list = expenses ?? [];
  const totalAdditional = list.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  const resourceCost = project?.resourceCost ?? 0;
  const totalCost = resourceCost + totalAdditional;

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Additional Project Expenses</CardTitle>
          <CardDescription>
            Record purchases or costs outside of resource time (e.g. software, hardware, licenses). These values automatically add to the <span className="font-medium text-foreground">project total cost</span> and affect profit/margin in the Financials tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <SummaryStatInline label="Resource Cost" value={formatIDR(resourceCost)} />
            <SummaryStatInline label="Additional Cost" value={formatIDR(totalAdditional)} highlight />
            <SummaryStatInline label="Total Cost" value={formatIDR(totalCost)} />
            <SummaryStatInline
              label="Remaining vs Revenue"
              value={formatIDR((project?.contractValue ?? 0) - totalCost)}
            />
          </div>

          <div className="rounded-md border border-dashed border-border p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">Add New Expense</div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <Label htmlFor="exp-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="exp-category" className="mt-1" data-testid="select-expense-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-5">
                <Label htmlFor="exp-desc">Description *</Label>
                <Input
                  id="exp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Burp Suite Pro license, 1 year"
                  className="mt-1"
                  data-testid="input-expense-description"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="exp-amount">Amount (IDR) *</Label>
                <Input
                  id="exp-amount"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1 font-mono"
                  data-testid="input-expense-amount"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="exp-date">Date</Label>
                <Input
                  id="exp-date"
                  type="date"
                  value={spentAt}
                  onChange={(e) => setSpentAt(e.target.value)}
                  className="mt-1"
                  data-testid="input-expense-date"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleAdd}
                disabled={addMutation.isPending}
                data-testid="button-add-expense"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No additional expenses yet. Record software, hardware, or other purchases above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">Created By</th>
                    <th className="py-2 pr-3 font-medium text-right">Amount</th>
                    <th className="py-2 pr-3 font-medium text-right w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e: any) => (
                    <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30" data-testid={`row-expense-${e.id}`}>
                      <td className="py-2 pr-3 text-muted-foreground">{formatDate(e.spentAt)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-[10px]">{expenseCategoryLabel(e.category)}</Badge>
                      </td>
                      <td className="py-2 pr-3">{e.description}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{e.createdByName ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{formatIDR(e.amount)}</td>
                      <td className="py-2 pr-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={removeMutation.isPending}
                          data-testid={`button-remove-expense-${e.id}`}
                          onClick={() => {
                            if (confirm(`Remove expense "${e.description}"?`)) {
                              removeMutation.mutate({ expenseId: e.id });
                            }
                          }}
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-2 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Total Additional Cost
                    </td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold">{formatIDR(totalAdditional)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStatInline({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold mt-1">{value}</div>
    </div>
  );
}

function DraftCompletionCard({ project }: { project: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [description, setDescription] = useState<string>(project.description ?? "");
  const [startDate, setStartDate] = useState<string>(project.startDate ? project.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState<string>(project.endDate ? project.endDate.slice(0, 10) : "");
  const [contractValue, setContractValue] = useState<string>(String(project.contractValue ?? 0));
  const [plannedMandays, setPlannedMandays] = useState<string>(String(project.plannedMandays ?? 0));
  const [estimatedCost, setEstimatedCost] = useState<string>(String(project.estimatedCost ?? 0));

  const update = useUpdateProject({
    mutation: {
      onSuccess: async () => {
        toast({ title: "Details saved", description: "Project moved to Observation status." });
        await qc.refetchQueries({ queryKey: getGetProjectQueryKey(project.id) });
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to save", description: e?.message ?? "Unknown error" }),
    },
  });

  function handleSave(promoteToObservation: boolean) {
    const cv = Number(contractValue);
    const ec = Number(estimatedCost);
    const pm = Number(plannedMandays);
    if (cv < 0 || ec < 0 || pm < 0) {
      toast({ variant: "destructive", title: "Invalid value", description: "Revenue, cost, and mandays cannot be negative." });
      return;
    }
    if (promoteToObservation && (!cv || !pm || !startDate || !endDate)) {
      toast({
        variant: "destructive",
        title: "Required fields missing",
        description: "Revenue, Planned Mandays, Start Date, and End Date are required before moving to Observation.",
      });
      return;
    }
    update.mutate({
      id: project.id,
      data: {
        description: description || null,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        contractValue: cv,
        estimatedCost: ec,
        plannedMandays: pm,
        ...(promoteToObservation ? { status: ProjectStatus.OBSERVATION } : {}),
      } as any,
    });
  }

  return (
    <Card className="border-purple-500/40 bg-purple-500/5 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Complete Project Details (DRAFT)</CardTitle>
        <CardDescription>
          Fill in financial data, schedule, and description. Add resources in the <span className="font-medium">Resources</span> tab. Once complete, move the project to <span className="font-medium">Observation</span> status to start execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="draft-description">Description</Label>
            <Textarea
              id="draft-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope of work and additional information..."
              className="resize-none h-20 mt-1"
              data-testid="input-draft-description"
            />
          </div>
          <div>
            <Label htmlFor="draft-start">Start Date *</Label>
            <Input id="draft-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" data-testid="input-draft-start" />
          </div>
          <div>
            <Label htmlFor="draft-end">End Date *</Label>
            <Input id="draft-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" data-testid="input-draft-end" />
          </div>
          <div>
            <Label htmlFor="draft-revenue">Revenue / Selling Price (IDR) *</Label>
            <Input id="draft-revenue" type="number" min={0} value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-revenue" />
          </div>
          <div>
            <Label htmlFor="draft-mandays">Planned Mandays *</Label>
            <Input id="draft-mandays" type="number" min={0} step="0.5" value={plannedMandays} onChange={(e) => setPlannedMandays(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-mandays" />
          </div>
          <div>
            <Label htmlFor="draft-cost">Estimated Cost (IDR)</Label>
            <Input id="draft-cost" type="number" min={0} value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-cost" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={update.isPending}
            data-testid="button-save-draft"
          >
            Save as DRAFT
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={update.isPending}
            data-testid="button-promote-observation"
          >
            Save & Move to Observation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResourcesTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id);
  // Principal can propose/manage rows whose system role matches the role they
  // supervise; the server further restricts to their direct supervisees.
  const principalSupervises: string | null =
    user?.role === "PRINCIPAL_KONSULTAN" ? "KONSULTAN" :
    user?.role === "PRINCIPAL_TECHNICAL_WRITER" ? "TECHNICAL_WRITER" :
    user?.role === "PRINCIPAL_ADMIN_PROJECT" ? "ADMIN_PROJECT" : null;
  const canPrincipalManageRow = (r: any) => principalSupervises != null && r.userRole === principalSupervises;
  const { data: resources, isLoading } = useListProjectResources(projectId);
  const { data: konsultanPool } = useListAvailableUsers(
    { role: "KONSULTAN" },
    { query: { enabled: canEdit, queryKey: ["users-available", "KONSULTAN"] } }
  );
  const { data: writerPool } = useListAvailableUsers(
    { role: "TECHNICAL_WRITER" },
    { query: { enabled: canEdit, queryKey: ["users-available", "TECHNICAL_WRITER"] } }
  );
  const { data: adminPool } = useListAvailableUsers(
    { role: "ADMIN_PROJECT" },
    { query: { enabled: canEdit, queryKey: ["users-available", "ADMIN_PROJECT"] } }
  );
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assignment updated" });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: ["users-available", "TECHNICAL_WRITER"] });
        queryClient.invalidateQueries({ queryKey: ["users-available", "ADMIN_PROJECT"] });
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e?.message ?? "Could not update", variant: "destructive" }),
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListProjectResourcesQueryKey(projectId) });

  const addMutation = useAddProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource added", description: "Team member assigned to this project." });
        setAddOpen(false);
        setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
        invalidate();
      },
      onError: (e: any) => toast({ title: "Failed", description: e?.message ?? "Could not add resource", variant: "destructive" }),
    },
  });
  const removeMutation = useRemoveProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource removed", description: "Team member unassigned from this project." });
        invalidate();
      },
      onError: (e: any) => toast({ title: "Failed", description: e?.message ?? "Could not remove resource", variant: "destructive" }),
    },
  });

  if (isLoading) return <LoadingPage />;
  const allList = resources ?? [];
  // Konsultan-only main team list. TW is shown in its own dropdown card below.
  const list = allList.filter((r: any) => r.userRole === "KONSULTAN");
  const totalPlanned = list.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0), 0);
  const totalActual = list.reduce((s: number, r: any) => s + (r.actualMandays ?? 0), 0);
  const estCost = list.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0) * (r.dailyRate ?? 0), 0);
  const assignedKonsultanIds = new Set(list.map((r: any) => r.userId));
  const availableKonsultan = (konsultanPool ?? []).filter(
    (u: any) => !assignedKonsultanIds.has(u.id) && (!u.atCapacity || form.userId === u.id),
  );

  const handleAdd = () => {
    if (!form.userId) {
      toast({ title: "Please select a team member", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      id: projectId,
      data: {
        userId: form.userId,
        roleInProject: form.roleInProject || undefined,
        plannedMandays: Number(form.plannedMandays) || 0,
        dailyRate: Number(form.dailyRate) || 0,
      },
    });
  };

  const writerName =
    project.technicalWriterName ??
    (writerPool ?? []).find((u: any) => u.id === project.technicalWriterId)?.name ??
    null;
  const adminName =
    project.adminProjectName ??
    (adminPool ?? []).find((u: any) => u.id === project.adminProjectId)?.name ??
    null;

  return (
    <div className="space-y-6">
      {/* Single-pick assignment cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Technical Writer</CardTitle>
            <CardDescription>One Technical Writer is assigned per project to deliver the report.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEdit ? (
              <Select
                value={project.technicalWriterId ?? "_none"}
                onValueChange={(v) =>
                  updateProject.mutate({ id: projectId, data: { technicalWriterId: v === "_none" ? null : v } as any })
                }
              >
                <SelectTrigger data-testid="select-tw">
                  <SelectValue placeholder="Select Technical Writer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Unassigned —</SelectItem>
                  {(writerPool ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({u.activeProjectCount} active)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{writerName ?? <span className="text-muted-foreground italic">Unassigned</span>}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Admin Project</CardTitle>
            <CardDescription>Handles BAST &amp; Invoice closing documents for this project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEdit ? (
              <Select
                value={project.adminProjectId ?? "_none"}
                onValueChange={(v) =>
                  updateProject.mutate({ id: projectId, data: { adminProjectId: v === "_none" ? null : v } as any })
                }
              >
                <SelectTrigger data-testid="select-ap">
                  <SelectValue placeholder="Select Admin Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Unassigned —</SelectItem>
                  {(adminPool ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({u.activeProjectCount} active)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{adminName ?? <span className="text-muted-foreground italic">Unassigned</span>}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Konsultan Team</CardTitle>
            <CardDescription>
              Konsultan assigned to {project?.code ?? "this project"}. Each Konsultan can be active on a maximum of 2 projects (OBSERVATION or ACTIVE).
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0" data-testid="button-add-konsultan">
              + Add Konsultan
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No resources assigned to this project yet.
              {canEdit && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => setAddOpen(true)}>+ Add First Resource</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Project Role</th>
                    <th className="py-2 pr-3 font-medium">System Role</th>
                    <th className="py-2 pr-3 font-medium text-right">Planned (md)</th>
                    <th className="py-2 pr-3 font-medium text-right">Actual (md)</th>
                    <th className="py-2 pr-3 font-medium text-right">Daily Rate</th>
                    <th className="py-2 pr-3 font-medium text-right">Est. Cost</th>
                    {canEdit && <th className="py-2 pr-3 font-medium text-right w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r: any) => {
                    const planned = r.plannedMandays ?? 0;
                    const actual = r.actualMandays ?? 0;
                    const pct = planned > 0 ? (actual / planned) * 100 : 0;
                    return (
                      <tr key={r.id ?? r.userId} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">{r.userName ?? "—"}</td>
                        <td className="py-2 pr-3">{r.roleInProject ?? <span className="text-muted-foreground italic">not set</span>}</td>
                        <td className="py-2 pr-3"><Badge variant="outline" className="text-[10px]">{RoleLabels[r.userRole as keyof typeof RoleLabels] ?? r.userRole}</Badge></td>
                        <td className="py-2 pr-3 text-right font-mono">{planned.toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {actual.toFixed(1)}
                          {planned > 0 && (
                            <span className={`ml-2 text-[10px] ${pct > 100 ? "text-destructive" : pct >= 80 ? "text-amber-500" : "text-muted-foreground"}`}>
                              ({pct.toFixed(0)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{formatIDR(r.dailyRate ?? 0)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{formatIDR(planned * (r.dailyRate ?? 0))}</td>
                        {(canEdit || canPrincipalManageRow(r)) && (
                          <td className="py-2 pr-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              disabled={removeMutation.isPending}
                              onClick={() => {
                                if (confirm(`Remove ${r.userName} from this project?`)) {
                                  removeMutation.mutate({ resourceId: r.id });
                                }
                              }}
                              title="Remove from project"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-xs font-medium">
                    <td colSpan={3} className="py-2 pr-3 text-muted-foreground">Total ({list.length} {list.length === 1 ? "person" : "people"})</td>
                    <td className="py-2 pr-3 text-right font-mono">{totalPlanned.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{totalActual.toFixed(1)}</td>
                    <td className="py-2 pr-3"></td>
                    <td className="py-2 pr-3 text-right font-mono text-primary">{formatIDR(estCost)}</td>
                    {canEdit && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Konsultan to {project?.code ?? "Project"}</DialogTitle>
            <DialogDescription>
              Each Konsultan can be active on a maximum of 2 projects. Konsultans already at capacity are hidden from the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Konsultan</Label>
              <Select value={form.userId} onValueChange={(v) => {
                const picked = (konsultanPool ?? []).find((u: any) => u.id === v);
                setForm({ ...form, userId: v, dailyRate: picked?.dailyRate ? String(picked.dailyRate) : form.dailyRate });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={availableKonsultan.length === 0 ? "No Konsultan available" : "Select a Konsultan"} />
                </SelectTrigger>
                <SelectContent>
                  {availableKonsultan.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{" "}
                      <span className="text-muted-foreground text-xs">
                        — {u.activeProjectCount}/2 active
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project Role <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Lead Consultant, Penetration Tester"
                value={form.roleInProject}
                onChange={(e) => setForm({ ...form, roleInProject: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Planned Mandays</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.plannedMandays}
                  onChange={(e) => setForm({ ...form, plannedMandays: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Daily Rate (IDR)</Label>
                <Input
                  type="number"
                  min="0"
                  step="100000"
                  value={form.dailyRate}
                  onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated cost for this assignment: <span className="font-mono text-foreground">{formatIDR((Number(form.plannedMandays) || 0) * (Number(form.dailyRate) || 0))}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addMutation.isPending}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending || !form.userId}>
              {addMutation.isPending ? "Saving..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
    (user?.role === "TECHNICAL_WRITER" && project.technicalWriterId === user?.id);

  const [coverUrl, setCoverUrl] = useState<string>(project.reportCoverUrl ?? "");
  const [reportLink, setReportLink] = useState<string>(project.reportLink ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useUpdateProjectReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report saved" });
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e?.message ?? "Could not save", variant: "destructive" }),
    },
  });

  const handleFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 4 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCoverUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Project Report
          </CardTitle>
          <CardDescription>
            Upload the report cover image and paste the report link (e.g. Google Drive). When both are filled, the PM and Admin Project will be notified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.reportSubmittedAt && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Submitted on {formatDate(project.reportSubmittedAt)}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Cover photo</Label>
              {coverUrl ? (
                <div className="relative">
                  <img
                    src={coverUrl}
                    alt="Report cover"
                    className="w-full h-48 object-cover rounded-md border border-border"
                  />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => setCoverUrl("")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-md border border-dashed border-border p-6 text-center cursor-pointer hover:bg-muted/30"
                  onClick={() => canEdit && fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {canEdit ? "Click to upload (max 4 MB)" : "No cover uploaded"}
                  </p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Report link</Label>
              <Input
                placeholder="https://drive.google.com/..."
                value={reportLink}
                onChange={(e) => setReportLink(e.target.value)}
                disabled={!canEdit}
                data-testid="input-report-link"
              />
              {reportLink && (
                <a
                  href={reportLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline break-all"
                >
                  {reportLink}
                </a>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  update.mutate({
                    id: projectId,
                    data: { reportCoverUrl: coverUrl || null, reportLink: reportLink || null } as any,
                  })
                }
                disabled={update.isPending}
                data-testid="button-save-report"
              >
                {update.isPending ? "Saving..." : "Save report"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type RequiredField = { key: string; label: string };

function getMissingRequiredFields(project: any): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!project.clientId) missing.push({ key: "clientId", label: "Client" });
  if (!project.startDate) missing.push({ key: "startDate", label: "Start Date" });
  if (!project.endDate) missing.push({ key: "endDate", label: "End Date" });
  if (!project.contractValue || Number(project.contractValue) <= 0)
    missing.push({ key: "contractValue", label: "Revenue (Selling Price)" });
  if (!project.plannedMandays || Number(project.plannedMandays) <= 0)
    missing.push({ key: "plannedMandays", label: "Planned Mandays" });
  if (!project.estimatedCost || Number(project.estimatedCost) <= 0)
    missing.push({ key: "estimatedCost", label: "Estimated Cost" });
  if (!project.description || !String(project.description).trim())
    missing.push({ key: "description", label: "Description" });
  return missing;
}

function OverviewTab({ project }: { project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canEdit =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
    (user?.role === "SALES" && project.salesId === user?.id);

  const [form, setForm] = useState({
    clientId: project.clientId ?? "",
    description: project.description ?? "",
    startDate: project.startDate ? String(project.startDate).slice(0, 10) : "",
    endDate: project.endDate ? String(project.endDate).slice(0, 10) : "",
    contractValue: String(project.contractValue ?? 0),
    estimatedCost: String(project.estimatedCost ?? 0),
    plannedMandays: String(project.plannedMandays ?? 0),
  });

  const isDraft = project.status === ProjectStatus.DRAFT;
  const isSalesDraftEdit = isDraft && user?.role === "SALES";
  const canPickClient = user?.role === "MANAGEMENT" || isSalesDraftEdit;

  const { data: clients } = useListClients({
    query: {
      queryKey: getListClientsQueryKey(),
      enabled: isEditing && canPickClient,
    },
  });

  const update = useUpdateProject({
    mutation: {
      onSuccess: async () => {
        toast({ title: "Overview updated", description: "Project details saved." });
        await qc.refetchQueries({ queryKey: getGetProjectQueryKey(project.id) });
        await qc.invalidateQueries({ queryKey: getGetProjectFinancialsQueryKey(project.id) });
        setConfirmOpen(false);
        setIsEditing(false);
      },
      onError: (e: any) =>
        toast({
          variant: "destructive",
          title: "Failed to save",
          description: e?.message ?? "Unknown error",
        }),
    },
  });

  function startEdit() {
    setForm({
      clientId: project.clientId ?? "",
      description: project.description ?? "",
      startDate: project.startDate ? String(project.startDate).slice(0, 10) : "",
      endDate: project.endDate ? String(project.endDate).slice(0, 10) : "",
      contractValue: String(project.contractValue ?? 0),
      estimatedCost: String(project.estimatedCost ?? 0),
      plannedMandays: String(project.plannedMandays ?? 0),
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function previewMissingFields(): RequiredField[] {
    const draft = {
      clientId: form.clientId,
      startDate: form.startDate,
      endDate: form.endDate,
      contractValue: Number(form.contractValue),
      plannedMandays: Number(form.plannedMandays),
      estimatedCost: Number(form.estimatedCost),
      description: form.description,
    };
    return getMissingRequiredFields(draft);
  }

  function handleSaveClick() {
    const cv = Number(form.contractValue);
    const ec = Number(form.estimatedCost);
    const pm = Number(form.plannedMandays);
    if (cv < 0 || ec < 0 || pm < 0) {
      toast({
        variant: "destructive",
        title: "Invalid value",
        description: "Revenue, cost, and mandays cannot be negative.",
      });
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      toast({
        variant: "destructive",
        title: "Invalid timeline",
        description: "End date cannot be before start date.",
      });
      return;
    }
    setConfirmOpen(true);
  }

  function confirmAndSave() {
    const data: Record<string, unknown> = isSalesDraftEdit
      ? {
          description: form.description.trim() || null,
          contractValue: Number(form.contractValue),
        }
      : {
          description: form.description.trim() || null,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          contractValue: Number(form.contractValue),
          estimatedCost: Number(form.estimatedCost),
          plannedMandays: Number(form.plannedMandays),
        };
    // MANAGEMENT may reassign the client at any time; SALES may also (re)assign while DRAFT.
    if (canPickClient && form.clientId && form.clientId !== project.clientId) {
      data.clientId = form.clientId;
    }
    update.mutate({ id: project.id, data: data as any });
  }

  const currentMissing = getMissingRequiredFields(project);

  return (
    <div className="space-y-4">
      {!isDraft && currentMissing.length > 0 && canEdit && !isEditing && (
        <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {currentMissing.length} required field{currentMissing.length > 1 ? "s" : ""} missing
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete the project information so financial estimates and reporting stay accurate:{" "}
                <span className="text-foreground">
                  {currentMissing.map((m) => m.label).join(", ")}
                </span>
                .
              </p>
            </div>
            <Button
              size="sm"
              onClick={startEdit}
              className="shrink-0"
              data-testid="button-overview-fix-missing"
            >
              <Pencil className="h-4 w-4 mr-1.5" />
              Fill in
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle className="text-base">Project Information</CardTitle>
            {canEdit && !isEditing && (!isDraft || isSalesDraftEdit) && (
              <Button
                size="sm"
                variant="outline"
                onClick={startEdit}
                data-testid="button-overview-edit"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!isEditing ? (
              <>
                <InfoRow icon={<Building2 className="h-4 w-4" />} label="Client" value={project.clientName ?? "-"} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Sales" value={project.salesName ?? "-"} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Project Manager" value={project.pmName ?? "-"} />
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="SPK / PO Number"
                  value={project.code ?? "-"}
                />
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">SPK / PO File</p>
                    {project.spkFileUrl ? (
                      <a
                        href={project.spkFileUrl}
                        download={project.spkFileName ?? "spk.pdf"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate block"
                        data-testid="link-overview-spk-file"
                      >
                        {project.spkFileName ?? "Download SPK / PO"}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Not uploaded</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Contract File</p>
                    {project.contractFileUrl ? (
                      <a
                        href={project.contractFileUrl}
                        download={project.contractFileName ?? "contract.pdf"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate block"
                        data-testid="link-overview-contract-file"
                      >
                        {project.contractFileName ?? "Download Contract"}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Not uploaded</p>
                    )}
                  </div>
                </div>
                <InfoRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Timeline"
                  value={
                    project.startDate || project.endDate
                      ? `${project.startDate ? formatDate(project.startDate) : "?"} → ${project.endDate ? formatDate(project.endDate) : "?"}`
                      : "Not set"
                  }
                />
                {project.description ? (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-muted-foreground italic">Not set</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {canPickClient ? (
                  <div>
                    <Label htmlFor="ov-client">Client *</Label>
                    <Select
                      value={form.clientId}
                      onValueChange={(v) => setForm({ ...form, clientId: v })}
                    >
                      <SelectTrigger id="ov-client" className="mt-1" data-testid="input-overview-client">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {(clients ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <InfoRow icon={<Building2 className="h-4 w-4" />} label="Client" value={project.clientName ?? "-"} />
                )}
                <InfoRow icon={<User className="h-4 w-4" />} label="Sales" value={project.salesName ?? "-"} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Project Manager" value={project.pmName ?? "-"} />
                {!isSalesDraftEdit && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="ov-start">Start Date *</Label>
                      <Input
                        id="ov-start"
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        className="mt-1"
                        data-testid="input-overview-start"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ov-end">End Date *</Label>
                      <Input
                        id="ov-end"
                        type="date"
                        value={form.endDate}
                        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        className="mt-1"
                        data-testid="input-overview-end"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="ov-description">Description {isSalesDraftEdit ? "" : "*"}</Label>
                  <Textarea
                    id="ov-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Scope of work, deliverables, key notes..."
                    className="resize-none h-24 mt-1"
                    data-testid="input-overview-description"
                  />
                </div>
                {isSalesDraftEdit && (
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Timeline, estimated cost, and planned mandays are completed by the assigned Project Manager once they pick up this draft.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {canViewProjectFinancials(user?.role) ? "Financial Estimation" : "Effort Estimation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isEditing ? (
              <>
                {canViewProjectFinancials(user?.role) ? (
                  <>
                    <Stat label="Revenue (Selling Price)" value={formatIDR(project.contractValue)} />
                    <Stat label="Estimated Operational Cost" value={formatIDR(project.estimatedCost)} muted />
                    <Stat label="Estimated Profit" value={formatIDR(project.estimatedProfit)} highlight />
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Margin</p>
                      <MarginBadge marginPct={project.marginPct} />
                    </div>
                  </>
                ) : null}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Planned Mandays</p>
                  <p className="font-mono text-sm">{project.plannedMandays.toFixed(1)}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="ov-revenue">Revenue / Selling Price (IDR) *</Label>
                  <Input
                    id="ov-revenue"
                    type="number"
                    min={0}
                    value={form.contractValue}
                    onChange={(e) => setForm({ ...form, contractValue: e.target.value })}
                    className="mt-1 font-mono"
                    data-testid="input-overview-revenue"
                  />
                </div>
                {!isSalesDraftEdit && (
                  <>
                    <div>
                      <Label htmlFor="ov-cost">Estimated Operational Cost (IDR) *</Label>
                      <Input
                        id="ov-cost"
                        type="number"
                        min={0}
                        value={form.estimatedCost}
                        onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
                        className="mt-1 font-mono"
                        data-testid="input-overview-cost"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ov-mandays">Planned Mandays *</Label>
                      <Input
                        id="ov-mandays"
                        type="number"
                        min={0}
                        step="0.5"
                        value={form.plannedMandays}
                        onChange={(e) => setForm({ ...form, plannedMandays: e.target.value })}
                        className="mt-1 font-mono"
                        data-testid="input-overview-mandays"
                      />
                    </div>
                  </>
                )}
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Margin and profit estimate are calculated automatically once you save.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {isEditing && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={cancelEdit}
            disabled={update.isPending}
            data-testid="button-overview-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveClick}
            disabled={update.isPending}
            data-testid="button-overview-save"
          >
            Review &amp; Save
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => !update.isPending && setConfirmOpen(o)}>
        <DialogContent data-testid="dialog-overview-confirm">
          <DialogHeader>
            <DialogTitle>Confirm Overview Changes</DialogTitle>
            <DialogDescription>
              Please review the values below before saving. These details drive the project's financial reporting.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const missing = previewMissingFields();
            return (
              <div className="space-y-4">
                {missing.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">
                        Some recommended fields are still empty
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        You can save anyway, but reporting and financials will be incomplete until these are filled in: {" "}
                        <span className="text-foreground">{missing.map((m) => m.label).join(", ")}</span>.
                      </p>
                    </div>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <ConfirmRow label="Client" value={
                    (clients ?? []).find((c: any) => c.id === form.clientId)?.name
                      ?? project.clientName
                      ?? "-"
                  } />
                  <ConfirmRow label="Timeline" value={
                    form.startDate || form.endDate
                      ? `${form.startDate ? formatDate(form.startDate) : "?"} → ${form.endDate ? formatDate(form.endDate) : "?"}`
                      : "Not set"
                  } />
                  <ConfirmRow label="Revenue" value={formatIDR(Number(form.contractValue) || 0)} />
                  <ConfirmRow label="Estimated Cost" value={formatIDR(Number(form.estimatedCost) || 0)} />
                  <ConfirmRow label="Planned Mandays" value={(Number(form.plannedMandays) || 0).toFixed(1)} />
                  <ConfirmRow label="Description" value={form.description.trim() || "—"} multiline />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={update.isPending}
              data-testid="button-overview-confirm-back"
            >
              Back to edit
            </Button>
            <Button
              onClick={confirmAndSave}
              disabled={update.isPending}
              data-testid="button-overview-confirm-save"
            >
              {update.isPending ? "Saving…" : "Confirm & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfirmRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? "" : "flex items-center justify-between gap-3"}>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`${multiline ? "block mt-1 text-sm whitespace-pre-wrap" : "font-mono text-sm text-right"} text-foreground`}>
        {value}
      </span>
    </div>
  );
}

function FinancialsTab({ projectId }: { projectId: string }) {
  const { data: f, isLoading } = useGetProjectFinancials(projectId, {
    query: { queryKey: getGetProjectFinancialsQueryKey(projectId), enabled: !!projectId },
  });

  if (isLoading) return <LoadingPage />;
  if (!f) return <EmptyState title="No financial data" description="Financial data is unavailable for this project." />;

  const profitPositive = (f.actualProfit ?? 0) >= 0;
  const forecastPositive = (f.forecastProfit ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FinancialCard
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Revenue"
          value={formatIDR(f.contractValue)}
          subtitle="Contract value (Selling Price)"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          label="Estimated Cost"
          value={formatIDR(f.estimatedCost)}
          subtitle="Planned operational cost"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-amber-500" />}
          label="Actual Cost"
          value={formatIDR(f.actualCost ?? 0)}
          subtitle="From approved timesheets × rate"
        />
        <FinancialCard
          icon={profitPositive ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Actual Profit / Loss"
          value={formatIDR(f.actualProfit ?? 0)}
          subtitle={`${formatPct(f.marginPct ?? 0)} margin`}
          tone={profitPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={forecastPositive ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Forecasted Final Profit"
          value={formatIDR(f.forecastProfit ?? 0)}
          subtitle={`Projected cost: ${formatIDR(f.forecastCost ?? 0)}`}
          tone={forecastPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={<Flame className="h-4 w-4 text-amber-500" />}
          label="Burn Rate"
          value={`${(f.burnRatePct ?? 0).toFixed(1)}%`}
          subtitle={`${(f.actualMandays ?? 0).toFixed(1)} / ${(f.plannedMandays ?? 0).toFixed(1)} mandays`}
          progress={Math.min(f.burnRatePct ?? 0, 100)}
        />
        <FinancialCard
          icon={(f.marginPct ?? 0) >= 0 ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Profit Margin"
          value={formatPct(f.marginPct ?? 0)}
          subtitle="Actual profit ÷ revenue"
          tone={(f.marginPct ?? 0) >= 0 ? "good" : "bad"}
        />
      </div>

      <WhatIfCard
        projectId={projectId}
        avgRateHint={
          (f.actualMandays ?? 0) > 0
            ? (f.actualCost ?? 0) / (f.actualMandays ?? 1)
            : 0
        }
      />

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Monthly Cost vs Revenue</CardTitle>
          <CardDescription>Approved timesheet cost compared to amortized revenue per month.</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          {!f.monthly?.length ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No approved timesheets yet — chart will populate as cost accrues.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={f.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="finRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="finCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1_000_000).toFixed(0)}M`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(v: number) => formatIDR(v)}
                />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#finRev)" />
                <Area type="monotone" dataKey="cost" name="Cost" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#finCost)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsTab({ projectId, projectStatus }: { projectId: string; projectStatus: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: docs, isLoading } = useListProjectDocuments(projectId, {
    query: { queryKey: getListProjectDocumentsQueryKey(projectId), enabled: !!projectId },
  });

  const createDoc = useCreateProjectDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: ["/projects"] });
      },
    },
  });
  const deleteDoc = useDeleteDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
        toast({ title: "Document deleted" });
      },
    },
  });

  const canUpload =
    user?.role === "ADMIN_PROJECT" ||
    user?.role === "MANAGEMENT" ||
    user?.role === "PROJECT_MANAGER";

  const list = docs ?? [];
  const hasBast = list.some((d) => d.type === "BAST");
  const hasInvoice = list.some((d) => d.type === "INVOICE");

  async function handleUpload(file: File, type: "BAST" | "INVOICE") {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { fileName, fileUrl } = await res.json();
      await createDoc.mutateAsync({
        id: projectId,
        data: { type: type as DocumentType, fileName, fileUrl },
      });
      toast({ title: `${type} uploaded`, description: fileName });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      {projectStatus === "COMPLETE" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Awaiting closing documents</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload both BAST and Invoice (PDF) to automatically close this project.
              </p>
              <div className="flex gap-4 mt-3">
                <Badge variant="outline" className={hasBast ? "bg-primary/10 text-primary border-primary/30" : ""}>
                  {hasBast ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null} BAST {hasBast ? "received" : "pending"}
                </Badge>
                <Badge variant="outline" className={hasInvoice ? "bg-primary/10 text-primary border-primary/30" : ""}>
                  {hasInvoice ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null} Invoice {hasInvoice ? "received" : "pending"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canUpload && projectStatus !== "CLOSED" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UploadCard
            type="BAST"
            label="BAST"
            description="Handover Acceptance Report (PDF)"
            done={hasBast}
            onUpload={(f) => handleUpload(f, "BAST")}
          />
          <UploadCard
            type="INVOICE"
            label="Invoice"
            description="Customer invoice (PDF)"
            done={hasInvoice}
            onUpload={(f) => handleUpload(f, "INVOICE")}
          />
        </div>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">All Documents</CardTitle>
          <CardDescription>{list.length} file(s) uploaded</CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3" data-testid={`doc-${d.type}`}>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate"
                      >
                        {d.fileName}
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Uploaded by {d.uploadedByName ?? "Unknown"} on {formatDate(d.uploadedAt)}
                    </p>
                  </div>
                  {canUpload && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDoc.mutate({ id: d.id })}
                      disabled={deleteDoc.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadCard({ type, label, description, done, onUpload }: {
  type: string; label: string; description: string; done: boolean; onUpload: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className={`border-border shadow-sm ${done ? "bg-primary/5 border-primary/30" : ""}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {done && <CheckCircle2 className="h-4 w-4 text-primary" />}
            {label}
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">{type}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={ref}
          type="file"
          accept="application/pdf"
          className="hidden"
          data-testid={`input-upload-${type}`}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try { await onUpload(f); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
          }}
        />
        <Button
          variant={done ? "outline" : "default"}
          className="w-full"
          onClick={() => ref.current?.click()}
          disabled={busy}
          data-testid={`button-upload-${type}`}
        >
          <Upload className="h-4 w-4 mr-2" />
          {busy ? "Uploading…" : done ? `Replace ${label} PDF` : `Upload ${label} PDF`}
        </Button>
      </CardContent>
    </Card>
  );
}

function FinancialCard({ icon, label, value, subtitle, tone, progress }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "good" | "bad";
  progress?: number;
}) {
  const valueColor =
    tone === "good" ? "text-primary" :
    tone === "bad" ? "text-destructive" :
    "text-foreground";
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-xl md:text-2xl font-bold font-mono ${valueColor}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {progress != null && <Progress value={progress} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

type WhatIfResp = {
  projectId: string;
  addMandays: number;
  avgDailyRate: number;
  base: { mandays: number; cost: number; profit: number; marginPct: number };
  scenario: { mandays: number; cost: number; profit: number; marginPct: number };
  deltaCost: number;
  deltaProfit: number;
};

function WhatIfCard({ projectId, avgRateHint }: { projectId: string; avgRateHint: number }) {
  const [add, setAdd] = useState<number>(5);
  const { data, isFetching } = useQuery<WhatIfResp>({
    queryKey: ["project-whatif", projectId, add],
    queryFn: () =>
      customFetch<WhatIfResp>(`/api/projects/${projectId}/whatif?addMandays=${add}`),
    enabled: !!projectId && add >= 0,
    staleTime: 0,
  });

  const baseMargin = data?.base.marginPct ?? 0;
  const scenarioMargin = data?.scenario.marginPct ?? 0;
  const delta = scenarioMargin - baseMargin;
  const tone = scenarioMargin >= 0 ? "text-primary" : "text-destructive";

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          What-If Scenario
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Project the impact on profit if more mandays are needed beyond what's already logged.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Additional mandays
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={add}
                onChange={(e) => setAdd(Math.max(0, Number(e.target.value) || 0))}
                className="w-32"
                data-testid="whatif-input"
              />
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={add}
                onChange={(e) => setAdd(Number(e.target.value))}
                className="w-48 accent-primary"
                data-testid="whatif-slider"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Avg cost/manday: <span className="font-mono text-foreground">{formatIDR(data?.avgDailyRate ?? avgRateHint ?? 0)}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Extra Cost</p>
            <p className="text-lg font-mono text-foreground mt-1">
              {formatIDR(data?.deltaCost ?? 0)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Projected Profit</p>
            <p className={`text-lg font-mono mt-1 ${tone}`}>
              {formatIDR(data?.scenario.profit ?? 0)}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Projected Margin</p>
            <p className={`text-lg font-mono mt-1 ${tone}`}>
              {formatPct(scenarioMargin)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              vs base {formatPct(baseMargin)} ·{" "}
              <span className={delta >= 0 ? "text-primary" : "text-destructive"}>
                {delta >= 0 ? "+" : ""}
                {formatPct(delta)}
              </span>
            </p>
          </div>
        </div>
        {isFetching && (
          <p className="text-xs text-muted-foreground">Recalculating…</p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-sm ${highlight ? "text-primary font-semibold" : muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function TimelineTab({ projectId, project }: { projectId: string; project: any }) {
  const { data: resources, isLoading: loadingRes } = useListProjectResources(projectId);
  const { data: timesheets, isLoading: loadingTs } = useListTimesheets({
    projectId,
    status: "APPROVED",
  });

  if (loadingRes || loadingTs) return <LoadingPage />;

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
