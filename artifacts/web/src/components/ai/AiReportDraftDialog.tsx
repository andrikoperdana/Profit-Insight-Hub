import { useState } from "react";
import { useGenerateAiReportDraft } from "@workspace/api-client-react";
import type { AiReportDraftResult } from "@workspace/api-client-react";
import { Sparkles, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function draftToPlainText(result: AiReportDraftResult): string {
  const d = result.draft;
  const lines: string[] = [];
  lines.push(`${result.projectName} — Monthly Report Draft (${result.periodMonth})`);
  lines.push("");
  lines.push("EXECUTIVE SUMMARY");
  lines.push(d.executiveSummary);
  lines.push("");
  lines.push("ACHIEVEMENTS");
  for (const a of d.achievements) lines.push(`- ${a}`);
  lines.push("");
  lines.push("ISSUES & RISKS");
  if (d.issuesRisks.length === 0) lines.push("- None noted this period.");
  for (const r of d.issuesRisks) lines.push(`- ${r}`);
  lines.push("");
  lines.push("NEXT PLANS");
  for (const n of d.nextPlans) lines.push(`- ${n}`);
  if (d.dataNotes) {
    lines.push("");
    lines.push(`Data notes: ${d.dataNotes}`);
  }
  return lines.join("\n");
}

/**
 * "Draft with AI" — generates a monthly status report draft from live project
 * data (hours, milestones, risks). Nothing is saved server-side: the user
 * copies the text into their formal report document.
 */
export default function AiReportDraftDialog({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [result, setResult] = useState<AiReportDraftResult | null>(null);

  const gen = useGenerateAiReportDraft({
    mutation: {
      onSuccess: (res) => setResult(res),
      onError: (e: any) => {
        toast({
          title: "Could not generate draft",
          description:
            e?.status === 429
              ? "Too many drafts in a short time — please wait a few minutes."
              : e?.message ?? "Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const generate = () => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      toast({ title: "Pick a valid month", variant: "destructive" });
      return;
    }
    gen.mutate({ data: { projectId, periodMonth: month, language } });
  };

  const copyAll = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(draftToPlainText(result));
      toast({ title: "Draft copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy manually.", variant: "destructive" });
    }
  };

  const d = result?.draft;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="button-ai-draft">
        <Sparkles className="h-4 w-4 mr-1 text-primary" /> Draft with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI report draft — {projectName}
            </DialogTitle>
            <DialogDescription>
              Builds a monthly status draft from live project data (logged hours, milestones, open risks).
              Review and edit before using it in the formal report.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Report month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
                data-testid="input-draft-month"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Language</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v === "en" ? "en" : "id")}>
                <SelectTrigger className="w-44" data-testid="select-draft-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">Bahasa Indonesia</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={gen.isPending} data-testid="button-draft-generate">
              {gen.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Generating…
                </>
              ) : result ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" /> Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" /> Generate draft
                </>
              )}
            </Button>
          </div>

          {gen.isPending && (
            <p className="text-sm text-muted-foreground">
              Reading project data and writing the draft — this takes a few seconds…
            </p>
          )}

          {d && !gen.isPending && (
            <div className="space-y-4 text-sm" data-testid="draft-result">
              <section>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Executive summary
                </h4>
                <p className="whitespace-pre-wrap">{d.executiveSummary}</p>
              </section>
              <section>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Achievements
                </h4>
                <ul className="list-disc pl-5 space-y-1">
                  {d.achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Issues & risks
                </h4>
                {d.issuesRisks.length === 0 ? (
                  <p className="text-muted-foreground">None noted this period.</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {d.issuesRisks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Next plans
                </h4>
                <ul className="list-disc pl-5 space-y-1">
                  {d.nextPlans.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </section>
              {d.dataNotes && (
                <p className="text-xs text-muted-foreground italic border-t border-border pt-2">
                  Data notes: {d.dataNotes}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            {d && (
              <Button onClick={copyAll} data-testid="button-draft-copy">
                <Copy className="h-4 w-4 mr-1" /> Copy draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
