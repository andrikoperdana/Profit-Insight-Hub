import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListTimesheets,
  useApproveTimesheet,
  useRejectTimesheet,
} from "@workspace/api-client-react";
import { getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Calendar, Check, Clock, Inbox, XCircle } from "lucide-react";
import { formatDate } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ApprovalInbox() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isPM = user?.role === "PROJECT_MANAGER" || user?.role === "MANAGEMENT";

  useEffect(() => {
    if (user && !isPM) setLocation("/timesheets");
  }, [user, isPM, setLocation]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = { scope: "approval" as const };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });

  const approve = useApproveTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet approved" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(params) });
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Inbox className="h-7 w-7 text-primary" /> Approval Inbox
        </h1>
        <p className="text-muted-foreground">
          Review and approve timesheets submitted by your team. Only approved entries are used in cost calculations.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Pending Submissions</span>
            <span className="text-sm font-normal text-muted-foreground">
              {timesheets?.length ?? 0} waiting
            </span>
          </CardTitle>
          <CardDescription>Submissions from Konsultan, Technical Writer, and Admin Project on projects you manage.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={6} rows={6} /></div>
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
                  <TableHead>Date</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timesheets.map((ts) => (
                  <TableRow key={ts.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center text-sm">
                        <Calendar className="h-3 w-3 mr-2 text-muted-foreground" />
                        {formatDate(ts.workDate)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{ts.userName}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${ts.projectId}`} className="text-primary hover:underline">
                        {ts.projectName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">{ts.hours}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground/90 line-clamp-2" title={ts.description ?? ""}>
                        {ts.description || <span className="text-muted-foreground italic">no description</span>}
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
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <RejectDialog tsId={ts.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        toast({ title: "Timesheet rejected", description: "The submitter has been notified." });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(params) });
        setOpen(false);
        setReason("");
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to reject", description: err?.message });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
          <XCircle className="h-4 w-4 mr-1" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Timesheet</DialogTitle>
          <DialogDescription>
            Provide a reason. The submitter will see this note and can resubmit a corrected entry.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label>Catatan Penolakan *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Deskripsi terlalu singkat, sebutkan task spesifik."
            className="resize-none h-24"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
