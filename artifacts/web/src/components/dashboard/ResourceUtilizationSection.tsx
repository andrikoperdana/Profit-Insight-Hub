import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  UserCheck,
  UserX,
  Clock4,
  Activity,
  AlertTriangle,
  Flame,
  TimerOff,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportSheets } from "@/lib/exports";
import { Link } from "wouter";
import { format } from "date-fns";

type Row = {
  userId: string;
  userName: string;
  role: string;
  title: string | null;
  specialization: string | null;
  status: "ACTIVE" | "IDLE" | "OVERLOADED";
  currentProjectId: string | null;
  currentProjectName: string | null;
  currentProjectStatus: string | null;
  currentClientId: string | null;
  currentClientName: string | null;
  assignmentEndDate: string | null;
  daysRemaining: number | null;
  finishingSoon: boolean;
  daysSinceLastActivity: number | null;
  idleLong: boolean;
  overloaded: boolean;
  avgHoursPerDay7d: number;
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
    overloaded: number;
    idleLong: number;
    utilizationPct: number;
  };
  filters: {
    principals: { id: string; name: string }[];
    specializations: string[];
  };
  resources: Row[];
  finishingSoonList: Row[];
  idleLongList: Row[];
  overloadedList: Row[];
};

type TrendResp = {
  days: number;
  headcount: number;
  trend: { date: string; utilizationPct: number; hours: number }[];
};

const ROLE_LABEL: Record<string, string> = {
  KONSULTAN: "Consultant",
  TECHNICAL_WRITER: "Technical Writer",
  PROJECT_MANAGER: "Project Manager",
};

function utilizationTone(pct: number): { bar: string; label: string } {
  if (pct >= 70) return { bar: "bg-emerald-500", label: "text-emerald-400" };
  if (pct >= 40) return { bar: "bg-amber-500", label: "text-amber-400" };
  return { bar: "bg-rose-500", label: "text-rose-400" };
}

function StatusBadge({ row }: { row: Row }) {
  if (row.status === "OVERLOADED") {
    return (
      <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/40 hover:bg-orange-500/20">
        Overloaded
      </Badge>
    );
  }
  if (row.status === "ACTIVE") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-rose-500/40 text-rose-300">
      Idle
    </Badge>
  );
}

