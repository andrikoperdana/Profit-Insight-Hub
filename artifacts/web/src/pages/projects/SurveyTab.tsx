import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Link2, Copy, ExternalLink, Download, MessageSquare, Star } from "lucide-react";

type Question = { key: string; text: string; type: "RATING" | "TEXT"; order: number; required: boolean };
type Aggregate = { key: string; text: string; order: number; average: number; responseCount: number };
type Response = {
  id: string;
  submitterName: string | null;
  submitterEmail: string | null;
  lessonLearned: string | null;
  answers: Record<string, { rating?: number; comment?: string; text?: string }>;
  createdAt: string;
};
type SurveyData = {
  project: { id: string; code: string; name: string; status: string };
  surveyAvailable: boolean;
  surveyToken: string | null;
  publicUrl: string | null;
  questions: Question[];
  aggregates: { perQuestion: Aggregate[]; overallAverage: number };
  responses: Response[];
};

export default function SurveyTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role;
  const canView = role === "MANAGEMENT" || role === "PROJECT_MANAGER";

  const { data, isLoading, error } = useQuery<SurveyData>({
    queryKey: ["/projects", projectId, "survey"],
    queryFn: () => customFetch<SurveyData>(`/api/projects/${projectId}/survey`),
    enabled: !!projectId && canView,
  });

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Customer survey results are only visible to Project Managers and Management.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <Card><CardContent className="py-10 text-muted-foreground">Loading survey…</CardContent></Card>;
  if (error || !data) return <Card><CardContent className="py-10 text-destructive">Failed to load survey data.</CardContent></Card>;

  if (!data.surveyAvailable) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          The customer satisfaction survey becomes available once this project is{" "}
          <span className="font-semibold text-foreground">Closed</span>.
        </CardContent>
      </Card>
    );
  }

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = data.surveyToken ? `${window.location.origin}${baseUrl}/survey/${data.surveyToken}` : "";

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => toast({ title: "Survey link copied" }));
  }

  function exportCsv() {
    if (!data) return;
    const rows: string[][] = [];
    const ratingQs = data.questions.filter((q) => q.type === "RATING");
    const headers = [
      "Submitted At", "Submitter Name", "Submitter Email",
      ...ratingQs.map((q) => `${q.text} (1-5)`),
      ...ratingQs.map((q) => `${q.text} — Comment`),
      "Lesson Learned",
    ];
    rows.push(headers);
    for (const r of data.responses) {
      const row = [
        new Date(r.createdAt).toISOString(),
        r.submitterName ?? "",
        r.submitterEmail ?? "",
        ...ratingQs.map((q) => String(r.answers?.[q.key]?.rating ?? "")),
        ...ratingQs.map((q) => String(r.answers?.[q.key]?.comment ?? "")),
        r.lessonLearned ?? "",
      ];
      rows.push(row);
    }
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `survey-${data.project.code}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const radarData = data.aggregates.perQuestion.map((q) => ({
    subject: q.text.split("—")[0].trim().slice(0, 28),
    score: Number(q.average.toFixed(2)),
    fullMark: 5,
  }));

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Public Survey Link
              </CardTitle>
              <CardDescription>
                Share this link with the client — no login required.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/40 text-primary">
              {data.responses.length} response{data.responses.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 px-3 py-2 rounded bg-muted text-sm break-all font-mono">{url}</code>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyLink}><Copy className="h-4 w-4 mr-2" />Copy</Button>
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" />Preview Survey</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.responses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No survey responses yet. Send the link to the client to start collecting feedback.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Overall Score</CardTitle>
                <CardDescription>Average across all rated questions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-primary">
                    {data.aggregates.overallAverage.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">/ 5.00</span>
                </div>
                <div className="flex mt-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${i <= Math.round(data.aggregates.overallAverage) ? "fill-primary text-primary" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {data.aggregates.perQuestion.map((q) => (
                    <div key={q.key} className="flex justify-between text-sm">
                      <span className="truncate pr-2">{q.text.split("—")[0].trim()}</span>
                      <span className="font-mono text-primary">{q.average.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex-row justify-between items-start">
                <div>
                  <CardTitle className="text-base">Score Distribution</CardTitle>
                  <CardDescription>Average rating per question</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={exportCsv}>
                    <Download className="h-4 w-4 mr-2" />CSV
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`${baseUrl}api/projects/${projectId}/survey/export.xlsx`} download>
                      <Download className="h-4 w-4 mr-2" />Excel
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`${baseUrl}api/projects/${projectId}/survey/export.pdf`} download>
                      <Download className="h-4 w-4 mr-2" />PDF
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="75%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.45} />
                    <RechartsTooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Lesson Learned & Comments
              </CardTitle>
              <CardDescription>Read-only — survey responses cannot be edited.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.responses.map((r) => {
                const comments = data.questions
                  .filter((q) => q.type === "RATING")
                  .map((q) => ({ q: q.text, c: r.answers?.[q.key]?.comment }))
                  .filter((x) => x.c);
                return (
                  <div key={r.id} className="p-3 rounded-md border border-border bg-muted/30">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>{r.submitterName || "Anonymous"} {r.submitterEmail ? `· ${r.submitterEmail}` : ""}</span>
                      <span>{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    {r.lessonLearned && (
                      <p className="text-sm whitespace-pre-wrap mb-2">{r.lessonLearned}</p>
                    )}
                    {comments.length > 0 && (
                      <div className="space-y-1 text-xs">
                        {comments.map((x, i) => (
                          <div key={i}>
                            <span className="font-semibold text-muted-foreground">{x.q.split("—")[0].trim()}: </span>
                            <span>{x.c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
