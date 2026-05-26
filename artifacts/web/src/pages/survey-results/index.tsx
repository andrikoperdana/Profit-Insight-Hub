import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Star, MessageSquare, Building2, User as UserIcon, Calendar, Sparkles, Loader2,
} from "lucide-react";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";

interface Rating {
  key: string;
  text: string;
  rating: number;
  comment: string | null;
}
interface TextAnswer {
  key: string;
  text: string;
  answer: string;
}
interface ResponseItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  pmName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  lessonLearned: string | null;
  submittedAt: string;
  scoreAvg: number;
  ratingCount: number;
  ratings: Rating[];
  textAnswers: TextAnswer[];
}
interface ApiResponse {
  year: number;
  page: number;
  pageSize: number;
  total: number;
  yearAverage: number;
  yearResponseCount: number;
  items: ResponseItem[];
}

function StarRow({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= full ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

function scoreBadgeClass(score: number): string {
  if (score >= 4.5) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
  if (score >= 3.5) return "bg-amber-500/10 text-amber-500 border-amber-500/30";
  if (score > 0)    return "bg-red-500/10 text-red-500 border-red-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function ResponseDetail({ item }: { item: ResponseItem }) {
  return (
    <div className="bg-muted/30 border-t border-border px-4 py-4 space-y-4">
      {/* Per-question ratings */}
      {item.ratings.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">
            Per-Question Ratings
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {item.ratings.map((r) => (
              <div key={r.key} className="rounded-md border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug">{r.text}</span>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <StarRow value={r.rating} />
                    <span className="font-mono text-xs text-muted-foreground">{r.rating}/5</span>
                  </div>
                </div>
                {r.comment && (
                  <div className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                    "{r.comment}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lesson learned / free text */}
      {(item.lessonLearned || item.textAnswers.length > 0) && (
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Client Feedback
          </div>
          <div className="space-y-2">
            {item.textAnswers.length > 0
              ? item.textAnswers.map((t) => (
                  <div key={t.key} className="rounded-md border border-border bg-card p-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1">{t.text}</div>
                    <div className="text-sm whitespace-pre-wrap">{t.answer}</div>
                  </div>
                ))
              : item.lessonLearned && (
                  <div className="rounded-md border border-border bg-card p-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Lesson Learned</div>
                    <div className="text-sm whitespace-pre-wrap">{item.lessonLearned}</div>
                  </div>
                )}
          </div>
        </div>
      )}

      {/* Submitter */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UserIcon className="h-3.5 w-3.5" />
          {item.submitterName ?? "Anonymous"}
          {item.submitterEmail ? ` · ${item.submitterEmail}` : ""}
        </span>
        {item.pmName && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> PM: {item.pmName}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SurveyResultsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const pageSize = 20;

  const seedMutation = useMutation({
    mutationFn: () => customFetch<{ ok: boolean; projectsClosed: string[]; responses: number }>(
      "/api/survey/seed-demo",
      { method: "POST" },
    ),
    onSuccess: (res) => {
      toast({
        title: "Demo data berhasil dibuat",
        description: `${res.responses} response survey ditambahkan di ${res.projectsClosed.length} project.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/survey/responses"] });
    },
    onError: (err: unknown) => {
      const e = err as { status?: number; data?: { error?: string; existingResponses?: number } };
      if (e?.status === 409) {
        toast({
          variant: "destructive",
          title: "Sudah ada data survey",
          description: `Seeder hanya jalan saat database masih kosong (sekarang ada ${e.data?.existingResponses ?? "?"} response).`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Seeder gagal",
          description: e?.data?.error ?? "Terjadi kesalahan saat seeding.",
        });
      }
    },
  });

  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [year]);

  const { data, isLoading, isFetching } = useQuery<ApiResponse>({
    queryKey: ["/survey/responses", year, page, pageSize],
    queryFn: () => customFetch<ApiResponse>(
      `/api/survey/responses?year=${year}&page=${page}&pageSize=${pageSize}`,
    ),
    enabled: user?.role === "MANAGEMENT" || user?.role === "SALES",
  });

  if (user && user.role !== "MANAGEMENT" && user.role !== "SALES") {
    setLocation("/");
    return null;
  }

  const yearOptions = Array.from({ length: 5 }).map((_, i) => currentYear - i);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const yearAvg = data?.yearAverage ?? 0;
  const yearCount = data?.yearResponseCount ?? 0;

  const onPage = useMemo(() => items.length, [items]);
  const onPageAvg = useMemo(() => {
    const scored = items.filter((i) => i.ratingCount > 0);
    if (scored.length === 0) return 0;
    return scored.reduce((s, i) => s + i.scoreAvg, 0) / scored.length;
  }, [items]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading && !data) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Survey Results & Client Feedback
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Annual list of customer survey responses. Each row shows the project, client, and
            the average rating across all rating questions. Expand a row to see per-question
            ratings, comments, and free-text feedback from the client.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "MANAGEMENT" && total === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSeedDialogOpen(true)}
              disabled={seedMutation.isPending}
              data-testid="button-seed-demo"
            >
              {seedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Seed Demo Data
            </Button>
          )}
          <Calendar className="h-4 w-4 text-muted-foreground" />
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
        </div>
      </div>

      <AlertDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buat data demo survey?</AlertDialogTitle>
            <AlertDialogDescription>
              Ini akan menutup hingga 6 project pertama (status jadi CLOSED) dan
              menambahkan ~9 response survey contoh dengan rating + komentar realistis
              di bulan ini. Hanya jalan sekali — jika sudah ada response survey,
              seeder akan ditolak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSeedDialogOpen(false);
                seedMutation.mutate();
              }}
            >
              Ya, buat data demo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardDescription>Total Responses · {year}</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">{total}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {yearCount} of these have at least one rating answer.
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardDescription>Annual Average Score</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums text-primary">
              {yearAvg > 0 ? yearAvg.toFixed(2) : "—"}
              <span className="text-base font-normal text-muted-foreground ml-1">/ 5</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StarRow value={yearAvg} />
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardDescription>Page Average · {onPage} shown</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {onPageAvg > 0 ? onPageAvg.toFixed(2) : "—"}
              <span className="text-base font-normal text-muted-foreground ml-1">/ 5</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Mean of the responses currently visible on this page.
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle>Responses</CardTitle>
          <CardDescription>
            {total} response{total === 1 ? "" : "s"} in {year} · Page {page} of {totalPages}
            {isFetching && " · Updating…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              title="No survey responses"
              description={`No client surveys have been submitted in ${year} yet. Surveys become available once a project is moved to status CLOSED and the link is shared with the client.`}
            />
          ) : (
            <>
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead className="whitespace-nowrap">Submitted</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const isOpen = expanded.has(it.id);
                    return (
                      <Fragment key={it.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => toggleExpand(it.id)}
                          data-testid={`row-response-${it.id}`}
                        >
                          <TableCell className="text-muted-foreground">
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{it.projectCode}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[260px]">{it.projectName}</div>
                          </TableCell>
                          <TableCell className="text-sm">{it.clientName}</TableCell>
                          <TableCell>
                            <div className="text-sm">{it.submitterName ?? <span className="text-muted-foreground italic">Anonymous</span>}</div>
                            {it.submitterEmail && (
                              <div className="text-[11px] text-muted-foreground">{it.submitterEmail}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(it.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell className="text-right">
                            {it.ratingCount > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <StarRow value={it.scoreAvg} />
                                <Badge variant="outline" className={cn("font-mono", scoreBadgeClass(it.scoreAvg))}>
                                  {it.scoreAvg.toFixed(2)}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No rating</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={6} className="p-0">
                              <ResponseDetail item={it} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
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
