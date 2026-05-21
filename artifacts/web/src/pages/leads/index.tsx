import { useState, useMemo } from "react";
import {
  useListLeads,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useConvertLead,
  useListClients,
  getListLeadsQueryKey,
  type Lead,
  LeadStage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatIDR } from "@/lib/format";
import { Plus, Trash2, ArrowRight, Briefcase } from "lucide-react";

const STAGES: { key: LeadStage; label: string; color: string }[] = [
  { key: "NEW" as LeadStage, label: "New", color: "border-slate-500/40 bg-slate-500/5" },
  { key: "QUALIFIED" as LeadStage, label: "Qualified", color: "border-blue-500/40 bg-blue-500/5" },
  { key: "PROPOSAL" as LeadStage, label: "Proposal", color: "border-indigo-500/40 bg-indigo-500/5" },
  { key: "NEGOTIATION" as LeadStage, label: "Negotiation", color: "border-amber-500/40 bg-amber-500/5" },
  { key: "WON" as LeadStage, label: "Won", color: "border-emerald-500/40 bg-emerald-500/5" },
  { key: "LOST" as LeadStage, label: "Lost", color: "border-destructive/40 bg-destructive/5" },
];

type FormState = {
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  clientId: string;
  prospectiveClientName: string;
  industry: string;
  source: string;
  stage: LeadStage;
  estimatedValue: string;
  probability: string;
  expectedCloseDate: string;
  notes: string;
};

const emptyForm: FormState = {
  title: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  clientId: "",
  prospectiveClientName: "",
  industry: "",
  source: "",
  stage: "NEW" as LeadStage,
  estimatedValue: "0",
  probability: "20",
  expectedCloseDate: "",
  notes: "",
};

