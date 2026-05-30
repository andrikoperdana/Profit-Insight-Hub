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
import { Clock, FileDown } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportCsv } from "@/lib/exports";
import { useToast } from "@/hooks/use-toast";
import { PageNav } from "@/pages/my-expenses";

type MyTimesheet = {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  workDate: string;
  hours: number;
  description: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

function statusClass(s: string): string {
  if (s === "APPROVED") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "REJECTED") return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "SUBMITTED") return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  return "bg-amber-500/15 text-amber-400 border-amber-500/30";
}

export default function MyTimesheetsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<MyTimesheet[]>({
    queryKey: ["my-timesheets"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/timesheets?scope=mine", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Failed to load timesheets");
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    return list
      .filter((t) => {
        if (status !== "ALL" && t.status !== status) return false;
        if (q) {
          const blob = `${t.projectName} ${t.taskTitle ?? ""} ${t.description ?? ""}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.workDate.localeCompare(a.workDate));
  }, [data, status, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const kpi = useMemo(() => {
    const acc = { total: 0, approved: 0, submitted: 0, rejected: 0, draft: 0 };
    for (const t of filtered) {
      acc.total += t.hours;
      if (t.status === "APPROVED") acc.approved += t.hours;
      else if (t.status === "SUBMITTED") acc.submitted += t.hours;
      else if (t.status === "REJECTED") acc.rejected += t.hours;
      else if (t.status === "DRAFT") acc.draft += t.hours;
    }
    return acc;
  }, [filtered]);

  function handleExport() {
    const rows = filtered.map((t) => ({
      Date: formatDate(t.workDate),
      Project: t.projectName,
      Task: t.taskTitle ?? "",
      Hours: t.hours,
      Description: t.description ?? "",
      Status: t.status,
      "Approved By": t.approvedByName ?? "",
      "Approved At": t.approvedAt ? formatDate(t.approvedAt) : "",
      "Rejection Reason": t.rejectionReason ?? "",
    }));
    if (rows.length === 0) {
      toast({ title: "No data", description: "The current filter produced no rows to export." });
      return;
    }
    exportCsv("my-timesheets", rows);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            My Timesheet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            History of all your timesheet entries — filter by status, search, paginate, and export to CSV.
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" data-testid="button-export-my-timesheets">
          <FileDown className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="Total Hours" value={kpi.total.toFixed(1)} sub={`${filtered.length} entries`} />
        <KpiCard label="Approved" value={kpi.approved.toFixed(1)} accent="text-emerald-400" />
        <KpiCard label="Submitted" value={kpi.submitted.toFixed(1)} accent="text-blue-400" />
        <KpiCard label="Draft" value={kpi.draft.toFixed(1)} accent="text-amber-400" />
        <KpiCard label="Rejected" value={kpi.rejected.toFixed(1)} accent="text-destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timesheet Entries</CardTitle>
          <CardDescription>Click the project to open the details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search project / task / description…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-xs"
              data-testid="input-search-my-timesheets"
            />
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-my-timesheets">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
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
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching timesheet entries.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((t) => (
                      <TableRow key={t.id} data-testid={`row-my-timesheet-${t.id}`}>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(t.workDate)}</TableCell>
                        <TableCell>
                          <Link href={`/projects/${t.projectId}`} className="text-xs text-primary hover:underline">
                            {t.projectName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{t.taskTitle ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{t.hours.toFixed(1)}</TableCell>
                        <TableCell className="text-xs max-w-[280px] truncate" title={t.description ?? ""}>
                          {t.description ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${statusClass(t.status)}`}
                            title={t.rejectionReason ?? (t.approvedByName ? `By ${t.approvedByName}` : "")}
                          >
                            {t.status}
                          </Badge>
                          {t.approvedByName && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">By {t.approvedByName}</div>
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
