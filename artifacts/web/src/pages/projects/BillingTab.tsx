import { Fragment, useMemo, useState } from "react";
import {
  useListBillingMilestones,
  useCreateBillingMilestone,
  useUpdateBillingMilestone,
  useDeleteBillingMilestone,
  usePushMilestoneToXero,
  useSyncXeroPayments,
  useListProjectWorkstreams,
  useListProjectDocuments,
  getListBillingMilestonesQueryKey,
  getListProjectWorkstreamsQueryKey,
  getListProjectDocumentsQueryKey,
  type BillingMilestone,
  type BillingMilestoneStatus,
  type ProjectWorkstream,
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
import { canInvoiceProjectStatus, isSuperAdmin } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatIDR } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";
import { WorkstreamPicker } from "./components/WorkstreamPicker";
import { downloadAuthed, postAuthed } from "@/lib/exports";
import { Plus, Trash2, Pencil, Loader2, Receipt, AlertCircle, FileText, Download, Link2, Layers, RefreshCw } from "lucide-react";

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
  project: {
    pmId?: string | null;
    status?: string;
    contractValue?: number;
    vatPercent?: number;
    contractValueIncludesVat?: boolean;
    useWorkstreams?: boolean;
  };
}

function splitVat(
  amount: number,
  vatPercent: number,
  includesVat: boolean,
): { dpp: number; vat: number; gross: number } {
  if (!isFinite(amount) || amount <= 0) return { dpp: 0, vat: 0, gross: 0 };
  if (includesVat) {
    const dpp = amount / (1 + vatPercent / 100);
    return { dpp, vat: amount - dpp, gross: amount };
  }
  const vat = amount * (vatPercent / 100);
  return { dpp: amount, vat, gross: amount + vat };
}

