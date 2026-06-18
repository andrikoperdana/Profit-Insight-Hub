import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useListUsers } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { ScrollText, Filter, RefreshCw, Download } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportCsv, exportSheets } from "@/lib/exports";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/common/Pagination";

interface AuditLog {
  id: string;
  userId: string | null;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  dataBefore: unknown;
  dataAfter: unknown;
  createdAt: string;
}

interface AuditResp {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

interface ActionStat {
  action: string;
  count: number;
}

const ACTION_GROUPS: Record<string, string> = {
  "user.created": "User",
  "user.updated": "User",
  "user.deleted": "User",
  "user.login": "Auth",
  "user.login_failed": "Auth",
  "project.created": "Project",
  "project.updated": "Project",
  "project.status_changed": "Project",
  "project.deleted": "Project",
  "project.auto_closed": "Project",
  "timesheet.created": "Timesheet",
  "timesheet.approved": "Timesheet",
  "timesheet.rejected": "Timesheet",
  "timesheet.bulk_approved": "Timesheet",
  "timesheet.deleted": "Timesheet",
  "document.uploaded": "Document",
  "document.deleted": "Document",
  "resource.assigned": "Resource",
  "resource.updated": "Resource",
  "resource.removed": "Resource",
};

function actionTone(action: string): string {
  if (action.endsWith(".deleted") || action.endsWith(".removed") || action === "user.login_failed") {
    return "bg-destructive/10 text-destructive border-destructive/30";
  }
  if (action.endsWith(".created") || action.endsWith(".assigned") || action.endsWith(".uploaded")) {
    return "bg-primary/10 text-primary border-primary/30";
  }
  if (action.includes("approved") || action.endsWith(".auto_closed") || action === "user.login") {
    return "bg-success/10 text-success border-success/30";
  }
  if (action.includes("rejected")) {
    return "bg-destructive/10 text-destructive border-destructive/30";
  }
  return "bg-warning/10 text-warning border-warning/30";
}

function buildFilterParams(opts: {
  from: string;
  to: string;
  userId: string;
  action: string;
}): URLSearchParams {
  const qs = new URLSearchParams();
  if (opts.from) qs.set("from", new Date(opts.from).toISOString());
  if (opts.to) {
    const t = new Date(opts.to);
    t.setHours(23, 59, 59, 999);
    qs.set("to", t.toISOString());
  }
  if (opts.userId && opts.userId !== "all") qs.set("userId", opts.userId);
  if (opts.action && opts.action !== "all") qs.set("action", opts.action);
  return qs;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [details, setDetails] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState<null | "csv" | "xlsx">(null);

  const { data: users } = useListUsers({ includeDeleted: true } as any);

  const queryKey = useMemo(
    () => ["audit-logs", { from, to, userId, action, page, pageSize }],
    [from, to, userId, action, page, pageSize],
  );

  const { data, isLoading, isFetching, refetch } = useQuery<AuditResp>({
    queryKey,
    queryFn: () => {
      const qs = buildFilterParams({ from, to, userId, action });
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      return customFetch<AuditResp>(`/api/audit-logs?${qs.toString()}`);
    },
  });

  const { data: actions } = useQuery<ActionStat[]>({
    queryKey: ["audit-log-actions"],
    queryFn: () => customFetch<ActionStat[]>("/api/audit-logs/actions"),
  });

  if (!isSuperAdmin(user?.role) && user?.role !== "SITE_ADMIN") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            You don't have permission to view the audit log.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  function resetFilters() {
    setFrom("");
    setTo("");
    setUserId("all");
    setAction("all");
    setPage(1);
  }

  async function fetchAllForExport(): Promise<AuditLog[]> {
    const qs = buildFilterParams({ from, to, userId, action });
    qs.set("page", "1");
    qs.set("pageSize", "200");
    const all: AuditLog[] = [];
    let p = 1;
    let total = Infinity;
    while (all.length < total) {
      qs.set("page", String(p));
      const resp = await customFetch<AuditResp>(`/api/audit-logs?${qs.toString()}`);
      all.push(...resp.items);
      total = resp.total;
      if (resp.items.length === 0) break;
      p += 1;
      if (p > 500) break; // hard safety cap (~100k rows)
    }
    return all;
  }

  function rowsForExport(items: AuditLog[]) {
    return items.map((log) => ({
      Time: log.createdAt,
      User: log.userName,
      Role: log.userRole,
      Action: log.action,
      Entity: ACTION_GROUPS[log.action] ?? log.entityType,
      EntityId: log.entityId ?? "",
      Description: log.description,
    }));
  }

  async function handleExport(kind: "csv" | "xlsx") {
    if (!data || data.total === 0) return;
    try {
      setExporting(kind);
      const items = await fetchAllForExport();
      const rows = rowsForExport(items);
      if (kind === "csv") {
        exportCsv("audit-logs", rows);
      } else {
        exportSheets("audit-logs", [{ name: "Audit Logs", rows }]);
      }
      toast({ title: `Exported ${rows.length} audit log entries.` });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not download audit log.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              Immutable record of every important action across the platform.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => handleExport("csv")}
            disabled={!data || data.total === 0 || exporting !== null}
            data-testid="button-export-audit-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport("xlsx")}
            disabled={!data || data.total === 0 || exporting !== null}
            data-testid="button-export-audit-xlsx"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting === "xlsx" ? "Exporting…" : "XLSX"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label htmlFor="from" className="text-xs">From</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">To</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">User</Label>
              <Select
                value={userId}
                onValueChange={(v) => {
                  setUserId(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {users?.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.deletedAt ? " (deleted)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Action</Label>
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actions?.map((a) => (
                    <SelectItem key={a.action} value={a.action}>
                      {a.action} ({a.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={resetFilters} className="flex-1">
                Reset
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Refresh"
              >
                <RefreshCw className={isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right w-24">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !data || data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No audit log entries match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/40">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}{" "}
                      <span className="text-muted-foreground/70">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{log.userName}</div>
                      <div className="text-xs text-muted-foreground">{log.userRole}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={actionTone(log.action)}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ACTION_GROUPS[log.action] ?? log.entityType}
                    </TableCell>
                    <TableCell className="text-sm max-w-md truncate">
                      {log.description}
                    </TableCell>
                    <TableCell className="text-right">
                      {(log.dataBefore || log.dataAfter) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetails(log)}
                        >
                          View
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {data && data.total > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              testId="audit-logs-pagination"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Audit Detail</DialogTitle>
            <DialogDescription>
              {details?.userName} • {details?.action} • {details && formatDate(details.createdAt)}{" "}
              {details && new Date(details.createdAt).toLocaleTimeString()}
            </DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-4">
              <p className="text-sm">{details.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                    Before
                  </p>
                  <pre className="bg-muted/40 border rounded-md p-3 text-xs overflow-auto max-h-96">
                    {details.dataBefore
                      ? JSON.stringify(details.dataBefore, null, 2)
                      : "—"}
                  </pre>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                    After
                  </p>
                  <pre className="bg-muted/40 border rounded-md p-3 text-xs overflow-auto max-h-96">
                    {details.dataAfter
                      ? JSON.stringify(details.dataAfter, null, 2)
                      : "—"}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
