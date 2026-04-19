import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserCheck,
  UserX,
  Clock4,
  Activity,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  userId: string;
  userName: string;
  role: string;
  title: string | null;
  status: "ACTIVE" | "IDLE";
  currentProjectId: string | null;
  currentProjectName: string | null;
  currentProjectStatus: string | null;
  assignmentEndDate: string | null;
  daysRemaining: number | null;
  finishingSoon: boolean;
  monthHours: number;
  utilizationPctMonth: number;
};

type Detail = {
  summary: {
    total: number;
    active: number;
    idle: number;
    vacation: number;
    finishingSoon: number;
    utilizationPct: number;
  };
  resources: Row[];
};

const ROLE_LABEL: Record<string, string> = {
  KONSULTAN: "Consultant",
  TECHNICAL_WRITER: "Technical Writer",
  PROJECT_MANAGER: "Project Manager",
};

type FilterKey = "all" | "active" | "idle" | "finishing";

function utilizationTone(pct: number): { bar: string; label: string } {
  if (pct >= 70) return { bar: "bg-emerald-500", label: "text-emerald-400" };
  if (pct >= 40) return { bar: "bg-amber-500", label: "text-amber-400" };
  return { bar: "bg-rose-500", label: "text-rose-400" };
}

function toExportRows(rows: Row[]) {
  return rows.map((r) => ({
    Name: r.userName,
    Role: ROLE_LABEL[r.role] ?? r.role,
    Title: r.title ?? "",
    Status: r.status,
    "Current Project": r.currentProjectName ?? "",
    "Project Status": r.currentProjectStatus ?? "",
    "Assignment End": r.assignmentEndDate
      ? format(new Date(r.assignmentEndDate), "yyyy-MM-dd")
      : "",
    "Days Remaining": r.daysRemaining ?? "",
    "Finishing Soon": r.finishingSoon ? "Yes" : "No",
    "Hours MTD": r.monthHours,
    "Utilization MTD %": r.utilizationPctMonth.toFixed(1),
  }));
}

function exportXlsx(rows: Row[], filename: string) {
  const data = toExportRows(rows);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resources");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportPdf(rows: Row[], title: string, filename: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("SecureProfit Hub — Resources Report", 14, 14);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    `${title} · Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    14,
    20,
  );

  const data = toExportRows(rows);
  const head = data.length > 0 ? [Object.keys(data[0])] : [];
  const body = data.map((r) => Object.values(r).map((v) => String(v ?? "")));

  autoTable(doc, {
    head,
    body,
    startY: 26,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 248, 246] },
  });

  doc.save(`${filename}.pdf`);
}

export default function ResourcesPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<Detail>({
    queryKey: ["resources-detail"],
    queryFn: () =>
      customFetch<Detail>("/api/dashboard/resource-utilization-detail"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.resources;
    if (filter === "active") rows = rows.filter((r) => r.status === "ACTIVE");
    else if (filter === "idle") rows = rows.filter((r) => r.status === "IDLE");
    else if (filter === "finishing")
      rows = rows.filter((r) => r.finishingSoon);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          (r.currentProjectName ?? "").toLowerCase().includes(q) ||
          (ROLE_LABEL[r.role] ?? r.role).toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, filter, search]);

  const filterLabel: Record<FilterKey, string> = {
    all: "All Resources",
    active: "Active Resources",
    idle: "Idle Resources",
    finishing: "Resources Finishing in 2 Days",
  };

  const handleExportXlsx = () =>
    exportXlsx(
      filtered,
      `resources-${filter}-${format(new Date(), "yyyyMMdd-HHmm")}`,
    );
  const handleExportPdf = () =>
    exportPdf(
      filtered,
      filterLabel[filter],
      `resources-${filter}-${format(new Date(), "yyyyMMdd-HHmm")}`,
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Resources
          </h1>
          <p className="text-muted-foreground">
            Workforce assignment and availability tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportXlsx}
            disabled={!filtered.length}
            data-testid="export-xlsx"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export XLSX
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={!filtered.length}
            data-testid="export-pdf"
          >
            <FileText className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Loading…
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Activity className="animate-pulse text-muted" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total
                </CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data.summary.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active workforce
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active
                </CardTitle>
                <UserCheck className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-400">
                  {data.summary.active}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  On Active or Pause projects
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Idle
                </CardTitle>
                <UserX className="h-4 w-4 text-rose-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-rose-400">
                  {data.summary.idle}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  No live assignment
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Finishing in 2 Days
                </CardTitle>
                <Clock4 className="h-4 w-4 text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-400">
                  {data.summary.finishingSoon}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Plan reassignment
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{filterLabel[filter]}</CardTitle>
            <CardDescription>
              {filtered.length}{" "}
              {filtered.length === 1 ? "resource" : "resources"} matching the
              current filter
            </CardDescription>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, project, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="resource-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as FilterKey)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">
                All ({data?.summary.total ?? 0})
              </TabsTrigger>
              <TabsTrigger value="active" data-testid="tab-active">
                Active ({data?.summary.active ?? 0})
              </TabsTrigger>
              <TabsTrigger value="idle" data-testid="tab-idle">
                Idle ({data?.summary.idle ?? 0})
              </TabsTrigger>
              <TabsTrigger value="finishing" data-testid="tab-finishing">
                Finishing in 2d ({data?.summary.finishingSoon ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filter} forceMount className="mt-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Role / Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Project</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead className="text-right">Days Left</TableHead>
                      <TableHead className="w-[200px]">
                        Utilization (MTD)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && !isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-12 text-muted-foreground"
                        >
                          No resources match the current filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((r) => {
                        const tone = utilizationTone(r.utilizationPctMonth);
                        return (
                          <TableRow key={r.userId}>
                            <TableCell className="font-medium">
                              {r.userName}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {ROLE_LABEL[r.role] ?? r.role}
                              {r.title ? (
                                <div className="text-xs">{r.title}</div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {r.status === "ACTIVE" ? (
                                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20">
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="border-rose-500/40 text-rose-300"
                                >
                                  Idle
                                </Badge>
                              )}
                              {r.finishingSoon && (
                                <Badge className="ml-2 bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/20">
                                  Ending soon
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {r.currentProjectId && r.currentProjectName ? (
                                <Link
                                  href={`/projects/${r.currentProjectId}`}
                                  className="text-primary hover:underline"
                                >
                                  {r.currentProjectName}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.assignmentEndDate
                                ? format(
                                    new Date(r.assignmentEndDate),
                                    "dd MMM yyyy",
                                  )
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.daysRemaining == null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : r.finishingSoon ? (
                                <span className="text-amber-400 font-semibold">
                                  {r.daysRemaining}
                                </span>
                              ) : (
                                <span>{r.daysRemaining}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full ${tone.bar} transition-all`}
                                    style={{
                                      width: `${Math.min(r.utilizationPctMonth, 100)}%`,
                                    }}
                                  />
                                </div>
                                <span
                                  className={`text-xs font-mono w-10 text-right ${tone.label}`}
                                >
                                  {r.utilizationPctMonth.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Download className="h-3.5 w-3.5" />
        Exports respect the current filter and search query.
      </p>
    </div>
  );
}
