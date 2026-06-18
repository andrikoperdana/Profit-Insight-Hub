import {
  useGetProjectClosingChecklist,
  useUpdateProjectClosingChecklistItem,
  getGetProjectClosingChecklistQueryKey,
  getGetProjectQueryKey,
  useUpdateProject,
  ProjectStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { CheckCircle2, Circle, MinusCircle, Lock } from "lucide-react";

export default function ClosingTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: items, isLoading } = useGetProjectClosingChecklist(projectId);
  const canWrite =
    isSuperAdmin(user?.role) ||
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project?.pmId === user?.id);

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
  const canClose = canWrite && allComplete && project?.status !== "CLOSED" && project?.status === "COMPLETE";

  return (
    <div className="space-y-4">
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
                {project?.status !== "COMPLETE"
                  ? "Project must be in COMPLETE status before it can be closed."
                  : allComplete
                    ? "All items completed. Project is ready to be closed."
                    : "Complete all items to unlock the Close Project button."}
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
    </div>
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
