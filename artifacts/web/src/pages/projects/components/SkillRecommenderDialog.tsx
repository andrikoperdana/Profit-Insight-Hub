import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Briefcase } from "lucide-react";
import { LoadingSpinner } from "@/components/common/Loading";

type Suggestion = {
  id: string;
  name: string;
  role: string;
  seniority: string | null;
  businessUnitName: string | null;
  skills: { id: string; name: string; proficiency: number }[];
  assignedHoursThisWeek: number;
  activeProjectsCount: number;
  activeProjects: { id: string; name: string }[];
  onLeaveDays: number;
  sameBuAsProject: boolean;
  score: number;
};
type Resp = {
  weekStart: string;
  weekEnd: string;
  role: string;
  total: number;
  candidates: Suggestion[];
};

function startOfThisWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default function SkillRecommenderDialog({
  open,
  onOpenChange,
  projectId,
  role,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  role: "KONSULTAN" | "TECHNICAL_WRITER" | "ADMIN_PROJECT";
  onSelect: (userId: string) => void;
}) {
  const [weekStart] = useState(() => startOfThisWeek());

  const { data, isLoading } = useQuery<Resp>({
    queryKey: ["resource-suggestions", projectId, role, weekStart],
    queryFn: () =>
      customFetch<Resp>(`/api/projects/${projectId}/resource-suggestions?role=${role}&weekStart=${weekStart}`),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Candidate Suggestions — {role}
          </DialogTitle>
          <DialogDescription>
            Ranked by skills, workload this week, leave status, and Business Unit match.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="py-10 flex justify-center"><LoadingSpinner /></div>
        ) : data.candidates.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No candidates available for this role.
          </p>
        ) : (
          <div className="space-y-3">
            {data.candidates.slice(0, 10).map((c, idx) => {
              const overloaded = c.assignedHoursThisWeek > 40;
              return (
                <div
                  key={c.id}
                  className="border border-border rounded-md p-3 hover:bg-muted/30 transition"
                  data-testid={`suggestion-${c.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                        <span className="font-medium">{c.name}</span>
                        {c.seniority && <Badge variant="outline" className="text-[10px]">{c.seniority}</Badge>}
                        {c.sameBuAsProject && (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                            BU match
                          </Badge>
                        )}
                        {c.businessUnitName && (
                          <span className="text-[11px] text-muted-foreground">· {c.businessUnitName}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className={overloaded ? "text-amber-500" : ""}>
                          {c.assignedHoursThisWeek}h this week
                          {overloaded && " (>40h)"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {c.activeProjectsCount} active projects
                        </span>
                        {c.onLeaveDays > 0 && (
                          <span className="text-amber-500 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {c.onLeaveDays}d leave
                          </span>
                        )}
                      </div>
                      {c.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.skills.slice(0, 8).map((s) => (
                            <Badge
                              key={s.id}
                              variant="outline"
                              className={`text-[10px] ${
                                s.proficiency >= 4
                                  ? "border-primary/50 text-primary"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {s.name} · L{s.proficiency}
                            </Badge>
                          ))}
                          {c.skills.length > 8 && (
                            <span className="text-[10px] text-muted-foreground">+{c.skills.length - 8} more</span>
                          )}
                        </div>
                      )}
                      {c.activeProjects.length > 0 && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Currently on: {c.activeProjects.slice(0, 3).map((p) => p.name).join(", ")}
                          {c.activeProjects.length > 3 && ` +${c.activeProjects.length - 3} more`}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        onSelect(c.id);
                        onOpenChange(false);
                      }}
                      data-testid={`select-suggestion-${c.id}`}
                    >
                      Select
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
