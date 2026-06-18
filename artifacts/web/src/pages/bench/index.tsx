import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetResourceUtilizationDetail } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingPage } from "@/components/common/Loading";
import { RoleLabels, isPrincipalRole, isSuperAdmin } from "@/lib/roles";
import {
  Users,
  AlertTriangle,
  Clock,
  TrendingDown,
  Briefcase,
  Search,
} from "lucide-react";
import { formatDate } from "@/lib/format";

type BenchRow = {
  userId: string;
  userName: string;
  role: string;
  title: string | null;
  status: "ACTIVE" | "IDLE" | "OVERLOADED";
  currentProjectId: string | null;
  currentProjectName: string | null;
  currentProjectStatus: string | null;
  assignmentEndDate: string | null;
  daysRemaining: number | null;
  finishingSoon: boolean;
  daysSinceLastActivity: number | null;
  idleLong: boolean;
  utilizationPctMonth: number;
  avgHoursPerDay7d: number;
};

export default function BenchPage() {
  const { user } = useAuth();
  const isMgmt = user?.role === "MANAGEMENT";
  const isPM = user?.role === "PROJECT_MANAGER";
  const isHr = user?.role === "HR";
  const isPrincipal = isPrincipalRole(user?.role);
  const allowed = isSuperAdmin(user?.role) || isMgmt || isPM || isHr || isPrincipal;

  const { data, isLoading } = useGetResourceUtilizationDetail({
    query: { enabled: !!user && allowed },
  } as any);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const detail = data as any;
  const allResources: BenchRow[] = detail?.resources ?? [];

  const benchResources = useMemo(() => {
    return allResources.filter((r) => {
      const lowUtil = r.utilizationPctMonth < 50;
      const idle = r.status === "IDLE";
      const finishing = r.finishingSoon;
      return idle || lowUtil || finishing;
    });
  }, [allResources]);

  const filtered = useMemo(() => {
    return benchResources
      .filter((r) =>
        search
          ? r.userName.toLowerCase().includes(search.toLowerCase()) ||
            (r.title ?? "").toLowerCase().includes(search.toLowerCase())
          : true,
      )
      .filter((r) => (roleFilter === "all" ? true : r.role === roleFilter))
      .sort((a, b) => a.utilizationPctMonth - b.utilizationPctMonth);
  }, [benchResources, search, roleFilter]);

  const idleCount = benchResources.filter((r) => r.status === "IDLE").length;
  const finishingSoonCount = benchResources.filter(
    (r) => r.finishingSoon,
  ).length;
  const lowUtilCount = benchResources.filter(
    (r) => r.utilizationPctMonth < 50 && r.status !== "IDLE",
  ).length;

  if (!user) return <LoadingPage />;
  if (!allowed) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-12 w-12 text-muted-foreground/50" />}
        title="Access denied"
        description="The Bench Report is available to Management, Project Managers, HR, and Principals (their own team)."
      />
    );
  }
  if (isLoading) return <LoadingPage />;

  return (
    <div className="p-6 space-y-6" data-testid="page-bench">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-primary" />
          Bench Report
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consultants and technical writers with low utilization this month, or
          whose current assignment is finishing soon. Use this to staff incoming
          projects.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="On the bench"
          value={benchResources.length}
          hint="Total available people"
          tone="default"
        />
        <KpiCard
          icon={Clock}
          label="Idle (no active project)"
          value={idleCount}
          hint="Not staffed today"
          tone={idleCount > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={TrendingDown}
          label="Low utilization (<50%)"
          value={lowUtilCount}
          hint="Underused this month"
          tone={lowUtilCount > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={Briefcase}
          label="Finishing soon (≤2 days)"
          value={finishingSoonCount}
          hint="Available very soon"
          tone={finishingSoonCount > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Available people</CardTitle>
              <CardDescription className="text-xs mt-1">
                Sorted by lowest utilization first.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-56"
                  data-testid="input-bench-search"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger
                  className="w-full sm:w-48"
                  data-testid="select-bench-role"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="KONSULTAN">Consultant</SelectItem>
                  <SelectItem value="TECHNICAL_WRITER">
                    Technical Writer
                  </SelectItem>
                  <SelectItem value="PROJECT_MANAGER">
                    Project Manager
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12 text-muted-foreground/50" />}
              title="Nobody on the bench"
              description="Everyone is currently staffed at a healthy utilization. Nice work."
            />
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Current project</TableHead>
                    <TableHead>Assignment ends</TableHead>
                    <TableHead className="text-right">Utilization (mo)</TableHead>
                    <TableHead className="text-right">Avg hrs/day (7d)</TableHead>
                    <TableHead>Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.userId}
                      data-testid={`row-bench-${r.userId}`}
                    >
                      <TableCell className="font-medium">
                        <div>{r.userName}</div>
                        {r.title && (
                          <div className="text-xs text-muted-foreground">
                            {r.title}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {RoleLabels[r.role as keyof typeof RoleLabels] ?? r.role}
                      </TableCell>
                      <TableCell>
                        <StatusBadge row={r} />
                      </TableCell>
                      <TableCell>
                        {r.currentProjectId && r.currentProjectName ? (
                          <Link
                            href={`/projects/${r.currentProjectId}`}
                            className="text-primary hover:underline text-sm"
                          >
                            {r.currentProjectName}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            None
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.assignmentEndDate ? (
                          <span
                            className={
                              r.finishingSoon
                                ? "text-amber-500 font-medium"
                                : ""
                            }
                          >
                            {formatDate(r.assignmentEndDate)}
                            {r.daysRemaining !== null && r.daysRemaining >= 0 && (
                              <span className="ml-1 text-muted-foreground">
                                ({r.daysRemaining}d)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span
                          className={
                            r.utilizationPctMonth < 30
                              ? "text-destructive"
                              : r.utilizationPctMonth < 50
                                ? "text-amber-500"
                                : "text-foreground"
                          }
                        >
                          {r.utilizationPctMonth.toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {r.avgHoursPerDay7d.toFixed(1)}h
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.daysSinceLastActivity === null
                          ? "Never"
                          : r.daysSinceLastActivity === 0
                            ? "Today"
                            : `${r.daysSinceLastActivity}d ago`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {(isSuperAdmin(user?.role) || isMgmt) && (
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription className="text-xs mt-1">
              Once you've found someone, staff them on a project.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/projects?status=OBSERVATION">
                <Briefcase className="h-4 w-4 mr-1.5" />
                Projects pending staffing
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/resource-planning">
                <Users className="h-4 w-4 mr-1.5" />
                Open Resource Planning
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  hint: string;
  tone: "default" | "warning";
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p
              className={
                "text-2xl font-bold mt-1 " +
                (tone === "warning" ? "text-amber-500" : "text-foreground")
              }
            >
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
          </div>
          <Icon
            className={
              "h-5 w-5 " +
              (tone === "warning" ? "text-amber-500" : "text-muted-foreground")
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ row }: { row: BenchRow }) {
  if (row.status === "IDLE") {
    return (
      <Badge variant="destructive" className="text-[10px]">
        Idle
      </Badge>
    );
  }
  if (row.finishingSoon) {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">
        Finishing soon
      </Badge>
    );
  }
  if (row.utilizationPctMonth < 50) {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">
        Low util
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      Active
    </Badge>
  );
}
