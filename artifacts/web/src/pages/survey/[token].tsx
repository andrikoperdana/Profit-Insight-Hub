import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, CheckCircle2 } from "lucide-react";
import itsecLogo from "@assets/Logo_Cybersecurity_Delivered_White_1781007162611.png";

type Question = { key: string; text: string; type: "RATING" | "TEXT"; required: boolean; order: number };
type SurveyForm = {
  project: { id: string; code: string; name: string; clientName: string };
  questions: Question[];
};

type Answers = Record<string, { rating?: number; comment?: string; text?: string }>;

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labels = ["", "Very Poor", "Poor", "Average", "Good", "Excellent"];
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          type="button"
          key={i}
          onClick={() => onChange(i)}
          className="p-1 transition hover:scale-110"
          aria-label={`Rate ${i} of 5`}
        >
          <Star className={`h-7 w-7 ${i <= value ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground min-w-[80px]">{value > 0 ? labels[value] : ""}</span>
    </div>
  );
}

export default function PublicSurveyPage() {
  const params = useParams();
  const token = params.token as string;
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadErr } = useQuery<SurveyForm>({
    queryKey: ["public-survey", token],
    queryFn: () => customFetch<SurveyForm>(`/api/public/surveys/${token}`),
    retry: false,
    enabled: !!token,
  });

  const submit = useMutation({
    mutationFn: (payload: any) =>
      customFetch(`/api/public/surveys/${token}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => setSubmitted(true),
    onError: (e: any) => setError(e?.message || "Failed to submit survey"),
  });

  function setRating(key: string, rating: number) {
    setAnswers((p) => ({ ...p, [key]: { ...p[key], rating } }));
  }
  function setComment(key: string, comment: string) {
    setAnswers((p) => ({ ...p, [key]: { ...p[key], comment } }));
  }
  function setText(key: string, text: string) {
    setAnswers((p) => ({ ...p, [key]: { ...p[key], text } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!data) return;
    for (const q of data.questions) {
      if (q.required) {
        const a = answers[q.key];
        if (q.type === "RATING" && (!a?.rating || a.rating < 1)) {
          setError(`Please rate "${q.text}"`);
          return;
        }
        if (q.type === "TEXT" && !a?.text?.trim()) {
          setError(`Please provide an answer for "${q.text}"`);
          return;
        }
      }
    }
    submit.mutate({ submitterName: submitterName || null, submitterEmail: submitterEmail || null, answers });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading survey…</p>
      </div>
    );
  }

  if (loadErr || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Survey unavailable</CardTitle>
            <CardDescription>
              This survey link is invalid, expired, or the project is not yet closed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-14 w-14 text-primary" />
            </div>
            <CardTitle>Thank you!</CardTitle>
            <CardDescription>Your feedback has been submitted successfully.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img src={itsecLogo} alt="ITSEC" className="h-8 w-auto" />
          <span className="font-bold text-lg text-foreground">SecureProfit Hub</span>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-2xl">Customer Satisfaction Survey</CardTitle>
            <CardDescription>
              <div className="mt-1">
                <span className="font-semibold text-foreground">{data.project.name}</span>
                <span className="text-muted-foreground"> · {data.project.code}</span>
              </div>
              <div className="text-muted-foreground">Client: {data.project.clientName}</div>
              <p className="mt-3 text-sm">
                Please take a moment to rate your experience. Your feedback is confidential and helps us improve.
              </p>
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-border">
                <div>
                  <Label htmlFor="name">Your name (optional)</Label>
                  <Input id="name" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} placeholder="John Doe" />
                </div>
                <div>
                  <Label htmlFor="email">Your email (optional)</Label>
                  <Input id="email" type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} placeholder="you@company.com" />
                </div>
              </div>

              {data.questions.map((q) => (
                <div key={q.key} className="space-y-2">
                  <Label className="text-base">
                    {q.text} {q.required && <span className="text-destructive">*</span>}
                  </Label>
                  {q.type === "RATING" ? (
                    <>
                      <StarPicker value={answers[q.key]?.rating ?? 0} onChange={(v) => setRating(q.key, v)} />
                      <Textarea
                        placeholder="Optional comment…"
                        value={answers[q.key]?.comment ?? ""}
                        onChange={(e) => setComment(q.key, e.target.value)}
                        rows={2}
                      />
                    </>
                  ) : (
                    <Textarea
                      placeholder="Your answer…"
                      value={answers[q.key]?.text ?? ""}
                      onChange={(e) => setText(q.key, e.target.value)}
                      rows={4}
                    />
                  )}
                </div>
              ))}

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
            <div className="px-6 pb-6">
              <Button type="submit" disabled={submit.isPending} className="w-full">
                {submit.isPending ? "Submitting…" : "Submit Survey"}
              </Button>
            </div>
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Powered by SecureProfit Hub · Your responses cannot be modified after submission.
        </p>
      </div>
    </div>
  );
}
