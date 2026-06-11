import { useState, useMemo, useEffect } from "react";
import {
  useListLeads,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useConvertLead,
  useImportLeads,
  useListClients,
  useListUsers,
  useListLeadActivities,
  useCreateLeadActivity,
  useDeleteLeadActivity,
  getListLeadsQueryKey,
  getListLeadActivitiesQueryKey,
  type Lead,
  type LeadActivity,
  LeadStage,
  LeadActivityType,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIDR } from "@/lib/format";
import { Plus, Trash2, ArrowRight, Briefcase, AlertTriangle, LayoutGrid, List as ListIcon, Upload } from "lucide-react";

const STAGES: { key: LeadStage; label: string; color: string }[] = [
  { key: "NEW" as LeadStage, label: "New", color: "border-slate-500/40 bg-slate-500/5" },
  { key: "QUALIFIED" as LeadStage, label: "Qualified", color: "border-blue-500/40 bg-blue-500/5" },
  { key: "PROPOSAL" as LeadStage, label: "Proposal", color: "border-indigo-500/40 bg-indigo-500/5" },
  { key: "NEGOTIATION" as LeadStage, label: "Negotiation", color: "border-amber-500/40 bg-amber-500/5" },
  { key: "WON" as LeadStage, label: "Won", color: "border-emerald-500/40 bg-emerald-500/5" },
  { key: "LOST" as LeadStage, label: "Lost", color: "border-destructive/40 bg-destructive/5" },
];

const DEFAULT_PROB: Record<LeadStage, number> = {
  NEW: 10, QUALIFIED: 30, PROPOSAL: 50, NEGOTIATION: 70, WON: 100, LOST: 0,
} as any;

const LOST_REASONS = [
  { value: "PRICE", label: "Price" },
  { value: "TIMELINE", label: "Timeline" },
  { value: "COMPETITOR", label: "Competitor" },
  { value: "NO_BUDGET", label: "No Budget" },
  { value: "NO_DECISION", label: "No Decision" },
  { value: "OTHER", label: "Other" },
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
  probabilityTouched: boolean;
  expectedCloseDate: string;
  notes: string;
};

const emptyForm: FormState = {
  title: "", contactName: "", contactEmail: "", contactPhone: "",
  clientId: "", prospectiveClientName: "", industry: "", source: "",
  stage: "NEW" as LeadStage, estimatedValue: "0", probability: "10",
  probabilityTouched: false, expectedCloseDate: "", notes: "",
};

function useUrlState() {
  const [search, setSearch] = useState(() => typeof window !== "undefined" ? window.location.search : "");
  useEffect(() => {
    const h = () => setSearch(window.location.search);
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") p.delete(k); else p.set(k, v);
    }
    const q = p.toString();
    const url = `${window.location.pathname}${q ? "?" + q : ""}`;
    window.history.replaceState({}, "", url);
    setSearch(q ? "?" + q : "");
  }
  return [params, update] as const;
}