export default function BillingTab({ projectId, project }: BillingTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: milestones, isLoading } = useListBillingMilestones(projectId, {
    query: { queryKey: getListBillingMilestonesQueryKey(projectId) },
  });

  const { data: workstreams } = useListProjectWorkstreams(projectId, {
    query: {
      queryKey: getListProjectWorkstreamsQueryKey(projectId),
      enabled: !!projectId && !!project.useWorkstreams,
    },
  });

  const { data: projectDocs } = useListProjectDocuments(projectId, undefined, {
    query: { queryKey: getListProjectDocumentsQueryKey(projectId), enabled: !!projectId },
  });
  const docUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of projectDocs ?? []) map.set(d.id, d.fileUrl);
    return map;
  }, [projectDocs]);

  const isManager =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user.id);

  const canPushXero =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    user?.role === "FINANCE" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user.id);

  // The pull-from-Xero endpoint is gated to MANAGEMENT/FINANCE only, so the
  // button must follow the same allowlist or PMs would hit a 403.
  const canSyncXero = isSuperAdmin(user?.role) || user?.role === "MANAGEMENT" || user?.role === "FINANCE";

  // A project can only be invoiced once it is running (ACTIVE) or beyond. Before
  // that (DRAFT / OBSERVATION / NO_NEED_CONSULTANT) invoicing actions are blocked.
  const canInvoiceNow = canInvoiceProjectStatus(project.status);
  const notInvoiceableReason = `The project is not active yet (status: ${project.status ?? "unknown"}). Set the project to Active before invoicing.`;

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<BillingMilestone | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListBillingMilestonesQueryKey(projectId) });
  };

  const pushToXero = usePushMilestoneToXero({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Sent to Xero",
          description: res.xeroInvoiceNumber
            ? `Created Xero invoice ${res.xeroInvoiceNumber}.`
            : "Xero invoice created.",
        });
        invalidate();
      },
      onError: (e: any) =>
        toast({ title: "Send to Xero failed", description: e?.message, variant: "destructive" }),
      onSettled: () => setBusyId(null),
    },
  });

  const syncFromXero = useSyncXeroPayments({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Synced from Xero",
          description:
            res.updated > 0
              ? `Checked ${res.checked} invoice(s); ${res.updated} marked as paid.`
              : `Checked ${res.checked} invoice(s); payment figures refreshed.`,
        });
        invalidate();
      },
      onError: (e: any) =>
        toast({ title: "Sync from Xero failed", description: e?.message, variant: "destructive" }),
    },
  });

  async function handleGenerateInvoice(m: BillingMilestone) {
    setBusyId(m.id);
    try {
      await postAuthed(`/api/billing-milestones/${m.id}/generate-invoice`);
      toast({ title: "Invoice generated", description: "Downloading the PDF…" });
      invalidate();
      await downloadAuthed(
        `/api/billing-milestones/${m.id}/invoice`,
        `Invoice-${m.name.replace(/[\\/]/g, "-")}.pdf`,
      );
    } catch (e: any) {
      toast({ title: "Generate invoice failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownloadInvoice(m: BillingMilestone) {
    setBusyId(m.id);
    try {
      await downloadAuthed(
        `/api/billing-milestones/${m.id}/invoice`,
        `Invoice-${(m.invoiceNumber ?? m.name).replace(/[\\/]/g, "-")}.pdf`,
      );
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

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

  const vatPercent = project.vatPercent ?? 11;
  const includesVat = project.contractValueIncludesVat ?? true;

  function amountFor(m: BillingMilestone): number {
    if (m.amount != null) return m.amount;
    return ((project.contractValue ?? 0) * (m.percentage || 0)) / 100;
  }

  const summary = useMemo(() => {
    const list = milestones ?? [];
    const totalPct = list
      .filter((m) => m.status !== "CANCELLED")
      .reduce((s, m) => s + (m.percentage || 0), 0);
    const planned = list.filter((m) => m.status === "PLANNED").length;
    let invoicedGross = 0, paidGross = 0;
    let invoicedDPP = 0, invoicedVat = 0;
    let paidVat = 0, outstandingVat = 0;
    for (const m of list) {
      if (m.status !== "INVOICED" && m.status !== "PAID") continue;
      const { dpp, vat, gross } = splitVat(amountFor(m), vatPercent, includesVat);
      invoicedGross += gross;
      invoicedDPP += dpp;
      invoicedVat += vat;
      if (m.status === "PAID") {
        paidGross += gross;
        paidVat += vat;
      } else {
        outstandingVat += vat;
      }
    }
    return { totalPct, planned, invoicedGross, paidGross, invoicedDPP, invoicedVat, paidVat, outstandingVat };
  }, [milestones, project.contractValue, vatPercent, includesVat]);

  const wsMap = useMemo(() => {
    const m = new Map<string, ProjectWorkstream>();
    for (const w of workstreams ?? []) m.set(w.id, w);
    return m;
  }, [workstreams]);

  // Group milestones by Business Unit (via their workstream). Falls back to a
  // single "Unassigned" bucket when a milestone has no workstream / BU.
  const groups = useMemo(() => {
    type Group = {
      key: string;
      label: string;
      sortOrder: number;
      items: BillingMilestone[];
      totalGross: number;
      invoicedGross: number;
      paidGross: number;
    };
    const map = new Map<string, Group>();
    for (const m of milestones ?? []) {
      const ws = m.workstreamId ? wsMap.get(m.workstreamId) : undefined;
      const key = ws?.businessUnitId ?? ws?.id ?? "__none";
      const label = ws?.businessUnitName ?? ws?.name ?? "Unassigned";
      let g = map.get(key);
      if (!g) {
        g = { key, label, sortOrder: ws?.sortOrder ?? 9999, items: [], totalGross: 0, invoicedGross: 0, paidGross: 0 };
        map.set(key, g);
      }
      g.items.push(m);
      if (m.status !== "CANCELLED") {
        const { gross } = splitVat(amountFor(m), vatPercent, includesVat);
        g.totalGross += gross;
        if (m.status === "INVOICED" || m.status === "PAID") g.invoicedGross += gross;
        if (m.status === "PAID") g.paidGross += gross;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
  }, [milestones, wsMap, vatPercent, includesVat, project.contractValue]);

  // Only render BU section headers when the plan actually spans business units.
  const grouped = groups.length > 1 || (groups.length === 1 && groups[0].key !== "__none");

  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    const src = grouped ? groups.flatMap((g) => g.items) : milestones ?? [];
    for (const ms of src) m.set(ms.id, ++i);
    return m;
  }, [grouped, groups, milestones]);

  function renderRow(m: BillingMilestone) {
    const split = splitVat(amountFor(m), vatPercent, includesVat);
    return (
      <TableRow key={m.id} className="hover:bg-muted/30 align-top">
        <TableCell className="text-muted-foreground font-mono text-xs">{indexOf.get(m.id)}</TableCell>
        <TableCell>
          <div className="font-medium">{m.name}</div>
          {m.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</div>
          )}
        </TableCell>
        <TableCell className="text-right font-mono">{m.percentage.toFixed(1)}%</TableCell>
        <TableCell className="text-right font-mono text-xs">{formatIDR(split.dpp)}</TableCell>
        <TableCell className="text-right font-mono text-xs text-amber-400">{formatIDR(split.vat)}</TableCell>
        <TableCell className="text-right font-mono font-semibold">{formatIDR(split.gross)}</TableCell>
        <TableCell className="text-xs whitespace-nowrap">{m.dueDate ? formatDate(m.dueDate) : "—"}</TableCell>
        <TableCell>
          <Badge variant="outline" className={STATUS_STYLE[m.status]}>
            {STATUS_LABEL[m.status]}
          </Badge>
        </TableCell>
        <TableCell className="text-xs font-mono">
          {m.invoiceNumber ?? "—"}
          {m.xeroInvoiceId && (
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-500">
              <Link2 className="h-3 w-3" /> Xero{m.xeroInvoiceNumber ? ` ${m.xeroInvoiceNumber}` : ""}
            </span>
          )}
          {m.xeroInvoiceId && m.xeroSyncedAt && (
            <span className="mt-0.5 flex flex-col gap-0.5 text-[10px]">
              {(m.xeroAmountPaid ?? 0) > 0 && (
                <span className="text-emerald-500">Paid {formatIDR(m.xeroAmountPaid!)}</span>
              )}
              {(m.xeroAmountDue ?? 0) > 0 && (
                <span className="text-amber-500">Outstanding {formatIDR(m.xeroAmountDue!)}</span>
              )}
              {(m.xeroAmountCredited ?? 0) > 0 && (
                <span className="text-sky-500">Credited {formatIDR(m.xeroAmountCredited!)}</span>
              )}
            </span>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {m.bastDocumentId ? (
            docUrlById.get(m.bastDocumentId) ? (
              <a
                href={docUrlById.get(m.bastDocumentId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-emerald-500 hover:underline"
                data-testid={`link-bast-${m.id}`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[140px]">{m.bastFileName ?? "BAST"}</span>
              </a>
            ) : (
              <span className="flex items-center gap-1 text-emerald-500">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[140px]">{m.bastFileName ?? "BAST"}</span>
              </span>
            )
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {m.bastUploadedAt && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {formatDate(m.bastUploadedAt)}
            </div>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {m.reportUrl ? (
            <a
              href={m.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-400 hover:underline"
              data-testid={`link-report-${m.id}`}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-[120px]">Report</span>
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {m.reportUrl && m.reportFiledAt && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {formatDate(m.reportFiledAt)}
            </div>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1.5">
            {canPushXero && !m.xeroInvoiceId && m.status !== "CANCELLED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === m.id || !canInvoiceNow}
                title={!canInvoiceNow ? notInvoiceableReason : undefined}
                onClick={() => {
                  setBusyId(m.id);
                  pushToXero.mutate({ milestoneId: m.id });
                }}
                data-testid={`button-send-xero-${m.id}`}
              >
                {busyId === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Send to Xero
              </Button>
            )}
            {isManager && m.status === "PLANNED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === m.id || !canInvoiceNow}
                title={!canInvoiceNow ? notInvoiceableReason : undefined}
                onClick={() => handleGenerateInvoice(m)}
                data-testid={`button-generate-invoice-${m.id}`}
              >
                {busyId === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                )}
                Generate Invoice
              </Button>
            )}
            {(m.status === "INVOICED" || m.status === "PAID") && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === m.id}
                onClick={() => handleDownloadInvoice(m)}
                data-testid={`button-download-invoice-${m.id}`}
              >
                {busyId === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                Invoice
              </Button>
            )}
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
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="% Allocated" value={`${summary.totalPct.toFixed(1)}%`} />
        <Stat label="Invoiced (Total)" value={formatIDR(summary.invoicedGross)} tone="info" />
        <Stat label="Paid (Total)" value={formatIDR(summary.paidGross)} tone="success" />
        <Stat label={`VAT ${vatPercent}% Outstanding`} value={formatIDR(summary.outstandingVat)} tone="primary" />
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Total DPP (Invoiced)" value={formatIDR(summary.invoicedDPP)} />
        <Stat label={`Total VAT ${vatPercent}% (Invoiced)`} value={formatIDR(summary.invoicedVat)} />
        <Stat label="VAT Paid" value={formatIDR(summary.paidVat)} tone="success" />
        <Stat label="Planned" value={String(summary.planned)} />
      </div>
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        VAT scheme: <span className="font-mono text-foreground">{vatPercent}%</span> —
        contract value is treated as{" "}
        <span className="font-medium text-foreground">
          {includesVat ? "GROSS (VAT included)" : "NET / DPP (VAT excluded)"}
        </span>
        . Each milestone amount follows the same scheme; DPP & VAT are derived automatically.
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
          <div className="flex items-center gap-2">
            {canSyncXero && (
              <Button
                variant="outline"
                onClick={() => syncFromXero.mutate()}
                disabled={syncFromXero.isPending}
                title="Pull the latest payment status, outstanding balance and credit notes from Xero"
                data-testid="button-sync-xero"
              >
                {syncFromXero.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync from Xero
              </Button>
            )}
            {isManager && (
              <Button onClick={() => setCreateOpen(true)} data-testid="button-new-milestone">
                <Plus className="h-4 w-4 mr-2" /> New Milestone
              </Button>
            )}
          </div>
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
                  <TableHead className="text-right">DPP</TableHead>
                  <TableHead className="text-right">VAT {vatPercent}%</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>BAST</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped
                  ? groups.map((g) => {
                      const paidPct = g.totalGross > 0 ? (g.paidGross / g.totalGross) * 100 : 0;
                      const invoicedPct = g.totalGross > 0 ? (g.invoicedGross / g.totalGross) * 100 : 0;
                      return (
                        <Fragment key={g.key}>
                          <TableRow className="bg-muted/50 hover:bg-muted/50 border-t-2 border-border">
                            <TableCell colSpan={12} className="py-2">
                              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
                                <div className="flex items-center gap-2">
                                  <Layers className="h-3.5 w-3.5 text-primary" />
                                  <span className="font-semibold">{g.label}</span>
                                  <span className="text-xs font-normal text-muted-foreground">
                                    {formatIDR(g.totalGross)} total · {formatIDR(g.invoicedGross)} invoiced
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-28 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500/40"
                                      style={{ width: `${Math.min(100, invoicedPct)}%` }}
                                    >
                                      <div
                                        className="h-full bg-emerald-500"
                                        style={{
                                          width: invoicedPct > 0 ? `${Math.min(100, (paidPct / invoicedPct) * 100)}%` : "0%",
                                        }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-xs font-mono font-semibold text-emerald-500 whitespace-nowrap">
                                    {paidPct.toFixed(0)}% paid
                                  </span>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    ({formatIDR(g.paidGross)} / {formatIDR(g.totalGross)})
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                          {g.items.map((m) => renderRow(m))}
                        </Fragment>
                      );
                    })
                  : (milestones ?? []).map((m) => renderRow(m))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <MilestoneFormDialog
          projectId={projectId}
          contractValue={project.contractValue ?? 0}
          useWorkstreams={!!project.useWorkstreams}
          onClose={() => setCreateOpen(false)}
          onSaved={invalidate}
        />
      )}
      {editRow && (
        <MilestoneFormDialog
          projectId={projectId}
          contractValue={project.contractValue ?? 0}
          useWorkstreams={!!project.useWorkstreams}
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
  useWorkstreams,
  milestone,
  onClose,
  onSaved,
}: {
  projectId: string;
  contractValue: number;
  useWorkstreams: boolean;
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
  const [reportUrl, setReportUrl] = useState(milestone?.reportUrl ?? "");
  const [workstreamId, setWorkstreamId] = useState<string | null>(
    (milestone as any)?.workstreamId ?? null,
  );

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
      ...(useWorkstreams ? { workstreamId } : {}),
    };
    if (editing && milestone) {
      update.mutate({
        milestoneId: milestone.id,
        data: { ...payload, status, reportUrl: reportUrl.trim() || null } as any,
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
              placeholder="e.g. DP 30% After Contract"
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
          {useWorkstreams && (
            <WorkstreamPicker
              projectId={projectId}
              value={workstreamId}
              onChange={setWorkstreamId}
              enabled
              testId="select-milestone-workstream"
            />
          )}
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
          {editing && (
            <div>
              <Label>Report Link</Label>
              <Input
                value={reportUrl}
                onChange={(e) => setReportUrl(e.target.value)}
                placeholder="https:// link to the shared report folder"
                data-testid="input-milestone-report-url"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Counts as revenue-recognition evidence when the BAST or payment is not yet in.
              </p>
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
