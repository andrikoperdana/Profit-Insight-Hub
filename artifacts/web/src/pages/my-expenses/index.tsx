import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useAddProjectExpense,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Receipt, ChevronLeft, ChevronRight, FileDown, Plus, Paperclip, FileText, X } from "lucide-react";
import { formatDate, formatIDR } from "@/lib/format";
import { exportCsv } from "@/lib/exports";
import { useToast } from "@/hooks/use-toast";
import { triggerExpenseReceiptDownload } from "@/components/dashboard/MyExpensesCard";

const EXPENSE_CATEGORIES = [
  { value: "SOFTWARE", label: "Software" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "LICENSE", label: "License" },
  { value: "TRAVEL", label: "Travel" },
  { value: "OTHER", label: "Other" },
];

type MyExpense = {
  id: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  category: string;
  description: string;
  amount: number;
  spentAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  hasReceipt: boolean;
};

function statusClass(status: string): string {
  if (status === "APPROVED") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (status === "REJECTED") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-amber-500/15 text-amber-400 border-amber-500/30";
}

export default function MyExpensesPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<MyExpense[]>({
    queryKey: ["my-expenses", "page", 500],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/expenses/mine?limit=500", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Failed to load expenses");
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((e) => {
      if (status !== "ALL" && e.status !== status) return false;
      if (q) {
        const blob = `${e.description} ${e.projectCode ?? ""} ${e.projectName ?? ""} ${e.category}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [data, status, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const kpi = useMemo(() => {
    const acc = { total: 0, approved: 0, pending: 0, rejected: 0 };
    for (const e of filtered) {
      acc.total += e.amount;
      if (e.status === "APPROVED") acc.approved += e.amount;
      if (e.status === "PENDING") acc.pending += e.amount;
      if (e.status === "REJECTED") acc.rejected += e.amount;
    }
    return acc;
  }, [filtered]);

  function handleExport() {
    const rows = filtered.map((e) => ({
      Tanggal: formatDate(e.spentAt),
      Proyek: e.projectCode ?? "",
      "Nama Proyek": e.projectName ?? "",
      Kategori: e.category,
      Deskripsi: e.description,
      Jumlah: e.amount,
      Status: e.status,
      "Approved By": e.approvedByName ?? "",
      "Approved At": e.approvedAt ? formatDate(e.approvedAt) : "",
      "Alasan Reject": e.rejectionReason ?? "",
    }));
    if (rows.length === 0) {
      toast({ title: "Tidak ada data", description: "Filter saat ini tidak menghasilkan baris untuk di-export." });
      return;
    }
    exportCsv("my-expenses", rows);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            My Expenses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Semua pengajuan expense Anda — filter, paginasi, dan export ke CSV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SubmitExpenseDialog />
          <Button onClick={handleExport} variant="outline" data-testid="button-export-my-expenses">
            <FileDown className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Total" value={formatIDR(kpi.total)} sub={`${filtered.length} baris`} />
        <KpiCard label="Approved" value={formatIDR(kpi.approved)} accent="text-emerald-400" />
        <KpiCard label="Pending" value={formatIDR(kpi.pending)} accent="text-amber-400" />
        <KpiCard label="Rejected" value={formatIDR(kpi.rejected)} accent="text-destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Pengajuan</CardTitle>
          <CardDescription>Klik kode proyek untuk membuka detail proyek.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Cari deskripsi / proyek / kategori…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-xs"
              data-testid="input-search-my-expenses"
            />
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-my-expenses">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / hal</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada pengajuan expense yang cocok.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Tanggal</TableHead>
                      <TableHead>Proyek</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((e) => (
                      <TableRow key={e.id} data-testid={`row-my-expense-${e.id}`}>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(e.spentAt)}</TableCell>
                        <TableCell>
                          <Link href={`/projects/${e.projectId}`} className="text-xs text-primary hover:underline">
                            {e.projectCode ?? "—"}
                          </Link>
                          <div className="text-[10px] text-muted-foreground max-w-[220px] truncate">
                            {e.projectName ?? ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{e.description}</div>
                          <Badge variant="outline" className="text-[10px] mt-1">{e.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatIDR(e.amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${statusClass(e.status)}`}
                            title={e.rejectionReason ?? (e.approvedByName ? `By ${e.approvedByName}` : "")}
                          >
                            {e.status}
                          </Badge>
                          {e.approvedByName && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">By {e.approvedByName}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.hasReceipt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              data-testid={`button-download-receipt-${e.id}`}
                              onClick={() =>
                                triggerExpenseReceiptDownload(e.id, e.projectCode, (msg) =>
                                  toast({ title: "Download failed", description: msg, variant: "destructive" }),
                                )
                              }
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />
                              PDF
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <PageNav
                page={safePage}
                totalPages={totalPages}
                total={filtered.length}
                pageSize={pageSize}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SubmitExpenseDialog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("SOFTWARE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [evidence, setEvidence] = useState<{ name: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const MAX_BYTES = 8 * 1024 * 1024;

  // Role-scoped: returns only projects the current user is involved in.
  const { data: projects } = useListProjects(undefined, {
    query: { enabled: open, queryKey: ["projects", "my-expense-submit"] },
  });

  const reset = () => {
    setProjectId("");
    setCategory("SOFTWARE");
    setDescription("");
    setAmount("");
    setSpentAt(new Date().toISOString().slice(0, 10));
    setEvidence(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const addMutation = useAddProjectExpense({
    mutation: {
      onSuccess: () => {
        toast({ title: "Expense submitted", description: "Pending approval by the project manager." });
        qc.invalidateQueries({ queryKey: ["my-expenses"] });
        setOpen(false);
        reset();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to submit expense", description: e?.message ?? "Unknown error" }),
    },
  });

  function handleFile(file: File | null) {
    if (!file) { setEvidence(null); return; }
    if (!ALLOWED.includes(file.type)) {
      toast({ variant: "destructive", title: "Unsupported file", description: "Use PDF or image (PNG/JPEG/WebP)." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ variant: "destructive", title: "File too large", description: "Max 8MB." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = String(ev.target?.result ?? "");
      if (url) setEvidence({ name: file.name, url });
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!projectId) {
      toast({ variant: "destructive", title: "Project is required" });
      return;
    }
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

  const projectList = projects ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-submit-expense">
          <Plus className="h-4 w-4 mr-2" />
          Submit Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Expense</DialogTitle>
          <DialogDescription>
            File an expense claim against a project you are involved in. It will be sent to the project manager for approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="se-project">Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="se-project" className="mt-1" data-testid="select-submit-expense-project">
                <SelectValue placeholder={projectList.length === 0 ? "No projects available" : "Select project"} />
              </SelectTrigger>
              <SelectContent>
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectList.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                You are not currently assigned to any project.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="se-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="se-category" className="mt-1" data-testid="select-submit-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="se-amount">Amount (IDR) *</Label>
              <Input
                id="se-amount"
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="mt-1 font-mono"
                data-testid="input-submit-expense-amount"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="se-desc">Description *</Label>
            <Input
              id="se-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Travel to client site, taxi fare"
              className="mt-1"
              data-testid="input-submit-expense-description"
            />
          </div>
          <div>
            <Label htmlFor="se-date">Date</Label>
            <Input
              id="se-date"
              type="date"
              value={spentAt}
              onChange={(e) => setSpentAt(e.target.value)}
              className="mt-1"
              data-testid="input-submit-expense-date"
            />
          </div>
          <div>
            <Label>Evidence (Receipt / Invoice)</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                data-testid="input-submit-expense-evidence"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-2" />
                {evidence ? "Change file" : "Attach PDF / image"}
              </Button>
              {evidence ? (
                <div className="flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-1 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[240px] truncate" title={evidence.name}>{evidence.name}</span>
                  <button
                    type="button"
                    onClick={() => { setEvidence(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    title="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Optional — PDF or image, max 8MB.</span>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending || !projectId} data-testid="button-confirm-submit-expense">
            {addMutation.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-bold mt-1 font-mono ${accent ?? ""}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function PageNav({
  page, totalPages, total, pageSize, onChange,
}: { page: number; totalPages: number; total: number; pageSize: number; onChange: (n: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>Menampilkan {from}–{to} dari {total}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          data-testid="button-prev-page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="px-2">Hal {page} / {totalPages}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          data-testid="button-next-page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
