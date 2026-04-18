import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useListTimesheets, 
  useCreateTimesheet, 
  useSubmitTimesheet, 
  useApproveTimesheet, 
  useRejectTimesheet,
  useDeleteTimesheet,
  useListProjects
} from "@workspace/api-client-react";
import { getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { UserRole, TimesheetStatus } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatIDR, formatDate } from "@/lib/format";
import { Clock, Plus, Send, Check, XCircle, Trash2, Calendar, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TimesheetStatusBadge } from "@/components/common/Badges";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";

const logTimeSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  workDate: z.string().min(1, "Date is required"),
  hours: z.coerce.number().min(0.5, "Minimum 0.5 hours").max(24, "Maximum 24 hours"),
  description: z.string().min(5, "Description required"),
});

export default function TimesheetsWorkspace() {
  const { user } = useAuth();
  const isPM = user?.role === UserRole.PROJECT_MANAGER || user?.role === UserRole.MANAGEMENT;
  
  // Default to "mine" for consultants, "approval" for PMs
  const defaultTab = isPM ? "approval" : "mine";
  const [activeTab, setActiveTab] = useState<"mine" | "approval" | "all">(defaultTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Timesheets</h1>
          <p className="text-muted-foreground">Log hours, track utilization, and manage approvals.</p>
        </div>
        <LogTimeDialog />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-muted">
          <TabsTrigger value="mine">My Timesheets</TabsTrigger>
          {isPM && <TabsTrigger value="approval">Pending Approvals</TabsTrigger>}
          {isPM && <TabsTrigger value="all">All Team Records</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="mine" className="pt-4 m-0">
          <TimesheetsTable scope="mine" />
        </TabsContent>
        {isPM && (
          <TabsContent value="approval" className="pt-4 m-0">
            <TimesheetsTable scope="approval" />
          </TabsContent>
        )}
        {isPM && (
          <TabsContent value="all" className="pt-4 m-0">
            <TimesheetsTable scope="all" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function LogTimeDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: projects } = useListProjects({ status: "ACTIVE" });

  const createTs = useCreateTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet saved as draft" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "mine" }) });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to save", description: err.message });
      }
    }
  });

  const form = useForm({
    resolver: zodResolver(logTimeSchema),
    defaultValues: { projectId: "", workDate: new Date().toISOString().split('T')[0], hours: 8, description: "" }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0"><Plus className="h-4 w-4 mr-2" /> Log Time</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Log Time</DialogTitle>
          <DialogDescription>Record your billable hours for a project.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => createTs.mutate({ data: d }))} className="space-y-4 pt-4">
            <FormField control={form.control} name="projectId" render={({ field }) => (
              <FormItem>
                <FormLabel>Project *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="workDate" render={({ field }) => (
                <FormItem><FormLabel>Date *</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="hours" render={({ field }) => (
                <FormItem><FormLabel>Hours *</FormLabel><FormControl><Input type="number" step="0.5" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Work Description *</FormLabel><FormControl><Textarea placeholder="What did you work on?" className="resize-none h-24" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createTs.isPending}>Save as Draft</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TimesheetsTable({ scope }: { scope: "mine" | "approval" | "all" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKeyParams = scope === "mine" ? {} : { scope };
  const { data: timesheets, isLoading } = useListTimesheets(queryKeyParams, {
    query: { queryKey: getListTimesheetsQueryKey(queryKeyParams) }
  });

  const submit = useSubmitTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet submitted for approval" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(queryKeyParams) });
      }
    }
  });

  const deleteTs = useDeleteTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet deleted" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(queryKeyParams) });
      }
    }
  });

  const approve = useApproveTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet approved" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(queryKeyParams) });
      }
    }
  });

  if (isLoading) return <TableSkeleton columns={7} rows={8} />;

  if (!timesheets?.length) {
    return (
      <EmptyState 
        title={scope === "approval" ? "All caught up!" : "No timesheets found"} 
        description={scope === "approval" ? "There are no timesheets waiting for your approval right now." : "You haven't logged any time yet."}
        icon={<Clock className="h-10 w-10 text-muted-foreground/50" />}
      />
    );
  }

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Date</TableHead>
            {scope !== "mine" && <TableHead>Consultant</TableHead>}
            <TableHead>Project</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead className="max-w-[200px]">Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {timesheets.map((ts) => (
            <TableRow key={ts.id}>
              <TableCell className="whitespace-nowrap font-medium flex items-center">
                <Calendar className="h-3 w-3 mr-2 text-muted-foreground" />
                {formatDate(ts.workDate)}
              </TableCell>
              {scope !== "mine" && <TableCell>{ts.userName}</TableCell>}
              <TableCell>
                <Link href={`/projects/${ts.projectId}`} className="hover:underline text-primary">
                  {ts.projectName}
                </Link>
              </TableCell>
              <TableCell className="font-mono">{ts.hours}</TableCell>
              <TableCell className="max-w-[200px] truncate" title={ts.description || ""}>
                {ts.description || "-"}
              </TableCell>
              <TableCell><TimesheetStatusBadge status={ts.status} /></TableCell>
              <TableCell className="text-right space-x-1">
                {/* Actions for "mine" tab */}
                {scope === "mine" && ts.status === "DRAFT" && (
                  <>
                    <Button size="sm" variant="ghost" title="Submit" className="text-primary hover:bg-primary/10 hover:text-primary" onClick={() => submit.mutate({ id: ts.id })}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Delete" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteTs.mutate({ id: ts.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {scope === "mine" && ts.status === "REJECTED" && (
                  <Button size="sm" variant="ghost" title="Delete" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteTs.mutate({ id: ts.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Actions for "approval" tab */}
                {scope === "approval" && ts.status === "SUBMITTED" && (
                  <>
                    <Button size="sm" variant="ghost" title="Approve" className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10" onClick={() => approve.mutate({ id: ts.id })}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <RejectTimesheetDialog tsId={ts.id} queryKeyParams={queryKeyParams} />
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RejectTimesheetDialog({ tsId, queryKeyParams }: { tsId: string, queryKeyParams: any }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reject = useRejectTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet rejected" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey(queryKeyParams) });
        setOpen(false);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Reject" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <XCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Timesheet</DialogTitle>
          <DialogDescription>Please provide a reason for rejection so the consultant can fix it.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Reason</Label>
          <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Incomplete description..." className="mt-2" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => reject.mutate({ id: tsId, data: { reason } })} disabled={!reason || reject.isPending}>Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
