import { useState, useMemo } from "react";
import {
  useListExpenses,
  useListProjects,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { UserRole } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { formatDate } from "@/lib/format";
import { formatIDR } from "@/lib/format";
import { exportCsv } from "@/lib/exports";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { Download, Receipt, FileText } from "lucide-react";
import { useEffect } from "react";

const CATEGORIES = ["SOFTWARE", "HARDWARE", "LICENSE", "TRAVEL", "OTHER"] as const;

const CATEGORY_STYLE: Record<string, string> = {
  SOFTWARE: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  HARDWARE: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  LICENSE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  TRAVEL: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  OTHER: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export default function ExpensesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const allowed =
    user?.role === UserRole.MANAGEMENT ||
    user?.role === UserRole.PROJECT_MANAGER ||
    user?.role === UserRole.SALES;

  useEffect(() => {
    if (user && !allowed) setLocation("/");
  }, [user, allowed, setLocation]);

  const { data: expenses, isLoading } = useListExpenses({
    query: { queryKey: getListExpensesQueryKey() },
  });
  const { data: projects } = useListProjects();

  const [projectFilter, setProjectFilter] = useState<string>("__all");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expenses ?? []).filter((e: any) => {
      if (projectFilter !== "__all" && e.projectId !== projectFilter) return false;
      if (categoryFilter !== "__all" && e.category !== categoryFilter) return false;
      if (q) {
        const hay = `${e.description ?? ""} ${e.projectName ?? ""} ${e.projectCode ?? ""} ${e.clientName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, projectFilter, categoryFilter, search]);

  const pager = usePagination(filtered, { resetKey: `${projectFilter}|${categoryFilter}|${search}` });

  const summary = useMemo(() => {
    const total = filtered.reduce((s, e: any) => s + (e.amount ?? 0), 0);
    const byCat: Record<string, number> = {};
    for (const e of filtered as any[]) {
      byCat[e.category] = (byCat[e.category] ?? 0) + (e.amount ?? 0);
    }
    return { total, byCat, count: filtered.length };
  }, [filtered]);

  function handleExportCsv() {
    const rows = filtered.map((e: any) => ({
      SpentAt: e.spentAt ? e.spentAt.slice(0, 10) : "",
      Project: e.projectCode ? `${e.projectCode} — ${e.projectName ?? ""}` : (e.projectName ?? ""),
      Client: e.clientName ?? "",
      Category: e.category,
      Description: e.description,
      AmountIDR: e.amount,
      AddedBy: e.createdByName ?? "",
      CreatedAt: e.createdAt ?? "",
    }));
    exportCsv("expenses", rows);
  }

  if (!user || !allowed) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Expenses</h1>
          <p className="text-muted-foreground">
            Non-resource costs (software, hardware, license, travel, other) across every project
            {user.role === UserRole.PROJECT_MANAGER ? " you manage" : user.role === UserRole.SALES ? " you handle" : ""}.
          </p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryCard label="Total Cost" value={formatIDR(summary.total)} />
        <SummaryCard label="Entry Count" value={String(summary.count)} />
        <SummaryCard label="Software + License" value={formatIDR((summary.byCat.SOFTWARE ?? 0) + (summary.byCat.LICENSE ?? 0))} />
        <SummaryCard label="Travel" value={formatIDR(summary.byCat.TRAVEL ?? 0)} />
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Expense List</CardTitle>
          <CardDescription>
            Add or remove expenses from the project detail page (the "Expenses" tab). This page is read-only with filters and export.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Search description / project / client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[220px]"
                data-testid="input-expense-search"
              />
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-8 w-[220px]" data-testid="filter-expense-project">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All projects</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-[150px]" data-testid="filter-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!filtered.length}
              data-testid="button-export-expenses-csv"
            >
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>

          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={6} rows={6} /></div>
          ) : !filtered.length ? (
            <EmptyState
              title="No expenses yet"
              description="Add expenses from the Expenses tab on a project detail page."
              icon={<Receipt className="h-10 w-10 text-muted-foreground/50" />}
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (IDR)</TableHead>
                  <TableHead>Proof</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {e.spentAt ? formatDate(e.spentAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${e.projectId}`} className="text-primary hover:underline text-sm">
                        {e.projectCode ? `${e.projectCode}` : e.projectName}
                      </Link>
                      {e.projectCode && e.projectName && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{e.projectName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.clientName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CATEGORY_STYLE[e.category] ?? ""}>
                        {e.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm line-clamp-2" title={e.description}>{e.description}</p>
                      {e.createdByName && (
                        <p className="text-xs text-muted-foreground mt-1">oleh {e.createdByName}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatIDR(e.amount)}</TableCell>
                    <TableCell>
                      {e.evidenceUrl ? (
                        <a
                          href={e.evidenceUrl}
                          download={e.evidenceFileName ?? "evidence"}
                          className="inline-flex items-center text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3 mr-1" /> File
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <Pagination
              page={pager.page}
              pageSize={pager.pageSize}
              total={pager.total}
              totalPages={pager.totalPages}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
              testId="expenses-pagination"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold mt-1 font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}
