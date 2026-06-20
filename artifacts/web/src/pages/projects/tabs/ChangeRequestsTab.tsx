import { useState } from "react";
import {
  useListProjectChangeRequests,
  useCreateProjectChangeRequest,
  useUpdateChangeRequest,
  useDeleteChangeRequest,
  useApproveChangeRequest,
  useRejectChangeRequest,
  useApplyChangeRequest,
  getListProjectChangeRequestsQueryKey,
  type ChangeRequest,
  type ChangeRequestType,
  type ChangeRequestStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Check, X, Rocket, FileEdit, CalendarClock, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { formatDate, formatIDR } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";

type CrProject = { id: string; pmId?: string | null };

const TYPE_LABELS: Record<ChangeRequestType, string> = {
  SCOPE: "Scope",
  SCHEDULE: "Schedule",
  COST: "Cost",
};

const TYPE_ICONS: Record<ChangeRequestType, React.ComponentType<{ className?: string }>> = {
  SCOPE: FileEdit,
  SCHEDULE: CalendarClock,
  COST: DollarSign,
};

const STATUS_COLORS: Record<ChangeRequestStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  APPROVED: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  APPLIED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  REJECTED: "bg-red-500/15 text-red-400 border-red-500/40",
};

const STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  APPLIED: "Applied",
  REJECTED: "Rejected",
};

type FormState = {
  type: ChangeRequestType;
  title: string;
  description: string;
  impactSummary: string;
  proposedStartDate: string;
  proposedEndDate: string;
  proposedPlannedMandays: string;
  proposedEstimatedCost: string;
  proposedContractValue: string;
};

const EMPTY_FORM: FormState = {
  type: "SCOPE",
  title: "",
  description: "",
  impactSummary: "",
  proposedStartDate: "",
  proposedEndDate: "",
  proposedPlannedMandays: "",
  proposedEstimatedCost: "",
  proposedContractValue: "",
};

function toNumberOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function ChangeRequestsTab({
  projectId,
  project,
}: {
  projectId: string;
  project: CrProject;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useListProjectChangeRequests(projectId);

  const canManage =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user.id);

  const create = useCreateProjectChangeRequest();
  const update = useUpdateChangeRequest();
  const del = useDeleteChangeRequest();
  const approve = useApproveChangeRequest();
  const reject = useRejectChangeRequest();
  const apply = useApplyChangeRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChangeRequest | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function refresh() {
    qc.invalidateQueries({ queryKey: getListProjectChangeRequestsQueryKey(projectId) });
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(cr: ChangeRequest) {
    setEditing(cr);
    setForm({
      type: cr.type,
      title: cr.title,
      description: cr.description ?? "",
      impactSummary: cr.impactSummary ?? "",
      proposedStartDate: cr.proposedStartDate ? cr.proposedStartDate.slice(0, 10) : "",
      proposedEndDate: cr.proposedEndDate ? cr.proposedEndDate.slice(0, 10) : "",
      proposedPlannedMandays:
        cr.proposedPlannedMandays != null ? String(cr.proposedPlannedMandays) : "",
      proposedEstimatedCost:
        cr.proposedEstimatedCost != null ? String(cr.proposedEstimatedCost) : "",
      proposedContractValue:
        cr.proposedContractValue != null ? String(cr.proposedContractValue) : "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const data = {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      impactSummary: form.impactSummary.trim() || null,
      proposedStartDate: form.proposedStartDate || null,
      proposedEndDate: form.proposedEndDate || null,
      proposedPlannedMandays: toNumberOrNull(form.proposedPlannedMandays),
      proposedEstimatedCost: toNumberOrNull(form.proposedEstimatedCost),
      proposedContractValue: toNumberOrNull(form.proposedContractValue),
    };
    try {
      if (editing) {
        await update.mutateAsync({ crId: editing.id, data });
      } else {
        await create.mutateAsync({ id: projectId, data });
      }
      refresh();
      setDialogOpen(false);
      toast({ title: editing ? "Change request updated" : "Change request created" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(cr: ChangeRequest) {
    if (!confirm(`Delete change request "${cr.title}"?`)) return;
    try {
      await del.mutateAsync({ crId: cr.id });
      refresh();
      toast({ title: "Change request deleted" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleApprove(cr: ChangeRequest) {
    try {
      await approve.mutateAsync({ crId: cr.id, data: {} });
      refresh();
      toast({ title: "Change request approved" });
    } catch (err) {
      toast({
        title: "Approve failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleReject(cr: ChangeRequest) {
    const note = prompt("Reason for rejection (optional):") ?? "";
    try {
      await reject.mutateAsync({ crId: cr.id, data: { decisionNote: note.trim() || null } });
      refresh();
      toast({ title: "Change request rejected" });
    } catch (err) {
      toast({
        title: "Reject failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleApply(cr: ChangeRequest) {
    const reBaseline = cr.type === "SCHEDULE" || cr.type === "COST";
    const msg = reBaseline
      ? `Apply "${cr.title}"? This updates the project plan and creates a new baseline version.`
      : `Apply "${cr.title}"? This updates the project plan.`;
    if (!confirm(msg)) return;
    try {
      await apply.mutateAsync({ crId: cr.id });
      refresh();
      toast({ title: "Change request applied" });
    } catch (err) {
      toast({
        title: "Apply failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  const summary = {
    draft: items.filter((c) => c.status === "DRAFT").length,
    approved: items.filter((c) => c.status === "APPROVED").length,
    applied: items.filter((c) => c.status === "APPLIED").length,
    rejected: items.filter((c) => c.status === "REJECTED").length,
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Change Requests</h3>
          <p className="text-sm text-muted-foreground">
            Formal change control for scope, schedule, and cost. Applying a schedule or cost
            change re-baselines the project.
          </p>
        </div>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="button-add-change-request">
                <Plus className="mr-2 h-4 w-4" /> New Change Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "New"} Change Request</DialogTitle>
                <DialogDescription>
                  Document a proposed change. Fill in only the proposed values relevant to the
                  change type.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((s) => ({ ...s, type: v as ChangeRequestType }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["SCOPE", "SCHEDULE", "COST"] as ChangeRequestType[]).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Impact Summary</Label>
                  <Textarea
                    rows={2}
                    value={form.impactSummary}
                    onChange={(e) => setForm((s) => ({ ...s, impactSummary: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposed Start Date</Label>
                  <Input
                    type="date"
                    value={form.proposedStartDate}
                    onChange={(e) => setForm((s) => ({ ...s, proposedStartDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposed End Date</Label>
                  <Input
                    type="date"
                    value={form.proposedEndDate}
                    onChange={(e) => setForm((s) => ({ ...s, proposedEndDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposed Planned Mandays</Label>
                  <Input
                    type="number"
                    value={form.proposedPlannedMandays}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, proposedPlannedMandays: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposed Estimated Cost (IDR)</Label>
                  <Input
                    type="number"
                    value={form.proposedEstimatedCost}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, proposedEstimatedCost: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Proposed Contract Value (IDR)</Label>
                  <Input
                    type="number"
                    value={form.proposedContractValue}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, proposedContractValue: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
                  {editing ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-2xl font-semibold">{summary.draft}</div>
          <div className="text-xs text-muted-foreground">Draft</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-semibold text-blue-400">{summary.approved}</div>
          <div className="text-xs text-muted-foreground">Approved</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-semibold text-emerald-400">{summary.applied}</div>
          <div className="text-xs text-muted-foreground">Applied</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-semibold text-red-400">{summary.rejected}</div>
          <div className="text-xs text-muted-foreground">Rejected</div>
        </CardContent></Card>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileEdit className="h-12 w-12 text-muted-foreground/50" />}
          title="No change requests"
          description="Raise a change request to track scope, schedule, or cost changes."
        />
      ) : (
        <div className="space-y-3">
          {items.map((cr) => {
            const Icon = TYPE_ICONS[cr.type];
            return (
              <Card key={cr.id} data-testid={`change-request-${cr.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{cr.title}</span>
                        <Badge variant="outline">{TYPE_LABELS[cr.type]}</Badge>
                        <Badge variant="outline" className={STATUS_COLORS[cr.status]}>
                          {STATUS_LABELS[cr.status]}
                        </Badge>
                      </div>
                      {cr.description && (
                        <p className="mt-1.5 text-sm text-muted-foreground">{cr.description}</p>
                      )}
                      {cr.impactSummary && (
                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">Impact: </span>
                          {cr.impactSummary}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {cr.proposedStartDate && (
                          <span>Start → {formatDate(cr.proposedStartDate)}</span>
                        )}
                        {cr.proposedEndDate && (
                          <span>End → {formatDate(cr.proposedEndDate)}</span>
                        )}
                        {cr.proposedPlannedMandays != null && (
                          <span>Mandays → {cr.proposedPlannedMandays}</span>
                        )}
                        {cr.proposedEstimatedCost != null && (
                          <span>Est. Cost → {formatIDR(cr.proposedEstimatedCost)}</span>
                        )}
                        {cr.proposedContractValue != null && (
                          <span>Contract → {formatIDR(cr.proposedContractValue)}</span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {cr.requestedByName && <span>Requested by {cr.requestedByName} · </span>}
                        {formatDate(cr.createdAt)}
                        {cr.decidedByName && cr.decidedAt && (
                          <span>
                            {" "}· {cr.status === "REJECTED" ? "Rejected" : "Approved"} by{" "}
                            {cr.decidedByName} on {formatDate(cr.decidedAt)}
                          </span>
                        )}
                        {cr.appliedAt && <span> · Applied {formatDate(cr.appliedAt)}</span>}
                      </div>
                      {cr.decisionNote && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Note: {cr.decisionNote}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {cr.status === "DRAFT" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(cr)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(cr)}
                              disabled={approve.isPending}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(cr)}
                              disabled={reject.isPending}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(cr)}
                              disabled={del.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </>
                        )}
                        {cr.status === "APPROVED" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApply(cr)}
                              disabled={apply.isPending}
                            >
                              <Rocket className="mr-1 h-3.5 w-3.5" /> Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(cr)}
                              disabled={reject.isPending}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
