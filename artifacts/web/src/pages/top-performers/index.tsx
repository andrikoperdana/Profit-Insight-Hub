import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  useGetTopPerformers,
  useListBusinessUnits,
  type TopPerformerItem,
  type TopPerformerMetricDef,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, Award, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatIDR } from "@/lib/format";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "PROJECT_MANAGER",   label: "Project Manager" },
  { value: "KONSULTAN",         label: "Consultant" },
  { value: "TECHNICAL_WRITER",  label: "Technical Writer" },
  { value: "ADMIN_PROJECT",     label: "Admin Project" },
] as const;

type RoleValue = typeof ROLES[number]["value"];

function formatMetric(value: number, format?: string): string {
  if (!isFinite(value)) return "—";
  switch (format) {
    case "pct":      return `${value.toFixed(1)}%`;
    case "hours":    return `${value.toFixed(1)}h`;
    case "currency": return formatIDR(value);
    default:         return value.toFixed(value % 1 === 0 ? 0 : 1);
  }
}

function rankBadge(rank: number) {
  if (rank === 1) return <Trophy className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-300" />;
  if (rank === 3) return <Award className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs text-muted-foreground font-mono">#{rank}</span>;
}

function PodiumCard({ item, weights }: { item: TopPerformerItem; weights: TopPerformerMetricDef[] }) {
  const initials = item.name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  return (
    <Card className={cn(
      "rounded-xl border shadow-sm",
      item.rank === 1 && "border-amber-400/40 bg-gradient-to-br from-amber-400/10 via-card to-card",
      item.rank === 2 && "border-slate-300/30 bg-gradient-to-br from-slate-300/10 via-card to-card",
      item.rank === 3 && "border-amber-700/30 bg-gradient-to-br from-amber-700/10 via-card to-card",
    )}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-background/70 flex items-center justify-center">
            {rankBadge(item.rank ?? 0)}
          </div>
          <Avatar className="h-12 w-12">
            {item.avatarDataUrl ? <AvatarImage src={item.avatarDataUrl} alt={item.name} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{item.name}</div>
            <div className="text-xs text-muted-foreground truncate">{item.businessUnitName ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{item.score.toFixed(1)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {weights.slice(0, 3).map((w) => {
            const b = item.breakdown[w.key];
            if (!b) return null;
            return (
              <div key={w.key} className="text-xs">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-muted-foreground truncate">{w.label}</span>
                  <span className="font-mono">{formatMetric(b.raw, w.format)}</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, b.normalized))}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleTabPanel({ role, year, businessUnitId }: { role: RoleValue; year: number; businessUnitId: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Reset pagination when any filter changes so users never land on an empty
  // page after switching year, BU, or role tab.
  useEffect(() => {
    setPage(1);
  }, [role, year, businessUnitId]);

  const { data, isLoading, isFetching } = useGetTopPerformers(
    { role, year, page, pageSize, ...(businessUnitId ? { businessUnitId } : {}) },
    { query: { queryKey: ["top-performers", role, year, businessUnitId, page] as const } },
  );

  const items = data?.items ?? [];
  const weights = data?.weights ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const podium = useMemo(() => items.filter((i) => i.eligible).slice(0, 3), [items]);

  if (isLoading && !data) return <LoadingPage />;

  return (
    <div className="space-y-5">
      {/* Weight legend */}
      <Card className="rounded-xl">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span className="font-medium text-foreground">Scoring weights:</span>
          {weights.map((w) => (
            <span key={w.key}>
              {w.label} <span className="font-mono text-primary">{Math.round(w.weight * 100)}%</span>
              {w.invert ? " (lower better)" : ""}
            </span>
          ))}
        </CardContent>
      </Card>

      {/* Podium */}
      {page === 1 && podium.length > 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {podium.map((item) => (
            <PodiumCard key={item.userId} item={item} weights={weights} />
          ))}
        </div>
      )}

      {/* Full table */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle>All Performers</CardTitle>
          <CardDescription>
            {total} user{total === 1 ? "" : "s"} · Year {year} · Page {page} of {totalPages}
            {isFetching && " · Updating…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState title="No data" description="No users matched the filters for this period." />
          ) : (
            <>
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>BU</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    {weights.map((w) => (
                      <TableHead key={w.key} className="text-right whitespace-nowrap">{w.label}</TableHead>
                    ))}
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const initials = it.name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
                    return (
                      <TableRow key={it.userId} className={cn(!it.eligible && "opacity-60")}>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-1.5">{rankBadge(it.rank ?? 0)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              {it.avatarDataUrl ? <AvatarImage src={it.avatarDataUrl} alt={it.name} /> : null}
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{it.name}</div>
                              <div className="text-[11px] text-muted-foreground">{it.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{it.businessUnitName ?? "—"}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{it.score.toFixed(1)}</TableCell>
                        {weights.map((w) => {
                          const b = it.breakdown[w.key];
                          return (
                            <TableCell key={w.key} className="text-right font-mono text-xs">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{formatMetric(b?.raw ?? 0, w.format)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <div>Raw: <span className="font-mono">{formatMetric(b?.raw ?? 0, w.format)}</span></div>
                                    <div>Normalized: <span className="font-mono">{(b?.normalized ?? 0).toFixed(1)}</span></div>
                                    <div>Weighted: <span className="font-mono">{(b?.weighted ?? 0).toFixed(2)}</span></div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          {it.eligible ? (
                            <Badge variant="outline" className="text-[10px]">Eligible</Badge>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500 cursor-help">
                                    Not eligible
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">Active months: {it.activeMonths}</div>
                                  <div className="text-xs text-muted-foreground">Min 3 active months required.</div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                    </Button>
                    <span className="text-xs font-mono">{page} / {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      data-testid="button-next-page"
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TopPerformersPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [businessUnitId, setBusinessUnitId] = useState<string>("__all__");
  const [tab, setTab] = useState<RoleValue>("PROJECT_MANAGER");

  const { data: businessUnits } = useListBusinessUnits();

  if (user?.role !== "MANAGEMENT") {
    setLocation("/");
    return null;
  }

  const yearOptions = Array.from({ length: 5 }).map((_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-400" /> Top Performers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Annual performance ranking per role (Jan–Dec). Scores normalised across each role's peer group.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px] h-9" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={businessUnitId} onValueChange={setBusinessUnitId}>
            <SelectTrigger className="w-[200px] h-9" data-testid="select-bu">
              <SelectValue placeholder="All Business Units" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Business Units</SelectItem>
              {(businessUnits ?? []).map((bu) => (
                <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as RoleValue)}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          {ROLES.map((r) => (
            <TabsTrigger key={r.value} value={r.value} data-testid={`tab-${r.value}`}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ROLES.map((r) => (
          <TabsContent key={r.value} value={r.value} className="mt-4">
            <RoleTabPanel
              role={r.value}
              year={year}
              businessUnitId={businessUnitId === "__all__" ? "" : businessUnitId}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
