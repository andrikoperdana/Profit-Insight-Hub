import { useState } from "react";
import {
  useCreateLeave,
  useListLeaves,
  useDeleteLeave,
  getListLeavesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plane, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";

const TYPES = [
  { value: "ANNUAL", label: "Annual Leave" },
  { value: "SICK", label: "Sick" },
  { value: "TRAINING", label: "Training" },
  { value: "UNPAID", label: "Unpaid Leave" },
  { value: "OTHER", label: "Other" },
];

const TYPE_TONE: Record<string, string> = {
  ANNUAL: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  SICK: "bg-red-500/15 text-red-300 border-red-500/30",
  TRAINING: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  UNPAID: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  OTHER: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export default function LeaveDialog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [type, setType] = useState("ANNUAL");
  const [note, setNote] = useState("");

  const params = { scope: "mine" } as any;
  const { data: leaves } = useListLeaves(undefined, { query: { enabled: open, queryKey: getListLeavesQueryKey() } });

  const create = useCreateLeave({
    mutation: {
      onSuccess: () => {
        toast({ title: "Leave recorded" });
        qc.invalidateQueries({ queryKey: getListLeavesQueryKey() });
        setNote("");
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to save", description: e?.message }),
    },
  });
  const del = useDeleteLeave({
    mutation: {
      onSuccess: () => {
        toast({ title: "Leave deleted" });
        qc.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      },
    },
  });

  const submit = () => {
    if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) {
      toast({ variant: "destructive", title: "Invalid date" });
      return;
    }
    create.mutate({ data: { startDate, endDate, type: type as any, note: note || null } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0" data-testid="button-log-leave">
          <Plane className="h-4 w-4 mr-2" /> Log Leave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Leave / Absence</DialogTitle>
          <DialogDescription>
            Record leave / training / sick days. Appears in Resource Planning so PMs do not assign you on those dates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-leave-start" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-leave-end" />
            </div>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: Family leave…" />
          </div>
          <Button onClick={submit} disabled={create.isPending} className="w-full" data-testid="button-save-leave">
            {create.isPending ? "Saving…" : "Add Leave"}
          </Button>

          <div className="pt-2 border-t border-border">
            <Label className="mb-2 block">My Leave</Label>
            {!leaves || leaves.length === 0 ? (
              <p className="text-xs text-muted-foreground">No leave recorded yet.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {leaves.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-xs border border-border/60 rounded p-2 bg-muted/20" data-testid={`leave-${l.id}`}>
                    <div className="flex-1">
                      <Badge variant="outline" className={`text-[10px] mr-2 ${TYPE_TONE[l.type] ?? ""}`}>
                        {TYPES.find((t) => t.value === l.type)?.label ?? l.type}
                      </Badge>
                      {formatDate(l.startDate)} → {formatDate(l.endDate)}
                      {l.note && <div className="text-muted-foreground mt-0.5">{l.note}</div>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate({ id: l.id })}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
