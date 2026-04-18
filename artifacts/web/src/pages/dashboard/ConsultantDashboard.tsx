import { useMemo } from "react";
import { Link } from "wouter";
import { useListTimesheets } from "@workspace/api-client-react";
import { getListTimesheetsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { formatDate } from "@/lib/format";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { TimesheetStatusBadge } from "@/components/common/Badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function ConsultantDashboard() {
  const params = { scope: "mine" as const };
  const { data: timesheets, isLoading } = useListTimesheets(params, {
    query: { queryKey: getListTimesheetsQueryKey(params) },
  });

  const stats = useMemo(() => {
    const list = timesheets ?? [];
    const approvedHours = list.filter((t) => t.status === "APPROVED").reduce((s, t) => s + t.hours, 0);
    const submittedHours = list.filter((t) => t.status === "SUBMITTED").reduce((s, t) => s + t.hours, 0);
    const rejected = list.filter((t) => t.status === "REJECTED").length;
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const last30Approved = list
      .filter((t) => t.status === "APPROVED" && new Date(t.workDate) >= monthAgo)
      .reduce((s, t) => s + t.hours, 0);
    return { approvedHours, submittedHours, rejected, last30Approved };
  }, [timesheets]);

  const weeklyChart = useMemo(() => {
    const buckets: Record<string, number> = {};
    const list = timesheets ?? [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const t of list) {
      if (t.status !== "APPROVED") continue;
      const key = new Date(t.workDate).toISOString().slice(0, 10);
      if (key in buckets) buckets[key] += t.hours;
    }
    return Object.entries(buckets).map(([date, hours]) => ({
      date: date.slice(5),
      hours,
    }));
  }, [timesheets]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">My Dashboard</h1>
        <p className="text-muted-foreground">Your time tracking summary and recent submissions.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-primary" />} label="Approved (Last 30d)" value={`${stats.last30Approved.toFixed(1)} h`} sub={`${stats.approvedHours.toFixed(1)} h all-time`} />
            <KpiCard icon={<Clock className="h-4 w-4 text-amber-500" />} label="Pending Approval" value={`${stats.submittedHours.toFixed(1)} h`} sub="Awaiting PM" />
            <KpiCard icon={<AlertCircle className="h-4 w-4 text-destructive" />} label="Rejected Entries" value={String(stats.rejected)} sub="Need revision" />
            <KpiCard icon={<Calendar className="h-4 w-4 text-primary" />} label="Total Entries" value={String(timesheets?.length ?? 0)} sub="All-time" />
          </>
        )}
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Approved Hours — Last 14 Days</CardTitle>
          <CardDescription>Daily approved hours trend</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Recent Timesheets</CardTitle>
          <CardDescription>Your latest 10 submissions</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton columns={4} rows={5} /></div>
          ) : !timesheets?.length ? (
            <EmptyState title="No timesheets yet" description="Head to Time Tracking to log your first entry." />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timesheets.slice(0, 10).map((ts) => (
                  <TableRow key={ts.id}>
                    <TableCell className="text-sm">{formatDate(ts.workDate)}</TableCell>
                    <TableCell><Link href={`/projects/${ts.projectId}`} className="text-primary hover:underline">{ts.projectName}</Link></TableCell>
                    <TableCell className="text-right font-mono">{ts.hours}</TableCell>
                    <TableCell><TimesheetStatusBadge status={ts.status} /></TableCell>
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

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
