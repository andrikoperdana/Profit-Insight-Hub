import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarRange, ChevronLeft, ChevronRight, Download, AlertTriangle, Coffee } from "lucide-react";
import { LoadingPage } from "@/components/common/Loading";
import { useAuth } from "@/lib/auth";
import { exportSheets } from "@/lib/exports";
import { RoleLabels } from "@/lib/roles";

type Cell = { date: string; status: "AVAILABLE" | "ASSIGNED" | "OVERLOADED" | "WEEKEND" | "ON_LEAVE"; hours: number; projects: string[]; leaveType?: string | null };
type WeeklyTotal = { weekStart: string; hours: number; warning: boolean };
type Row = {
  userId: string;
  userName: string;
  role: string;
  title: string | null;
  currentClientId: string | null;
  currentClientName: string | null;
  cells: Cell[];
  weeklyTotals: WeeklyTotal[];
};
type Summary = { date: string; isWorkday: boolean; available: number; assigned: number; overloaded: number; byRole: Record<string, { available: number; assigned: number; overloaded: number }> };
type ApiResp = {
  start: string;
  days: number;
  rows: Row[];
  summary: Summary[];
  filters: { principals: { id: string; name: string }[]; specializations: string[] };
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  const diff = (dow + 6) % 7; // Monday=0
  x.setDate(x.getDate() - diff);
  return x;
}

function shortDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit" });
}
function monthLabel(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const STATUS_STYLE: Record<Cell["status"], string> = {
  AVAILABLE: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  ASSIGNED: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  OVERLOADED: "bg-destructive/15 text-destructive border border-destructive/40",
  WEEKEND: "bg-muted/40 text-muted-foreground/50",
  ON_LEAVE: "bg-slate-500/20 text-slate-300 border border-slate-500/40",
};

export default function CapacityPlanning() {
  const { user } = useAuth();
  const allowed = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";

  const [weeks, setWeeks] = useState<2 | 4>(2);
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [principalFilter, setPrincipalFilter] = useState<string>("all");
  const [specFilter, setSpecFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const startStr = anchor.toISOString().slice(0, 10);
  const days = weeks * 7;

  const { data, isLoading } = useQuery<ApiResp>({
    queryKey: ["capacity", startStr, days],
    queryFn: () => customFetch<ApiResp>(`/api/capacity/calendar?start=${startStr}&days=${days}`),
    enabled: allowed,
    staleTime: 30_000,
  });

  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      if (principalFilter !== "all" && r.currentClientId !== principalFilter) return false;
      if (specFilter !== "all" && r.title !== specFilter) return false;
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      return true;
    });
  }, [data, principalFilter, specFilter, roleFilter]);

  if (!allowed) {
    return (
      <div className="p-8">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only Management and Project Managers can view Capacity Planning.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  if (isLoading || !data) return <LoadingPage />;

  const moveWeeks = (delta: number) => {
    const next = new Date(anchor);
    next.setDate(next.getDate() + delta * 7);
    setAnchor(startOfWeek(next));
  };

  function handleExport() {
    const rows = filteredRows.flatMap((r) =>
      r.cells.map((c) => ({
        Resource: r.userName,
        Role: RoleLabels[r.role as keyof typeof RoleLabels] ?? r.role,
        Title: r.title ?? "",
        CurrentClient: r.currentClientName ?? "",
        Date: c.date,
        Status: c.status,
        Hours: c.hours,
        Projects: c.projects.join("; "),
      })),
    );
    if (!data) return;
    const summary = data.summary.map((s) => ({
      Date: s.date,
      Workday: s.isWorkday ? "Yes" : "No",
      AvailableSlots: s.available,
      Assigned: s.assigned,
      Overloaded: s.overloaded,
      Consultant_Available: s.byRole?.KONSULTAN?.available ?? 0,
      TW_Available: s.byRole?.TECHNICAL_WRITER?.available ?? 0,
      Admin_Available: s.byRole?.ADMIN_PROJECT?.available ?? 0,
    }));
    exportSheets("capacity-planning", [
      { name: "Calendar", rows },
      { name: "Daily Summary", rows: summary },
    ]);
  }

  // Days with notable patterns
  const overloadedDays = data.summary.filter((s) => s.isWorkday && s.overloaded > 0);
  const idleHeavyDays = data.summary.filter((s) => s.isWorkday && s.available >= 3 && s.assigned <= s.available);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-7 w-7 text-primary" />
            Capacity Planning
          </h1>
          <p className="text-muted-foreground">
            See who is available, assigned, or overloaded across the next {weeks} weeks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => moveWeeks(-1)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => moveWeeks(1)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v) as 2 | 4)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 weeks</SelectItem>
              <SelectItem value="4">4 weeks</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Available</Badge>
        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">Assigned</Badge>
        <Badge className="bg-destructive/15 text-destructive border-destructive/40">Overloaded</Badge>
        <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/40">On Leave</Badge>
        <Badge variant="outline" className="text-amber-500 border-amber-500/40">Week &gt; 40h</Badge>
        <Badge variant="outline" className="text-muted-foreground"><Coffee className="h-3 w-3 mr-1" /> Weekend</Badge>
        <span className="text-sm text-muted-foreground ml-2">
          Range: {monthLabel(data.start)} · starting {shortDate(data.start)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="KONSULTAN">Consultant</SelectItem>
            <SelectItem value="TECHNICAL_WRITER">Technical Writer</SelectItem>
            <SelectItem value="ADMIN_PROJECT">Admin Project</SelectItem>
            <SelectItem value="PROJECT_MANAGER">Project Manager</SelectItem>
          </SelectContent>
        </Select>
        <Select value={principalFilter} onValueChange={setPrincipalFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Principal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All principals</SelectItem>
            {data.filters.principals.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={specFilter} onValueChange={setSpecFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Specialization" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specializations</SelectItem>
            {data.filters.specializations.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(overloadedDays.length > 0 || idleHeavyDays.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          {overloadedDays.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <CardTitle className="text-base">Overloaded days</CardTitle>
                  <CardDescription>
                    {overloadedDays.length} day(s) with at least one resource above 8h
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          )}
          {idleHeavyDays.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Coffee className="h-5 w-5 text-amber-400" />
                <div>
                  <CardTitle className="text-base">Available capacity</CardTitle>
                  <CardDescription>
                    {idleHeavyDays.length} day(s) with 3+ idle resources — opportunity to assign
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>Each cell shows status; numbers indicate logged hours that day.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <TooltipProvider delayDuration={150}>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-muted/40 z-10 min-w-[180px]">Resource</th>
                  {data.summary.map((s) => (
                    <th key={s.date} className={`p-2 text-center min-w-[60px] ${!s.isWorkday ? "text-muted-foreground/60" : ""}`}>
                      {shortDate(s.date)}
                    </th>
                  ))}
                  <th className="p-2 text-center min-w-[80px] bg-muted/60">Week h</th>
                </tr>
                <tr className="text-[10px] text-muted-foreground border-t border-border">
                  <th className="text-left p-2 sticky left-0 bg-muted/40 z-10">Available slots</th>
                  {data.summary.map((s) => (
                    <th key={s.date} className="p-1 text-center font-normal">
                      {s.isWorkday ? <span className="text-emerald-400">{s.available}</span> : "—"}
                    </th>
                  ))}
                  <th className="p-1 text-center font-normal bg-muted/60">—</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={2 + data.summary.length} className="p-6 text-center text-muted-foreground">
                      No resources match the current filters.
                    </td>
                  </tr>
                )}
                {filteredRows.map((row) => (
                  <tr key={row.userId} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2 sticky left-0 bg-card z-10">
                      <div className="font-medium">{row.userName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {RoleLabels[row.role as keyof typeof RoleLabels] ?? row.role}
                        {row.title ? ` · ${row.title}` : ""}
                      </div>
                    </td>
                    {row.cells.map((c) => {
                      const cls = STATUS_STYLE[c.status];
                      const label =
                        c.status === "WEEKEND"
                          ? "Weekend"
                          : c.status === "ON_LEAVE"
                            ? `On leave${c.leaveType ? ` · ${c.leaveType}` : ""}`
                            : c.status === "AVAILABLE"
                              ? "Available"
                              : c.status === "OVERLOADED"
                                ? `Overloaded · ${c.hours}h`
                                : `Assigned · ${c.hours}h`;
                      const label_short =
                        c.status === "WEEKEND" ? "—"
                          : c.status === "ON_LEAVE" ? "L"
                            : c.hours > 0 ? `${c.hours}h` : "·";
                      return (
                        <td key={c.date} className="p-1 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`mx-auto h-7 w-12 rounded text-[10px] flex items-center justify-center ${cls}`}>
                                {label_short}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div className="font-medium">{label}</div>
                                {c.projects.length > 0 && (
                                  <div className="text-muted-foreground">{c.projects.join(", ")}</div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td className="p-1 text-center bg-muted/30">
                      <div className="flex flex-col items-center gap-0.5">
                        {(row.weeklyTotals ?? []).map((w) => (
                          <Tooltip key={w.weekStart}>
                            <TooltipTrigger asChild>
                              <div
                                className={`h-7 w-14 rounded text-[10px] flex items-center justify-center font-medium ${
                                  w.warning
                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {w.hours}h
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div className="font-medium">Week {w.weekStart}</div>
                                <div className={w.warning ? "text-amber-400" : "text-muted-foreground"}>
                                  Total {w.hours}h{w.warning ? " · exceeds 40h/week" : ""}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
