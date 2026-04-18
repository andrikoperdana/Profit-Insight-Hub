import { useGetDashboardSummary, useGetProfitTrend, useGetStatusBreakdown, useGetTopProjects, useGetRecentActivity, useGetUtilization } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatIDR, formatPct } from "@/lib/format";
import { Briefcase, Wallet, TrendingUp, Clock, AlertCircle, Activity } from "lucide-react";
import { SkeletonCard, TableSkeleton } from "@/components/common/Loading";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import ResourceUtilizationSection from "@/components/dashboard/ResourceUtilizationSection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { ProjectStatus } from "@workspace/api-client-react";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: trend, isLoading: loadingTrend } = useGetProfitTrend();
  const { data: statusBreakdown, isLoading: loadingStatus } = useGetStatusBreakdown();
  const { data: topProjects, isLoading: loadingTop } = useGetTopProjects();
  const { data: recentActivity, isLoading: loadingActivity } = useGetRecentActivity();
  const { data: utilization, isLoading: loadingUtil } = useGetUtilization();

  const STATUS_COLORS: Record<ProjectStatus, string> = {
    [ProjectStatus.OBSERVATION]: "hsl(var(--chart-2))", // Blue
    [ProjectStatus.ACTIVE]: "hsl(var(--chart-1))",      // Green
    [ProjectStatus.PAUSE]: "hsl(var(--chart-3))",       // Amber
    [ProjectStatus.COMPLETE]: "hsl(var(--chart-4))",    // Emerald
    [ProjectStatus.CLOSED]: "hsl(var(--chart-5))",      // Slate
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">System overview and key performance metrics.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingSummary || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
                <Briefcase className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{summary.activeProjects}</div>
                <p className="text-xs text-muted-foreground mt-1">Out of {summary.totalProjects} total</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground font-mono">{formatIDR(summary.totalContractValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Contract value</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Average Margin</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatPct(summary.avgMarginPct)}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all active</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{summary.pendingTimesheets}</div>
                <p className="text-xs text-muted-foreground mt-1">Timesheets</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Resource Utilization */}
      <ResourceUtilizationSection />

      <div className="grid gap-6 md:grid-cols-7 lg:grid-cols-7">
        {/* Profit Trend Chart */}
        <Card className="md:col-span-4 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Profit Margin Trend</CardTitle>
            <CardDescription>Monthly cost vs revenue tracking</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loadingTrend || !trend ? (
              <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rp ${value / 1000000}M`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatIDR(value)}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#colorRevenue)" />
                  <Area type="monotone" dataKey="cost" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorCost)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card className="md:col-span-3 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Project Status</CardTitle>
            <CardDescription>Current pipeline distribution</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            {loadingStatus || !statusBreakdown ? (
              <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="status"
                  >
                    {statusBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    formatter={(value: number, _name, props: any) => [`${value} project${value === 1 ? '' : 's'}`, props?.payload?.status ?? props?.name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Projects */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Top Projects by Margin</CardTitle>
            <CardDescription>Highest performing active engagements</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {loadingTop || !topProjects ? (
              <TableSkeleton columns={3} rows={5} />
            ) : (
              <div className="space-y-4">
                {topProjects.map((project) => (
                  <div key={project.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Link href={`/projects/${project.id}`} className="font-medium hover:text-primary transition-colors">
                        {project.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{project.clientName}</p>
                    </div>
                    <MarginBadge marginPct={project.marginPct} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {loadingActivity || !recentActivity ? (
              <TableSkeleton columns={1} rows={5} />
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-4">
                    <div className="mt-0.5 bg-muted p-1.5 rounded-full border border-border">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{activity.message}</p>
                      <div className="flex items-center text-xs text-muted-foreground space-x-2">
                        {activity.userName && <span>{activity.userName}</span>}
                        {activity.userName && activity.projectName && <span>•</span>}
                        {activity.projectName && <span>{activity.projectName}</span>}
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Utilization */}
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Resource Utilization</CardTitle>
          <CardDescription>Mandays planned vs actual across team</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          {loadingUtil || !utilization ? (
            <div className="h-full flex items-center justify-center"><Activity className="animate-pulse text-muted" /></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilization} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="userName" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                />
                <Bar dataKey="plannedMandays" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="actualMandays" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
