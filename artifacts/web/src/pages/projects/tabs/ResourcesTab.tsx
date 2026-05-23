import { useParams, Link } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import SkillRecommenderDialog from "../components/SkillRecommenderDialog";
import { Sparkles } from "lucide-react";
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
  const [form, setForm] = useState({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
  const [suggestRole, setSuggestRole] = useState<null | "KONSULTAN" | "TECHNICAL_WRITER">(null);

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

  if (isLoading) return <LoadingPage />;
  const allList = resources ?? [];
  // Konsultan team
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

  // Technical Writer team (multi-pick, mirrors Konsultan)
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

  // Other Resources: anyone active in the system who isn't already a Konsultan/TW/AdminProject
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

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Konsultan Team</CardTitle>
            <CardDescription>
              Konsultan assigned to {project?.code ?? "this project"}. Multiple Konsultans can be assigned per project; the active-project count is shown for awareness only.
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
              <Button size="sm" onClick={() => setAddingRole("KONSULTAN")} data-testid="button-add-konsultan">
                + Add Konsultan
              </Button>
            </div>
          ) : canPrincipalProposeKonsultan ? (
            <Button size="sm" onClick={() => setAddingRole("KONSULTAN")} className="shrink-0" data-testid="button-propose-konsultan">
              + Propose Konsultan
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

      {/* Technical Writer Team — multi-pick, mirrors Konsultan */}
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
                    <th className="py-2 pr-3 font-medium text-right">Daily Rate</th>
                    <th className="py-2 pr-3 font-medium text-right">Est. Cost</th>
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
                    <td colSpan={3} className="py-2 pr-3 text-muted-foreground">Total ({twList.length} {twList.length === 1 ? "person" : "people"})</td>
                    <td className="py-2 pr-3 text-right font-mono">{twTotalPlanned.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{twTotalActual.toFixed(1)}</td>
                    <td className="py-2 pr-3"></td>
                    <td className="py-2 pr-3 text-right font-mono text-primary">{formatIDR(twEstCost)}</td>
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
            <Button
              size="sm"
              onClick={() => {
                setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
                setAddingRole("OTHER");
              }}
              className="shrink-0"
              data-testid="button-add-other-resource"
            >
              + Add Other Resource
            </Button>
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
                    <th className="py-2 pr-3 font-medium text-right">Daily Rate</th>
                    <th className="py-2 pr-3 font-medium text-right">Est. Cost</th>
                    {canEdit && <th className="py-2 pr-3 font-medium text-right w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {otherList.map((r: any) => {
                    const planned = r.plannedMandays ?? 0;
                    const actual = r.actualMandays ?? 0;
                    return (
                      <tr key={r.id ?? r.userId} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">{r.userName ?? "—"}</td>
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
                        <td className="py-2 pr-3 text-right font-mono">{formatIDR(r.dailyRate ?? 0)}</td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {formatIDR(planned * (r.dailyRate ?? 0))}
                        </td>
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
                    <td className="py-2 pr-3"></td>
                    <td className="py-2 pr-3 text-right font-mono text-primary">{formatIDR(otherEstCost)}</td>
                    {canEdit && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}


export default ResourcesTab;
