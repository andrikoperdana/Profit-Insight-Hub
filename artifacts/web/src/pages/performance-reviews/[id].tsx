import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  useGetPerformanceReview,
  useUpdatePerformanceReview,
  useSubmitPerformanceReview,
  useAcknowledgePerformanceReview,
  useDeletePerformanceReview,
  useUpsertPerformanceReviewProjectRating,
  useRemovePerformanceReviewProjectRating,
  useListProjects,
  getGetPerformanceReviewQueryKey,
  type PerformanceReviewStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Star, Send, CheckCircle2, Trash2, Plus, Briefcase, Clock, Award, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { RoleLabels } from "@/lib/roles";

const STATUS_COLORS: Record<PerformanceReviewStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  SUBMITTED: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  ACKNOWLEDGED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

export default function PerformanceReviewDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: review, isLoading } = useGetPerformanceReview(id);
  const { data: projects = [] } = useListProjects();

  const update = useUpdatePerformanceReview();
  const submit = useSubmitPerformanceReview();
  const acknowledge = useAcknowledgePerformanceReview();
  const del = useDeletePerformanceReview();
  const upsertRating = useUpsertPerformanceReviewProjectRating();
  const removeRating = useRemovePerformanceReviewProjectRating();

  const [form, setForm] = useState({
    overallRating: "",
    summary: "",
    strengths: "",
    improvements: "",
    goals: "",
  });
  const [ackText, setAckText] = useState("");
  const [ratingDialog, setRatingDialog] = useState(false);
  const [ratingForm, setRatingForm] = useState({ projectId: "", rating: "5", comment: "" });

  useEffect(() => {
    if (review) {
      setForm({
        overallRating: review.overallRating ? String(review.overallRating) : "",
        summary: review.summary ?? "",
        strengths: review.strengths ?? "",
        improvements: review.improvements ?? "",
        goals: review.goals ?? "",
      });
      setAckText(review.acknowledgement ?? "");
    }
  }, [review]);

  if (isLoading || !review) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const isAdmin = user?.role === "MANAGEMENT" || user?.role === "HR";
  const isReviewer = review.reviewerId === user?.id;
  const isSubject = review.userId === user?.id;
  const editable = (isReviewer || isAdmin) && review.status !== "ACKNOWLEDGED";
  const canAck = isSubject && review.status === "SUBMITTED";
  const canRate = isAdmin || isReviewer || user?.role === "PROJECT_MANAGER";

  async function refresh() {
    await qc.invalidateQueries({ queryKey: getGetPerformanceReviewQueryKey(id) });
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        id,
        data: {
          overallRating: form.overallRating ? Number(form.overallRating) : null,
          summary: form.summary || null,
          strengths: form.strengths || null,
          improvements: form.improvements || null,
          goals: form.goals || null,
        },
      });
      await refresh();
      toast({ title: "Saved" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleSubmit() {
    try {
      await submit.mutateAsync({ id });
      await refresh();
      toast({ title: "Review submitted for employee acknowledgement" });
    } catch (err) {
      toast({
        title: "Submit failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleAck() {
    try {
      await acknowledge.mutateAsync({ id, data: { acknowledgement: ackText || null } });
      await refresh();
      toast({ title: "Review acknowledged" });
    } catch (err) {
      toast({
        title: "Acknowledge failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this review?")) return;
    try {
      await del.mutateAsync({ id });
      toast({ title: "Review deleted" });
      window.location.href = (import.meta.env.BASE_URL || "/") + "performance-reviews";
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleAddRating() {
    if (!ratingForm.projectId) {
      toast({ title: "Select a project", variant: "destructive" });
      return;
    }
    try {
      await upsertRating.mutateAsync({
        id,
        data: {
          projectId: ratingForm.projectId,
          rating: Number(ratingForm.rating),
          comment: ratingForm.comment || null,
        },
      });
      await refresh();
      setRatingDialog(false);
      setRatingForm({ projectId: "", rating: "5", comment: "" });
      toast({ title: "Rating saved" });
    } catch (err) {
      toast({
        title: "Failed to save rating",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleRemoveRating(ratingId: string) {
    if (!confirm("Delete this rating?")) return;
    try {
      await removeRating.mutateAsync({ id, ratingId });
      await refresh();
      toast({ title: "Rating deleted" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  const metrics = review.metrics;
  const projectsInReview = new Set((review.projectRatings ?? []).map((r) => r.projectId));
  const availableProjects = projects.filter((p) => !projectsInReview.has(p.id));

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <Link href="/performance-reviews">
        <Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{review.userName ?? review.userId}</h1>
          <p className="text-sm text-muted-foreground">
            {review.userTitle ?? (review.userRole ? (RoleLabels as Record<string, string>)[review.userRole] ?? review.userRole : "")}
            {" · "}
            {review.period} {review.periodYear}
            {" · "}
            Reviewer: {review.reviewerName ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Period {formatDate(review.periodStart)} — {formatDate(review.periodEnd)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_COLORS[review.status]}>{review.status}</Badge>
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Billable Hours</div>
          <div className="text-xl font-semibold">{metrics?.billableHours.toFixed(1) ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Utilization</div>
          <div className="text-xl font-semibold">{metrics?.utilizationPct.toFixed(1) ?? 0}%</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Projects</div>
          <div className="text-xl font-semibold">{metrics?.projectCount ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Award className="h-3 w-3" /> Skills</div>
          <div className="text-xl font-semibold">{metrics?.skillCount ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> Avg Project Rating</div>
          <div className="text-xl font-semibold">
            {metrics?.avgProjectRating ? `${metrics.avgProjectRating.toFixed(1)}/5` : "—"}
          </div>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Assessment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Overall Rating (1–5)</Label>
              <Select
                value={form.overallRating}
                onValueChange={(v) => setForm((s) => ({ ...s, overallRating: v }))}
                disabled={!editable}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea
                rows={3}
                value={form.summary}
                onChange={(e) => setForm((s) => ({ ...s, summary: e.target.value }))}
                disabled={!editable}
              />
            </div>
            <div>
              <Label>Strengths</Label>
              <Textarea
                rows={2}
                value={form.strengths}
                onChange={(e) => setForm((s) => ({ ...s, strengths: e.target.value }))}
                disabled={!editable}
              />
            </div>
            <div>
              <Label>Areas to Improve</Label>
              <Textarea
                rows={2}
                value={form.improvements}
                onChange={(e) => setForm((s) => ({ ...s, improvements: e.target.value }))}
                disabled={!editable}
              />
            </div>
            <div>
              <Label>Goals for next period</Label>
              <Textarea
                rows={2}
                value={form.goals}
                onChange={(e) => setForm((s) => ({ ...s, goals: e.target.value }))}
                disabled={!editable}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {editable && (
                <Button onClick={handleSave} disabled={update.isPending}>Save</Button>
              )}
              {editable && review.status === "DRAFT" && (
                <Button onClick={handleSubmit} disabled={submit.isPending}>
                  <Send className="mr-2 h-4 w-4" /> Submit Review
                </Button>
              )}
            </div>
            {canAck && (
              <div className="border-t border-border pt-3 space-y-2">
                <Label>Acknowledgement (employee note)</Label>
                <Textarea
                  rows={2}
                  value={ackText}
                  onChange={(e) => setAckText(e.target.value)}
                  placeholder="Write your response / acknowledgement…"
                />
                <Button onClick={handleAck} disabled={acknowledge.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Acknowledge
                </Button>
              </div>
            )}
            {review.status === "ACKNOWLEDGED" && review.acknowledgement && (
              <div className="border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">Acknowledgement {review.acknowledgedAt && `(${formatDate(review.acknowledgedAt)})`}</div>
                <div className="text-sm mt-1 whitespace-pre-wrap">{review.acknowledgement}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Per-Project Rating (by PM)</span>
              {canRate && review.status !== "ACKNOWLEDGED" && (
                <Dialog open={ratingDialog} onOpenChange={setRatingDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> Rating</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Project Rating</DialogTitle>
                      <DialogDescription>
                        Only the project's PM (or HR/MGMT) can rate. Scale: 1 (poor) — 5 (excellent).
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Project</Label>
                        <Select value={ratingForm.projectId} onValueChange={(v) => setRatingForm((s) => ({ ...s, projectId: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                          <SelectContent>
                            {availableProjects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Rating</Label>
                        <Select value={ratingForm.rating} onValueChange={(v) => setRatingForm((s) => ({ ...s, rating: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Comment</Label>
                        <Textarea
                          rows={3}
                          value={ratingForm.comment}
                          onChange={(e) => setRatingForm((s) => ({ ...s, comment: e.target.value }))}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRatingDialog(false)}>Cancel</Button>
                      <Button onClick={handleAddRating} disabled={upsertRating.isPending}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(review.projectRatings ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No project ratings yet.</div>
            ) : (
              (review.projectRatings ?? []).map((pr) => (
                <div key={pr.id} className="border border-border rounded-md p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{pr.projectCode} — {pr.projectName}</div>
                      {pr.comment && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{pr.comment}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Star className="h-3.5 w-3.5 text-amber-400" />{pr.rating}/5
                      </span>
                      {(isAdmin || pr.ratedById === user?.id) && review.status !== "ACKNOWLEDGED" && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveRating(pr.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">By {pr.ratedByName ?? "—"} · {formatDate(pr.createdAt)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Project Activity &amp; Skills (this period)</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-2">Hours per Project</div>
            {(metrics?.projects ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No approved timesheets in this period.</div>
            ) : (
              <div className="space-y-1">
                {(metrics?.projects ?? []).map((p) => (
                  <div key={p.projectId} className="flex items-center justify-between text-sm border-b border-border/40 py-1">
                    <span>{p.projectCode} — {p.projectName}</span>
                    <span className="font-medium">{p.hours.toFixed(1)} h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Skill Profile</div>
            {(metrics?.skills ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No skills registered yet.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(metrics?.skills ?? []).map((s) => (
                  <Badge key={s.skillId} variant="outline">
                    {s.skillName} · L{s.proficiency}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
