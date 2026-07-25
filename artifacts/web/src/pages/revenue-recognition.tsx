import { useState } from "react";
import { Link } from "wouter";
import { useGetRevenueRecognition } from "@workspace/api-client-react";
import type {
  RevenueRecognitionMilestone,
  RevenueRecognitionProject,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CircleDollarSign,
  ChevronDown,
  ChevronRight,
  Link2,
  FileCheck2,
  AlertCircle,
  Info,
} from "lucide-react";
import { formatIDR } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  INVOICED: "Invoiced",
  PAID: "Paid",
};

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function BasisBadge({ m }: { m: RevenueRecognitionMilestone }) {
  if (m.basis === "BAST") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 gap-1">
        <FileCheck2 className="h-3 w-3" /> BAST
      </Badge>
    );
  }
  if (m.basis === "PAID") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 gap-1">
        <FileCheck2 className="h-3 w-3" /> Paid
      </Badge>
    );
  }
  if (m.basis === "REPORT") {
    return (
      <Badge variant="outline" className="border-blue-500/40 text-blue-400 gap-1">
        <Link2 className="h-3 w-3" /> Report
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">Not recognized</span>;
}

function StatCard({
  label,
  value,
  sub,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: "muted" | "success" | "warning";
}) {
  const toneMap = {
    muted: "text-foreground",
    success: "text-emerald-500",
    warning: "text-amber-500",
  };
  return (
    <Card className="rounded-xl border-border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide">
          <span>{label}</span>
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 shrink-0 cursor-help normal-case" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-xs normal-case tracking-normal">
                {hint}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className={`text-xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ProjectRow({ p }: { p: RevenueRecognitionProject }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
        data-testid={`row-revrec-project-${p.projectId}`}
      >
        <TableCell className="w-8">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <Link
            href={`/projects/${p.projectId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium hover:underline"
          >
            {p.code} — {p.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {p.clientName ?? "—"}
            {p.pmName ? ` · PM: ${p.pmName}` : ""}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{p.status}</Badge>
        </TableCell>
        <TableCell className="text-right font-mono text-sm">{formatIDR(p.totalDpp)}</TableCell>
        <TableCell className="text-right font-mono text-sm text-emerald-500">
          {formatIDR(p.recognizedDpp)}
        </TableCell>
        <TableCell className="text-right font-mono text-sm text-amber-500">
          {formatIDR(p.unrecognizedDpp)}
        </TableCell>
        <TableCell className="w-[160px]">
          <div className="flex items-center gap-2">
            <Progress value={p.recognizedPct} className="h-2" />
            <span className="text-xs font-mono whitespace-nowrap">
              {p.recognizedPct.toFixed(0)}%
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {p.recognizedCount}/{p.milestoneCount} milestones
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="p-0">
            <div className="px-6 py-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Milestone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">DPP</TableHead>
                    <TableHead>Recognition Basis</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Recognized At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.milestones.map((m) => (
                    <TableRow key={m.id} data-testid={`row-revrec-milestone-${m.id}`}>
                      <TableCell className="text-sm">
                        {m.name}
                        {m.workstreamName && (
                          <div className="text-xs text-muted-foreground">{m.workstreamName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{STATUS_LABEL[m.status] ?? m.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatIDR(m.dpp)}
                      </TableCell>
                      <TableCell>
                        <BasisBadge m={m} />
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className={m.hasBast ? "text-emerald-500" : "text-muted-foreground"}>
                            BAST {m.hasBast ? "uploaded" : "missing"}
                          </span>
                          <span
                            className={
                              m.status === "PAID" ? "text-emerald-500" : "text-muted-foreground"
                            }
                          >
                            {m.status === "PAID"
                              ? "Paid"
                              : m.invoiced
                                ? "Invoiced (not paid)"
                                : "Not invoiced"}
                          </span>
                          {m.reportUrl ? (
                            <a
                              href={m.reportUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-400 hover:underline"
                            >
                              <Link2 className="h-3 w-3" /> Report link
                            </a>
                          ) : (
                            <span className="text-muted-foreground">No report link</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.recognizedAt ? formatDate(m.recognizedAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function RevenueRecognitionPage() {
  const { user } = useAuth();
  const role = user?.role;
  const seesByPm = role === "MANAGEMENT" || role === "FINANCE" || role === "SUPER_ADMIN";
  const { data, isLoading, isError, refetch } = useGetRevenueRecognition();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <Card className="rounded-xl border-destructive/40">
          <CardContent className="p-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1 text-sm">Failed to load revenue recognition data.</div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { totals, projects, byPm, byBusinessUnit, byPmoDirector } = data;

  return (
    <div className="p-6 space-y-5" data-testid="page-revenue-recognition">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CircleDollarSign className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Revenue Recognition</h1>
          <p className="text-sm text-muted-foreground">
            A milestone is recognized when its BAST is uploaded, it is paid, or its report link
            is filed. Commercial (client) projects only; cancelled milestones excluded.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Revenue (DPP)"
          value={formatIDR(totals.totalDpp)}
          sub={`${totals.projectCount} projects · ${totals.milestoneCount} milestones`}
          hint="Total contracted (planned) revenue from all payment terms of client projects. DPP is the tax base: the value before VAT."
        />
        <StatCard
          label="Recognized (DPP)"
          value={formatIDR(totals.recognizedDpp)}
          sub={`${totals.recognizedCount} of ${totals.milestoneCount} milestones`}
          tone="success"
          hint="Revenue you can already book: milestones with a BAST uploaded, already paid, or a report link filed."
        />
        <StatCard
          label="Unrecognized (DPP)"
          value={formatIDR(totals.unrecognizedDpp)}
          tone="warning"
          hint="Contracted revenue still waiting for evidence: no BAST, not paid, and no report link yet."
        />
        <Card className="rounded-xl border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide">
              <span>Recognized %</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 shrink-0 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-xs normal-case tracking-normal">
                  Share of total contracted revenue that is already recognized.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-xl font-bold mt-1">{totals.recognizedPct.toFixed(1)}%</div>
            <Progress value={totals.recognizedPct} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects" data-testid="tab-revrec-projects">
            By Project
          </TabsTrigger>
          {seesByPm && (
            <TabsTrigger value="pm" data-testid="tab-revrec-pm">
              By Project Manager
            </TabsTrigger>
          )}
          {seesByPm && (
            <TabsTrigger value="bu" data-testid="tab-revrec-bu">
              By Business Unit
            </TabsTrigger>
          )}
          {seesByPm && (
            <TabsTrigger value="pmo" data-testid="tab-revrec-pmo">
              By PMO Director
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="projects">
          <Card className="rounded-xl border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Projects</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {projects.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No commercial projects with billing milestones found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total DPP</TableHead>
                      <TableHead className="text-right">Recognized</TableHead>
                      <TableHead className="text-right">Unrecognized</TableHead>
                      <TableHead className="w-[160px]">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p) => (
                      <ProjectRow key={p.projectId} p={p} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {seesByPm && (
          <TabsContent value="pm">
            <Card className="rounded-xl border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By Project Manager</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {byPm.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No data available.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project Manager</TableHead>
                        <TableHead className="text-right">Projects</TableHead>
                        <TableHead className="text-right">Total DPP</TableHead>
                        <TableHead className="text-right">Recognized</TableHead>
                        <TableHead className="w-[200px]">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byPm.map((g) => (
                        <TableRow key={g.pmId ?? "none"} data-testid={`row-revrec-pm-${g.pmId ?? "none"}`}>
                          <TableCell className="font-medium">{g.pmName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {g.projectCount}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatIDR(g.totalDpp)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-500">
                            {formatIDR(g.recognizedDpp)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={g.recognizedPct} className="h-2" />
                              <span className="text-xs font-mono whitespace-nowrap">
                                {g.recognizedPct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {seesByPm && (
          <TabsContent value="bu">
            <Card className="rounded-xl border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By Business Unit</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Milestones are attributed to the business unit of their workstream; milestones
                  without a workstream fall back to the project&apos;s single workstream BU or the
                  PM&apos;s business unit.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {byBusinessUnit.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No data available.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business Unit</TableHead>
                        <TableHead className="text-right">Projects</TableHead>
                        <TableHead className="text-right">Milestones</TableHead>
                        <TableHead className="text-right">Total DPP</TableHead>
                        <TableHead className="text-right">Recognized</TableHead>
                        <TableHead className="w-[200px]">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byBusinessUnit.map((g) => (
                        <TableRow
                          key={g.businessUnitId ?? "none"}
                          data-testid={`row-revrec-bu-${g.businessUnitId ?? "none"}`}
                        >
                          <TableCell className="font-medium">{g.businessUnitName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {g.projectCount}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {g.milestoneCount}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatIDR(g.totalDpp)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-500">
                            {formatIDR(g.recognizedDpp)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={g.recognizedPct} className="h-2" />
                              <span className="text-xs font-mono whitespace-nowrap">
                                {g.recognizedPct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {seesByPm && (
          <TabsContent value="pmo">
            <Card className="rounded-xl border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By PMO Director</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Projects are attributed to the director their PM reports to. A Management user
                  acting as PM counts as their own director.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {byPmoDirector.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No data available.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PMO Director</TableHead>
                        <TableHead className="text-right">Projects</TableHead>
                        <TableHead className="text-right">Total DPP</TableHead>
                        <TableHead className="text-right">Recognized</TableHead>
                        <TableHead className="w-[200px]">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byPmoDirector.map((g) => (
                        <TableRow
                          key={g.directorId ?? "none"}
                          data-testid={`row-revrec-pmo-${g.directorId ?? "none"}`}
                        >
                          <TableCell className="font-medium">{g.directorName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {g.projectCount}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatIDR(g.totalDpp)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-500">
                            {formatIDR(g.recognizedDpp)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={g.recognizedPct} className="h-2" />
                              <span className="text-xs font-mono whitespace-nowrap">
                                {g.recognizedPct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
