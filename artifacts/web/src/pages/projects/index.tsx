import { useListProjects } from "@workspace/api-client-react";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";
import { Plus, Search, Filter } from "lucide-react";
import { formatIDR } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { canCreateProject } from "@/lib/roles";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { ProjectStatus } from "@workspace/api-client-react";

export default function ProjectsList() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: projects, isLoading } = useListProjects(
    statusFilter === "all" ? {} : { status: statusFilter },
    { query: { queryKey: ["projects", statusFilter] } }
  );

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.clientName && p.clientName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-muted-foreground">Manage active consulting engagements.</p>
        </div>
        
        {canCreateProject(user?.role) && (
          <Button asChild className="shrink-0">
            <Link href="/projects/new">
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <Tabs defaultValue="all" onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList className="bg-muted w-full sm:w-auto overflow-x-auto justify-start">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value={ProjectStatus.OBSERVATION}>Observation</TabsTrigger>
            <TabsTrigger value={ProjectStatus.ACTIVE}>Active</TabsTrigger>
            <TabsTrigger value={ProjectStatus.PAUSE}>Pause</TabsTrigger>
            <TabsTrigger value={ProjectStatus.COMPLETE}>Complete</TabsTrigger>
            <TabsTrigger value={ProjectStatus.CLOSED}>Closed</TabsTrigger>
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
                <TableHead className="text-right">Contract Value</TableHead>
                <TableHead className="text-center">Margin</TableHead>
                <TableHead className="text-right">PM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((project) => (
                <TableRow key={project.id} className="group cursor-pointer hover:bg-muted/30">
                  <TableCell>
                    <Link href={`/projects/${project.id}`} className="block h-full w-full outline-none">
                      <div className="font-medium text-foreground group-hover:text-primary transition-colors">{project.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{project.code}</div>
                    </Link>
                  </TableCell>
                  <TableCell>{project.clientName || "-"}</TableCell>
                  <TableCell><ProjectStatusBadge status={project.status} /></TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatIDR(project.contractValue)}</TableCell>
                  <TableCell className="text-center"><MarginBadge marginPct={project.marginPct} /></TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{project.pmName || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
