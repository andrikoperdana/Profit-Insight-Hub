import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListMyTasks,
  useLogTaskTime,
  getListMyTasksQueryKey,
  type Task,
  type TaskStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Loader2, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};
const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  TODO: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  IN_PROGRESS: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BLOCKED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DONE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function MyTasksCard() {
  const { data: tasks, isLoading } = useListMyTasks({
    query: { queryKey: getListMyTasksQueryKey() },
  });
  const [logTask, setLogTask] = useState<Task | null>(null);

  const open = useMemo(
    () => (tasks ?? []).filter((t) => t.status !== "DONE"),
    [tasks],
  );
  const totalLogged = (tasks ?? []).reduce((s, t) => s + (t.loggedHours ?? 0), 0);

  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" /> My Tasks
        </CardTitle>
        <CardDescription>
          {open.length > 0
            ? `${open.length} open · ${totalLogged.toFixed(1)}h clocked across all your tasks`
            : "No open tasks assigned to you"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6"><TableSkeleton columns={4} rows={3} /></div>
        ) : !tasks?.length ? (
          <EmptyState title="No tasks yet" description="Tasks assigned to you will appear here." />
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.slice(0, 8).map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/30 align-top">
                  <TableCell className="max-w-[280px]">
                    <Link href={`/projects/${t.projectId}`} className="text-primary hover:underline font-medium">
                      {t.title}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.projectCode ? `${t.projectCode} · ` : ""}{t.projectName ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.endDate ? formatDate(t.endDate) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TASK_STATUS_STYLE[t.status as TaskStatus]}>
                      {TASK_STATUS_LABELS[t.status as TaskStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {(t.loggedHours ?? 0).toFixed(1)}h
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => setLogTask(t)}
                      data-testid={`button-dashboard-log-${t.id}`}
                    >
                      <Clock className="h-3.5 w-3.5 mr-1" /> Log
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {(tasks?.length ?? 0) > 8 && (
          <div className="p-3 text-right">
            <span className="text-xs text-muted-foreground">
              Showing 8 of {tasks!.length}. Open the project to see more.
            </span>
          </div>
        )}
      </CardContent>
      {logTask && (
        <DashboardLogHoursDialog
          task={logTask}
          onClose={() => setLogTask(null)}
        />
      )}
    </Card>
  );
}

function DashboardLogHoursDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<string>("1");
  const [note, setNote] = useState("");
  const [loggedAt, setLoggedAt] = useState(new Date().toISOString().slice(0, 10));

  const log = useLogTaskTime({
    mutation: {
      onSuccess: () => {
        toast({ title: `Logged ${hours}h on "${task.title}"` });
        queryClient.invalidateQueries({ queryKey: getListMyTasksQueryKey() });
        onClose();
      },
      onError: (e: any) =>
        toast({ title: "Log failed", description: e?.message, variant: "destructive" }),
    },
  });

  const h = Number(hours);
  const canSubmit = isFinite(h) && h > 0 && h <= 24 && !log.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Hours</DialogTitle>
          <DialogDescription className="text-xs">
            {task.projectCode ? `${task.projectCode} — ` : ""}{task.title}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Hours *</Label>
            <Input
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} />
          </div>
          <div>
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on? (optional)"
              className="resize-none h-16"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => log.mutate({
              taskId: task.id,
              data: { hours: h, note: note.trim() || undefined, loggedAt },
            })}
          >
            {log.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
            Log {h || 0}h
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
