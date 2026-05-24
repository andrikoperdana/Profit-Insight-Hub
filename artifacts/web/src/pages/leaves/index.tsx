import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useListLeaves } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { CalendarOff, Download, Search, ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/format";

const LEAVE_TYPES = ["ANNUAL", "SICK", "TRAINING", "UNPAID", "OTHER"] as const;

type LeaveRow = {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  type: string;
  note: string | null;
  createdAt: string;
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function diffDays(start: string, end: string): number {
  const s = new Date(start.slice(0, 10));
  const e = new Date(end.slice(0, 10));
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function downloadLeavesCsv(rows: LeaveRow[]) {
  const header = ["User", "Type", "Start Date", "End Date", "Days", "Note", "Logged At"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.userName),
        csvEscape(r.type),
        csvEscape(r.startDate.slice(0, 10)),
        csvEscape(r.endDate.slice(0, 10)),
        csvEscape(diffDays(r.startDate, r.endDate)),
        csvEscape(r.note ?? ""),
        csvEscape(r.createdAt.slice(0, 10)),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leaves-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const typeColor: Record<string, string> = {
  ANNUAL: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  SICK: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  TRAINING: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  UNPAID: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  OTHER: "bg-slate-500/10 text-slate-300 border-slate-500/20",
};

export default function LeavesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canView =
    user?.role === "HR" || user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const query = useMemo(
    () => ({
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    }),
    [startDate, endDate],
  );

  const { data, isLoading } = useListLeaves(query, {
    query: { enabled: canView },
  } as any);

  const allLeaves = (data ?? []) as LeaveRow[];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allLeaves.filter((l) => {
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (q && !l.userName.toLowerCase().includes(q) && !(l.note ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [allLeaves, search, typeFilter]);

  const pager = usePagination(filtered);

  if (!canView) {
    return (
      <EmptyState
        title="Access Denied"
        description="Leave Management is available to HR, PMO Director, and Project Manager only."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    downloadLeavesCsv(filtered);
    toast({ title: "CSV exported", description: `${filtered.length} leave records exported.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarOff className="h-7 w-7 text-primary" /> Leave Management
          </h1>
          <p className="text-muted-foreground">
            Read-only view of leaves logged by employees who are assigned to projects.
            This is not a company-wide attendance record — only people actively staffed on
            engagements appear here, so PMs can see when their team will be away.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleExport}
          disabled={filtered.length === 0}
          data-testid="button-export-leaves"
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filter by employee, type, or date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or note"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-leave-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-leave-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start"
              data-testid="input-leave-start"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End"
              data-testid="input-leave-end"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} leave record{filtered.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No leaves found"
              description="Adjust the filters or wait for employees to log leaves."
              icon={<CalendarOff className="h-10 w-10 text-muted-foreground/40" />}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.pageItems.map((l) => (
                    <TableRow key={l.id} data-testid={`row-leave-${l.id}`}>
                      <TableCell className="font-medium">{l.userName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeColor[l.type] ?? typeColor.OTHER}>
                          {l.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(l.startDate)}</TableCell>
                      <TableCell>{formatDate(l.endDate)}</TableCell>
                      <TableCell className="text-right font-mono">{diffDays(l.startDate, l.endDate)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                        {l.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={pager.page}
                pageSize={pager.pageSize}
                total={pager.total}
                totalPages={pager.totalPages}
                onPageChange={pager.setPage}
                onPageSizeChange={pager.setPageSize}
                testId="leaves-pagination"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
