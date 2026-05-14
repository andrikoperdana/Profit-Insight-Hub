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
  const { user } = useAuth();
  const { data: expenses, isLoading } = useListProjectExpenses(projectId);
  const isApprover =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project?.pmId === user.id);

  const [category, setCategory] = useState<string>("SOFTWARE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [evidence, setEvidence] = useState<{ name: string; url: string } | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  const ALLOWED_EVIDENCE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

  function handleEvidenceChange(file: File | null) {
    if (!file) { setEvidence(null); return; }
    if (!ALLOWED_EVIDENCE_TYPES.includes(file.type)) {
      toast({ variant: "destructive", title: "Unsupported file", description: "Use PDF or image (PNG/JPEG/WebP)." });
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast({ variant: "destructive", title: "File too large", description: "Max 8MB." });
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = String(ev.target?.result ?? "");
      if (url) setEvidence({ name: file.name, url });
    };
    reader.readAsDataURL(file);
  }

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
        setEvidence(null);
        if (evidenceInputRef.current) evidenceInputRef.current.value = "";
        invalidateAll();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to save expense", description: e?.message ?? "Unknown error" }),
    },
  });

  const approveMutation = useApproveProjectExpense({
    mutation: {
      onSuccess: () => {
        toast({ title: "Expense approved", description: "Project total cost updated." });
        invalidateAll();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to approve", description: e?.message ?? "Unknown error" }),
    },
  });

  const rejectMutation = useRejectProjectExpense({
    mutation: {
      onSuccess: () => {
        toast({ title: "Expense rejected" });
        invalidateAll();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to reject", description: e?.message ?? "Unknown error" }),
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
        category: category as any,
        description: description.trim(),
        amount: amt,
        spentAt: spentAt || undefined,
        evidenceUrl: evidence?.url,
        evidenceFileName: evidence?.name,
      },
    });
  }

  if (isLoading) return <LoadingPage />;

  const list = expenses ?? [];
  const totalApproved = list.reduce(
    (s: number, e: any) => s + ((e.status === "APPROVED" ? e.amount : 0) ?? 0),
    0,
  );
  const totalPending = list.reduce(
    (s: number, e: any) => s + ((e.status === "PENDING" ? e.amount : 0) ?? 0),
    0,
  );
  const totalAdditional = totalApproved;
  const resourceCost = project?.resourceCost ?? 0;
  const totalCost = resourceCost + totalAdditional;

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Additional Project Expenses</CardTitle>
          <CardDescription>
            Track non-resource costs (software, hardware, licenses, travel). Anyone on the project can submit; PM/Management approve. Only expenses with status <span className="font-medium text-foreground">APPROVED</span> count toward total cost &amp; margin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <SummaryStatInline label="Resource Cost" value={formatIDR(resourceCost)} />
            <SummaryStatInline label="Additional Cost (Approved)" value={formatIDR(totalApproved)} highlight />
            <SummaryStatInline label="Pending Approval" value={formatIDR(totalPending)} />
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
            <div>
              <Label>Evidence (Invoice / Billing PDF)</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  ref={evidenceInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleEvidenceChange(e.target.files?.[0] ?? null)}
                  data-testid="input-expense-evidence"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => evidenceInputRef.current?.click()}
                  data-testid="button-pick-evidence"
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  {evidence ? "Change file" : "Attach PDF / image"}
                </Button>
                {evidence ? (
                  <div className="flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-1 text-xs">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[240px] truncate" title={evidence.name}>{evidence.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEvidence(null);
                        if (evidenceInputRef.current) evidenceInputRef.current.value = "";
                      }}
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      title="Remove attachment"
                      data-testid="button-clear-evidence"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Optional — PDF or image, max 8MB.</span>
                )}
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
                    <th className="py-2 pr-3 font-medium">Evidence</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium text-right">Amount</th>
                    <th className="py-2 pr-3 font-medium text-right w-[180px]">Actions</th>
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
                      <td className="py-2 pr-3">
                        {e.evidenceUrl ? (
                          <a
                            href={e.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={e.evidenceFileName ?? "evidence"}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            data-testid={`link-evidence-${e.id}`}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="max-w-[160px] truncate">{e.evidenceFileName ?? "View"}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <ExpenseStatusBadge status={e.status ?? "PENDING"} reason={e.rejectionReason} />
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{formatIDR(e.amount)}</td>
                      <td className="py-2 pr-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isApprover && e.status === "PENDING" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-expense-${e.id}`}
                                onClick={() => approveMutation.mutate({ expenseId: e.id })}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                disabled={rejectMutation.isPending}
                                data-testid={`button-reject-expense-${e.id}`}
                                onClick={() => {
                                  const reason = prompt(`Reason for rejecting "${e.description}"?`, "");
                                  if (reason && reason.trim()) {
                                    rejectMutation.mutate({ expenseId: e.id, data: { reason: reason.trim() } });
                                  }
                                }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {(e.status === "PENDING" || isApprover) && (
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
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30">
                    <td colSpan={6} className="py-2 pr-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Total Additional Cost (APPROVED only)
                    </td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold">{formatIDR(totalApproved)}</td>
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

function ExpenseStatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    APPROVED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <Badge variant="outline" className={`${map[status] ?? "bg-muted"} text-[10px]`} title={reason ?? ""}>
      {status}
    </Badge>
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

export default ExpensesTab;
