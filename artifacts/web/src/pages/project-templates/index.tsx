import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { useLocation } from "wouter";
import {
  useListProjectTemplates,
  useCreateProjectTemplate,
  useUpdateProjectTemplate,
  useDeleteProjectTemplate,
  useApplyProjectTemplate,
  useListBusinessUnits,
  useListClients,
  useListTaskTemplates,
  getListProjectTemplatesQueryKey,
  type ProjectTemplate,
  type ProjectTemplateResource,
  type ProjectTemplateMilestone,
  type ProjectTemplateRaidItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { LayoutTemplate, Plus, Pencil, Trash2, ShieldAlert, Rocket } from "lucide-react";
import { formatIDR } from "@/lib/format";

type DraftResource = ProjectTemplateResource & { _key: string };
type DraftMilestone = ProjectTemplateMilestone & { _key: string };
type DraftRaid = ProjectTemplateRaidItem & { _key: string };

const ROLE_OPTIONS = [
  "PROJECT_MANAGER",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "ADMIN_PROJECT",
  "PRINCIPAL_KONSULTAN",
  "OTHER",
];

const DEFAULT_RATES: Record<string, number> = {
  PROJECT_MANAGER: 2_500_000,
  KONSULTAN: 1_800_000,
  TECHNICAL_WRITER: 1_200_000,
  ADMIN_PROJECT: 900_000,
  PRINCIPAL_KONSULTAN: 3_500_000,
  OTHER: 1_500_000,
};

export default function ProjectTemplatesPage() {
  const { user } = useAuth();
  const isMgmt = isSuperAdmin(user?.role) || user?.role === "MANAGEMENT";
  const canApply =
    isSuperAdmin(user?.role) || ["MANAGEMENT", "PROJECT_MANAGER", "SALES"].includes(user?.role ?? "");
  const { data: templates, isLoading } = useListProjectTemplates();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [applyTarget, setApplyTarget] = useState<ProjectTemplate | null>(null);

  if (!canApply) {
    return (
      <EmptyState
        title="Access denied"
        description="Project Templates are only available to Management, Project Manager, and Sales."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Project Templates</h1>
          <p className="text-muted-foreground">
            Project blueprint with resource estimates, billing milestones, and standard RAID. Use it to create new DRAFT projects in seconds.
          </p>
        </div>
        {isMgmt && (
          <Button onClick={() => { setEditing(null); setEditOpen(true); }} data-testid="button-new-project-template">
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : !templates || templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description={isMgmt ? "Create the first template to speed up project intake." : "No templates have been created yet."}
          icon={<LayoutTemplate className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="border-border" data-testid={`project-template-${t.id}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{t.name}</CardTitle>
                    <CardDescription className="truncate">
                      {t.businessUnitName ? `${t.businessUnitName} • ` : ""}
                      {t.defaultDurationDays} days • {t.plannedMandays.toFixed(1)} mandays
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canApply && (
                      <Button size="sm" variant="default" onClick={() => setApplyTarget(t)} data-testid={`apply-template-${t.id}`}>
                        <Rocket className="h-3.5 w-3.5 mr-1" /> Use
                      </Button>
                    )}
                    {isMgmt && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setEditOpen(true); }} data-testid={`edit-project-template-${t.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteButton id={t.id} name={t.name} />
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Selling Price" value={formatIDR(t.estimatedContractValue)} />
                  <Stat label="Est. Cost" value={formatIDR(t.estimatedCost)} muted />
                  <Stat label="Est. Margin" value={
                    t.estimatedContractValue > 0
                      ? `${(((t.estimatedContractValue - t.estimatedCost) / t.estimatedContractValue) * 100).toFixed(1)}%`
                      : "-"
                  } />
                  <Stat label="Resources" value={`${t.resources.length} role`} />
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {t.resources.slice(0, 4).map((r) => (
                    <Badge key={r.id ?? r.role} variant="outline" className="text-[10px]">
                      {r.role.replace(/_/g, " ")} ×{r.count}
                    </Badge>
                  ))}
                  {t.milestones.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-muted/40">
                      {t.milestones.length} milestone
                    </Badge>
                  )}
                  {t.raidItems.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500">
                      {t.raidItems.length} RAID
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editOpen && (
        <TemplateDialog open={editOpen} onClose={() => setEditOpen(false)} editing={editing} />
      )}
      {applyTarget && (
        <ApplyDialog template={applyTarget} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={muted ? "font-mono text-muted-foreground" : "font-mono"}>{value}</div>
    </div>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useDeleteProjectTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template deleted" });
        qc.invalidateQueries({ queryKey: getListProjectTemplatesQueryKey() });
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to delete", description: e?.message }),
    },
  });
  return (
    <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete template "${name}"?`)) del.mutate({ id }); }}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

function withKeys<T>(arr: T[]): (T & { _key: string })[] {
  return arr.map((x, i) => ({ ...(x as any), _key: `${i}-${Math.random().toString(36).slice(2, 7)}` }));
}

function TemplateDialog({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: ProjectTemplate | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: bus } = useListBusinessUnits();
  const { data: taskTemplates } = useListTaskTemplates();

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [businessUnitId, setBusinessUnitId] = useState(editing?.businessUnitId ?? "");
  const [kind, setKind] = useState<"CLIENT" | "INTERNAL">((editing?.kind as any) ?? "CLIENT");
  const [defaultDurationDays, setDefaultDurationDays] = useState(String(editing?.defaultDurationDays ?? 30));
  const [estimatedContractValue, setEstimatedContractValue] = useState(String(editing?.estimatedContractValue ?? 0));
  const [vatPercent, setVatPercent] = useState(String(editing?.vatPercent ?? 11));
  const [contractValueIncludesVat, setIncludesVat] = useState(editing?.contractValueIncludesVat ?? true);
  const [taskTemplateId, setTaskTemplateId] = useState(editing?.taskTemplateId ?? "");
  const [resources, setResources] = useState<DraftResource[]>(
    withKeys(editing?.resources ?? [{ role: "KONSULTAN", count: 1, plannedMandays: 10, dailyRate: DEFAULT_RATES.KONSULTAN!, note: null }]) as DraftResource[],
  );
  const [milestones, setMilestones] = useState<DraftMilestone[]>(
    withKeys(editing?.milestones ?? [
      { name: "Down Payment 30%", percentage: 30, offsetDays: 0, order: 0 },
      { name: "Final payment 70%", percentage: 70, offsetDays: 30, order: 1 },
    ]) as DraftMilestone[],
  );
  const [raidItems, setRaidItems] = useState<DraftRaid[]>(
    withKeys(editing?.raidItems ?? []) as DraftRaid[],
  );

  const totals = useMemo(() => {
    let mandays = 0;
    let cost = 0;
    for (const r of resources) {
      mandays += (r.count || 1) * (r.plannedMandays || 0);
      cost += (r.count || 1) * (r.plannedMandays || 0) * (r.dailyRate || 0);
    }
    const revenue = Number(estimatedContractValue) || 0;
    const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
    return { mandays, cost, margin };
  }, [resources, estimatedContractValue]);

  const milestoneTotal = useMemo(() => milestones.reduce((s, m) => s + (m.percentage || 0), 0), [milestones]);

  const create = useCreateProjectTemplate({
    mutation: {
      onSuccess: () => { toast({ title: "Template created" }); qc.invalidateQueries({ queryKey: getListProjectTemplatesQueryKey() }); onClose(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to save", description: e?.message }),
    },
  });
  const update = useUpdateProjectTemplate({
    mutation: {
      onSuccess: () => { toast({ title: "Template updated" }); qc.invalidateQueries({ queryKey: getListProjectTemplatesQueryKey() }); onClose(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Update failed", description: e?.message }),
    },
  });

  const submit = () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Template name is required" });
      return;
    }
    const payload = {
      name: name.trim(),
      description: description || null,
      businessUnitId: businessUnitId || null,
      kind,
      defaultDurationDays: Number(defaultDurationDays) || 30,
      estimatedContractValue: Number(estimatedContractValue) || 0,
      vatPercent: Number(vatPercent) || 0,
      contractValueIncludesVat,
      taskTemplateId: taskTemplateId || null,
      resources: resources.map(({ _key, id: _id, ...r }) => r),
      milestones: milestones.map(({ _key, id: _id, ...m }) => m),
      raidItems: raidItems.map(({ _key, id: _id, ...r }) => r),
    };
    if (editing) update.mutate({ id: editing.id, data: payload as any });
    else create.mutate({ data: payload as any });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle>
          <DialogDescription>Define the full project blueprint with cost estimates, billing milestones, and standard RAID.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Template Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Standard Web Pentest" data-testid="input-pt-name" />
            </div>
            <div>
              <Label>Business Unit</Label>
              <Select value={businessUnitId || "__none"} onValueChange={(v) => setBusinessUnitId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— All BUs —</SelectItem>
                  {bus?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT">CLIENT</SelectItem>
                  <SelectItem value="INTERNAL">INTERNAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Duration (days)</Label>
              <Input type="number" min={1} value={defaultDurationDays} onChange={(e) => setDefaultDurationDays(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-3 gap-3 border border-border/60 rounded p-3 bg-muted/10">
            <div>
              <Label>Selling Price (Revenue) IDR</Label>
              <Input type="number" min={0} value={estimatedContractValue} onChange={(e) => setEstimatedContractValue(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label>VAT (%)</Label>
              <Input type="number" min={0} max={100} value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={contractValueIncludesVat} onChange={(e) => setIncludesVat(e.target.checked)} />
                Price includes VAT
              </label>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Resource Plan ({resources.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() =>
                setResources([...resources, { _key: Math.random().toString(36), role: "KONSULTAN", count: 1, plannedMandays: 5, dailyRate: DEFAULT_RATES.KONSULTAN!, note: null }])
              }>
                <Plus className="h-3 w-3 mr-1" /> Add Role
              </Button>
            </div>
            <div className="space-y-2">
              {resources.map((r, i) => (
                <div key={r._key} className="grid grid-cols-12 gap-2 items-center border border-border/60 rounded p-2 bg-muted/10">
                  <Select value={r.role} onValueChange={(v) => {
                    const copy = [...resources]; copy[i] = { ...r, role: v, dailyRate: r.dailyRate || DEFAULT_RATES[v] || 0 }; setResources(copy);
                  }}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="col-span-1" type="number" min={1} value={r.count} title="People count"
                    onChange={(e) => { const c = [...resources]; c[i] = { ...r, count: Number(e.target.value) || 1 }; setResources(c); }} />
                  <Input className="col-span-2" type="number" min={0} step={0.5} value={r.plannedMandays} title="Mandays per person"
                    onChange={(e) => { const c = [...resources]; c[i] = { ...r, plannedMandays: Number(e.target.value) || 0 }; setResources(c); }} />
                  <Input className="col-span-3 font-mono text-xs" type="number" min={0} value={r.dailyRate} title="Daily rate (IDR)"
                    onChange={(e) => { const c = [...resources]; c[i] = { ...r, dailyRate: Number(e.target.value) || 0 }; setResources(c); }} />
                  <div className="col-span-2 text-xs text-right font-mono text-muted-foreground">
                    {formatIDR(r.count * r.plannedMandays * r.dailyRate)}
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="col-span-1"
                    onClick={() => setResources(resources.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 p-3 border border-primary/30 rounded bg-primary/5">
              <div><div className="text-[10px] uppercase text-muted-foreground">Total Mandays</div><div className="font-mono">{totals.mandays.toFixed(1)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Estimated Cost</div><div className="font-mono">{formatIDR(totals.cost)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Estimated Margin</div><div className={`font-mono font-bold ${totals.margin >= 30 ? "text-emerald-500" : totals.margin >= 15 ? "text-amber-500" : "text-red-500"}`}>{totals.margin.toFixed(1)}%</div></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Billing Milestones ({milestones.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() =>
                setMilestones([...milestones, { _key: Math.random().toString(36), name: "Milestone", percentage: 0, offsetDays: 0, order: milestones.length }])
              }>
                <Plus className="h-3 w-3 mr-1" /> Add Milestone
              </Button>
            </div>
            <div className="space-y-2">
              {milestones.map((m, i) => (
                <div key={m._key} className="grid grid-cols-12 gap-2 items-center border border-border/60 rounded p-2 bg-muted/10">
                  <Input className="col-span-5" placeholder="Milestone name" value={m.name}
                    onChange={(e) => { const c = [...milestones]; c[i] = { ...m, name: e.target.value }; setMilestones(c); }} />
                  <Input className="col-span-2" type="number" min={0} max={100} value={m.percentage} title="%"
                    onChange={(e) => { const c = [...milestones]; c[i] = { ...m, percentage: Number(e.target.value) || 0 }; setMilestones(c); }} />
                  <Input className="col-span-2" type="number" min={0} value={m.offsetDays} title="Offset days from start"
                    onChange={(e) => { const c = [...milestones]; c[i] = { ...m, offsetDays: Number(e.target.value) || 0 }; setMilestones(c); }} />
                  <div className="col-span-2 text-xs text-right font-mono text-muted-foreground">
                    {formatIDR((Number(estimatedContractValue) || 0) * (m.percentage / 100))}
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="col-span-1"
                    onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <p className={`text-xs mt-1 ${Math.abs(milestoneTotal - 100) < 0.1 ? "text-emerald-500" : "text-amber-500"}`}>
              Total: {milestoneTotal.toFixed(1)}% {Math.abs(milestoneTotal - 100) < 0.1 ? "✓" : "(should be 100%)"}
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Standard RAID ({raidItems.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() =>
                setRaidItems([...raidItems, { _key: Math.random().toString(36), type: "RISK", title: "", description: null, impact: "MEDIUM", likelihood: "MEDIUM", mitigation: null }])
              }>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {raidItems.map((r, i) => (
                <div key={r._key} className="grid grid-cols-12 gap-2 items-start border border-border/60 rounded p-2 bg-muted/10">
                  <Select value={r.type} onValueChange={(v) => { const c = [...raidItems]; c[i] = { ...r, type: v as any }; setRaidItems(c); }}>
                    <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RISK">RISK</SelectItem>
                      <SelectItem value="ASSUMPTION">ASSUMPTION</SelectItem>
                      <SelectItem value="ISSUE">ISSUE</SelectItem>
                      <SelectItem value="DEPENDENCY">DEPENDENCY</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="col-span-6" placeholder="Title" value={r.title}
                    onChange={(e) => { const c = [...raidItems]; c[i] = { ...r, title: e.target.value }; setRaidItems(c); }} />
                  <Select value={r.impact ?? "MEDIUM"} onValueChange={(v) => { const c = [...raidItems]; c[i] = { ...r, impact: v as any }; setRaidItems(c); }}>
                    <SelectTrigger className="col-span-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">LOW</SelectItem>
                      <SelectItem value="MEDIUM">MED</SelectItem>
                      <SelectItem value="HIGH">HIGH</SelectItem>
                      <SelectItem value="CRITICAL">CRIT</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={r.likelihood ?? "MEDIUM"} onValueChange={(v) => { const c = [...raidItems]; c[i] = { ...r, likelihood: v as any }; setRaidItems(c); }}>
                    <SelectTrigger className="col-span-2 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">LOW</SelectItem>
                      <SelectItem value="MEDIUM">MED</SelectItem>
                      <SelectItem value="HIGH">HIGH</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" size="icon" variant="ghost" className="col-span-1"
                    onClick={() => setRaidItems(raidItems.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Link Task Template (optional)</Label>
            <Select value={taskTemplateId || "__none"} onValueChange={(v) => setTaskTemplateId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {taskTemplates?.map((tt) => <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">PM can apply it manually from the Tasks tab after the project is created.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {editing ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDialog({ template, onClose }: { template: ProjectTemplate; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: clients } = useListClients();
  const [code, setCode] = useState("");
  const [name, setName] = useState(template.name);
  const [clientId, setClientId] = useState("");
  const [contractValue, setContractValue] = useState(String(template.estimatedContractValue));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const apply = useApplyProjectTemplate({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: "Project created from template", description: "You will be redirected to the project page." });
        qc.invalidateQueries({ queryKey: getListProjectTemplatesQueryKey() });
        onClose();
        if (data?.projectId) setLocation(`/projects/${data.projectId}`);
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed to apply template", description: e?.message }),
    },
  });

  const submit = () => {
    if (!code.trim() || !name.trim() || !clientId) {
      toast({ variant: "destructive", title: "SPK, Name, and Client are required" });
      return;
    }
    apply.mutate({
      id: template.id,
      data: {
        code: code.trim(),
        name: name.trim(),
        clientId,
        contractValue: Number(contractValue) || 0,
        startDate,
      },
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Use Template: {template.name}</DialogTitle>
          <DialogDescription>
            A DRAFT project will be created with {template.milestones.length} billing milestones and {template.raidItems.length} RAID items from the template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>SPK / PO Number *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Example: SPK-2026-001" data-testid="input-apply-code" />
          </div>
          <div>
            <Label>Project Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-apply-name" />
          </div>
          <div>
            <Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contract Value (IDR)</Label>
              <Input type="number" min={0} value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/40">
            Estimated cost: <span className="font-mono">{formatIDR(template.estimatedCost)}</span> ·
            Planned mandays: <span className="font-mono">{template.plannedMandays.toFixed(1)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={apply.isPending} data-testid="button-confirm-apply">
            {apply.isPending ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
