import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Users,
  UserCheck,
  UserX,
  Clock4,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

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
  distribution: Array<{ name: string; value: number }>;
  resources: Row[];
  finishingSoonList: Row[];
};

const ROLE_LABEL: Record<string, string> = {
  KONSULTAN: "Konsultan",
  TECHNICAL_WRITER: "Technical Writer",
  PROJECT_MANAGER: "Project Manager",
};

const PIE_COLORS: Record<string, string> = {
  Active: "hsl(var(--chart-1))",
  Idle: "hsl(var(--chart-3))",
  Vacation: "hsl(var(--chart-2))",
};

function utilizationTone(pct: number): { bar: string; label: string } {
  if (pct >= 70) return { bar: "bg-emerald-500", label: "text-emerald-400" };
  if (pct >= 40) return { bar: "bg-amber-500", label: "text-amber-400" };
  return { bar: "bg-rose-500", label: "text-rose-400" };
}

export default function ResourceUtilizationSection() {
  const { data, isLoading } = useQuery<Detail>({
    queryKey: ["dashboard-resource-utilization-detail"],
    queryFn: () =>
      customFetch<Detail>("/api/dashboard/resource-utilization-detail"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  if (isLoading || !data) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Resource Utilization</CardTitle>
          <CardDescription>Live workforce status</CardDescription>
        </CardHeader>
        <CardContent className="h-[200px] flex items-center justify-center">
          <Activity className="animate-pulse text-muted" />
        </CardContent>
      </Card>
    );
  }

  const { summary, distribution, resources, finishingSoonList } = data;
  const tone = utilizationTone(summary.utilizationPct);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Resource Utilization
        </h2>
        <p className="text-sm text-muted-foreground">
          Real-time workforce assignment and capacity overview
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Resources
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {summary.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active workforce</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active / Assigned
            </CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">
              {summary.active}
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
              {summary.idle}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              No live assignment
            </p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Will Finish in 2 Days
            </CardTitle>
            <Clock4 className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-400">
              {summary.finishingSoon}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Assignment ending soon
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Utilization rate + Pie */}
      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Overall Utilization Rate</CardTitle>
            <CardDescription>
              Share of resources currently assigned to active engagements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-end justify-between">
              <div className={`text-5xl font-bold font-mono ${tone.label}`}>
                {summary.utilizationPct.toFixed(0)}%
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>
                  <span className="text-emerald-400 font-semibold">
                    {summary.active}
                  </span>{" "}
                  active of{" "}
                  <span className="font-semibold text-foreground">
                    {summary.total}
                  </span>
                </div>
                <div className="text-xs mt-1">
                  Threshold: &lt;40% red · 40–70% amber · &gt;70% green
                </div>
              </div>
            </div>
            <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${tone.bar} transition-all`}
                style={{ width: `${Math.min(summary.utilizationPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>40%</span>
              <span>70%</span>
              <span>100%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>Active vs Idle vs Vacation</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                >
                  {distribution.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[entry.name] ?? "hsl(var(--muted))"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  labelStyle={{
                    color: "hsl(var(--foreground))",
                    fontWeight: 600,
                  }}
                  formatter={(value: number, name) => [
                    `${value} ${value === 1 ? "person" : "people"}`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {distribution.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: PIE_COLORS[d.name] }}
                  />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="text-foreground font-semibold">
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Finishing soon list */}
      {finishingSoonList.length > 0 && (
        <Card className="border-amber-500/40 shadow-sm bg-amber-500/5">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <CardTitle className="text-amber-300">
                Resources Finishing in 2 Days
              </CardTitle>
              <CardDescription className="text-amber-200/70">
                These engagements end within 48 hours — plan reassignments now
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {finishingSoonList.map((r) => (
                <div
                  key={r.userId}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                >
                  <div className="font-medium text-foreground">
                    {r.userName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ROLE_LABEL[r.role] ?? r.role}
                    {r.title ? ` · ${r.title}` : ""}
                  </div>
                  {r.currentProjectId && r.currentProjectName && (
                    <div className="mt-2 text-sm">
                      <Link
                        href={`/projects/${r.currentProjectId}`}
                        className="text-amber-300 hover:underline"
                      >
                        {r.currentProjectName}
                      </Link>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-amber-200/80">
                    Ends{" "}
                    {r.assignmentEndDate
                      ? format(new Date(r.assignmentEndDate), "dd MMM yyyy")
                      : "—"}{" "}
                    · {r.daysRemaining ?? 0}{" "}
                    {r.daysRemaining === 1 ? "day" : "days"} left
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Table */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Resource Detail</CardTitle>
          <CardDescription>
            Per-resource status, current project, and month-to-date utilization
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  <TableHead className="w-[200px]">Utilization (MTD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((r) => {
                  const utilTone = utilizationTone(r.utilizationPctMonth);
                  return (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium">{r.userName}</TableCell>
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
                          ? format(new Date(r.assignmentEndDate), "dd MMM yyyy")
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
                          <span className="text-foreground">
                            {r.daysRemaining}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full ${utilTone.bar} transition-all`}
                              style={{
                                width: `${Math.min(r.utilizationPctMonth, 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs font-mono w-10 text-right ${utilTone.label}`}
                          >
                            {r.utilizationPctMonth.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
