import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListProjects, customFetch, ProjectStatus } from "@workspace/api-client-react";
import { formatIDR, formatPct } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HealthBadge, MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { EmptyState } from "@/components/common/EmptyState";
import {
  AlarmClock,
  AlertTriangle,
  Briefcase,
  TrendingUp,
  Wallet,
} from "lucide-react";

type PmPending = { pmId: string; pmName: string; pendingCount: number };

function Kpi({
  icon,
  label,
  value,
  sub,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </div>
        <p className={`text-2xl font-bold text-foreground mt-1 ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function PmDashboards() {
  const { data: allProjects, isLoading } = useListProjects();

  // Per-PM pending timesheet counts (MGMT/SUPER_ADMIN-only endpoint). Read-only.
  const { data: pmPending } = useQuery<PmPending[]>({
    queryKey: ["dashboard-pm-pending-timesheets"],
    queryFn: () => customFetch<PmPending[]>("/api/dashboard/pm-pending-timesheets"),
    refetchOnMount: "always",
    staleTime: 30_000,
  });

  // Distinct PMs present across the portfolio, for the picker.
  const pmOptions = useMemo(
    () =>
      Array.from(
        (allProjects ?? []).reduce((m, p) => {
          if (p.pmId && p.pmName) m.set(p.pmId, p.pmName);
          return m;
        }, new Map<string, string>()),
      )
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allProjects],
  );

  const [selectedPm, setSelectedPm] = useState<string>("");
  useEffect(() => {
    if (!selectedPm && pmOptions.length > 0) setSelectedPm(pmOptions[0].id);
  }, [pmOptions, selectedPm]);

  const pmProjects = useMemo(
    () => (allProjects ?? []).filter((p) => p.pmId === selectedPm),
    [allProjects, selectedPm],
  );

  const activeProjects = pmProjects.filter(
    (p) =>
      p.status === ProjectStatus.ACTIVE || p.status === ProjectStatus.OBSERVATION,
  );
  const totalRevenue = pmProjects.reduce((s, p) => s + p.contractValue, 0);
  const totalProfit = pmProjects.reduce((s, p) => s + (p.actualProfit ?? 0), 0);
  const weightedMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const pendingApprovals =
    pmPending?.find((r) => r.pmId === selectedPm)?.pendingCount ?? 0;

  // At-risk = active engagements with thin margin, negative profit, or low health.
  const atRisk = pmProjects.filter(
    (p) =>
      (p.status === ProjectStatus.ACTIVE ||
        p.status === ProjectStatus.OBSERVATION) &&
      ((p.marginPct ?? 100) < 10 ||
        (p.actualProfit ?? 0) < 0 ||
        (p.healthScore != null && p.healthScore < 50)),
  );

  const statusCounts = useMemo(() => {
    const order: ProjectStatus[] = [
      ProjectStatus.DRAFT,
      ProjectStatus.OBSERVATION,
      ProjectStatus.ACTIVE,
      ProjectStatus.PAUSE,
      ProjectStatus.COMPLETE,
      ProjectStatus.CLOSED,
    ];
    const m = new Map<ProjectStatus, number>();
    for (const p of pmProjects) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return order
      .filter((s) => (m.get(s) ?? 0) > 0)
      .map((s) => ({ status: s, count: m.get(s) ?? 0 }));
  }, [pmProjects]);

  const selectedPmName = pmOptions.find((p) => p.id === selectedPm)?.name ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            PM Dashboards
          </h1>
          <p className="text-muted-foreground">
            Monitor each Project Manager's portfolio at a glance — projects,
            health, margin, and approval queue. Read-only.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Select value={selectedPm} onValueChange={setSelectedPm}>
            <SelectTrigger className="bg-card" data-testid="select-pm">
              <SelectValue placeholder="Select a Project Manager" />
            </SelectTrigger>
            <SelectContent>
              {pmOptions.map((pm) => (
                <SelectItem key={pm.id} value={pm.id}>
                  {pm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : pmOptions.length === 0 ? (
        <EmptyState
          title="No Project Managers found"
          description="No projects are currently assigned to a PM."
        />
      ) : !selectedPm ? (
        <EmptyState
          title="Select a Project Manager"
          description="Choose a PM above to view their portfolio."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<Briefcase className="h-4 w-4 text-primary" />}
              label="Active Projects"
              value={String(activeProjects.length)}
              sub={`${pmProjects.length} total under ${selectedPmName}`}
            />
            <Kpi
              icon={<Wallet className="h-4 w-4 text-primary" />}
              label="Total Revenue"
              value={formatIDR(totalRevenue)}
              sub="Contract value"
              mono
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              label="Weighted Margin"
              value={formatPct(weightedMargin)}
              sub={`Σ profit ÷ Σ revenue · ${formatIDR(totalProfit)}`}
            />
            <Kpi
              icon={<AlarmClock className="h-4 w-4 text-primary" />}
              label="Pending Approvals"
              value={String(pendingApprovals)}
              sub="Timesheets awaiting this PM"
            />
          </div>

          {atRisk.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <CardTitle className="text-base">
                    {atRisk.length} project(s) need attention
                  </CardTitle>
                  <CardDescription>
                    Thin margin (&lt;10%), negative profit, or low health score
                    among active engagements.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-center">Margin</TableHead>
                      <TableHead className="text-center">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRisk.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link
                            href={`/projects/${p.id}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {p.name}
                          </Link>
                          <div className="text-xs text-muted-foreground font-mono">
                            {p.code}
                          </div>
                        </TableCell>
                        <TableCell>{p.clientName || "-"}</TableCell>
                        <TableCell className="text-center">
                          <MarginBadge marginPct={p.marginPct} />
                        </TableCell>
                        <TableCell className="text-center">
                          <HealthBadge
                            score={p.healthScore ?? null}
                            label={p.healthLabel ?? null}
                            reasons={p.healthReasons ?? null}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Status Breakdown</CardTitle>
              <CardDescription>
                How {selectedPmName}'s projects are distributed across the
                lifecycle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statusCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {statusCounts.map((s) => (
                    <div
                      key={s.status}
                      className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                    >
                      <ProjectStatusBadge status={s.status} />
                      <span className="text-lg font-bold text-foreground">
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Projects handled by {selectedPmName}</CardTitle>
              <CardDescription>
                Read-only. Click a project to drill into its detail.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {pmProjects.length === 0 ? (
                <EmptyState
                  title="No projects"
                  description="This PM has no projects."
                />
              ) : (
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-center">Margin</TableHead>
                      <TableHead className="text-center">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pmProjects.map((p) => (
                      <TableRow key={p.id} className="hover:bg-muted/30">
                        <TableCell>
                          <Link href={`/projects/${p.id}`} className="block">
                            <div className="font-medium text-foreground hover:text-primary">
                              {p.name}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {p.code}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>{p.clientName || "-"}</TableCell>
                        <TableCell>
                          <ProjectStatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatIDR(p.contractValue)}
                        </TableCell>
                        <TableCell className="text-center">
                          <MarginBadge marginPct={p.marginPct} />
                        </TableCell>
                        <TableCell className="text-center">
                          <HealthBadge
                            score={p.healthScore ?? null}
                            label={p.healthLabel ?? null}
                            reasons={p.healthReasons ?? null}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
