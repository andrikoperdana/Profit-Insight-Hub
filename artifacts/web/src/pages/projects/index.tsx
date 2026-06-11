import { useListProjects, customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, Download } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { canCreateProject, canViewProjectFinancials } from "@/lib/roles";
import { exportSheets, exportCsv } from "@/lib/exports";
import { classifyProject } from "@/lib/projectType";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { HealthBadge, MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { ProjectStatus } from "@workspace/api-client-react";

export default function ProjectsList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isPrincipal = !!user?.role && user.role.startsWith("PRINCIPAL_");
  // Principals only see ACTIVE projects (server-enforced), so lock the
  // status filter and hide the other status tabs.
  const [statusFilter, setStatusFilter] = useState<string>(
    isPrincipal ? ProjectStatus.ACTIVE : "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [seeding, setSeeding] = useState(false);

  const { data: projects, isLoading } = useListProjects(
    statusFilter === "all" ? {} : { status: statusFilter },
    { query: { queryKey: ["projects", statusFilter] } }
  );

  const nonClosedCount = (projects ?? []).filter(p => p.status !== "CLOSED" && p.status !== "COMPLETE").length;
  const showSeed = !import.meta.env.PROD && user?.role === "MANAGEMENT" && statusFilter === "all" && nonClosedCount < 3;
  const onSeed = async () => {
    if (!confirm("Add 9 sample projects (3 OBSERVATION + 3 ACTIVE + 3 PAUSE)?")) return;
    setSeeding(true);
    try {
      const r = await customFetch("/api/projects/seed-demo", { method: "POST" }) as { created?: unknown[]; skipped?: unknown[] };
      alert(`Success. Created: ${r.created?.length ?? 0}, skipped: ${r.skipped?.length ?? 0}.`);
      queryClient.invalidateQueries();
    } catch (e: unknown) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.clientName && p.clientName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const showFinancials = canViewProjectFinancials(user?.role);

  const projectExportRows = (filteredProjects ?? []).map((p) => {
    const base: Record<string, unknown> = {
      Code: p.code,
      Name: p.name,
      Type: classifyProject({ name: p.name, code: p.code }),
      Client: p.clientName ?? "",
      PM: p.pmName ?? "",
      Sales: (p as any).salesName ?? "",
      Status: p.status,
    };
    if (showFinancials) {
      base.ContractValue = p.contractValue;
      base.EstimatedCost = (p as any).estimatedCost ?? 0;
      base.EstimatedProfit = (p as any).estimatedProfit ?? 0;
      base.ActualCost = (p as any).actualCost ?? 0;
      base.ActualProfit = (p as any).actualProfit ?? 0;
      base.MarginPct = p.marginPct;
    }
    base.PlannedMandays = (p as any).plannedMandays ?? 0;
    base.ActualMandays = (p as any).actualMandays ?? 0;
    base.StartDate = (p as any).startDate ?? "";
    base.EndDate = (p as any).endDate ?? "";
    return base;
  });

  const pager = usePagination(filteredProjects, {
    resetKey: `${statusFilter}|${searchQuery}`,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-muted-foreground">Manage active consulting engagements.</p>
        </div>
        
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button
            variant="outline"
            onClick={() => exportCsv("projects", projectExportRows)}
            disabled={projectExportRows.length === 0}
            data-testid="button-export-projects-csv"
          >
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => exportSheets("project-profitability", [{ name: "Projects", rows: projectExportRows }])}
            disabled={projectExportRows.length === 0}
            data-testid="button-export-projects"
          >
            <Download className="h-4 w-4 mr-2" /> XLSX
          </Button>
          {showSeed && (
            <Button variant="outline" onClick={onSeed} disabled={seeding} data-testid="button-seed-projects-demo">
              {seeding ? "Seeding…" : "Load 9 demo projects"}
            </Button>
          )}
          {canCreateProject(user?.role) && user?.role !== "SALES" && (
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="h-4 w-4 mr-2" /> New Project
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList className="bg-muted w-full sm:w-auto overflow-x-auto justify-start">
            {!isPrincipal && <TabsTrigger value="all">All</TabsTrigger>}
            {!isPrincipal && <TabsTrigger value={ProjectStatus.OBSERVATION}>Observation</TabsTrigger>}
            <TabsTrigger value={ProjectStatus.ACTIVE}>Active</TabsTrigger>
            {!isPrincipal && <TabsTrigger value={ProjectStatus.PAUSE}>Pause</TabsTrigger>}
            {!isPrincipal && <TabsTrigger value={ProjectStatus.COMPLETE}>Complete</TabsTrigger>}
            {!isPrincipal && <TabsTrigger value={ProjectStatus.CLOSED}>Closed</TabsTrigger>}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search projects..." 
            className="pl-9 bg-card" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={6} rows={10} />
      ) : !filteredProjects?.length ? (
        <EmptyState 
          title="No projects found" 
          description={searchQuery ? "No projects match your search." : "There are no projects in this status."}
        />
      ) : (
        <Card className="overflow-hidden border-border shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                {showFinancials && (
                  <>
                    <TableHead className="text-right">Contract Value</TableHead>
                    <TableHead className="text-center">Margin</TableHead>
                    <TableHead className="text-center">Health</TableHead>
                  </>
                )}
                <TableHead className="text-right">PM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((project) => (
                <TableRow key={project.id} className="group cursor-pointer hover:bg-muted/30">
                  <TableCell>
                    <Link href={`/projects/${project.id}`} className="block h-full w-full outline-none">
                      <div className="font-medium text-foreground group-hover:text-primary transition-colors">{project.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{project.code}</div>
                    </Link>
                  </TableCell>
                  <TableCell>{project.clientName || "-"}</TableCell>
                  <TableCell><ProjectStatusBadge status={project.status} /></TableCell>
                  {showFinancials && (
                    <>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(project.contractValue, (project as any).currency)}
                        {(project as any).currency && (project as any).currency !== "IDR" && (
                          <span className="ml-1 text-[10px] uppercase text-muted-foreground">{(project as any).currency}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center"><MarginBadge marginPct={project.marginPct} /></TableCell>
                      <TableCell className="text-center">
                        <HealthBadge
                          score={project.healthScore ?? null}
                          label={project.healthLabel ?? null}
                          reasons={project.healthReasons ?? null}
                          components={(project as any).healthComponents ?? null}
                        />
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right text-muted-foreground text-sm">{project.pmName || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={pager.page}
            pageSize={pager.pageSize}
            total={pager.total}
            totalPages={pager.totalPages}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            testId="projects-pagination"
          />
        </Card>
      )}
    </div>
  );
}