export default function ResourceUtilizationSection() {
  const [principal, setPrincipal] = useState<string>("__all__");
  const [specialization, setSpecialization] = useState<string>("__all__");

  const { data, isLoading } = useQuery<Detail>({
    queryKey: ["dashboard-resource-utilization-detail"],
    queryFn: () =>
      customFetch<Detail>("/api/dashboard/resource-utilization-detail"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: trend } = useQuery<TrendResp>({
    queryKey: ["dashboard-utilization-trend", 30],
    queryFn: () =>
      customFetch<TrendResp>("/api/dashboard/utilization-trend?days=30"),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const filteredResources = useMemo(() => {
    if (!data) return [];
    return data.resources.filter((r) => {
      if (principal !== "__all__" && r.currentClientId !== principal) return false;
      if (specialization !== "__all__" && r.specialization !== specialization)
        return false;
      return true;
    });
  }, [data, principal, specialization]);

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

  const { summary, finishingSoonList, idleLongList, overloadedList } = data;
  const tone = utilizationTone(summary.utilizationPct);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Resource Utilization
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time workforce assignment, capacity, and 30-day trend
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={principal} onValueChange={setPrincipal}>
            <SelectTrigger className="w-[180px]" data-testid="filter-principal">
              <SelectValue placeholder="Principal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Principals</SelectItem>
              {data.filters.principals.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={specialization} onValueChange={setSpecialization}>
            <SelectTrigger className="w-[180px]" data-testid="filter-spec">
              <SelectValue placeholder="Specialization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Specializations</SelectItem>
              {data.filters.specializations.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = filteredResources.map((r) => ({
                Resource: r.userName,
                Role: r.role,
                Specialization: r.specialization ?? "",
                Status: r.status,
                CurrentProject: r.currentProjectName ?? "",
                Principal: r.currentClientName ?? "",
                AssignmentEnd: r.assignmentEndDate ?? "",
                DaysRemaining: r.daysRemaining ?? "",
                AvgHoursPerDay7d: Number((r.avgHoursPerDay7d ?? 0).toFixed(2)),
                MonthHours: Number((r.monthHours ?? 0).toFixed(2)),
                MonthUtilizationPct: Number((r.utilizationPctMonth ?? 0).toFixed(1)),
              }));
              const summaryRows = [{
                Total: summary.total,
                Active: summary.active,
                Idle: summary.idle,
                Overloaded: summary.overloaded,
                FinishingSoon: summary.finishingSoon,
                IdleLong: summary.idleLong,
                UtilizationPct: Number(summary.utilizationPct.toFixed(1)),
              }];
              exportSheets("resource-utilization", [
                { name: "Resources", rows },
                { name: "Summary", rows: summaryRows },
              ]);
            }}
            data-testid="button-export-resources"
          >
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          icon={<Users className="h-4 w-4 text-primary" />}
          label="Total Resources"
          value={summary.total}
          hint="Active workforce"
        />
        <SummaryCard
          icon={<UserCheck className="h-4 w-4 text-emerald-400" />}
          label="Active / Assigned"
          value={summary.active}
          valueClass="text-emerald-400"
          hint="On Active or Pause projects"
        />
        <SummaryCard
          icon={<UserX className="h-4 w-4 text-rose-400" />}
          label="Idle"
          value={summary.idle}
          valueClass="text-rose-400"
          hint="No live assignment"
        />
        <SummaryCard
          icon={<Clock4 className="h-4 w-4 text-amber-400" />}
          label="Will Finish in 2 Days"
          value={summary.finishingSoon}
          valueClass="text-amber-400"
          hint="Plan reassignment"
        />
        <SummaryCard
          icon={<Flame className="h-4 w-4 text-orange-400" />}
          label="Overloaded"
          value={summary.overloaded}
          valueClass="text-orange-400"
          hint=">8h/day avg (7d)"
        />
      </div>

      {/* Overall utilization bar */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Overall Utilization Rate</CardTitle>
          <CardDescription>
            Share of resources currently engaged. Threshold: &lt;40% red · 40–70%
            amber · &gt;70% green.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between">
            <div className={`text-5xl font-bold font-mono ${tone.label}`}>
              {summary.utilizationPct.toFixed(0)}%
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <span className="text-emerald-400 font-semibold">
                {summary.active}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-foreground">
                {summary.total}
              </span>{" "}
              engaged
            </div>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${tone.bar} transition-all`}
              style={{ width: `${Math.min(summary.utilizationPct, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="trend" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trend" data-testid="tab-trend">
            30-Day Trend
          </TabsTrigger>
          <TabsTrigger value="detail" data-testid="tab-detail">
            Detail Table
          </TabsTrigger>
          <TabsTrigger value="highlights" data-testid="tab-highlights">
            Highlights
            {(finishingSoonList.length +
              idleLongList.length +
              overloadedList.length) >
              0 && (
              <Badge variant="secondary" className="ml-2">
                {finishingSoonList.length +
                  idleLongList.length +
                  overloadedList.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="m-0">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Utilization Trend (30 days)</CardTitle>
              <CardDescription>
                Daily utilization rate based on approved hours vs team capacity
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {!trend ? (
                <div className="h-full flex items-center justify-center">
                  <Activity className="animate-pulse text-muted" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trend.trend}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--chart-1))"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(var(--chart-1))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      domain={[0, 100]}
                    />
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(v: number) => [`${v.toFixed(1)}%`, "Util."]}
                    />
                    <Area
                      type="monotone"
                      dataKey="utilizationPct"
                      stroke="hsl(var(--chart-1))"
                      fillOpacity={1}
                      fill="url(#utilGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail" className="m-0">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Resource Detail</CardTitle>
              <CardDescription>
                {filteredResources.length} of {data.resources.length} resources
                shown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Specialization</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Project</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead className="text-right">Days Left</TableHead>
                      <TableHead className="text-right">Avg h/day (7d)</TableHead>
                      <TableHead className="w-[180px]">Util. (MTD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResources.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center py-12 text-muted-foreground"
                        >
                          No resources match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredResources.map((r) => {
                        const utilTone = utilizationTone(r.utilizationPctMonth);
                        return (
                          <TableRow key={r.userId}>
                            <TableCell className="font-medium">
                              {r.userName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {ROLE_LABEL[r.role] ?? r.role}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {r.specialization || "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge row={r} />
                              {r.finishingSoon && (
                                <Badge className="ml-1 bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/20">
                                  Ending soon
                                </Badge>
                              )}
                              {r.idleLong && (
                                <Badge className="ml-1 bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/20">
                                  Idle &gt;5d
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
                            <TableCell className="text-muted-foreground text-sm">
                              {r.assignmentEndDate
                                ? format(
                                    new Date(r.assignmentEndDate),
                                    "dd MMM yyyy",
                                  )
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
                                <span>{r.daysRemaining}</span>
                              )}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-sm ${r.overloaded ? "text-orange-400 font-semibold" : ""}`}
                            >
                              {r.avgHoursPerDay7d.toFixed(1)}
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
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="highlights" className="m-0 space-y-4">
          <HighlightCard
            title="Resources Almost Free"
            description="Engagements ending within 48 hours — line up the next assignment."
            tone="amber"
            icon={<Clock4 className="h-5 w-5" />}
            rows={finishingSoonList}
            renderHint={(r) =>
              `Ends ${r.assignmentEndDate ? format(new Date(r.assignmentEndDate), "dd MMM yyyy") : "—"} · ${r.daysRemaining ?? 0} day(s) left`
            }
          />
          <HighlightCard
            title="Idle Resources (>5 days)"
            description="Have not logged any approved hours in over 5 days."
            tone="rose"
            icon={<TimerOff className="h-5 w-5" />}
            rows={idleLongList}
            renderHint={(r) =>
              r.daysSinceLastActivity == null
                ? "Never logged hours"
                : `${r.daysSinceLastActivity} days since last activity`
            }
          />
          <HighlightCard
            title="Overloaded Resources"
            description="Averaged more than 8 hours/day over the last 7 days."
            tone="orange"
            icon={<Flame className="h-5 w-5" />}
            rows={overloadedList}
            renderHint={(r) =>
              `${r.avgHoursPerDay7d.toFixed(1)} h/day avg (7d)`
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  valueClass?: string;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${valueClass ?? "text-foreground"}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function HighlightCard({
  title,
  description,
  tone,
  icon,
  rows,
  renderHint,
}: {
  title: string;
  description: string;
  tone: "amber" | "rose" | "orange";
  icon: React.ReactNode;
  rows: Row[];
  renderHint: (r: Row) => string;
}) {
  const toneMap = {
    amber: {
      border: "border-amber-500/40",
      bg: "bg-amber-500/5",
      title: "text-amber-300",
      desc: "text-amber-200/70",
      chip: "bg-amber-500/10 border-amber-500/40 text-amber-300",
    },
    rose: {
      border: "border-rose-500/40",
      bg: "bg-rose-500/5",
      title: "text-rose-300",
      desc: "text-rose-200/70",
      chip: "bg-rose-500/10 border-rose-500/40 text-rose-300",
    },
    orange: {
      border: "border-orange-500/40",
      bg: "bg-orange-500/5",
      title: "text-orange-300",
      desc: "text-orange-200/70",
      chip: "bg-orange-500/10 border-orange-500/40 text-orange-300",
    },
  }[tone];

  return (
    <Card className={`${toneMap.border} shadow-sm ${toneMap.bg}`}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <div className={toneMap.title}>{icon}</div>
        <div>
          <CardTitle className={toneMap.title}>{title}</CardTitle>
          <CardDescription className={toneMap.desc}>
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No resources in this category. <AlertTriangle className="inline h-4 w-4 ml-1 text-emerald-400" />
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div
                key={r.userId}
                className={`rounded-md border p-3 ${toneMap.chip}`}
              >
                <div className="font-medium text-foreground">{r.userName}</div>
                <div className="text-xs text-muted-foreground">
                  {ROLE_LABEL[r.role] ?? r.role}
                  {r.specialization ? ` · ${r.specialization}` : ""}
                </div>
                {r.currentProjectId && r.currentProjectName && (
                  <div className="mt-2 text-sm">
                    <Link
                      href={`/projects/${r.currentProjectId}`}
                      className={`${toneMap.title} hover:underline`}
                    >
                      {r.currentProjectName}
                    </Link>
                  </div>
                )}
                <div className="mt-1 text-xs opacity-80">{renderHint(r)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
