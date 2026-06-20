import { useParams, Link } from "wouter";
import { useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canViewProjectFinancials, canViewRaid, canViewDailyRate } from "@/lib/roles";
import { ProjectStatusBadge } from "@/components/common/Badges";
import {
  OverviewSection,
  TimelineSection,
  TasksSection,
  FinancialsSection,
  ResourcesSection,
  ExpensesSection,
  TimesheetsSection,
  BillingSection,
  DocumentsSection,
  RaidSection,
  ChangeRequestsSection,
} from "./sections";

export default function ProjectSummary() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: project, isLoading, isError, error } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !!id },
  });

  const canFinancials = canViewProjectFinancials(user?.role);
  const canRaid = canViewRaid(user?.role);
  const canRate = canViewDailyRate(user?.role);
  const p = project as any;
  const isCommercial = !p ? true : (p.kind ?? "CLIENT") === "CLIENT";

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
      </div>
    );
  }

  if (isError || !p) {
    const msg =
      error instanceof Error
        ? error.message
        : "This project is unavailable or you don't have access to it.";
    return (
      <div className="p-8 space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {msg}
        </div>
        <Button asChild variant="outline">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Projects
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="summary-root mx-auto max-w-5xl space-y-6">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to project
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()} data-testid="button-print-summary">
          <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
        </Button>
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-foreground">{p.name}</h1>
          <ProjectStatusBadge status={p.status} />
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          {p.code}
          {p.clientName ? ` · ${p.clientName}` : ""}
        </p>
        <p className="hidden print:block text-[11px] text-muted-foreground">
          Project Summary · generated {new Date().toLocaleString()}
        </p>
      </header>

      <OverviewSection project={p} canFinancials={canFinancials} />
      <TimelineSection projectId={id} />
      <TasksSection projectId={id} />
      {canFinancials && <FinancialsSection projectId={id} isCommercial={isCommercial} />}
      <ResourcesSection projectId={id} project={p} canRate={canRate} />
      <ExpensesSection projectId={id} canFinancials={canFinancials} />
      <TimesheetsSection projectId={id} />
      {canFinancials && isCommercial && <BillingSection projectId={id} project={p} />}
      <DocumentsSection projectId={id} />
      {canRaid && <RaidSection projectId={id} />}
      <ChangeRequestsSection projectId={id} />
    </div>
  );
}
