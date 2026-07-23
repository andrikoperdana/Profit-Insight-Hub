import { useParams, Link } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import SkillRecommenderDialog from "../components/SkillRecommenderDialog";
import BulkAddResourcesDialog from "../components/BulkAddResourcesDialog";
import { Sparkles, Users } from "lucide-react";
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
  useAcceptProjectResource,
  useRejectProjectResource,
  getListProjectResourcesQueryKey,
  useListResourceRates,
  useCreateResourceRate,
  getListResourceRatesQueryKey,
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
  Pencil, AlertTriangle, Paperclip, X, History,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { WorkstreamPicker } from "../components/WorkstreamPicker";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials, canViewDailyRate, isSuperAdmin } from "@/lib/roles";
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


function ResourcesTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id);
  // Daily Rate / Est. Cost columns only visible to MGMT, PM, Finance, HR.
  const showRate = canViewDailyRate(user?.role as any);
  // Principal can propose/manage rows whose system role matches the role they
  // supervise; the server further restricts to their direct supervisees.
  const principalSupervises: string | null =
    user?.role === "PRINCIPAL_KONSULTAN" ? "KONSULTAN" :
    user?.role === "PRINCIPAL_TECHNICAL_WRITER" ? "TECHNICAL_WRITER" :
    user?.role === "PRINCIPAL_ADMIN_PROJECT" ? "ADMIN_PROJECT" : null;
  const canPrincipalManageRow = (r: any) => principalSupervises != null && r.userRole === principalSupervises;
  // True when the current Principal directly supervises the row's user (used to
  // gate the Approve/Decline actions on pending-approval rows). The server is
  // authoritative; this just hides controls the caller can't action.
  const isRowPrincipalApprover = (r: any) =>
    canPrincipalManageRow(r) && (supervisees ?? []).some((u: any) => u.id === r.userId);
  const projectIsAssignable = project.status === "OBSERVATION" || project.status === "ACTIVE";
  const canPrincipalEditAp =
    user?.role === "PRINCIPAL_ADMIN_PROJECT" && projectIsAssignable;
  const canPrincipalProposeKonsultan =
    user?.role === "PRINCIPAL_KONSULTAN" && projectIsAssignable;
  const canPrincipalProposeTw =
    user?.role === "PRINCIPAL_TECHNICAL_WRITER" && projectIsAssignable;
  const { data: supervisees } = useListUsersUnderSupervision({
    query: {
      enabled: canPrincipalEditAp || canPrincipalProposeKonsultan || canPrincipalProposeTw,
      queryKey: ["users-under-supervision"],
    },
  } as any);
  const { data: resources, isLoading } = useListProjectResources(projectId);
  const { data: konsultanPool } = useListAvailableUsers(
    { role: "KONSULTAN" },
    { query: { enabled: canEdit, queryKey: ["users-available", "KONSULTAN"] } }
  );
  const { data: writerPool } = useListAvailableUsers(
    { role: "TECHNICAL_WRITER" },
    { query: { enabled: canEdit || canPrincipalProposeTw, queryKey: ["users-available", "TECHNICAL_WRITER"] } }
  );
  const { data: adminPool } = useListAvailableUsers(
    { role: "ADMIN_PROJECT" },
    { query: { enabled: canEdit, queryKey: ["users-available", "ADMIN_PROJECT"] } }
  );
  const { data: allActiveUsers } = useListActiveAllUsers({
    query: { enabled: canEdit, queryKey: ["users-active-all"] },
  });
  const [addingRole, setAddingRole] = useState<null | "KONSULTAN" | "TECHNICAL_WRITER" | "OTHER">(null);
  const [rateResource, setRateResource] = useState<any | null>(null);
  const [form, setForm] = useState({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
  const [formWorkstreamId, setFormWorkstreamId] = useState<string | null>(null);
  const [suggestRole, setSuggestRole] = useState<null | "KONSULTAN" | "TECHNICAL_WRITER">(null);
  const [bulkVariant, setBulkVariant] = useState<null | "KONSULTAN" | "TECHNICAL_WRITER" | "OTHER">(null);

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
        setAddingRole(null);
        setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
        invalidate();
      },
      onError: (e: any) => toast({ title: "Failed", description: e?.message ?? "Could not add resource", variant: "destructive" }),
    },
  });
  const proposeMutation = useProposeProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource proposed", description: "PM has been notified to accept." });
        setAddingRole(null);
        setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
        invalidate();
      },
      onError: (e: any) => toast({ title: "Failed", description: e?.message ?? "Could not propose resource", variant: "destructive" }),
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
  const acceptMutation = useAcceptProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assignment approved", description: "The team member is now active on this project." });
        invalidate();
      },
      onError: (e: any) => toast({ title: "Failed", description: e?.message ?? "Could not approve assignment", variant: "destructive" }),
    },
  });
  const rejectMutation = useRejectProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assignment declined", description: "The proposed assignment was removed." });
        invalidate();
      },
      onError: (e: any) => toast({ title: "Failed", description: e?.message ?? "Could not decline assignment", variant: "destructive" }),
    },
  });

  if (isLoading) return <LoadingPage />;
  const allList = resources ?? [];
  // Consultant team
  const list = allList.filter((r: any) => r.userRole === "KONSULTAN");
  const totalPlanned = list.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0), 0);
  const totalActual = list.reduce((s: number, r: any) => s + (r.actualMandays ?? 0), 0);
  const estCost = list.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0) * (r.dailyRate ?? 0), 0);
  const assignedKonsultanIds = new Set(list.map((r: any) => r.userId));
  const availableKonsultan = (konsultanPool ?? []).filter(
    (u: any) => !assignedKonsultanIds.has(u.id),
  );
  const principalKonsultanPool = (supervisees ?? []).filter(
    (u: any) => u.role === "KONSULTAN" && !assignedKonsultanIds.has(u.id),
  );
  const konsultanOptions = canEdit ? availableKonsultan : principalKonsultanPool;

  // Technical Writer team (multi-pick, mirrors Consultant)
  const twList = allList.filter((r: any) => r.userRole === "TECHNICAL_WRITER");
  const twTotalPlanned = twList.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0), 0);
  const twTotalActual = twList.reduce((s: number, r: any) => s + (r.actualMandays ?? 0), 0);
  const twEstCost = twList.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0) * (r.dailyRate ?? 0), 0);
  const assignedTwIds = new Set(twList.map((r: any) => r.userId));
  const availableWriters = (writerPool ?? []).filter((u: any) => !assignedTwIds.has(u.id));
  const principalWriterPool = (supervisees ?? []).filter(
    (u: any) => u.role === "TECHNICAL_WRITER" && !assignedTwIds.has(u.id),
  );
  const writerOptions = canEdit ? availableWriters : principalWriterPool;

  // Other Resources: anyone active in the system who isn't already a Consultant/TW/AdminProject
  // resource on this project. Free-text "Role on Project" required.
  const otherList = allList.filter(
    (r: any) => r.userRole !== "KONSULTAN" && r.userRole !== "TECHNICAL_WRITER",
  );
  const otherTotalPlanned = otherList.reduce((s: number, r: any) => s + (r.plannedMandays ?? 0), 0);
  const otherTotalActual = otherList.reduce((s: number, r: any) => s + (r.actualMandays ?? 0), 0);
  const otherEstCost = otherList.reduce(
    (s: number, r: any) => s + (r.plannedMandays ?? 0) * (r.dailyRate ?? 0),
    0,
  );
  const assignedAnyIds = new Set(allList.map((r: any) => r.userId));
  const otherPool = (allActiveUsers ?? []).filter((u: any) => !assignedAnyIds.has(u.id));

  const dialogPool =
    addingRole === "OTHER"
      ? otherPool
      : addingRole === "TECHNICAL_WRITER"
        ? (canEdit ? (writerPool ?? []) : principalWriterPool)
        : (canEdit ? (konsultanPool ?? []) : principalKonsultanPool);
  const dialogOptions =
    addingRole === "OTHER"
      ? otherPool
      : addingRole === "TECHNICAL_WRITER"
        ? writerOptions
        : konsultanOptions;
  const dialogRoleLabel =
    addingRole === "OTHER"
      ? "Other Resource"
      : addingRole === "TECHNICAL_WRITER"
        ? "Technical Writer"
        : "Consultant";

  const handleAdd = () => {
    if (!form.userId || !addingRole) {
      toast({ title: "Please select a team member", variant: "destructive" });
      return;
    }
    if (addingRole === "OTHER" && !form.roleInProject.trim()) {
      toast({
        title: "Role on project is required",
        description: "Enter a position such as 'SOC Manager', 'Security Engineer', 'Sales Support', etc.",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      id: projectId,
      data: {
        userId: form.userId,
        roleInProject: form.roleInProject || undefined,
        plannedMandays: Number(form.plannedMandays) || 0,
        dailyRate: Number(form.dailyRate) || 0,
        workstreamId: formWorkstreamId,
      },
    };
    if (canEdit) {
      addMutation.mutate(payload);
    } else if (
      (addingRole === "KONSULTAN" && canPrincipalProposeKonsultan) ||
      (addingRole === "TECHNICAL_WRITER" && canPrincipalProposeTw)
    ) {
      proposeMutation.mutate(payload);
    }
  };

  const adminName =
    project.adminProjectName ??
    (adminPool ?? []).find((u: any) => u.id === project.adminProjectId)?.name ??
    null;

  return (
    <div className="space-y-6">
      {/* Admin Project: still single-pick on Project */}
      <div className="grid gap-4 md:grid-cols-2">
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
            ) : canPrincipalEditAp ? (
              <>
                <Select
                  value={project.adminProjectId ?? "_none"}
                  onValueChange={(v) =>
                    updateProject.mutate({ id: projectId, data: { adminProjectId: v === "_none" ? null : v } as any })
                  }
                >
                  <SelectTrigger data-testid="select-ap-principal">
                    <SelectValue placeholder="Assign one of your admins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Unassigned —</SelectItem>
                    {(supervisees ?? [])
                      .filter((u: any) => u.role === "ADMIN_PROJECT")
                      .map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  As Principal Admin Project you may assign one of your direct supervisees. PM may override later.
                </p>
              </>
            ) : (
              <p className="text-sm">{adminName ?? <span className="text-muted-foreground italic">Unassigned</span>}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(() => {
        const plannedMd = Number(project?.plannedMandays ?? 0);
        const estCostFromIntake = Number(project?.estimatedCost ?? 0);
        const totalAssigned = (list?.length ?? 0) + (twList?.length ?? 0) + (otherList?.length ?? 0);
        if (totalAssigned > 0 || (plannedMd <= 0 && estCostFromIntake <= 0)) return null;
        return (
          <Card className="border-amber-500/40 bg-amber-500/5 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Staffing Plan from Registration
              </CardTitle>
              <CardDescription>
                When this project was created, the resource requirements were recorded as a budget estimate. Assign the actual people below so utilization and timesheets can be tracked.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Planned Mandays</div>
                <div className="text-lg font-semibold font-mono">{plannedMd.toLocaleString()}</div>
              </div>
              {canViewProjectFinancials(user?.role) && (
                <div>
                  <div className="text-muted-foreground">Estimated Resource Cost</div>
                  <div className="text-lg font-semibold font-mono">{formatIDR(estCostFromIntake)}</div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p>
          Selecting a resource here is for cost and planning purposes only. A Consultant or Technical Writer who has a Principal
          becomes active on the project only after their Principal approves the assignment.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Consultant Team</CardTitle>
            <CardDescription>
              Consultants assigned to {project?.code ?? "this project"}. Multiple consultants can be assigned per project; the active-project count is shown for awareness only.
            </CardDescription>
          </div>
          {canEdit ? (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSuggestRole("KONSULTAN")}
                data-testid="button-suggest-konsultan"
              >
                <Sparkles className="h-4 w-4 mr-1" /> Suggest
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkVariant("KONSULTAN")} data-testid="button-bulk-add-konsultan">
                <Users className="h-4 w-4 mr-1" /> Add Multiple
              </Button>
              <Button size="sm" onClick={() => setAddingRole("KONSULTAN")} data-testid="button-add-konsultan">
                + Add Consultant
              </Button>
            </div>
          ) : canPrincipalProposeKonsultan ? (
            <Button size="sm" onClick={() => setAddingRole("KONSULTAN")} className="shrink-0" data-testid="button-propose-konsultan">
              + Propose Consultant
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No Consultant assigned to this project yet.
              {(canEdit || canPrincipalProposeKonsultan) && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => setAddingRole("KONSULTAN")}>
                    {canEdit ? "+ Add First Consultant" : "+ Propose Consultant"}
                  </Button>
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
                    {showRate && <th className="py-2 pr-3 font-medium text-right">Daily Rate</th>}
                    {showRate && <th className="py-2 pr-3 font-medium text-right">Est. Cost</th>}
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
                        <td className="py-2 pr-3 font-medium">
                          {r.userName ?? "—"}
                          {r.pendingPrincipalApproval && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/50 text-amber-500">
                              Pending Principal approval
                            </Badge>
                          )}
                        </td>
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
                        {showRate && (
                          <td className="py-2 pr-3 text-right font-mono">
                            <span className="inline-flex items-center gap-1 justify-end">
                              {formatIDR(r.dailyRate ?? 0)}
                              {canEdit && (
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setRateResource(r)}
                                  title="Rate history"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </span>
                          </td>
                        )}
                        {showRate && <td className="py-2 pr-3 text-right font-mono">{formatIDR(planned * (r.dailyRate ?? 0))}</td>}
                        {(canEdit || canPrincipalManageRow(r)) && (
                          <td className="py-2 pr-3 text-right">
                            {r.pendingPrincipalApproval && isRowPrincipalApprover(r) ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-500"
                                  disabled={acceptMutation.isPending || rejectMutation.isPending}
                                  onClick={() => acceptMutation.mutate({ resourceId: r.id })}
                                  title="Approve assignment"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  disabled={acceptMutation.isPending || rejectMutation.isPending}
                                  onClick={() => {
                                    if (confirm(`Decline the assignment of ${r.userName}?`)) {
                                      rejectMutation.mutate({ resourceId: r.id });
                                    }
                                  }}
                                  title="Decline assignment"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
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
                            )}
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
                    {showRate && <td className="py-2 pr-3"></td>}
                    {showRate && <td className="py-2 pr-3 text-right font-mono text-primary">{formatIDR(estCost)}</td>}
                    {canEdit && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technical Writer Team — multi-pick, mirrors Consultant */}
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Technical Writer Team</CardTitle>
            <CardDescription>
              Technical Writers assigned to {project?.code ?? "this project"} to deliver the report.
            </CardDescription>
          </div>
          {canEdit ? (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSuggestRole("TECHNICAL_WRITER")}
                data-testid="button-suggest-tw"
              >
                <Sparkles className="h-4 w-4 mr-1" /> Suggest
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkVariant("TECHNICAL_WRITER")} data-testid="button-bulk-add-tw">
                <Users className="h-4 w-4 mr-1" /> Add Multiple
              </Button>
              <Button size="sm" onClick={() => setAddingRole("TECHNICAL_WRITER")} data-testid="button-add-tw">
                + Add Technical Writer
              </Button>
            </div>
          ) : canPrincipalProposeTw ? (
            <Button size="sm" onClick={() => setAddingRole("TECHNICAL_WRITER")} className="shrink-0" data-testid="button-propose-tw">
              + Propose Technical Writer
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {twList.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No Technical Writer assigned to this project yet.
              {(canEdit || canPrincipalProposeTw) && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => setAddingRole("TECHNICAL_WRITER")}>
                    {canEdit ? "+ Add First Technical Writer" : "+ Propose Technical Writer"}
                  </Button>
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
                    {showRate && <th className="py-2 pr-3 font-medium text-right">Daily Rate</th>}
                    {showRate && <th className="py-2 pr-3 font-medium text-right">Est. Cost</th>}
                    {(canEdit || canPrincipalProposeTw) && <th className="py-2 pr-3 font-medium text-right w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {twList.map((r: any) => {
                    const planned = r.plannedMandays ?? 0;
                    const actual = r.actualMandays ?? 0;
                    const pct = planned > 0 ? (actual / planned) * 100 : 0;
                    return (
                      <tr key={r.id ?? r.userId} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">
                          {r.userName ?? "—"}
                          {r.pendingPrincipalApproval && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/50 text-amber-500">
                              Pending Principal approval
                            </Badge>
                          )}
                        </td>
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
                        {showRate && (
                          <td className="py-2 pr-3 text-right font-mono">
                            <span className="inline-flex items-center gap-1 justify-end">
                              {formatIDR(r.dailyRate ?? 0)}
                              {canEdit && (
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setRateResource(r)}
                                  title="Rate history"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </span>
                          </td>
                        )}
                        {showRate && <td className="py-2 pr-3 text-right font-mono">{formatIDR(planned * (r.dailyRate ?? 0))}</td>}
                        {(canEdit || canPrincipalManageRow(r)) && (
                          <td className="py-2 pr-3 text-right">
                            {r.pendingPrincipalApproval && isRowPrincipalApprover(r) ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-500"
                                  disabled={acceptMutation.isPending || rejectMutation.isPending}
                                  onClick={() => acceptMutation.mutate({ resourceId: r.id })}
                                  title="Approve assignment"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  disabled={acceptMutation.isPending || rejectMutation.isPending}
                                  onClick={() => {
                                    if (confirm(`Decline the assignment of ${r.userName}?`)) {
                                      rejectMutation.mutate({ resourceId: r.id });
                                    }
                                  }}
                                  title="Decline assignment"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
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
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-xs font-medium">
                    <td colSpan={3} className="py-2 pr-3 text-muted-foreground">Total ({twList.length} {twList.length === 1 ? "person" : "people"})</td>
                    <td className="py-2 pr-3 text-right font-mono">{twTotalPlanned.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{twTotalActual.toFixed(1)}</td>
                    {showRate && <td className="py-2 pr-3"></td>}
                    {showRate && <td className="py-2 pr-3 text-right font-mono text-primary">{formatIDR(twEstCost)}</td>}
                    {(canEdit || canPrincipalProposeTw) && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Other Resources — flexible, for Sales / SOC Manager / Security Engineer / Junior SE / etc. */}
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Other Resources</CardTitle>
            <CardDescription>
              Add resources outside Consultant / Technical Writer (e.g. Sales, SOC Manager,
              Security Engineer, Junior Security Engineer). Enter a free-form position in the
              "Role on Project" field.
            </CardDescription>
          </div>
          {canEdit && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkVariant("OTHER")}
                data-testid="button-bulk-add-other-resource"
              >
                <Users className="h-4 w-4 mr-1" /> Add Multiple
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
                  setAddingRole("OTHER");
                }}
                data-testid="button-add-other-resource"
              >
                + Add Other Resource
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {otherList.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No additional resources yet. Click the button above to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Role on Project</th>
                    <th className="py-2 pr-3 font-medium">System Role</th>
                    <th className="py-2 pr-3 font-medium text-right">Planned (md)</th>
                    <th className="py-2 pr-3 font-medium text-right">Actual (md)</th>
                    {showRate && <th className="py-2 pr-3 font-medium text-right">Daily Rate</th>}
                    {showRate && <th className="py-2 pr-3 font-medium text-right">Est. Cost</th>}
                    {canEdit && <th className="py-2 pr-3 font-medium text-right w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {otherList.map((r: any) => {
                    const planned = r.plannedMandays ?? 0;
                    const actual = r.actualMandays ?? 0;
                    return (
                      <tr key={r.id ?? r.userId} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">
                          {r.userName ?? "—"}
                          {r.pendingPrincipalApproval && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/50 text-amber-500">
                              Pending Principal approval
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {r.roleInProject ?? <span className="text-muted-foreground italic">not set</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-[10px]">
                            {RoleLabels[r.userRole as keyof typeof RoleLabels] ?? r.userRole}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{planned.toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{actual.toFixed(1)}</td>
                        {showRate && <td className="py-2 pr-3 text-right font-mono">{formatIDR(r.dailyRate ?? 0)}</td>}
                        {showRate && (
                          <td className="py-2 pr-3 text-right font-mono">
                            {formatIDR(planned * (r.dailyRate ?? 0))}
                          </td>
                        )}
                        {canEdit && (
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
                    <td colSpan={3} className="py-2 pr-3 text-muted-foreground">
                      Total ({otherList.length} {otherList.length === 1 ? "person" : "people"})
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{otherTotalPlanned.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{otherTotalActual.toFixed(1)}</td>
                    {showRate && <td className="py-2 pr-3"></td>}
                    {showRate && <td className="py-2 pr-3 text-right font-mono text-primary">{formatIDR(otherEstCost)}</td>}
                    {canEdit && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {bulkVariant && (
        <BulkAddResourcesDialog
          open={!!bulkVariant}
          onOpenChange={(o) => { if (!o) setBulkVariant(null); }}
          projectId={projectId}
          variant={bulkVariant}
          candidates={
            bulkVariant === "KONSULTAN"
              ? availableKonsultan
              : bulkVariant === "TECHNICAL_WRITER"
                ? availableWriters
                : otherPool
          }
          workstreamId={null}
        />
      )}

      <Dialog open={!!addingRole} onOpenChange={(o) => !o && setAddingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {canEdit ? "Add" : "Propose"} {dialogRoleLabel} to {project?.code ?? "Project"}
            </DialogTitle>
            <DialogDescription>
              {canEdit
                ? (addingRole === "KONSULTAN"
                    ? "Assign a Consultant to this project. Multiple Consultants can be assigned per project."
                    : addingRole === "TECHNICAL_WRITER"
                      ? "Assign a Technical Writer to this project. Multiple Technical Writers can be assigned per project."
                      : "Add any user (Sales, SOC Manager, Security Engineer, etc.) as a resource. Enter their position under \"Role on Project\".")
                : "Pick one of your supervisees to propose. The PM will be notified and may accept or replace your proposal."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{dialogRoleLabel}</Label>
              <Select value={form.userId} onValueChange={(v) => {
                const picked = dialogPool.find((u: any) => u.id === v);
                setForm({ ...form, userId: v, dailyRate: picked?.dailyRate ? String(picked.dailyRate) : form.dailyRate });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={dialogOptions.length === 0 ? `No ${dialogRoleLabel} available` : `Select a ${dialogRoleLabel}`} />
                </SelectTrigger>
                <SelectContent>
                  {dialogOptions.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {canEdit && addingRole === "KONSULTAN" && (
                        <span className={`text-xs ${u.atCapacity ? "text-amber-500" : "text-muted-foreground"}`}>
                          {" "}— {u.activeProjectCount} active{u.atCapacity ? " (at capacity)" : ""}
                        </span>
                      )}
                      {canEdit && addingRole === "TECHNICAL_WRITER" && typeof u.activeProjectCount === "number" && (
                        <span className="text-muted-foreground text-xs">
                          {" "}— {u.activeProjectCount} active
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Role on Project{" "}
                {addingRole === "OTHER" ? (
                  <span className="text-destructive text-xs">*</span>
                ) : (
                  <span className="text-muted-foreground text-xs">(optional)</span>
                )}
              </Label>
              <Input
                placeholder={
                  addingRole === "OTHER"
                    ? "e.g. SOC Manager, Security Engineer, Junior SE, Sales Support"
                    : "e.g. Lead Consultant, Penetration Tester"
                }
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
            <WorkstreamPicker
              projectId={projectId}
              value={formWorkstreamId}
              onChange={setFormWorkstreamId}
              enabled={!!project?.useWorkstreams}
              testId="select-resource-workstream"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingRole(null)} disabled={addMutation.isPending || proposeMutation.isPending}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending || proposeMutation.isPending || !form.userId}>
              {addMutation.isPending || proposeMutation.isPending
                ? (canEdit ? "Saving..." : "Proposing...")
                : (canEdit ? "Add" : "Propose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {suggestRole && (
        <SkillRecommenderDialog
          open={!!suggestRole}
          onOpenChange={(o) => !o && setSuggestRole(null)}
          projectId={projectId}
          role={suggestRole}
          onSelect={(userId) => {
            setAddingRole(suggestRole);
            setForm((f) => ({ ...f, userId }));
            setSuggestRole(null);
          }}
        />
      )}

      {rateResource && (
        <RateHistoryDialog
          resource={rateResource}
          projectId={projectId}
          canEdit={canEdit}
          onClose={() => setRateResource(null)}
        />
      )}
    </div>
  );
}

function RateHistoryDialog({
  resource,
  projectId,
  canEdit,
  onClose,
}: {
  resource: any;
  projectId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rates, isLoading } = useListResourceRates(resource.id, {
    query: { queryKey: getListResourceRatesQueryKey(resource.id) },
  });
  const [form, setForm] = useState({
    costRate: String(resource.dailyRate ?? ""),
    sellingRate: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const createMutation = useCreateResourceRate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResourceRatesQueryKey(resource.id) });
        queryClient.invalidateQueries({ queryKey: getListProjectResourcesQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getGetProjectFinancialsQueryKey(projectId) });
        toast({ title: "Rate period added" });
      },
      onError: (err: any) => {
        toast({
          title: "Failed to add rate period",
          description: err?.body?.reason ?? err?.body?.error ?? err?.message ?? "Unknown error",
          variant: "destructive",
        });
      },
    },
  });

  const handleAdd = () => {
    const costRate = Number(form.costRate);
    if (!Number.isFinite(costRate) || costRate <= 0) {
      toast({ title: "Cost rate must be greater than 0", variant: "destructive" });
      return;
    }
    if (!form.effectiveFrom) {
      toast({ title: "Effective date is required", variant: "destructive" });
      return;
    }
    const sellingRate = form.sellingRate.trim() === "" ? null : Number(form.sellingRate);
    if (sellingRate != null && (!Number.isFinite(sellingRate) || sellingRate < 0)) {
      toast({ title: "Selling rate must be a valid number", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      resourceId: resource.id,
      data: { costRate, sellingRate, effectiveFrom: form.effectiveFrom },
    });
  };

  const list: any[] = Array.isArray(rates) ? rates : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rate History — {resource.userName ?? "Resource"}</DialogTitle>
          <DialogDescription>
            Cost rate periods for this assignment. Timesheet costing uses the rate in effect on each work date;
            dates before the earliest period fall back to the resource's base daily rate.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-4 text-sm text-muted-foreground">Loading…</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No rate periods yet. The base daily rate {formatIDR(resource.dailyRate ?? 0)} applies to all dates.
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Effective From</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Cost Rate</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Selling Rate</th>
                  <th className="py-1.5 font-medium">Added By</th>
                </tr>
              </thead>
              <tbody>
                {list.map((rate: any) => (
                  <tr key={rate.id} className="border-b border-border/40">
                    <td className="py-1.5 pr-3">{formatDate(rate.effectiveFrom)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{formatIDR(rate.costRate ?? 0)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {rate.sellingRate != null ? formatIDR(rate.sellingRate) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">{rate.createdByName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground">Add rate period</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Effective From</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cost Rate (IDR/day)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.costRate}
                  onChange={(e) => setForm((f) => ({ ...f, costRate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Selling Rate (optional)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="—"
                  value={form.sellingRate}
                  onChange={(e) => setForm((f) => ({ ...f, sellingRate: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Selling rate is informational only; it is not used in cost or margin calculations.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canEdit && (
            <Button onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Add Period"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default ResourcesTab;
