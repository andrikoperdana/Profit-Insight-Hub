import { useParams, Link } from "wouter";
import { useGetProject } from "@workspace/api-client-react";
import { getGetProjectQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Building2, User, Calendar, FileText } from "lucide-react";
import { formatIDR, formatDate } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;

  const { data: project, isLoading } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !!id }
  });

  if (isLoading) return <LoadingPage />;
  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="The project you are looking for does not exist or you do not have access."
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/projects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-1">SPK/PO: {project.code}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Project Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Client" value={project.clientName ?? "-"} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Sales" value={project.salesName ?? "-"} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Project Manager" value={project.pmName ?? "-"} />
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Timeline"
              value={
                project.startDate || project.endDate
                  ? `${project.startDate ? formatDate(project.startDate) : "?"} → ${project.endDate ? formatDate(project.endDate) : "?"}`
                  : "Not set"
              }
            />
            {project.description && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Financial Estimation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Stat label="Revenue (Harga Jual)" value={formatIDR(project.contractValue)} />
            <Stat label="Estimated Operational Cost" value={formatIDR(project.estimatedCost)} muted />
            <Stat label="Estimated Profit" value={formatIDR(project.estimatedProfit)} highlight />
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Margin</p>
              <MarginBadge marginPct={project.marginPct} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Planned Mandays</p>
              <p className="font-mono text-sm">{project.plannedMandays.toFixed(1)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Next Steps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Project is in <span className="text-primary font-medium">{project.status}</span> status. Resource assignment, timesheet logging, and document management will be enabled in the next phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-sm ${highlight ? "text-primary font-semibold" : muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
