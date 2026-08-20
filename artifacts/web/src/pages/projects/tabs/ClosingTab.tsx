import {
  useGetProjectClosingChecklist,
  useUpdateProjectClosingChecklistItem,
  getGetProjectClosingChecklistQueryKey,
  getGetProjectQueryKey,
  useUpdateProject,
  useListProjectFeedback360,
  useSubmitFeedback360,
  getListProjectFeedback360QueryKey,
  ProjectStatus,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { CheckCircle2, Circle, MinusCircle, Lock, Star } from "lucide-react";

type ClosingSurveyData = {
  closeReadiness: {
    csatRequired: boolean;
    csatResponseCount: number;
    csatSatisfied: boolean;
    csatWaived: boolean;
    feedback360Total: number;
    feedback360Submitted: number;
    feedback360Pending: number;
    feedback360Satisfied: boolean;
  };
};

export default function ClosingTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canWrite =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project?.pmId === user?.id);
  const { data: items, isLoading } = useGetProjectClosingChecklist(projectId);
  const {
    data: surveyData,
    isLoading: isReadinessLoading,
    error: readinessError,
  } = useQuery<ClosingSurveyData>({
    queryKey: ["/projects", projectId, "survey"],
    queryFn: () =>
      customFetch<ClosingSurveyData>(`/api/projects/${projectId}/survey`),
    enabled: !!projectId && canWrite,
    refetchInterval: project?.status === "COMPLETE" ? 30_000 : false,
  });

  const updateItem = useUpdateProjectClosingChecklistItem({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetProjectClosingChecklistQueryKey(projectId) }),
      onError: (e: any) => toast({ variant: "destructive", title: "Update failed", description: e?.message }),
    },
  });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        toast({ title: "Project closed", description: "Status changed to CLOSED." });
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to close project", description: e?.message }),
    },
  });

  const list = items ?? [];
  const done = list.filter((i) => i.status !== "PENDING").length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const allComplete = list.length > 0 && done === list.length;
  const readiness = surveyData?.closeReadiness;
  const csatReady = !!readiness?.csatSatisfied;
  const feedbackReady = !!readiness?.feedback360Satisfied;
  const canClose =
    canWrite &&
    allComplete &&
    csatReady &&
    feedbackReady &&
    project?.status === "COMPLETE";
  const closeBlocker =
    project?.status !== "COMPLETE"
      ? "Project must be in COMPLETE status before it can be closed."
      : !allComplete
        ? "Complete all checklist items to unlock the Close Project button."
        : isReadinessLoading
          ? "Checking CSAT and 360 feedback requirements…"
          : readinessError || !readiness
            ? "Closing requirements could not be verified. Refresh the page and try again."
            : !csatReady
              ? "A client CSAT response or Management waiver is still required."
              : !feedbackReady
                ? `${readiness.feedback360Pending} pending 360 feedback entr${readiness.feedback360Pending === 1 ? "y" : "ies"} must be submitted.`
                : "All requirements are complete. The project is ready to close.";

  return (
    <div className="space-y-4">
      {canWrite && (project?.status === "COMPLETE" || project?.status === "CLOSED") && (
        <Card className="border-border" data-testid="card-closing-readiness">
          <CardHeader>
            <CardTitle className="text-base">Close Readiness</CardTitle>
            <CardDescription>
              Checklist, client CSAT, and 360 feedback must all be complete before closing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReadinessRow
              label="Closing checklist"
              detail={`${done}/${list.length} items complete`}
              ready={allComplete}
              loading={isLoading}
            />
            <ReadinessRow
              label="Client CSAT"
              detail={
                readiness
                  ? !readiness.csatRequired
                    ? "Not required for this project type"
                    : readiness.csatResponseCount > 0
                      ? `${readiness.csatResponseCount} response${readiness.csatResponseCount === 1 ? "" : "s"} received`
                      : readiness.csatWaived
                        ? "Waived by Management"
                        : "Waiting for client response or Management waiver"
                  : "Checking requirement…"
              }
              ready={csatReady}
              loading={isReadinessLoading}
            />
            <ReadinessRow
              label="360 feedback"
              detail={
                readiness
                  ? readiness.feedback360Total === 0
                    ? "No feedback entries required"
                    : `${readiness.feedback360Submitted}/${readiness.feedback360Total} submitted`
                  : "Checking requirement…"
              }
              ready={feedbackReady}
              loading={isReadinessLoading}
            />
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Closing Checklist</CardTitle>
              <CardDescription>
                All items must be DONE or NA before the project can be closed (CLOSED).
              </CardDescription>
            </div>
            <Badge variant={allComplete ? "default" : "outline"} className={allComplete ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" : ""}>
              {done}/{list.length} done
            </Badge>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : list.length === 0 ? (
            <div className="text-sm text-muted-foreground">The checklist will be generated automatically.</div>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((it) => (
                <ChecklistRow
                  key={it.id}
                  item={it}
                  canWrite={canWrite}
                  onChange={(status, note) =>
                    updateItem.mutate({ id: projectId, itemId: it.id, data: { status: status as any, note } })
                  }
                />
              ))}
            </ul>
          )}

          {canWrite && project?.status !== "CLOSED" && (
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {closeBlocker}
              </p>
              <Button
                disabled={!canClose || updateProject.isPending}
                onClick={() =>
                  updateProject.mutate({
                    id: projectId,
                    data: { status: ProjectStatus.CLOSED } as any,
                  })
                }
                data-testid="button-close-project"
              >
                <Lock className="h-4 w-4 mr-2" />
                Close Project (CLOSED)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {(project?.status === "COMPLETE" || project?.status === "CLOSED") && (
        <Feedback360Card projectId={projectId} userId={user?.id} projectStatus={project?.status} />
      )}
    </div>
  );
}

function Feedback360Card({
  projectId,
  userId,
  projectStatus,
}: {
  projectId: string;
  userId?: string;
  projectStatus?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows, isLoading } = useListProjectFeedback360(projectId);
  const list = rows ?? [];
  const submitted = list.filter((f) => f.status === "SUBMITTED").length;
  const allSubmitted = list.length > 0 && submitted === list.length;

  if (isLoading || list.length === 0) return null;

  return (
    <Card className="border-border" data-testid="card-feedback360">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">360 Feedback</CardTitle>
            <CardDescription>
              PM and team members review each other after completion. All entries must be
              submitted before the project can be closed.
            </CardDescription>
          </div>
          <Badge
            variant={allSubmitted ? "default" : "outline"}
            className={allSubmitted ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" : ""}
            data-testid="badge-feedback360-progress"
          >
            {submitted}/{list.length} submitted
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {list.map((fb) => (
            <Feedback360Row
              key={fb.id}
              fb={fb}
              isMine={fb.reviewerId === userId}
              canSubmit={fb.reviewerId === userId && fb.status === "PENDING" && projectStatus !== "CLOSED"}
              onSubmitted={() =>
                Promise.all([
                  qc.invalidateQueries({
                    queryKey: getListProjectFeedback360QueryKey(projectId),
                  }),
                  qc.invalidateQueries({
                    queryKey: ["/projects", projectId, "survey"],
                  }),
                ]).then(() => undefined)
              }
              toast={toast}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReadinessRow({
  label,
  detail,
  ready,
  loading,
}: {
  label: string;
  detail: string;
  ready: boolean;
  loading: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        {ready && !loading ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
      <Badge
        variant="outline"
        className={
          ready && !loading
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
            : ""
        }
      >
        {loading ? "Checking" : ready ? "Ready" : "Pending"}
      </Badge>
    </div>
  );
}

function Feedback360Row({
  fb,
  isMine,
  canSubmit,
  onSubmitted,
  toast,
}: {
  fb: any;
  isMine: boolean;
  canSubmit: boolean;
  onSubmitted: () => void;
  toast: any;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");

  const submit = useSubmitFeedback360({
    mutation: {
      onSuccess: () => {
        toast({ title: "Feedback submitted", description: "Thank you for your feedback." });
        setOpen(false);
        onSubmitted();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to submit feedback", description: e?.message }),
    },
  });

  return (
    <li className="py-3" data-testid={`feedback360-row-${fb.id}`}>
      <div className="flex items-start gap-3">
        {fb.status === "SUBMITTED" ? (
          <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground/60" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">
              <span className={isMine ? "font-medium" : ""}>{fb.reviewerName}</span>
              <span className="text-muted-foreground"> reviews </span>
              {fb.subjectName}
              {isMine && <span className="text-xs text-muted-foreground"> (you)</span>}
            </div>
            <div className="flex items-center gap-2">
              {fb.status === "SUBMITTED" && fb.rating != null && (
                <span className="flex items-center gap-0.5 text-xs text-amber-500" data-testid={`feedback360-rating-${fb.id}`}>
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {fb.rating}/5
                </span>
              )}
              <Badge variant="outline" className="text-[10px]">{fb.status}</Badge>
              {canSubmit && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setOpen(!open)}
                  data-testid={`button-submit-feedback360-${fb.id}`}
                >
                  {open ? "Cancel" : "Give Feedback"}
                </Button>
              )}
            </div>
          </div>
          {fb.status === "SUBMITTED" && fb.comment && (
            <p className="text-xs text-muted-foreground mt-1 italic">"{fb.comment}"</p>
          )}
          {open && canSubmit && (
            <div className="mt-3 space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-1" data-testid="feedback360-star-picker">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-0.5"
                    data-testid={`feedback360-star-${n}`}
                  >
                    <Star
                      className={`h-5 w-5 ${n <= rating ? "text-amber-500 fill-current" : "text-muted-foreground/40"}`}
                    />
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  {rating > 0 ? `${rating}/5` : "Select a rating"}
                </span>
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="text-xs"
                placeholder="Comment (optional)"
                data-testid="input-feedback360-comment"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={rating < 1 || submit.isPending}
                  onClick={() =>
                    submit.mutate({ id: fb.id, data: { rating, comment: comment.trim() || null } })
                  }
                  data-testid="button-confirm-feedback360"
                >
                  Submit Feedback
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ChecklistRow({
  item,
  canWrite,
  onChange,
}: {
  item: any;
  canWrite: boolean;
  onChange: (status: string, note: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState<string>(item.note ?? "");

  const Icon = item.status === "DONE" ? CheckCircle2 : item.status === "NA" ? MinusCircle : Circle;
  const iconColor =
    item.status === "DONE" ? "text-emerald-500" :
    item.status === "NA" ? "text-muted-foreground" : "text-muted-foreground/60";

  return (
    <li className="py-3" data-testid={`checklist-item-${item.key}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">{item.label}</div>
            <div className="flex items-center gap-1">
              {canWrite ? (
                <>
                  <Button
                    size="sm"
                    variant={item.status === "DONE" ? "default" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => onChange("DONE", note || null)}
                    data-testid={`mark-done-${item.key}`}
                  >Done</Button>
                  <Button
                    size="sm"
                    variant={item.status === "NA" ? "secondary" : "ghost"}
                    className="h-7 text-xs"
                    onClick={() => onChange("NA", note || null)}
                  >N/A</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => onChange("PENDING", note || null)}
                    disabled={item.status === "PENDING"}
                  >Reset</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpanded(!expanded)}>
                    {expanded ? "Hide" : "Note"}
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
              )}
            </div>
          </div>
          {item.completedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {item.status} • {new Date(item.completedAt).toLocaleString("en-US")}
            </p>
          )}
          {item.note && !expanded && (
            <p className="text-xs text-muted-foreground mt-1 italic">"{item.note}"</p>
          )}
          {expanded && canWrite && (
            <div className="mt-2 flex gap-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs" placeholder="Note (optional)" />
              <Button size="sm" onClick={() => { onChange(item.status, note || null); setExpanded(false); }}>Save</Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
