import { useState } from "react";
import {
  useListProjectWorkstreams,
  useCreateProjectWorkstream,
  useUpdateWorkstream,
  useDeleteWorkstream,
  getListProjectWorkstreamsQueryKey,
  useListBusinessUnits,
  type ProjectWorkstream,
  type WorkstreamStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatIDR, formatDate } from "@/lib/format";
import { Plus, Pencil, Trash2, AlertTriangle, Layers } from "lucide-react";

type ProjectLike = {
  id: string;
  pmId?: string | null;
  contractValue?: number | null;
};

const STATUS_LABELS: Record<WorkstreamStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANTS: Record<WorkstreamStatus, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  ON_HOLD: "secondary",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

type FormState = {
  code: string;
  name: string;
  description: string;
  businessUnitId: string;
  allocationPct: string;
  plannedMandays: string;
  estimatedCost: string;
  startDate: string;
  endDate: string;
  status: WorkstreamStatus;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  description: "",
  businessUnitId: "",
  allocationPct: "0",
  plannedMandays: "0",
  estimatedCost: "0",
  startDate: "",
  endDate: "",
  status: "ACTIVE",
};

function toIsoOrNull(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function WorkstreamsTab({
  projectId,
  project,
}: {
  projectId: string;
  project: ProjectLike;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const canWrite =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id);

  const wsQuery = useListProjectWorkstreams(projectId, {
    query: { queryKey: getListProjectWorkstreamsQueryKey(projectId), enabled: !!projectId },
  });
  const buQuery = useListBusinessUnits();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListProjectWorkstreamsQueryKey(projectId) });

  const createMut = useCreateProjectWorkstream({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        setForm(emptyForm);
        toast({ title: "Workstream created" });
      },
      onError: (err: unknown) => {
        const e = err as { data?: { error?: string } };
        toast({
          variant: "destructive",
          title: "Failed to create workstream",
          description: e?.data?.error,
        });
      },
    },
  });

  const updateMut = useUpdateWorkstream({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        setEditing(null);
        setForm(emptyForm);
        toast({ title: "Workstream updated" });
      },
      onError: (err: unknown) => {
        const e = err as { data?: { error?: string } };
        toast({
          variant: "destructive",
          title: "Failed to update workstream",
          description: e?.data?.error,
        });
      },
    },
  });

  const deleteMut = useDeleteWorkstream({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteTarget(null);
        toast({ title: "Workstream deleted" });
      },
      onError: (err: unknown) => {
        const e = err as { data?: { error?: string } };
        toast({
          variant: "destructive",
          title: "Failed to delete workstream",
          description: e?.data?.error,
        });
      },
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectWorkstream | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectWorkstream | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const items = wsQuery.data ?? [];
  const totalAllocation = items.reduce((s, w) => s + (w.allocationPct || 0), 0);
  const totalMandays = items.reduce((s, w) => s + (w.plannedMandays || 0), 0);
  const totalEstCost = items.reduce((s, w) => s + (w.estimatedCost || 0), 0);
  const allocationOff = items.length > 0 && Math.abs(totalAllocation - 100) > 0.01;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(w: ProjectWorkstream) {
    setEditing(w);
    setForm({
      code: w.code,
      name: w.name,
      description: w.description ?? "",
      businessUnitId: w.businessUnitId ?? "",
      allocationPct: String(w.allocationPct ?? 0),
      plannedMandays: String(w.plannedMandays ?? 0),
      estimatedCost: String(w.estimatedCost ?? 0),
      startDate: toDateInputValue(w.startDate),
      endDate: toDateInputValue(w.endDate),
      status: w.status,
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      businessUnitId: form.businessUnitId || null,
      allocationPct: Number(form.allocationPct) || 0,
      plannedMandays: Number(form.plannedMandays) || 0,
      estimatedCost: Number(form.estimatedCost) || 0,
      startDate: toIsoOrNull(form.startDate),
      endDate: toIsoOrNull(form.endDate),
      status: form.status,
    };
    if (!payload.code) {
      toast({ variant: "destructive", title: "Code is required" });
      return;
    }
    if (!payload.name) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    if (editing) {
      updateMut.mutate({ wsId: editing.id, data: payload });
    } else {
      createMut.mutate({ id: projectId, data: payload });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Workstreams
              </CardTitle>
              <CardDescription>
                Break this project into sub-projects per Business Unit. Each
                workstream tracks its own allocation, planned mandays, estimated
                cost, and can carry its own resources, tasks, expenses, and billing
                milestones.
              </CardDescription>
            </div>
            {canWrite && (
              <Button onClick={openCreate} data-testid="btn-add-workstream">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Workstream
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length > 0 && (
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Workstreams" value={String(items.length)} />
              <Stat
                label="Total Allocation"
                value={`${totalAllocation.toFixed(2)}%`}
                tone={allocationOff ? "warn" : undefined}
              />
              <Stat label="Total Planned Mandays" value={totalMandays.toFixed(1)} />
              <Stat label="Total Estimated Cost" value={formatIDR(totalEstCost)} />
            </div>
          )}

          {allocationOff && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-amber-200">
                  Allocation totals {totalAllocation.toFixed(2)}% (should be 100%)
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Adjust each workstream's allocation so the sum equals 100% of the
                  project's contract value. Reports that split P&amp;L per BU rely on
                  this percentage.
                </div>
              </div>
            </div>
          )}

          {wsQuery.isLoading && !wsQuery.data ? (
            <div className="p-10 text-center text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No workstreams yet"
              description={
                canWrite
                  ? "Add a workstream to split this project across multiple Business Units (e.g. Pentest, Threat Hunting, GRC)."
                  : "This project has no workstreams. A PM or Management can add them."
              }
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Business Unit</TableHead>
                  <TableHead className="text-right">Alloc %</TableHead>
                  <TableHead className="text-right">Planned MD</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => (
                  <TableRow key={w.id} data-testid={`row-workstream-${w.id}`}>
                    <TableCell className="font-mono text-xs">{w.code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{w.name}</div>
                      {w.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {w.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {w.businessUnitName ? (
                        <Badge variant="outline">{w.businessUnitName}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {w.allocationPct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {w.plannedMandays.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatIDR(w.estimatedCost)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {w.startDate ? formatDate(w.startDate) : "—"}
                      {" → "}
                      {w.endDate ? formatDate(w.endDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[w.status]}>
                        {STATUS_LABELS[w.status]}
                      </Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(w)}
                            data-testid={`btn-edit-workstream-${w.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(w)}
                            data-testid={`btn-delete-workstream-${w.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Workstream" : "Add Workstream"}</DialogTitle>
            <DialogDescription>
              Workstreams split a project across Business Units. The allocation
              percentage drives how revenue, cost, and margin are attributed to
              each BU in reports.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-code">Code *</Label>
                <Input
                  id="ws-code"
                  placeholder="e.g. PT-01"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  data-testid="input-workstream-code"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as WorkstreamStatus })}
                >
                  <SelectTrigger id="ws-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as WorkstreamStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Name *</Label>
              <Input
                id="ws-name"
                placeholder="e.g. External Network Pentest"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="input-workstream-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea
                id="ws-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-bu">Business Unit</Label>
              <Select
                value={form.businessUnitId || "_none"}
                onValueChange={(v) => setForm({ ...form, businessUnitId: v === "_none" ? "" : v })}
              >
                <SelectTrigger id="ws-bu"><SelectValue placeholder="Select BU" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {(buQuery.data ?? []).map((bu) => (
                    <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-alloc">Allocation %</Label>
                <Input
                  id="ws-alloc"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.allocationPct}
                  onChange={(e) => setForm({ ...form, allocationPct: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-md">Planned Mandays</Label>
                <Input
                  id="ws-md"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.plannedMandays}
                  onChange={(e) => setForm({ ...form, plannedMandays: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-cost">Estimated Cost (IDR)</Label>
                <Input
                  id="ws-cost"
                  type="number"
                  min="0"
                  step="1000"
                  value={form.estimatedCost}
                  onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-start">Start Date</Label>
                <Input
                  id="ws-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-end">End Date</Label>
                <Input
                  id="ws-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            {project.contractValue && form.allocationPct ? (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                Allocated value at {Number(form.allocationPct).toFixed(2)}% of the
                project's contract value ={" "}
                <span className="font-semibold text-foreground">
                  {formatIDR(((project.contractValue || 0) * Number(form.allocationPct)) / 100)}
                </span>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              data-testid="btn-save-workstream"
            >
              {editing ? "Save changes" : "Create workstream"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workstream?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Delete workstream{" "}
                  <span className="font-mono">{deleteTarget.code}</span> —{" "}
                  <span className="font-medium">{deleteTarget.name}</span>?
                  Any resources, tasks, expenses, or billing milestones linked to
                  it will be detached (set to no workstream) but not deleted.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate({ wsId: deleteTarget.id })}
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " +
        (tone === "warn"
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card")
      }
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 text-lg font-semibold tabular-nums " +
          (tone === "warn" ? "text-amber-300" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