export default function LeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const isAllowed = !user || user.role === "SALES";

  const { data: leads, isLoading } = useListLeads({ query: { enabled: isAllowed } } as any);
  const { data: clients } = useListClients();
  const create = useCreateLead();
  const update = useUpdateLead();
  const del = useDeleteLead();
  const convert = useConvertLead();

  const [isFormOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dragId, setDragId] = useState<string | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [convertCode, setConvertCode] = useState("");

  const canWrite = user?.role === "MANAGEMENT" || user?.role === "SALES";

  const grouped = useMemo(() => {
    const out: Record<LeadStage, Lead[]> = {
      NEW: [], QUALIFIED: [], PROPOSAL: [], NEGOTIATION: [], WON: [], LOST: [],
    } as any;
    for (const l of leads ?? []) (out[l.stage] ??= []).push(l);
    return out;
  }, [leads]);

  const totals = useMemo(() => {
    const t: Record<string, { count: number; value: number; weighted: number }> = {};
    for (const s of STAGES) t[s.key] = { count: 0, value: 0, weighted: 0 };
    for (const l of leads ?? []) {
      const k = l.stage as string;
      if (!t[k]) continue;
      t[k].count += 1;
      t[k].value += l.estimatedValue;
      t[k].weighted += l.estimatedValue * (l.probability / 100);
    }
    return t;
  }, [leads]);

  const pipelineValue = useMemo(() => {
    return (leads ?? [])
      .filter((l) => l.stage !== "WON" && l.stage !== "LOST")
      .reduce((s, l) => s + l.estimatedValue * (l.probability / 100), 0);
  }, [leads]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(l: Lead) {
    setEditingId(l.id);
    setForm({
      title: l.title,
      contactName: l.contactName ?? "",
      contactEmail: l.contactEmail ?? "",
      contactPhone: l.contactPhone ?? "",
      clientId: l.clientId ?? "",
      prospectiveClientName: l.prospectiveClientName ?? "",
      industry: l.industry ?? "",
      source: l.source ?? "",
      stage: l.stage,
      estimatedValue: String(l.estimatedValue),
      probability: String(l.probability),
      expectedCloseDate: l.expectedCloseDate ? l.expectedCloseDate.slice(0, 10) : "",
      notes: l.notes ?? "",
    });
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      clientId: form.clientId || null,
      prospectiveClientName: form.prospectiveClientName || undefined,
      industry: form.industry || undefined,
      source: form.source || undefined,
      stage: form.stage,
      estimatedValue: Number(form.estimatedValue) || 0,
      probability: Number(form.probability) || 0,
      expectedCloseDate: form.expectedCloseDate || null,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, data: payload as any });
        toast({ title: "Lead updated" });
      } else {
        await create.mutateAsync({ data: payload as any });
        toast({ title: "Lead added" });
      }
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" });
    }
  }

  async function handleDelete(l: Lead) {
    if (!confirm(`Delete lead "${l.title}"?`)) return;
    try {
      await del.mutateAsync({ id: l.id });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      toast({ title: "Lead deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message, variant: "destructive" });
    }
  }

  async function handleStageChange(l: Lead, newStage: LeadStage) {
    if (l.stage === newStage) return;
    try {
      await update.mutateAsync({ id: l.id, data: { stage: newStage } as any });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    } catch (e: any) {
      toast({ title: "Failed to change stage", description: e?.message, variant: "destructive" });
    }
  }

  function openConvert(l: Lead) {
    setConvertingLead(l);
    setConvertCode(`LEAD-${l.id.slice(-6).toUpperCase()}`);
  }

  async function handleConvert() {
    if (!convertingLead) return;
    try {
      const r = await convert.mutateAsync({
        id: convertingLead.id,
        data: { code: convertCode } as any,
      });
      toast({ title: "Lead converted to project", description: r.projectCode });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      setConvertingLead(null);
      navigate(`/projects/${r.projectId}`);
    } catch (e: any) {
      toast({ title: "Conversion failed", description: e?.message, variant: "destructive" });
    }
  }

  if (!isAllowed) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <div className="font-semibold text-destructive mb-1">Access denied</div>
        <div className="text-muted-foreground">
          Sales Pipeline is only accessible to users with the Sales role.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">Kanban board from prospect to project conversion.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Weighted Pipeline (open)</div>
            <div className="text-lg font-bold text-primary">{formatIDR(pipelineValue)}</div>
          </div>
          {canWrite && (
            <Button onClick={openCreate} data-testid="button-new-lead">
              <Plus className="h-4 w-4 mr-1" /> New Lead
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map((s) => (
          <div
            key={s.key}
            className={`rounded-lg border ${s.color} p-3 min-h-[300px]`}
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={() => {
              if (!dragId) return;
              const lead = (leads ?? []).find((x) => x.id === dragId);
              if (lead) handleStageChange(lead, s.key);
              setDragId(null);
            }}
            data-testid={`column-${s.key}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">{s.label}</div>
              <Badge variant="outline" className="text-[10px]">{totals[s.key]?.count ?? 0}</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground mb-3">
              {formatIDR(totals[s.key]?.value ?? 0)}
            </div>
            <div className="space-y-2">
              {(grouped[s.key] ?? []).map((l) => (
                <Card
                  key={l.id}
                  draggable={canWrite}
                  onDragStart={() => setDragId(l.id)}
                  onDragEnd={() => setDragId(null)}
                  className="bg-card cursor-grab hover:border-primary/40 transition"
                  data-testid={`lead-${l.id}`}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="font-medium text-sm leading-tight line-clamp-2">{l.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.clientName || l.prospectiveClientName || "—"}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-primary font-semibold">{formatIDR(l.estimatedValue)}</span>
                      <span className="text-muted-foreground">{l.probability}%</span>
                    </div>
                    {l.ownerName && (
                      <div className="text-[10px] text-muted-foreground">Owner: {l.ownerName}</div>
                    )}
                    {canWrite && (
                      <div className="flex items-center gap-1 pt-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(l)}>
                          Edit
                        </Button>
                        {!l.convertedProjectId && (s.key === "NEGOTIATION" || s.key === "PROPOSAL" || s.key === "WON") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-primary"
                            onClick={() => openConvert(l)}
                            data-testid={`button-convert-${l.id}`}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" /> Convert
                          </Button>
                        )}
                        {l.convertedProjectId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => navigate(`/projects/${l.convertedProjectId}`)}
                          >
                            <Briefcase className="h-3 w-3 mr-1" /> Project
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive ml-auto" onClick={() => handleDelete(l)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {!isLoading && (grouped[s.key] ?? []).length === 0 && (
                <div className="text-[11px] text-muted-foreground italic">Empty</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Lead" : "New Lead"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Opportunity Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Pentest Bank XYZ 2026" data-testid="input-lead-title" />
            </div>
            <div>
              <Label>Client (existing)</Label>
              <Select value={form.clientId || "_none"} onValueChange={(v) => setForm({ ...form, clientId: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None / New prospect —</SelectItem>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Or New Prospect Name</Label>
              <Input value={form.prospectiveClientName} onChange={(e) => setForm({ ...form, prospectiveClientName: e.target.value })} disabled={!!form.clientId} />
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as LeadStage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Referral / Web / Cold call" />
            </div>
            <div>
              <Label>Estimated Value (IDR)</Label>
              <Input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
            </div>
            <div>
              <Label>Probability (%)</Label>
              <Input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
            </div>
            <div>
              <Label>Expected Close Date</Label>
              <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
            </div>
            <div>
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Phone</Label>
              <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending} data-testid="button-save-lead">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertingLead} onOpenChange={(o) => !o && setConvertingLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Project</DialogTitle>
          </DialogHeader>
          {convertingLead && (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-medium">{convertingLead.title}</div>
                <div className="text-muted-foreground">
                  {convertingLead.clientName || convertingLead.prospectiveClientName || "New prospect"} · {formatIDR(convertingLead.estimatedValue)}
                </div>
              </div>
              <div>
                <Label>Project Code</Label>
                <Input value={convertCode} onChange={(e) => setConvertCode(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                A project will be created with DRAFT status. The lead will be marked WON and linked to this project.
                {!convertingLead.clientId && " Since no client is linked yet, a new client will be created automatically."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertingLead(null)}>Cancel</Button>
            <Button onClick={handleConvert} disabled={convert.isPending} data-testid="button-confirm-convert">
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
