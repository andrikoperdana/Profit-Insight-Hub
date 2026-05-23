import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListUsers,
  useListBusinessUnits,
  useListLeaves,
  useGetSkillMatrix,
  useGetResourceUtilizationDetail,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Network,
  CalendarOff,
  AlertTriangle,
  TrendingUp,
  UserPlus,
  Award,
  ChevronRight,
  CalendarRange,
} from "lucide-react";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { RoleLabels } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function plusDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function HRDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in14 = plusDays(today, 14);

  const { data: users } = useListUsers();
  const { data: businessUnits } = useListBusinessUnits();
  const { data: leaves } = useListLeaves({
    startDate: today.toISOString().slice(0, 10),
    endDate: in14.toISOString().slice(0, 10),
  });
  const { data: skillMatrix } = useGetSkillMatrix();
  const { data: utilDetail } = useGetResourceUtilizationDetail();
  const { data: utilization } = useQuery<{ days: number; headcount: number; trend: { date: string; utilizationPct: number; hours: number }[] }>({
    queryKey: ["hr-utilization-trend"],
    queryFn: () => customFetch("/api/dashboard/utilization-trend?days=30"),
  });

  const activeUsers = useMemo(() => (users ?? []).filter((u: any) => u.isActive && !u.deletedAt), [users]);

  const headcountByBu = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of activeUsers) {
      const bu = (u as any).businessUnit?.name ?? "Unassigned";
      map.set(bu, (map.get(bu) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [activeUsers]);

  const headcountByRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of activeUsers) {
      const label = RoleLabels[(u as any).role as keyof typeof RoleLabels] ?? (u as any).role;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [activeUsers]);

  const seniorityCounts = useMemo(() => {
    const map = new Map<string, number>([["JUNIOR", 0], ["MID", 0], ["SENIOR", 0], ["PRINCIPAL", 0], ["Unset", 0]]);
    for (const u of activeUsers) {
      const s = (u as any).seniority ?? "Unset";
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [activeUsers]);

  const todayStr = todayKey();
  const leavesToday = useMemo(() => {
    return (leaves ?? []).filter((l: any) => {
      const start = l.startDate.slice(0, 10);
      const end = l.endDate.slice(0, 10);
      return start <= todayStr && todayStr <= end;
    });
  }, [leaves, todayStr]);

  const upcomingLeaves = useMemo(() => {
    return (leaves ?? [])
      .filter((l: any) => l.startDate.slice(0, 10) > todayStr)
      .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8);
  }, [leaves, todayStr]);

  const benchTop = useMemo(() => {
    const list = ((utilDetail as any)?.resources ?? []) as Array<any>;
    return list
      .filter((r) => r.status === "IDLE" || r.utilizationPctMonth < 50)
      .sort((a, b) => a.utilizationPctMonth - b.utilizationPctMonth)
      .slice(0, 6);
  }, [utilDetail]);

  const skillGaps = useMemo(() => {
    return ((skillMatrix as any)?.gaps ?? []).filter((g: any) => g.isGap).slice(0, 6);
  }, [skillMatrix]);

  const newJoiners = useMemo(() => {
    const cutoff = plusDays(today, -30).getTime();
    return activeUsers
      .filter((u: any) => new Date(u.createdAt).getTime() >= cutoff)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [activeUsers, today]);

  const utilizationTrend = useMemo(() => {
    return (utilization?.trend ?? []).map((p) => ({
      date: p.date.slice(5),
      utilization: Math.round(p.utilizationPct),
    }));
  }, [utilization]);

  const totalHeadcount = activeUsers.length;
  const totalOnLeaveToday = leavesToday.length;
  const totalGaps = skillGaps.length;
  const totalBuses = (businessUnits ?? []).filter((b: any) => b.isActive).length;

  return (
    <div className="space-y-6">
      <WelcomeBanner />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Users} label="Active Headcount" value={totalHeadcount} subtext={`${totalBuses} business units`} accent="text-emerald-500" />
        <KpiCard icon={CalendarOff} label="On Leave Today" value={totalOnLeaveToday} subtext={`${upcomingLeaves.length} upcoming (14d)`} accent="text-amber-500" />
        <KpiCard icon={UserPlus} label="New Joiners (30d)" value={newJoiners.length} subtext="onboarding window" accent="text-blue-500" />
        <KpiCard icon={AlertTriangle} label="Skill Gaps" value={totalGaps} subtext="single-point of failure" accent="text-rose-500" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Headcount per Business Unit</CardTitle>
            <CardDescription>Active employees grouped by BU.</CardDescription>
          </CardHeader>
          <CardContent>
            {headcountByBu.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={headcountByBu} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "rgb(15,23,42)", border: "1px solid rgb(51,65,85)" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {headcountByBu.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role Distribution</CardTitle>
            <CardDescription>Headcount by system role.</CardDescription>
          </CardHeader>
          <CardContent>
            {headcountByRole.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={headcountByRole} dataKey="value" nameKey="name" outerRadius={80} label>
                    {headcountByRole.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "rgb(15,23,42)", border: "1px solid rgb(51,65,85)" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Utilization Trend (30 days)</CardTitle>
          <CardDescription>Average billable utilization across delivery staff.</CardDescription>
        </CardHeader>
        <CardContent>
          {utilizationTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={utilizationTrend}>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "rgb(15,23,42)", border: "1px solid rgb(51,65,85)" }} />
                <Line type="monotone" dataKey="utilization" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">On Leave Today</CardTitle>
              <CardDescription>People currently away.</CardDescription>
            </div>
            <Link href="/leaves">
              <Button variant="ghost" size="sm" className="gap-1">
                All leaves <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {leavesToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one is on leave today.</p>
            ) : (
              <ul className="space-y-2">
                {leavesToday.map((l: any) => (
                  <li key={l.id} className="flex justify-between items-center text-sm border-b border-border/40 pb-1.5 last:border-0">
                    <div>
                      <span className="font-medium">{l.userName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">until {formatDate(l.endDate)}</span>
                    </div>
                    <Badge variant="outline">{l.type}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Leaves (14 days)</CardTitle>
            <CardDescription>Scheduled time off — coordinate with PMs.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingLeaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming leaves.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingLeaves.map((l: any) => (
                  <li key={l.id} className="flex justify-between items-center text-sm border-b border-border/40 pb-1.5 last:border-0">
                    <div>
                      <span className="font-medium">{l.userName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
                    </div>
                    <Badge variant="outline">{l.type}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><CalendarRange className="h-4 w-4" /> Bench &amp; Low Utilization</CardTitle>
              <CardDescription>Idle staff or below-50% utilization.</CardDescription>
            </div>
            <Link href="/bench"><Button variant="ghost" size="sm" className="gap-1">View bench <ChevronRight className="h-3 w-3" /></Button></Link>
          </CardHeader>
          <CardContent>
            {benchTop.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone is fully utilized.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Util%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {benchTop.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium">{r.userName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{RoleLabels[r.role as keyof typeof RoleLabels] ?? r.role}</TableCell>
                      <TableCell className="text-right font-mono">{Math.round(r.utilizationPctMonth)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4" /> Skill Gaps</CardTitle>
              <CardDescription>Skills with no Senior/Principal or single holder.</CardDescription>
            </div>
            <Link href="/skill-matrix"><Button variant="ghost" size="sm" className="gap-1">Full matrix <ChevronRight className="h-3 w-3" /></Button></Link>
          </CardHeader>
          <CardContent>
            {skillGaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill gaps detected.</p>
            ) : (
              <ul className="space-y-2">
                {skillGaps.map((g: any) => (
                  <li key={g.skillId} className="flex justify-between items-center text-sm border-b border-border/40 pb-1.5 last:border-0">
                    <span className="font-medium">{g.skillName}</span>
                    <span className="text-xs text-muted-foreground">{g.gapReason ?? "Coverage gap"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> New Joiners (last 30 days)</CardTitle>
              <CardDescription>Recent hires to onboard.</CardDescription>
            </div>
            <Link href="/users"><Button variant="ghost" size="sm" className="gap-1">All employees <ChevronRight className="h-3 w-3" /></Button></Link>
          </CardHeader>
          <CardContent>
            {newJoiners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new joiners in the last 30 days.</p>
            ) : (
              <ul className="space-y-2">
                {newJoiners.map((u: any) => (
                  <li key={u.id} className="flex justify-between items-center text-sm border-b border-border/40 pb-1.5 last:border-0">
                    <div>
                      <span className="font-medium">{u.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{u.title ?? RoleLabels[u.role as keyof typeof RoleLabels]}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Seniority Pyramid</CardTitle>
            <CardDescription>Talent depth across the firm.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={seniorityCounts} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 40 }}>
                <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ background: "rgb(15,23,42)", border: "1px solid rgb(51,65,85)" }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" /> Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <QuickLink to="/users" label="Employees" desc="Browse & edit personnel" />
          <QuickLink to="/org-chart" label="Org Chart" desc="Reporting hierarchy" />
          <QuickLink to="/skill-matrix" label="Skill Matrix" desc="Coverage & gaps" />
          <QuickLink to="/capacity" label="Capacity Planning" desc="Team availability" />
          <QuickLink to="/resource-planning" label="Resource Planning" desc="Mandays grid" />
          <QuickLink to="/business-units" label="Business Units" desc="Manage BUs" />
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtext,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  subtext?: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
        </div>
        <p className="text-3xl font-bold mt-2">{value}</p>
        {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function QuickLink({ to, label, desc }: { to: string; label: string; desc: string }) {
  return (
    <Link href={to}>
      <div className="rounded-lg border border-border/60 p-3 hover:bg-accent/40 transition cursor-pointer">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
