import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTimesheets,
  useApproveTimesheet,
  useRejectTimesheet,
  useDeleteTimesheet,
  getListTimesheetsQueryKey,
  getGetProjectQueryKey,
  getGetProjectFinancialsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Clock, Download, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { exportCsv } from "@/lib/exports";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted/40 text-muted-foreground border-border",
  SUBMITTED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
};

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold mt-1">{value}</div>
    </div>
  );
}

export default function TimesheetsTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isApprover =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project?.pmId === user.id);

  const params = { projectId };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey(params) });
    qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetProjectFinancialsQueryKey(projectId) });
  };

  const approveMutation = useApproveTimesheet({
    mutation: {
      onSuccess: () => { toast({ title: "Timesheet approved" }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to approve", description: e?.message }),
    },
  });
  const rejectMutation = useRejectTimesheet({
    mutation: {
      onSuccess: () => { toast({ title: "Timesheet rejected" }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to reject", description: e?.message }),
    },
  });
  const deleteMutation = useDeleteTimesheet({
    mutation: {
      onSuccess: () => { toast({ title: "Timesheet deleted" }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to delete", description: e?.message }),
    },
  });

  const [statusFilter, setStatusFilter] = useState<string>("__all");
  const [userFilter, setUserFilter] = useState<string>("__all");
  const [search, setSearch] = useState("");

  const list = timesheets ?? [];

  const userOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ts of list) {
      if (ts.userId && !seen.has(ts.userId)) {
        seen.set(ts.userId, ts.userName ?? ts.userId);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((ts: any) => {
      if (statusFilter !== "__all" && ts.status !== statusFilter) return false;
      if (userFilter !== "__all" && ts.userId !== userFilter) return false;
      if (q) {
        const hay = `${ts.userName ?? ""} ${ts.description ?? ""} ${ts.taskTitle ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, statusFilter, userFilter, search]);

  const totalHours = filtered.reduce((s: number, t: any) => s + (t.hours ?? 0), 0);
  const approvedHours = filtered.filter((t: any) => t.status === "APPROVED").reduce((s: number, t: any) => s + (t.hours ?? 0), 0);
  const submittedHours = filtered.filter((t: any) => t.status === "SUBMITTED").reduce((s: number, t: any) => s + (t.hours ?? 0), 0);
  const rejectedHours = filtered.filter((t: any) => t.status === "REJECTED").reduce((s: number, t: any) => s + (t.hours ?? 0), 0);

  function handleExportCsv() {
    const rows = filtered.map((ts: any) => ({
      Date: ts.workDate ? ts.workDate.slice(0, 10) : "",
      User: ts.userName ?? "",
      Task: ts.taskTitle ?? "",
      Hours: ts.hours ?? 0,
      Description: ts.description ?? "",
      Status: ts.status,
      ApprovedBy: ts.approvedByName ?? "",
      RejectionReason: ts.rejectionReason ?? "",
      SubmittedAt: ts.createdAt ?? "",
    }));
    exportCsv(`timesheets-${project?.code ?? projectId}`, rows);
  }

  async function handleApproveAllSubmitted() {
    const pending = filtered.filter((t: any) => t.status === "SUBMITTED");
    if (pending.length === 0) {
      toast({ title: "Nothing to approve", description: "No submitted entries in current view." });
      return;
    }
    if (!confirm(`Approve ${pending.length} submitted timesheet(s)?`)) return;
    for (const ts of pending) {
      try {
        await approveMutation.mutateAsync({ id: ts.id });
      } catch {
        // toast already shown by onError
      }
    }
  }

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Project Timesheets</CardTitle>
          <CardDescription>
            All timesheet entries logged against this project. Only entries with status{" "}
            <span className="font-medium text-foreground">APPROVED</span> count toward resource cost &amp; margin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <StatCard label="Total Hours" value={totalHours.toFixed(1)} />
            <StatCard label="Approved Hours" value={approvedHours.toFixed(1)} highlight />
            <StatCard label="Pending Approval" value={submittedHours.toFixed(1)} />
            <StatCard label="Rejected Hours" value={rejectedHours.toFixed(1)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[160px]" data-testid="filter-ts-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">User</span>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-8 w-[200px]" data-testid="filter-ts-user">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All users</SelectItem>
                  {userOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col flex-1 min-w-[180px]">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Search</span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="User, task, description..."
                className="h-8"
                data-testid="filter-ts-search"
              />
            </div>
            <div className="ml-auto flex items-end gap-2">
              {isApprover && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApproveAllSubmitted}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve-all-ts"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Approve All Submitted
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                data-testid="button-export-project-ts-csv"
              >
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No timesheets found"
              description={list.length === 0
                ? "No one has logged time against this project yet."
                : "No entries match the current filters."}
              icon={<Clock className="h-10 w-10 text-muted-foreground/50" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ts: any) => (
                    <TableRow key={ts.id} data-testid={`row-ts-${ts.id}`}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {ts.workDate ? formatDate(ts.workDate) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{ts.userName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ts.taskTitle ?? <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{(ts.hours ?? 0).toFixed(1)}</TableCell>
                      <TableCell className="text-sm max-w-[280px]">
                        <div className="truncate" title={ts.description ?? ""}>{ts.description ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${STATUS_COLORS[ts.status] ?? "bg-muted"} text-[10px]`}
                          title={ts.rejectionReason ?? ""}
                        >
                          {ts.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isApprover && ts.status === "SUBMITTED" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate({ id: ts.id })}
                                data-testid={`button-approve-ts-${ts.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                disabled={rejectMutation.isPending}
                                onClick={() => {
                                  const reason = prompt("Reason for rejection?", "");
                                  if (reason && reason.trim()) {
                                    rejectMutation.mutate({ id: ts.id, data: { reason: reason.trim() } });
                                  }
                                }}
                                data-testid={`button-reject-ts-${ts.id}`}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {(isSuperAdmin(user?.role) || user?.role === "MANAGEMENT" || ts.userId === user?.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm(`Delete this timesheet entry?`)) {
                                  deleteMutation.mutate({ id: ts.id });
                                }
                              }}
                              title="Delete"
                              data-testid={`button-delete-ts-${ts.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
