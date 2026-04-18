import { Link } from "wouter";
import { useListProjects, ProjectStatus } from "@workspace/api-client-react";
import { useMemo } from "react";
import { Briefcase, FileCheck, ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { formatIDR, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";

export default function AdminProjectDashboard() {
  const { user } = useAuth();
  const { data: complete, isLoading: l1 } = useListProjects(
    { status: ProjectStatus.COMPLETE },
    { query: { queryKey: ["/projects", "COMPLETE"] } },
  );
  const { data: closed, isLoading: l2 } = useListProjects(
    { status: ProjectStatus.CLOSED },
    { query: { queryKey: ["/projects", "CLOSED"] } },
  );
  const { data: active } = useListProjects(
    { status: ProjectStatus.ACTIVE },
    { query: { queryKey: ["/projects", "ACTIVE"] } },
  );

  const completeList = useMemo(() => complete ?? [], [complete]);
  const closedList = useMemo(() => closed ?? [], [closed]);
  const activeCount = active?.length ?? 0;

  if (l1 || l2) return <LoadingPage />;

  const totalAwaitingValue = completeList.reduce((s, p) => s + p.contractValue, 0);
  const now = Date.now();
  const overdueDocs = completeList.filter((p) => {
    const ref = p.endDate ? new Date(p.endDate).getTime() : new Date(p.createdAt).getTime();
    return now - ref > 3 * 24 * 60 * 60 * 1000;
  });
  void user;

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle="Pantau dokumen closing (BAST + Invoice) yang menunggu untuk diunggah." />

      {overdueDocs.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <CardTitle className="text-base">
                {overdueDocs.length} project complete &gt; 3 hari belum ada dokumen closing
              </CardTitle>
              <CardDescription>
                Segera unggah BAST + Invoice agar revenue dapat ditagihkan.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-sm space-y-1">
              {overdueDocs.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <Link href={`/projects/${p.id}`} className="text-primary hover:underline font-medium">
                    {p.code} · {p.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {p.endDate ? `Selesai ${formatDate(p.endDate)}` : "—"}
                  </span>
                </li>
              ))}
              {overdueDocs.length > 5 && (
                <li className="text-xs text-muted-foreground pt-1">
                  …dan {overdueDocs.length - 5} lainnya
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi
          icon={<ClipboardList className="h-4 w-4 text-amber-500" />}
          label="Awaiting Closing Docs"
          value={completeList.length.toString()}
          subtitle="Need BAST + Invoice"
          tone="warn"
        />
        <Kpi
          icon={<FileCheck className="h-4 w-4 text-primary" />}
          label="Total Awaiting Value"
          value={formatIDR(totalAwaitingValue)}
          subtitle="Contract value at risk"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          label="Closed Projects"
          value={closedList.length.toString()}
          subtitle="Fully documented"
        />
        <Kpi
          icon={<Briefcase className="h-4 w-4 text-blue-500" />}
          label="Active Projects"
          value={activeCount.toString()}
          subtitle="In execution"
        />
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Projects Awaiting Closing Documents</CardTitle>
          <CardDescription>
            Upload BAST and Invoice (PDF) for each project below — both files will auto-close the project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completeList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              All complete projects have closing documents. Nothing to upload right now.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Contract Value</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completeList.map((p) => (
                  <TableRow key={p.id} data-testid={`row-complete-${p.code}`}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="text-primary hover:underline font-medium">
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{p.code}</p>
                    </TableCell>
                    <TableCell className="text-sm">{p.clientName ?? "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{formatIDR(p.contractValue)}</TableCell>
                    <TableCell className="text-sm">{p.endDate ? formatDate(p.endDate) : "-"}</TableCell>
                    <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" data-testid={`button-upload-${p.code}`}>
                        <Link href={`/projects/${p.id}`}>Upload Docs</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recently Closed</CardTitle>
          <CardDescription>Last {Math.min(closedList.length, 8)} closed project(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {closedList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No closed projects yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {closedList.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <Link href={`/projects/${p.id}`} className="text-sm text-foreground hover:text-primary truncate block">
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{p.code} · {p.clientName ?? "-"}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/30">
                    {formatIDR(p.contractValue)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, subtitle, tone }: {
  icon: React.ReactNode; label: string; value: string; subtitle?: string; tone?: "warn";
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold font-mono ${tone === "warn" ? "text-amber-500" : "text-foreground"}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
