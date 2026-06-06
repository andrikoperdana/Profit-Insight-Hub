import { useMemo, useState } from "react";
import {
  useGetWorkHoursTeam,
  getGetWorkHoursTeamQueryKey,
  type WorkHoursSummary,
  type WorkHoursPeriod,
  type WorkHoursPeriodStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Clock, Download } from "lucide-react";
import { RoleLabels } from "@/lib/roles";
import type { UserRole } from "@workspace/api-client-react";

const STATUS_META: Record<WorkHoursPeriodStatus, { label: string; tone: string }> = {
  MET: { label: "On Target", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ON_TRACK: { label: "On Track", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  BEHIND: { label: "Slightly Behind", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  AT_RISK: { label: "Behind", tone: "bg-destructive/15 text-destructive border-destructive/30" },
};

function PeriodCell({ period }: { period: WorkHoursPeriod }) {
  if (period.targetHours <= 0) {
    return (
      <div className="text-xs">
        <span className="font-mono">{period.loggedHours.toFixed(1)}h</span>
        <span className="text-muted-foreground"> · not required</span>
      </div>
    );
  }
  const meta = STATUS_META[period.status];
  return (
    <div className="space-y-1">
      <div className="text-xs font-mono">
        {period.loggedHours.toFixed(1)} / {period.targetHours.toFixed(0)}h
      </div>
      <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
      {period.pendingHours > 0 && (
        <div className="text-[10px] text-blue-400">{period.pendingHours.toFixed(1)}h pending</div>
      )}
    </div>
  );
}

export default function WorkHoursTeamPage() {
  const [search, setSearch] = useState("");
  const [weekStatus, setWeekStatus] = useState<string>("ALL");

  const { data, isLoading } = useGetWorkHoursTeam({
    query: { queryKey: getGetWorkHoursTeamQueryKey() },
  });

  const members: WorkHoursSummary[] = data?.members ?? [];

  function downloadExport(format: "csv" | "xlsx") {
    const token = localStorage.getItem("auth_token");
    fetch(`/api/work-hours/team/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error("export failed");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `work-hours-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("Failed to download work hours report."));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (weekStatus !== "ALL") {
        if (weekStatus === "BEHIND") {
          if (m.week.status !== "BEHIND" && m.week.status !== "AT_RISK") return false;
        } else if (m.week.status !== weekStatus) {
          return false;
        }
      }
      if (q) {
        const blob = `${m.userName} ${RoleLabels[m.role as UserRole] ?? m.role} ${m.businessUnitName ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, weekStatus]);

  const kpi = useMemo(() => {
    const required = members.filter((m) => m.required);
    const onTarget = required.filter((m) => m.week.status === "MET" || m.week.status === "ON_TRACK").length;
    const behind = required.filter((m) => m.week.status === "BEHIND").length;
    const atRisk = required.filter((m) => m.week.status === "AT_RISK").length;
    return { total: required.length, onTarget, behind, atRisk };
  }, [members]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Work Hours Compliance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.scopeLabel ? `${data.scopeLabel} — ` : ""}
            tracking the 40 hours/week target. Recorded leave lowers each person's target.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadExport("csv")}
            disabled={members.length === 0}
            data-testid="button-export-work-hours-csv"
          >
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadExport("xlsx")}
            disabled={members.length === 0}
            data-testid="button-export-work-hours-xlsx"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Required Staff" value={String(kpi.total)} />
        <KpiCard label="On Target (This Week)" value={String(kpi.onTarget)} accent="text-emerald-400" />
        <KpiCard label="Slightly Behind" value={String(kpi.behind)} accent="text-amber-400" />
        <KpiCard label="Behind" value={String(kpi.atRisk)} accent="text-destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Hours</CardTitle>
          <CardDescription>Logged hours include entries awaiting approval. Pending hours are shown separately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search name / role / business unit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
              data-testid="input-search-work-hours"
            />
            <Select value={weekStatus} onValueChange={setWeekStatus}>
              <SelectTrigger className="w-[200px]" data-testid="select-week-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All — This Week</SelectItem>
                <SelectItem value="MET">On Target</SelectItem>
                <SelectItem value="ON_TRACK">On Track</SelectItem>
                <SelectItem value="BEHIND">Behind (any)</SelectItem>
                <SelectItem value="AT_RISK">Behind only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members match the current filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Business Unit</TableHead>
                    <TableHead>This Week</TableHead>
                    <TableHead>This Month</TableHead>
                    <TableHead>This Year</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.userId} data-testid={`row-work-hours-${m.userId}`}>
                      <TableCell className="font-medium text-sm">{m.userName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {RoleLabels[m.role as UserRole] ?? m.role}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.businessUnitName ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><PeriodCell period={m.week} /></TableCell>
                      <TableCell><PeriodCell period={m.month} /></TableCell>
                      <TableCell><PeriodCell period={m.year} /></TableCell>
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

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 font-mono ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
