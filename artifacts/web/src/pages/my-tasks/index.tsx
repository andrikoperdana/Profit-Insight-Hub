import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ListChecks, FileDown } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportCsv } from "@/lib/exports";
import { useToast } from "@/hooks/use-toast";
import { PageNav } from "@/pages/my-expenses";

type MyTask = {
  id: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  project?: { id: string; code?: string | null; name?: string | null } | null;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED" | string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number | null;
  billable: boolean;
};

function statusClass(s: string): string {
  if (s === "DONE") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "BLOCKED") return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "IN_PROGRESS") return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export default function MyTasksPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("ACTIVE");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<MyTask[]>({
    queryKey: ["my-tasks"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/tasks/mine", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Failed to load tasks");
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((t) => {
      if (status === "ACTIVE" && t.status === "DONE") return false;
      if (status !== "ALL" && status !== "ACTIVE" && t.status !== status) return false;
      if (q) {
        const projName = t.projectName ?? t.project?.name ?? "";
        const projCode = t.projectCode ?? t.project?.code ?? "";
        const blob = `${t.title} ${t.description ?? ""} ${projName} ${projCode}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [data, status, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const kpi = useMemo(() => {
    const acc = { total: 0, todo: 0, inProgress: 0, done: 0, blocked: 0 };
    for (const t of filtered) {
      acc.total += 1;
      if (t.status === "TODO") acc.todo += 1;
      else if (t.status === "IN_PROGRESS") acc.inProgress += 1;
      else if (t.status === "DONE") acc.done += 1;
      else if (t.status === "BLOCKED") acc.blocked += 1;
    }
    return acc;
  }, [filtered]);

  function handleExport() {
    const rows = filtered.map((t) => {
      const projName = t.projectName ?? t.project?.name ?? "";
      const projCode = t.projectCode ?? t.project?.code ?? "";
      return {
        Proyek: projCode || projName,
        Task: t.title,
        Deskripsi: t.description ?? "",
        Status: t.status,
        "Tanggal Mulai": t.startDate ? formatDate(t.startDate) : "",
        "Tanggal Selesai": t.endDate ? formatDate(t.endDate) : "",
        "Progress %": t.progressPercent ?? 0,
        Billable: t.billable ? "Ya" : "Tidak",
      };
    });
    if (rows.length === 0) {
      toast({ title: "Tidak ada data", description: "Filter saat ini tidak menghasilkan baris untuk di-export." });
      return;
    }
    exportCsv("my-tasks", rows);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            My Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Semua task yang ditugaskan kepada Anda — filter, paginasi, dan export CSV.
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" data-testid="button-export-my-tasks">
          <FileDown className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="Total" value={String(kpi.total)} sub="setelah filter" />
        <KpiCard label="To Do" value={String(kpi.todo)} accent="text-muted-foreground" />
        <KpiCard label="In Progress" value={String(kpi.inProgress)} accent="text-blue-400" />
        <KpiCard label="Done" value={String(kpi.done)} accent="text-emerald-400" />
        <KpiCard label="Blocked" value={String(kpi.blocked)} accent="text-destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Task</CardTitle>
          <CardDescription>Klik nama proyek untuk membuka detail proyek.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Cari task / proyek…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-xs"
              data-testid="input-search-my-tasks"
            />
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-my-tasks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Aktif (kecuali Done)</SelectItem>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="TODO">To Do</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
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
            <p className="text-sm text-muted-foreground">Tidak ada task yang cocok.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Proyek</TableHead>
                      <TableHead className="w-[120px]">Mulai</TableHead>
                      <TableHead className="w-[120px]">Selesai</TableHead>
                      <TableHead className="w-[110px] text-right">Progress</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((t) => {
                      const projName = t.projectName ?? t.project?.name ?? "";
                      const projCode = t.projectCode ?? t.project?.code ?? "";
                      return (
                        <TableRow key={t.id} data-testid={`row-my-task-${t.id}`}>
                          <TableCell>
                            <div className="text-sm font-medium">{t.title}</div>
                            {t.description && (
                              <div className="text-[11px] text-muted-foreground max-w-[320px] truncate">
                                {t.description}
                              </div>
                            )}
                            {!t.billable && (
                              <Badge variant="outline" className="text-[10px] mt-1">Non-billable</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Link href={`/projects/${t.projectId}`} className="text-xs text-primary hover:underline">
                              {projCode || projName || "—"}
                            </Link>
                            {projCode && projName && (
                              <div className="text-[10px] text-muted-foreground max-w-[200px] truncate">{projName}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.startDate ? formatDate(t.startDate) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.endDate ? formatDate(t.endDate) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {t.progressPercent ?? 0}%
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${statusClass(t.status)}`}>
                              {t.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
