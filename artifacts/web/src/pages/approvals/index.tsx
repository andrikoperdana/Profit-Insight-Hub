import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  useListTimesheets,
  useApproveTimesheet,
  useRejectTimesheet,
  customFetch,
} from "@workspace/api-client-react";
import { getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { AlarmClock, Calendar, Check, Clock, Download, Inbox, XCircle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportCsv } from "@/lib/exports";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination, usePagination } from "@/components/common/Pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const OVERDUE_MS = 48 * 60 * 60 * 1000;

export default function ApprovalInbox() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isPM = isSuperAdmin(user?.role) || user?.role === "PROJECT_MANAGER" || user?.role === "MANAGEMENT";

  useEffect(() => {
    if (user && !isPM) setLocation("/timesheets");
  }, [user, isPM, setLocation]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = { scope: "approval" as const };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selections when list changes
  useEffect(() => {
    if (timesheets) {
      setSelected((prev) => {
        const ids = new Set(timesheets.map((t) => t.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    }
  }, [timesheets]);

  const approve = useApproveTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet approved" });
        queryClient.invalidateQueries({
          queryKey: getListTimesheetsQueryKey(params),
        });
      },
    },
  });

  const bulkApprove = useMutation({
    mutationFn: (ids: string[]) =>
      customFetch<{ approved: number; ids: string[] }>(
        "/api/timesheets/bulk-approve",
        { method: "POST", body: JSON.stringify({ ids }) },
      ),
    onSuccess: (resp) => {
      toast({
        title: `${resp.approved} timesheet(s) approved`,
        description:
          resp.approved < selected.size
            ? `${selected.size - resp.approved} skipped (no permission or no longer pending)`
            : undefined,
      });
      setSelected(new Set());
      queryClient.invalidateQueries({
        queryKey: getListTimesheetsQueryKey(params),
      });
    },
    onError: (err: any) =>
      toast({
        title: "Bulk approve failed",
        description: err?.message,
        variant: "destructive",
      }),
  });

  const overdueCount = useMemo(() => {
    if (!timesheets) return 0;
    const now = Date.now();
    return timesheets.filter(
      (t) => now - new Date(t.createdAt).getTime() > OVERDUE_MS,
    ).length;
  }, [timesheets]);

  const allChecked =
    !!timesheets?.length && selected.size === timesheets.length;
  const someChecked = selected.size > 0 && !allChecked;

  const pager = usePagination(timesheets);

  function handleExportCsv() {
    const rows = (timesheets ?? []).map((ts) => ({
      Date: ts.workDate ?? "",
      Submitter: ts.userName ?? "",
      Project: ts.projectName ?? "",
      Hours: ts.hours ?? 0,
      Description: ts.description ?? "",
      SubmittedAt: ts.createdAt ?? "",
      AgeHours: Math.round((Date.now() - new Date(ts.createdAt).getTime()) / 3600000),
    }));
    exportCsv("approval-inbox", rows);
  }

  function toggleAll() {
    if (!timesheets) return;
    setSelected(allChecked ? new Set() : new Set(timesheets.map((t) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Inbox className="h-7 w-7 text-primary" /> Approval Inbox
        </h1>
        <p className="text-muted-foreground">
          Review and approve timesheets submitted by your team. Only approved
          entries are used in cost calculations.
        </p>
      </div>

      {overdueCount > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlarmClock className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">
                {overdueCount} timesheet{overdueCount === 1 ? "" : "s"} pending
                more than 48 hours
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Submitters are blocked on your review. Please action these soon.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              Pending Submissions
              <Badge variant="secondary" className="font-normal">
                {timesheets?.length ?? 0}
              </Badge>
            </span>
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportCsv}
                disabled={!timesheets?.length}
                data-testid="button-export-approvals-csv"
              >
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              {selected.size > 0 && (
                <Button
                  size="sm"
                  onClick={() => bulkApprove.mutate(Array.from(selected))}
                  disabled={bulkApprove.isPending}
                  className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950"
                  data-testid="button-bulk-approve"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve {selected.size} selected
                </Button>
              )}
            </span>
          </CardTitle>
          <CardDescription>
            Submissions from Consultant, Technical Writer, and Admin Project on
            projects you manage. Tick rows for bulk approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton columns={7} rows={6} />
            </div>
          ) : !timesheets?.length ? (
            <EmptyState
              title="All caught up!"
              description="No timesheets are waiting for your approval right now."
              icon={<Clock className="h-10 w-10 text-muted-foreground/50" />}
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allChecked ? true : someChecked ? "indeterminate" : false
                      }
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((ts) => {
                  const submitted = new Date(ts.createdAt).getTime();
                  const ageH = Math.round((Date.now() - submitted) / 3600000);
                  const overdue = ageH > 48;
                  return (
                    <TableRow
                      key={ts.id}
                      className={overdue ? "bg-destructive/5" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(ts.id)}
                          onCheckedChange={() => toggleOne(ts.id)}
                          aria-label={`Select ${ts.userName}`}
                          data-testid={`checkbox-${ts.id}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center text-sm">
                          <Calendar className="h-3 w-3 mr-2 text-muted-foreground" />
                          {formatDate(ts.workDate)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {ts.userName}
                        {overdue && (
                          <Badge
                            variant="destructive"
                            className="ml-2 text-[10px]"
                          >
                            {ageH}h waiting
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/projects/${ts.projectId}`}
                          className="text-primary hover:underline"
                        >
                          {ts.projectName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {ts.hours}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p
                          className="text-sm text-foreground/90 line-clamp-2"
                          title={ts.description ?? ""}
                        >
                          {ts.description || (
                            <span className="text-muted-foreground italic">
                              no description
                            </span>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 border-emerald-600/30 hover:bg-emerald-500/10 hover:text-emerald-500"
                            onClick={() => approve.mutate({ id: ts.id })}
                            disabled={approve.isPending}
                            data-testid={`approve-${ts.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <RejectDialog tsId={ts.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {timesheets && timesheets.length > 0 && (
            <Pagination
              page={pager.page}
              pageSize={pager.pageSize}
              total={pager.total}
              totalPages={pager.totalPages}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
              testId="approvals-pagination"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RejectDialog({ tsId }: { tsId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = { scope: "approval" as const };

  const reject = useRejectTimesheet({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Timesheet rejected",
          description: "The submitter has been notified.",
        });
        queryClient.invalidateQueries({
          queryKey: getListTimesheetsQueryKey(params),
        });
        setOpen(false);
        setReason("");
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Failed to reject",
          description: err?.message,
        });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          <XCircle className="h-4 w-4 mr-1" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Timesheet</DialogTitle>
          <DialogDescription>
            Provide a reason. The submitter will see this note and can resubmit
            a corrected entry.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label>Rejection Note *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Description too brief, please specify the task."
            className="resize-none h-24"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => reject.mutate({ id: tsId, data: { reason } })}
            disabled={!reason.trim() || reject.isPending}
          >
            Confirm Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