export default function LeadsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const role = user?.role;
  const isMgmt = role === "MANAGEMENT";
  const isSales = role === "SALES";
  const isAllowed = !!user && (isSales || isMgmt);
  const canWrite = isSales;
  const canImport = isSales || isMgmt;

  const { data: leads, isLoading } = useListLeads({ query: { enabled: isAllowed } } as any);
  const { data: clients } = useListClients();
  const { data: allUsers } = useListUsers({ query: { enabled: isMgmt } } as any);
  const usersData = useMemo(
    () => (allUsers ?? []).filter((u) => u.role === "SALES"),
    [allUsers],
  );
  const create = useCreateLead();
  const update = useUpdateLead();
  const del = useDeleteLead();
  const convert = useConvertLead();
  const importLeads = useImportLeads();
  const createActivity = useCreateLeadActivity();
  const delActivity = useDeleteLeadActivity();

  const [params, setParams] = useUrlState();
  const view = (params.get("view") || "board") as "board" | "list";
  const stageFilter = (params.get("stages") || "").split(",").filter(Boolean) as LeadStage[];
  const ownerFilter = params.get("owner") || "";
  const sourceFilter = params.get("source") || "";
  const fromFilter = params.get("from") || "";
  const toFilter = params.get("to") || "";

  const [isFormOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dragId, setDragId] = useState<string | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [convertCode, setConvertCode] = useState("");
  const [convertClientName, setConvertClientName] = useState("");
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [lostReason, setLostReason] = useState("PRICE");
  const [lostCompetitor, setLostCompetitor] = useState("");
  const [lostNotes, setLostNotes] = useState("");
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [isImportOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState<{
    total: number;
    created: number;
    failed: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // Open drawer from ?leadId=
  useEffect(() => {
    const id = params.get("leadId");
    if (id && leads) {
      const l = leads.find((x) => x.id === id);
      if (l) setDrawerLead(l);
    }
  }, [params, leads]);

  const filteredLeads = useMemo(() => {
    let out = leads ?? [];
    if (stageFilter.length) out = out.filter((l) => stageFilter.includes(l.stage));
    if (ownerFilter) out = out.filter((l) => l.ownerId === ownerFilter);
    if (sourceFilter) out = out.filter((l) => (l.source || "").toLowerCase().includes(sourceFilter.toLowerCase()));
    if (fromFilter) out = out.filter((l) => l.expectedCloseDate && l.expectedCloseDate >= fromFilter);
    if (toFilter) out = out.filter((l) => l.expectedCloseDate && l.expectedCloseDate <= toFilter);
    return out;
  }, [leads, stageFilter, ownerFilter, sourceFilter, fromFilter, toFilter]);

  const grouped = useMemo(() => {
    const out: Record<LeadStage, Lead[]> = {
      NEW: [], QUALIFIED: [], PROPOSAL: [], NEGOTIATION: [], WON: [], LOST: [],
    } as any;
    for (const l of filteredLeads) (out[l.stage] ??= []).push(l);
    return out;
  }, [filteredLeads]);

  const totals = useMemo(() => {
    const t: Record<string, { count: number; value: number; weighted: number }> = {};
    for (const s of STAGES) t[s.key] = { count: 0, value: 0, weighted: 0 };
    for (const l of filteredLeads) {
      const k = l.stage as string;
      if (!t[k]) continue;
      t[k].count += 1;
      t[k].value += l.estimatedValue;
      t[k].weighted += l.estimatedValue * (l.probability / 100);
    }
    return t;
  }, [filteredLeads]);

  const pipelineValue = useMemo(() => {
    return filteredLeads
      .filter((l) => l.stage !== "WON" && l.stage !== "LOST")
      .reduce((s, l) => s + l.estimatedValue * (l.probability / 100), 0);
  }, [filteredLeads]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
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
      probabilityTouched: true,
      expectedCloseDate: l.expectedCloseDate ? l.expectedCloseDate.slice(0, 10) : "",
      notes: l.notes ?? "",
    });
    setFormOpen(true);
  }

  function setStage(next: LeadStage) {
    setForm((f) => {
      const newProb = !f.probabilityTouched ? String(DEFAULT_PROB[next] ?? f.probability) : f.probability;
      return { ...f, stage: next, probability: newProb };
    });
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
    if (newStage === "LOST") {
      setLostLead(l);
      setLostReason("PRICE");
      setLostCompetitor("");
      setLostNotes("");
      return;
    }
    if (newStage === "WON") {
      openConvert(l);
      return;
    }
    try {
      await update.mutateAsync({ id: l.id, data: { stage: newStage } as any });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    } catch (e: any) {
      toast({ title: "Failed to change stage", description: e?.message, variant: "destructive" });
    }
  }

  async function confirmLost() {
    if (!lostLead) return;
    try {
      const notesAppend = lostNotes
        ? `${lostLead.notes ? lostLead.notes + "\n\n" : ""}[LOST] ${lostNotes}`
        : lostLead.notes ?? undefined;
      await update.mutateAsync({
        id: lostLead.id,
        data: {
          stage: "LOST" as LeadStage,
          lostReason,
          competitorWon: lostCompetitor || null,
          notes: notesAppend,
        } as any,
      });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      toast({ title: "Lead marked as LOST" });
      setLostLead(null);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  }

  function openConvert(l: Lead) {
    setConvertingLead(l);
    setConvertCode(`LEAD-${l.id.slice(-6).toUpperCase()}`);
    setConvertClientName(l.prospectiveClientName ?? "");
  }

  async function handleConvert() {
    if (!convertingLead) return;
    try {
      const r = await convert.mutateAsync({
        id: convertingLead.id,
        data: {
          code: convertCode,
          clientName: convertingLead.clientId ? undefined : convertClientName,
        } as any,
      });
      toast({ title: "Lead converted to project", description: r.projectCode });
      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      setConvertingLead(null);
      navigate(`/projects/${r.projectId}`);
    } catch (e: any) {
      toast({ title: "Conversion failed", description: e?.message, variant: "destructive" });
    }
  }

  if (!user) {
    return <div className="text-sm text-muted-foreground p-6">Loading…</div>;
  }
  if (!isAllowed) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <div className="font-semibold text-destructive mb-1">Access denied</div>
        <div className="text-muted-foreground">
          Sales Pipeline is only accessible to Sales or Management.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {isMgmt ? "Read-only view of all leads." : "Kanban board from prospect to project conversion."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Weighted Pipeline (open)</div>
            <div className="text-lg font-bold text-primary">{formatIDR(pipelineValue)}</div>
          </div>
          <div className="flex border rounded-md overflow-hidden">
            <Button size="sm" variant={view === "board" ? "default" : "ghost"} className="rounded-none" onClick={() => setParams({ view: "board" })} data-testid="button-view-board">
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="rounded-none" onClick={() => setParams({ view: "list" })} data-testid="button-view-list">
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
          {canImport && (
            <Button
              variant="outline"
              onClick={() => {
                setImportCsv("");
                setImportFileName("");
                setImportResult(null);
                setImportOpen(true);
              }}
              data-testid="button-import-leads"
            >
              <Upload className="h-4 w-4 mr-1" /> Import CSV
            </Button>
          )}
          {canWrite && (
            <Button onClick={openCreate} data-testid="button-new-lead">
              <Plus className="h-4 w-4 mr-1" /> New Lead
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="py-3 px-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Stage</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {STAGES.map((s) => {
                const on = stageFilter.includes(s.key);
                return (
                  <Badge
                    key={s.key}
                    variant={on ? "default" : "outline"}
                    className="cursor-pointer text-[11px]"
                    onClick={() => {
                      const next = on ? stageFilter.filter((x) => x !== s.key) : [...stageFilter, s.key];
                      setParams({ stages: next.join(",") || null });
                    }}
                  >
                    {s.label}
                  </Badge>
                );
              })}
            </div>
          </div>
          {isMgmt && (
            <div className="min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Owner</Label>
              <Select value={ownerFilter || "_all"} onValueChange={(v) => setParams({ owner: v === "_all" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All owners</SelectItem>
                  {(usersData ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-[150px]">
            <Label className="text-xs text-muted-foreground">Source</Label>
            <Input value={sourceFilter} onChange={(e) => setParams({ source: e.target.value || null })} placeholder="any" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Close date from</Label>
            <Input type="date" value={fromFilter} onChange={(e) => setParams({ from: e.target.value || null })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">to</Label>
            <Input type="date" value={toFilter} onChange={(e) => setParams({ to: e.target.value || null })} />
          </div>
          {(stageFilter.length || ownerFilter || sourceFilter || fromFilter || toFilter) ? (
            <Button size="sm" variant="ghost" onClick={() => setParams({ stages: null, owner: null, source: null, from: null, to: null })}>
              Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAGES.map((s) => (
            <div
              key={s.key}
              className={`rounded-lg border ${s.color} p-3 min-h-[300px]`}
              onDragOver={(e) => { if (dragId && canWrite) e.preventDefault(); }}
              onDrop={() => {
                if (!dragId || !canWrite) return;
                const lead = filteredLeads.find((x) => x.id === dragId);
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
                {formatIDR(totals[s.key]?.value ?? 0)} · weighted {formatIDR(totals[s.key]?.weighted ?? 0)}
              </div>
              <div className="space-y-2">
                {(grouped[s.key] ?? []).map((l) => (
                  <Card
                    key={l.id}
                    draggable={canWrite}
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setDrawerLead(l)}
                    className="bg-card cursor-pointer hover:border-primary/40 transition"
                    data-testid={`lead-${l.id}`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm leading-tight line-clamp-2 flex-1">{l.title}</div>
                        {(l as any).followupOverdue && (
                          <Badge variant="destructive" className="text-[9px] gap-1 shrink-0">
                            <AlertTriangle className="h-3 w-3" /> follow-up
                          </Badge>
                        )}
                      </div>
                      {l.pipedriveDealId != null && (
                        <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                          From Pipedrive
                        </Badge>
                      )}
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
                        <div className="flex items-center gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(l)}>
                            Edit
                          </Button>
                          {!l.convertedProjectId && (s.key === "NEGOTIATION" || s.key === "PROPOSAL") && (
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
                          {!l.convertedProjectId && s.key === "WON" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-primary"
                              onClick={() => navigate(`/projects/new?leadId=${l.id}`)}
                              data-testid={`button-register-${l.id}`}
                            >
                              <ArrowRight className="h-3 w-3 mr-1" /> Register Project
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
      ) : (
        <Card className="border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Prob</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Close</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrawerLead(l)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.title}</span>
                        {(l as any).followupOverdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        {l.pipedriveDealId != null && (
                          <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                            Pipedrive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{l.clientName || l.prospectiveClientName || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{l.stage}</Badge></TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatIDR(l.estimatedValue)}</TableCell>
                    <TableCell className="text-right text-sm">{l.probability}%</TableCell>
                    <TableCell className="text-sm">{l.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.expectedCloseDate ? l.expectedCloseDate.slice(0, 10) : "—"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>Edit</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLeads.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No leads.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail/Activities drawer */}
      <Sheet open={!!drawerLead} onOpenChange={(o) => { if (!o) { setDrawerLead(null); setParams({ leadId: null }); } }}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {drawerLead && (
            <>
              <SheetHeader>
                <SheetTitle>{drawerLead.title}</SheetTitle>
              </SheetHeader>
              <Tabs defaultValue="detail" className="mt-4">
                <TabsList>
                  <TabsTrigger value="detail">Detail</TabsTrigger>
                  <TabsTrigger value="activities" data-testid="tab-activities">Activities</TabsTrigger>
                </TabsList>
                <TabsContent value="detail" className="space-y-2 text-sm">
                  {drawerLead.pipedriveDealId != null && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                      Imported from Pipedrive (deal #{drawerLead.pipedriveDealId}). Details sync one-way
                      from Pipedrive and may be overwritten on the next import.
                    </div>
                  )}
                  <Row k="Client" v={drawerLead.clientName || drawerLead.prospectiveClientName || "—"} />
                  <Row k="Stage" v={drawerLead.stage} />
                  <Row k="Value" v={formatIDR(drawerLead.estimatedValue)} />
                  <Row k="Probability" v={`${drawerLead.probability}%`} />
                  <Row k="Weighted" v={formatIDR(drawerLead.estimatedValue * drawerLead.probability / 100)} />
                  <Row k="Source" v={drawerLead.source || "—"} />
                  <Row k="Industry" v={drawerLead.industry || "—"} />
                  <Row k="Contact" v={drawerLead.contactName ? `${drawerLead.contactName}${drawerLead.contactEmail ? " · " + drawerLead.contactEmail : ""}` : "—"} />
                  <Row k="Owner" v={drawerLead.ownerName || "—"} />
                  <Row k="Close date" v={drawerLead.expectedCloseDate ? drawerLead.expectedCloseDate.slice(0, 10) : "—"} />
                  {drawerLead.lostReason && <Row k="Lost reason" v={drawerLead.lostReason} />}
                  {drawerLead.competitorWon && <Row k="Competitor" v={drawerLead.competitorWon} />}
                  {drawerLead.notes && (
                    <div className="pt-2">
                      <div className="text-xs text-muted-foreground mb-1">Notes</div>
                      <div className="whitespace-pre-wrap text-sm">{drawerLead.notes}</div>
                    </div>
                  )}
                  {canWrite && (
                    <Button className="mt-3" onClick={() => { openEdit(drawerLead); setDrawerLead(null); }}>Edit lead</Button>
                  )}
                </TabsContent>
                <TabsContent value="activities">
                  <ActivitiesPanel
                    leadId={drawerLead.id}
                    canWrite={canWrite && drawerLead.ownerId === user?.id}
                    onMutated={() => {
                      qc.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(drawerLead.id) });
                      qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
                    }}
                    createActivity={createActivity}
                    delActivity={delActivity}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Form */}
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
              <Select value={form.stage} onValueChange={(v) => setStage(v as LeadStage)}>
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
              <Label>Probability (%) <span className="text-[10px] text-muted-foreground">default for {form.stage}: {DEFAULT_PROB[form.stage]}%</span></Label>
              <Input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value, probabilityTouched: true })} />
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

      {/* Import CSV dialog */}
      <Dialog open={isImportOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportResult(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Leads from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                Required header: <code className="text-foreground">title</code>. Optional columns:{" "}
                <code className="text-foreground">contactName, contactEmail, contactPhone, prospectiveClientName, industry, source, estimatedValue, expectedCloseDate, notes</code>.
              </div>
              <div>
                Imported rows are created with stage <strong>NEW</strong> and probability 10%. Use dates in <code className="text-foreground">YYYY-MM-DD</code> format.
              </div>
              <button
                type="button"
                className="text-primary underline"
                onClick={() => {
                  const sample =
                    "title,contactName,contactEmail,contactPhone,prospectiveClientName,industry,source,estimatedValue,expectedCloseDate,notes\n" +
                    'Pentest Bank XYZ,Andi,andi@bankxyz.id,+62811000111,Bank XYZ,Finance,Referral,250000000,2026-08-31,"Web app pentest"\n';
                  const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "leads-template.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                data-testid="button-download-template"
              >
                Download CSV template
              </button>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Choose a CSV file</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setImportFileName(f.name);
                  const text = await f.text();
                  setImportCsv(text);
                  setImportResult(null);
                }}
                data-testid="input-import-file"
              />
              {importFileName && (
                <div className="text-[11px] text-muted-foreground mt-1">Selected: {importFileName}</div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Or paste CSV</Label>
              <Textarea
                rows={6}
                value={importCsv}
                onChange={(e) => { setImportCsv(e.target.value); setImportResult(null); }}
                placeholder="title,contactName,..."
                className="font-mono text-xs"
                data-testid="textarea-import-csv"
              />
            </div>
            {importResult && (
              <div className="rounded-md border border-border p-3 space-y-2 text-sm" data-testid="import-result">
                <div className="flex gap-4">
                  <div><span className="text-muted-foreground">Total rows:</span> <strong>{importResult.total}</strong></div>
                  <div className="text-emerald-500"><span className="text-muted-foreground">Created:</span> <strong>{importResult.created}</strong></div>
                  <div className={importResult.failed > 0 ? "text-destructive" : ""}>
                    <span className="text-muted-foreground">Failed:</span> <strong>{importResult.failed}</strong>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-40 overflow-auto">
                    <div className="text-xs font-medium text-destructive mb-1">Row errors</div>
                    <ul className="text-xs space-y-1">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-mono">Row {e.row}:</span> {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportResult(null); }}>
              {importResult && importResult.created > 0 ? "Close" : "Cancel"}
            </Button>
            <Button
              onClick={async () => {
                if (!importCsv.trim()) {
                  toast({ title: "Choose a file or paste CSV first", variant: "destructive" });
                  return;
                }
                try {
                  const r = await importLeads.mutateAsync({ data: { csv: importCsv } });
                  setImportResult(r);
                  qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
                  toast({
                    title: `Imported ${r.created} of ${r.total} leads`,
                    description: r.failed > 0 ? `${r.failed} row(s) failed validation.` : undefined,
                    variant: r.failed > 0 && r.created === 0 ? "destructive" : "default",
                  });
                } catch (e: any) {
                  toast({ title: "Import failed", description: e?.message, variant: "destructive" });
                }
              }}
              disabled={importLeads.isPending || !importCsv.trim()}
              data-testid="button-run-import"
            >
              {importLeads.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LOST dialog */}
      <Dialog open={!!lostLead} onOpenChange={(o) => !o && setLostLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Lead as Lost</DialogTitle>
          </DialogHeader>
          {lostLead && (
            <div className="space-y-3">
              <div className="text-sm font-medium">{lostLead.title}</div>
              <div>
                <Label>Reason *</Label>
                <Select value={lostReason} onValueChange={setLostReason}>
                  <SelectTrigger data-testid="select-lost-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Competitor (won the deal)</Label>
                <Input value={lostCompetitor} onChange={(e) => setLostCompetitor(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={2} value={lostNotes} onChange={(e) => setLostNotes(e.target.value)} placeholder="Optional context — will be appended to lead notes." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostLead(null)}>Cancel</Button>
            <Button onClick={confirmLost} disabled={update.isPending} data-testid="button-confirm-lost">Mark Lost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert dialog */}
      <Dialog open={!!convertingLead} onOpenChange={(o) => !o && setConvertingLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Project (Won)</DialogTitle>
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
              {!convertingLead.clientId && (
                <div>
                  <Label>Client Name *</Label>
                  <Input value={convertClientName} onChange={(e) => setConvertClientName(e.target.value)} placeholder="New client to create" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A project will be created with DRAFT status. The lead will be marked WON and linked to this project.
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-xs text-muted-foreground w-28 shrink-0">{k}</div>
      <div className="text-sm">{v}</div>
    </div>
  );
}

function ActivitiesPanel({
  leadId, canWrite, onMutated, createActivity, delActivity,
}: {
  leadId: string;
  canWrite: boolean;
  onMutated: () => void;
  createActivity: ReturnType<typeof useCreateLeadActivity>;
  delActivity: ReturnType<typeof useDeleteLeadActivity>;
}) {
  const { data: activities, isLoading } = useListLeadActivities(leadId);
  const { toast } = useToast();
  const [type, setType] = useState<LeadActivityType>("CALL" as LeadActivityType);
  const [outcome, setOutcome] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextNote, setNextNote] = useState("");

  async function add() {
    if (!outcome.trim() && !nextNote.trim()) {
      toast({ title: "Add an outcome or next action", variant: "destructive" });
      return;
    }
    try {
      await createActivity.mutateAsync({
        id: leadId,
        data: {
          type,
          outcome: outcome || null,
          nextActionAt: nextDate || null,
          nextActionNote: nextNote || null,
        } as any,
      });
      setOutcome(""); setNextDate(""); setNextNote("");
      onMutated();
      toast({ title: "Activity added" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  }

  async function remove(a: LeadActivity) {
    if (!confirm("Delete this activity?")) return;
    try {
      await delActivity.mutateAsync({ id: leadId, activityId: a.id });
      onMutated();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 mt-2">
      {canWrite && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeadActivityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALL">Call</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="MEETING">Meeting</SelectItem>
                  <SelectItem value="NOTE">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Next action date</Label>
              <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Outcome</Label>
            <Textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What happened?" data-testid="input-activity-outcome" />
          </div>
          <div>
            <Label className="text-xs">Next action note</Label>
            <Input value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="Follow-up reminder" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={createActivity.isPending} data-testid="button-add-activity">
              <Plus className="h-3 w-3 mr-1" /> Log activity
            </Button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (activities ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No activities logged.</div>
      ) : (
        <div className="space-y-2">
          {(activities ?? []).map((a) => {
            const overdue = a.nextActionAt && new Date(a.nextActionAt) <= new Date();
            return (
              <div key={a.id} className="border rounded-md p-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(a.occurredAt).toLocaleString()}</span>
                  </div>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => remove(a)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                {a.outcome && <div className="mt-1 whitespace-pre-wrap">{a.outcome}</div>}
                {a.nextActionAt && (
                  <div className={`text-xs mt-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    Next action: {a.nextActionAt.slice(0, 10)} {overdue && "(overdue)"}
                    {a.nextActionNote && ` — ${a.nextActionNote}`}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">by {a.createdByName ?? "user"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
