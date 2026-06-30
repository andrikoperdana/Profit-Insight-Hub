import { useGetBillableUtilization, getGetBillableUtilizationQueryKey, type BillableUtilization } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function ratingFor(pct: number): { label: string; color: string } {
  if (pct >= 85) return { label: "Overworked", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
  if (pct >= 70) return { label: "Healthy", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
  if (pct >= 50) return { label: "Below Target", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" };
  return { label: "Underutilized", color: "bg-rose-500/20 text-rose-300 border-rose-500/40" };
}

export default function BillableUtilizationCard({ days = 30, data: dataProp }: { days?: number; data?: BillableUtilization }) {
  // The executive dashboard supplies this via the aggregated overview; other
  // callers (e.g. HR dashboard) fall back to fetching it directly.
  const query = useGetBillableUtilization(
    { days },
    { query: { enabled: dataProp === undefined, queryKey: getGetBillableUtilizationQueryKey({ days }) } },
  );
  const data = dataProp ?? query.data;
  const isLoading = dataProp === undefined && query.isLoading;
  const isError = dataProp === undefined && query.isError;

  if (isError) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Billable Utilization
          </CardTitle>
          <CardDescription className="text-rose-400">
            Unable to load billable utilization data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Billable Utilization
          </CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent className="h-40" />
      </Card>
    );
  }

  const pct = data.billablePct;
  const rating = ratingFor(pct);

  return (
    <Card className="border-border shadow-sm" data-testid="card-billable-utilization">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Billable Utilization
            </CardTitle>
            <CardDescription>
              Billable hours vs total approved hours · last {data.days} days
            </CardDescription>
          </div>
          <Badge variant="outline" className={rating.color}>{rating.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold text-foreground font-mono">{pct.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.billableHours.toFixed(1)} billable / {data.totalHours.toFixed(1)} total hours
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Non-billable</div>
            <div className="font-mono text-foreground">{data.nonBillableHours.toFixed(1)} h</div>
          </div>
        </div>
        <Progress value={Math.min(pct, 100)} className="h-2" />
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bu-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} hide />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} width={28} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Billable"]}
              />
              <Area type="monotone" dataKey="billablePct" stroke="hsl(var(--primary))" fill="url(#bu-grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">
          Industry healthy band: 70–85%. Below 50% indicates underutilization or too much internal work.
        </p>
      </CardContent>
    </Card>
  );
}
