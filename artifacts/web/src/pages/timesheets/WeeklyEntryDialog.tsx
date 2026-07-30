import { useMemo, useState } from "react";
import {
  useListProjects,
  useListMyTasks,
  useCreateBulkTimesheets,
  getListTimesheetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { CalendarRange } from "lucide-react";

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + monOffset);
  return x;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function WeeklyEntryDialog({ isAutoApprove }: { isAutoApprove: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  // Delivery roles must clock hours against an assigned task (server enforces
  // per-entry); mirror it client-side so the whole batch doesn't fail.
  const taskRequired = ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"].includes(user?.role ?? "");
  const [open, setOpen] = useState(false);
  const [weekStartIso, setWeekStartIso] = useState(startOfWeek(new Date()).toISOString().slice(0, 10));
  // grid[projectId][dayIndex] = hours
  const [grid, setGrid] = useState<Record<string, number[]>>({});
  // taskByProject[projectId] = taskId (optional task linkage for the whole week)
  const [taskByProject, setTaskByProject] = useState<Record<string, string>>({});
  const [desc, setDesc] = useState("");

  const { data: projects } = useListProjects({ status: "ACTIVE" }, { query: { enabled: open, queryKey: ["projects", "active", { open }] as const } });
  const { data: myTasks } = useListMyTasks({ query: { enabled: open, queryKey: ["my-tasks", "weekly-entry"] } });

  const days = useMemo(() => {
    const start = new Date(weekStartIso);
    return Array.from({ length: 5 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { iso: d.toISOString().slice(0, 10), label: DAY_LABELS[i], date: d };
    });
  }, [weekStartIso]);

  const projectList = projects ?? [];

  const setCell = (pid: string, di: number, v: number) => {
    setGrid((g) => {
      const row = g[pid] ? [...g[pid]] : [0, 0, 0, 0, 0];
      row[di] = isNaN(v) ? 0 : Math.max(0, Math.min(24, v));
      return { ...g, [pid]: row };
    });
  };

  const totals = useMemo(() => {
    const perDay = [0, 0, 0, 0, 0];
    let grand = 0;
    Object.values(grid).forEach((row) => {
      row.forEach((h, i) => { perDay[i] += h; grand += h; });
    });
    return { perDay, grand };
  }, [grid]);

  const bulk = useCreateBulkTimesheets({
    mutation: {
      onSuccess: (res) => {
        if (res.failed > 0) {
          const errs = res.results.filter((r) => !r.ok).map((r) => r.error).slice(0, 3).join("; ");
          toast({
            variant: "destructive",
            title: `${res.created} succeeded, ${res.failed} failed`,
            description: errs,
          });
        } else {
          toast({ title: `${res.created} timesheet(s) recorded successfully` });
        }
        qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "mine" }) });
        qc.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ scope: "approval" }) });
        if (res.failed === 0) {
          setOpen(false);
          setGrid({});
          setTaskByProject({});
          setDesc("");
        }
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to submit", description: e?.message }),
    },
  });

  const submit = () => {
    const entries: Array<{ projectId: string; workDate: string; hours: number; taskId?: string; description?: string }> = [];
    const missingTaskProjects: string[] = [];
    Object.entries(grid).forEach(([pid, row]) => {
      const taskId = taskByProject[pid] || undefined;
      const rowHasHours = row.some((h) => h > 0);
      if (rowHasHours && taskRequired && !taskId) missingTaskProjects.push(pid);
      row.forEach((h, i) => {
        if (h > 0) entries.push({ projectId: pid, workDate: days[i].iso, hours: h, ...(taskId ? { taskId } : {}), description: desc || `Weekly ${weekStartIso}` });
      });
    });
    if (missingTaskProjects.length > 0) {
      toast({
        variant: "destructive",
        title: "Task selection required",
        description: "Your role must clock hours against an assigned task. Pick a task for every project row with hours.",
      });
      return;
    }
    if (entries.length === 0) {
      toast({ variant: "destructive", title: "No hours entered yet" });
      return;
    }
    if (entries.length > 50) {
      toast({ variant: "destructive", title: "Maximum 50 entries per submit" });
      return;
    }
    bulk.mutate({ data: { entries } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0" data-testid="button-weekly-entry">
          <CalendarRange className="h-4 w-4 mr-2" /> Weekly Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Weekly Timesheet Entry</DialogTitle>
          <DialogDescription>
            Enter hours per project per day. Weekdays only (Mon–Fri). Up to the last 5 working days.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Week (Monday)</label>
              <Input
                type="date"
                value={weekStartIso}
                onChange={(e) => setWeekStartIso(startOfWeek(new Date(e.target.value)).toISOString().slice(0, 10))}
                data-testid="input-week-start"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Description (optional, applied to all entries)</label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Example: Pentest execution, documentation…" />
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              Total: {totals.grand.toFixed(1)}h
            </Badge>
          </div>

          {projectList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ACTIVE projects assigned to you right now.</p>
          ) : (
            <div className="border border-border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Project</th>
                    <th className="text-left p-2 min-w-[180px]">Task (optional)</th>
                    {days.map((d) => (
                      <th key={d.iso} className="text-center p-2 min-w-[80px]">
                        <div>{d.label}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">{d.iso.slice(5)}</div>
                      </th>
                    ))}
                    <th className="text-right p-2 font-mono">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {projectList.map((p) => {
                    const row = grid[p.id] ?? [0, 0, 0, 0, 0];
                    const rowTotal = row.reduce((a, b) => a + b, 0);
                    const tasksForProject = (myTasks ?? []).filter(
                      (t: any) => t.projectId === p.id && t.status !== "DONE",
                    );
                    return (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="p-2 sticky left-0 bg-background">
                          <div className="font-medium">{p.projectId ?? p.code ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{p.name}</div>
                        </td>
                        <td className="p-1">
                          {tasksForProject.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">No assigned tasks</span>
                          ) : (
                            <Select
                              value={taskByProject[p.id] || "__none"}
                              onValueChange={(v) =>
                                setTaskByProject((prev) => ({ ...prev, [p.id]: v === "__none" ? "" : v }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`weekly-task-${p.id}`}>
                                <SelectValue placeholder="Not linked" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">Not linked to a task</SelectItem>
                                {tasksForProject.map((t: any) => (
                                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        {row.map((h, i) => (
                          <td key={i} className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={h || ""}
                              onChange={(e) => setCell(p.id, i, Number(e.target.value))}
                              className="h-8 text-center font-mono"
                              data-testid={`cell-${p.id}-${i}`}
                            />
                          </td>
                        ))}
                        <td className="p-2 text-right font-mono font-semibold">{rowTotal > 0 ? rowTotal.toFixed(1) : "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    <td className="p-2 sticky left-0 bg-muted/30" colSpan={2}>Total per day</td>
                    {totals.perDay.map((t, i) => (
                      <td key={i} className="p-2 text-center font-mono">{t > 0 ? t.toFixed(1) : "—"}</td>
                    ))}
                    <td className="p-2 text-right font-mono">{totals.grand.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={bulk.isPending || totals.grand === 0} data-testid="button-submit-weekly">
            {bulk.isPending ? "Saving…" : isAutoApprove ? "Save (Auto-approve)" : "Submit Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
