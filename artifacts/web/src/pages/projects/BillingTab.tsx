import { useMemo, useState } from "react";
import {
  useListBillingMilestones,
  useCreateBillingMilestone,
  useUpdateBillingMilestone,
  useDeleteBillingMilestone,
  getListBillingMilestonesQueryKey,
  type BillingMilestone,
  type BillingMilestoneStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatIDR } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";
import { Plus, Trash2, Pencil, Loader2, Receipt, AlertCircle } from "lucide-react";

const STATUS_LABEL: Record<BillingMilestoneStatus, string> = {
  PLANNED: "Planned",
  INVOICED: "Invoiced",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const STATUS_STYLE: Record<BillingMilestoneStatus, string> = {
  PLANNED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  INVOICED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PAID: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

interface BillingTabProps {
  projectId: string;
  project: { pmId?: string | null; contractValue?: number };
}

export default function BillingTab({ projectId, project }: BillingTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: milestones, isLoading } = useListBillingMilestones(projectId, {
    query: { queryKey: getListBillingMilestonesQueryKey(projectId) },
  });

  const isManager =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<BillingMilestone | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListBillingMilestonesQueryKey(projectId) });
  };

  const deleteMutation = useDeleteBillingMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone deleted" });
        invalidate();
      },
      onError: (e: any) =>
        toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
    },
  });

  const summary = useMemo(() => {
    const list = milestones ?? [];
    const totalPct = list
      .filter((m) => m.status !== "CANCELLED")
      .reduce((s, m) => s + (m.percentage || 0), 0);
    const cv = project.contractValue ?? 0;
    const planned = list.filter((m) => m.status === "PLANNED").length;
    const invoiced = list
      .filter((m) => m.status === "INVOICED" || m.status === "PAID")
      .reduce((s, m) => s + (m.amount ?? (cv * (m.percentage || 0)) / 100), 0);
    const paid = list
      .filter((m) => m.status === "PAID")
      .reduce((s, m) => s + (m.amount ?? (cv * (m.percentage || 0)) / 100), 0);
    return { totalPct, planned, invoiced, paid };
  }, [milestones, project.contractValue]);

  function amountFor(m: BillingMilestone): number {
    if (m.amount != null) return m.amount;
    return ((project.contractValue ?? 0) * (m.percentage || 0)) / 100;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="% Allocated" value={`${summary.totalPct.toFixed(1)}%`} />
        <Stat label="Planned" value={String(summary.planned)} />
        <Stat label="Invoiced" value={formatIDR(summary.invoiced)} tone="info" />
        <Stat label="Paid" value={formatIDR(summary.paid)} tone="success" />
      </div>

      {summary.totalPct > 100 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          Total allocation {summary.totalPct.toFixed(1)}% exceeds 100% of the contract value.
        </div>
      )}
      {summary.totalPct < 100 && (milestones ?? []).length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-400 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          Total allocation {summary.totalPct.toFixed(1)}% — {(100 - summary.totalPct).toFixed(1)}% short of 100%.
        </div>
      )}

      <Card className="rounded-xl border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Billing Plan (Terms of Payment)
            </CardTitle>
            <CardDescription>
              Plan billing milestones and their share of the contract value. Example: 30% DP, 40% Mid, 30% After BAST.
            </CardDescription>
          </div>
          {isManager && (
            <Button onClick={() => setCreateOpen(true)} data-testid="button-new-milestone">
              <Plus className="h-4 w-4 mr-2" /> New Milestone
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : !milestones?.length ? (
            <EmptyState
              title="No billing milestones yet"
              description={
                isManager
                  ? "Add the first billing milestone for this project."
                  : "The PM hasn't set up a billing plan for this project yet."
              }
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Milestone</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m, idx) => (
                  <TableRow key={m.id} className="hover:bg-muted/30 align-top">
                    <TableCell className="text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      {m.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{m.percentage.toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono">{formatIDR(amountFor(m))}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{m.dueDate ? formatDate(m.dueDate) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLE[m.status]}>
                        {STATUS_LABEL[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{m.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {isManager && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => setEditRow(m)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete milestone "${m.name}"?`)) {
                                  deleteMutation.mutate({ milestoneId: m.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <MilestoneFormDialog
          projectId={projectId}
          contractValue={project.contractValue ?? 0}
          onClose={() => setCreateOpen(false)}
          onSaved={invalidate}
        />
      )}
      {editRow && (
        <MilestoneFormDialog
          projectId={projectId}
          contractValue={project.contractValue ?? 0}
          milestone={editRow}
          onClose={() => setEditRow(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "primary" | "success" | "info";
}) {
  const toneMap = {
    muted: "text-foreground",
    primary: "text-primary",
    success: "text-emerald-500",
    info: "text-blue-400",
  };
  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MilestoneFormDialog({
  projectId,
  contractValue,
  milestone,
  onClose,
  onSaved,
}: {
  projectId: string;
  contractValue: number;
  milestone?: BillingMilestone;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const editing = !!milestone;
  const [name, setName] = useState(milestone?.name ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [percentage, setPercentage] = useState<string>(String(milestone?.percentage ?? 0));
  const [overrideAmount, setOverrideAmount] = useState<boolean>(milestone?.amount != null);
  const [amount, setAmount] = useState<string>(String(milestone?.amount ?? ""));
  const [dueDate, setDueDate] = useState(milestone?.dueDate ? milestone.dueDate.slice(0, 10) : "");
  const [status, setStatus] = useState<BillingMilestoneStatus>(milestone?.status ?? "PLANNED");
  const [invoiceNumber, setInvoiceNumber] = useState(milestone?.invoiceNumber ?? "");

  const create = useCreateBillingMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone created" });
        onSaved();
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Create failed", description: e?.message, variant: "destructive" }),
    },
  });
  const update = useUpdateBillingMilestone({
    mutation: {
      onSuccess: () => {
        toast({ title: "Milestone updated" });
        onSaved();
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
    },
  });

  const submitting = create.isPending || update.isPending;
  const pctNum = Number(percentage);
  const amtNum = overrideAmount ? Number(amount) : null;
  const computedAmount =
    amtNum != null && isFinite(amtNum) ? amtNum : (contractValue * (isFinite(pctNum) ? pctNum : 0)) / 100;

  const canSubmit =
    name.trim().length > 0 && isFinite(pctNum) && pctNum >= 0 && pctNum <= 100 && !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      percentage: pctNum,
      amount: overrideAmount && isFinite(Number(amount)) ? Number(amount) : null,
      dueDate: dueDate || null,
      invoiceNumber: invoiceNumber.trim() || null,
    };
    if (editing && milestone) {
      update.mutate({
        milestoneId: milestone.id,
        data: { ...payload, status } as any,
      });
    } else {
      create.mutate({ id: projectId, data: payload as any });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Milestone" : "New Billing Milestone"}</DialogTitle>
          <DialogDescription>
            Each milestone represents a billing term to the client. Percentages are computed from the contract value.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DP 30% Setelah Kontrak"
              data-testid="input-milestone-name"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — billing prerequisites, documents to submit, etc."
              className="resize-none h-16"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Percentage (%) *</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                data-testid="input-milestone-pct"
              />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="rounded-md border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={overrideAmount}
                onChange={(e) => setOverrideAmount(e.target.checked)}
              />
              Override amount (default: computed from percentage × contract)
            </label>
            {overrideAmount ? (
              <Input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount in IDR"
                data-testid="input-milestone-amount"
              />
            ) : (
              <p className="text-xs font-mono text-muted-foreground">
                = {formatIDR(computedAmount)}
              </p>
            )}
          </div>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as BillingMilestoneStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as BillingMilestoneStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoice Number</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-001"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-testid="button-save-milestone">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {editing ? "Save Changes" : "Create Milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
