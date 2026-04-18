import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from "lucide-react";

type Q = {
  id?: string;
  key: string;
  text: string;
  type: "RATING" | "TEXT";
  order: number;
  required: boolean;
  isActive: boolean;
};

export default function SurveyTemplateEditor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Q[]>({
    queryKey: ["/survey/template"],
    queryFn: () => customFetch<Q[]>("/api/survey/template"),
  });
  const [items, setItems] = useState<Q[]>([]);

  useEffect(() => { if (data) setItems(data.map((q) => ({ ...q }))); }, [data]);

  const save = useMutation({
    mutationFn: (questions: Q[]) =>
      customFetch("/api/survey/template", {
        method: "PUT",
        body: JSON.stringify({ questions }),
      }),
    onSuccess: () => {
      toast({ title: "Survey template saved" });
      qc.invalidateQueries({ queryKey: ["/survey/template"] });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e?.message, variant: "destructive" }),
  });

  function addQuestion() {
    setItems((arr) => [
      ...arr,
      { key: `question_${arr.length + 1}`, text: "New question", type: "RATING", order: arr.length + 1, required: true, isActive: true },
    ]);
  }
  function update(i: number, patch: Partial<Q>) {
    setItems((arr) => arr.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function remove(i: number) { setItems((arr) => arr.filter((_, idx) => idx !== i)); }
  function move(i: number, dir: -1 | 1) {
    setItems((arr) => {
      const next = [...arr];
      const j = i + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((q, idx) => ({ ...q, order: idx + 1 }));
    });
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Customer Survey Template</CardTitle>
              <CardDescription>
                Edit the questions clients will answer. Submitted responses cannot be modified after submission.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={addQuestion}><Plus className="h-4 w-4 mr-1" />Add Question</Button>
              <Button onClick={() => save.mutate(items.map((q, i) => ({ ...q, order: i + 1 })))} disabled={save.isPending}>
                <Save className="h-4 w-4 mr-1" />{save.isPending ? "Saving…" : "Save Template"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((q, i) => (
            <div key={q.id ?? `new-${i}`} className="p-4 rounded-md border border-border bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground font-mono">Question {i + 1}</div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <Label>Key</Label>
                  <Input
                    value={q.key}
                    onChange={(e) => update(i, { key: e.target.value })}
                    placeholder="e.g. project_management"
                    disabled={!!q.id}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lowercase letters, numbers, underscores. Cannot change after creation.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label>Question Text</Label>
                  <Input value={q.text} onChange={(e) => update(i, { text: e.target.value })} />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={q.type} onValueChange={(v) => update(i, { type: v as "RATING" | "TEXT" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RATING">Rating (1-5)</SelectItem>
                      <SelectItem value="TEXT">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={q.required} onCheckedChange={(v) => update(i, { required: v })} />
                    <Label>Required</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={q.isActive} onCheckedChange={(v) => update(i, { isActive: v })} />
                    <Label>Active</Label>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-center text-muted-foreground py-6">No questions yet. Add one to get started.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
