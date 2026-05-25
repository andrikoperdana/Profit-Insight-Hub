import { OverviewFileSlot, ConfirmRow, InfoRow, getMissingRequiredFields, type RequiredField } from "./overview/parts";
import { Stat } from "./FinancialsTab";
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
import BudgetConsumptionCard from "@/components/projects/BudgetConsumptionCard";

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
    vatPercent: String(project.vatPercent ?? 11),
    contractValueIncludesVat: project.contractValueIncludesVat ?? true,
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
      vatPercent: String(project.vatPercent ?? 11),
      contractValueIncludesVat: project.contractValueIncludesVat ?? true,
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
    const vp = Number(form.vatPercent);
    if (!isFinite(vp) || vp < 0 || vp > 100) {
      toast({
        variant: "destructive",
        title: "Invalid VAT",
        description: "VAT (VAT) percent must be a number between 0 and 100.",
      });
      return;
    }
    const data: Record<string, unknown> = isSalesDraftEdit
      ? {
          description: form.description.trim() || null,
          contractValue: Number(form.contractValue),
          vatPercent: vp,
          contractValueIncludesVat: form.contractValueIncludesVat,
        }
      : {
          description: form.description.trim() || null,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          contractValue: Number(form.contractValue),
          vatPercent: vp,
          contractValueIncludesVat: form.contractValueIncludesVat,
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

      <DocumentChecklistCard projectId={project.id} projectStatus={project.status} />

      {project.kind && project.kind !== "CLIENT" && canViewProjectFinancials(user?.role) && (
        <BudgetConsumptionCard
          budget={project.contractValue ?? 0}
          actualCost={project.actualCost ?? 0}
          kind={project.kind}
        />
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
                <OverviewFileSlot
                  label="SPK / PO File"
                  url={project.spkFileUrl}
                  fileName={project.spkFileName}
                  canEdit={canEdit}
                  uploading={update.isPending}
                  testIdPrefix="overview-spk"
                  downloadFallback="spk.pdf"
                  downloadLinkLabel="Download SPK / PO"
                  onUpload={(data) =>
                    update.mutate({
                      id: project.id,
                      data: { spkFileUrl: data.url, spkFileName: data.name } as any,
                    })
                  }
                  onRemove={() =>
                    update.mutate({
                      id: project.id,
                      data: { spkFileUrl: null, spkFileName: null } as any,
                    })
                  }
                />
                <OverviewFileSlot
                  label="Contract File"
                  url={project.contractFileUrl}
                  fileName={project.contractFileName}
                  canEdit={canEdit}
                  uploading={update.isPending}
                  testIdPrefix="overview-contract"
                  downloadFallback="contract.pdf"
                  downloadLinkLabel="Download Contract"
                  onUpload={(data) =>
                    update.mutate({
                      id: project.id,
                      data: { contractFileUrl: data.url, contractFileName: data.name } as any,
                    })
                  }
                  onRemove={() =>
                    update.mutate({
                      id: project.id,
                      data: { contractFileUrl: null, contractFileName: null } as any,
                    })
                  }
                />
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ov-vat">VAT (%)</Label>
                    <Input
                      id="ov-vat"
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={form.vatPercent}
                      onChange={(e) => setForm({ ...form, vatPercent: e.target.value })}
                      className="mt-1 font-mono"
                      data-testid="input-overview-vat"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ov-vat-type">Revenue type</Label>
                    <Select
                      value={form.contractValueIncludesVat ? "incl" : "excl"}
                      onValueChange={(v) => setForm({ ...form, contractValueIncludesVat: v === "incl" })}
                    >
                      <SelectTrigger id="ov-vat-type" className="mt-1" data-testid="select-overview-vat-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incl">Includes VAT (gross)</SelectItem>
                        <SelectItem value="excl">Excludes VAT (DPP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                  <ConfirmRow
                    label="VAT"
                    value={`${Number(form.vatPercent || 0)}% · ${form.contractValueIncludesVat ? "Includes VAT (gross)" : "Excludes VAT (DPP)"}`}
                  />
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




export default OverviewTab;

function DocumentChecklistCard({
  projectId,
  projectStatus,
}: {
  projectId: string;
  projectStatus: string;
}) {
  const { data: docs } = useListProjectDocuments(projectId);
  const list = (docs ?? []) as Array<{ type: string }>;

  const isComplete = projectStatus === "COMPLETE" || projectStatus === "CLOSED";
  const isActive =
    projectStatus === "ACTIVE" || projectStatus === "PAUSE" || isComplete;

  if (!isActive) return null;

  const items = [
    {
      key: "CONTRACT",
      label: "Contract / SPK",
      required: true,
      hint: "Signed contract or PO from client",
    },
    {
      key: "INVOICE",
      label: "Invoice",
      required: true,
      hint: "Invoice issued to client",
    },
    {
      key: "BAST",
      label: "BAST (Handover)",
      required: isComplete,
      hint: isComplete ? "Required before closing" : "Final handover document",
    },
    {
      key: "REPORT",
      label: "Final Report",
      required: isComplete,
      hint: isComplete ? "Required before closing" : "Deliverable report",
    },
  ];

  const rows = items.map((it) => {
    const count = list.filter((d) => d.type === it.key).length;
    const status: "ok" | "missing" | "optional" = count > 0
      ? "ok"
      : it.required
        ? "missing"
        : "optional";
    return { ...it, count, status };
  });

  const missingCount = rows.filter((r) => r.status === "missing").length;
  const requiredTotal = rows.filter((r) => r.required).length;
  const requiredReady = rows.filter((r) => r.required && r.count > 0).length;

  return (
    <Card className="border-border shadow-sm" data-testid="card-document-checklist">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Document Checklist
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            {missingCount === 0
              ? `All ${requiredTotal} required document${requiredTotal === 1 ? "" : "s"} are uploaded.`
              : `${missingCount} required document${missingCount > 1 ? "s" : ""} still missing — open the Documents tab to upload.`}
          </CardDescription>
        </div>
        <Badge
          variant={missingCount === 0 ? "default" : "destructive"}
          className="shrink-0"
        >
          {requiredReady}/{requiredTotal} ready
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((r) => (
            <div
              key={r.key}
              className={
                "flex items-start gap-3 p-3 rounded-md border " +
                (r.status === "ok"
                  ? "border-primary/40 bg-primary/5"
                  : r.status === "missing"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-muted/20")
              }
              data-testid={`checklist-${r.key.toLowerCase()}`}
            >
              <div className="mt-0.5">
                {r.status === "ok" ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : r.status === "missing" ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {r.label}
                    {r.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </p>
                  {r.count > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      ×{r.count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
