import { useState } from "react";
import {
  useListProjectRaidItems,
  useCreateProjectRaidItem,
  useUpdateRaidItem,
  useDeleteRaidItem,
  useListActiveAllUsers,
  getListProjectRaidItemsQueryKey,
  type ProjectRaidItem,
  type RaidType,
  type RaidImpact,
  type RaidLikelihood,
  type RaidStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, AlertTriangle, ShieldAlert, HelpCircle, Link2, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";

type RaidProject = { id: string; pmId?: string | null };

const TYPE_LABELS: Record<RaidType, string> = {
  RISK: "Risk",
  ASSUMPTION: "Assumption",
  ISSUE: "Issue",
  DEPENDENCY: "Dependency",
};

const TYPE_ICONS: Record<RaidType, React.ComponentType<{ className?: string }>> = {
  RISK: ShieldAlert,
  ASSUMPTION: HelpCircle,
  ISSUE: AlertTriangle,
  DEPENDENCY: Link2,
};

const IMPACT_COLORS: Record<RaidImpact, string> = {
  LOW: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  MEDIUM: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/40",
};

const STATUS_COLORS: Record<RaidStatus, string> = {
  OPEN: "bg-red-500/15 text-red-400 border-red-500/40",
  MITIGATING: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  CLOSED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

type FormState = {
  type: RaidType;
  title: string;
  description: string;
  impact: RaidImpact;
  likelihood: RaidLikelihood;
  status: RaidStatus;
  ownerId: string;
  mitigation: string;
  dueDate: string;
};

const EMPTY_FORM: FormState = {
  type: "RISK",
  title: "",
  description: "",
  impact: "MEDIUM",
  likelihood: "MEDIUM",
  status: "OPEN",
  ownerId: "__none__",
  mitigation: "",
  dueDate: "",
};

export default function RaidTab({ projectId, project }: { projectId: string; project: RaidProject }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useListProjectRaidItems(projectId);
  const canFetchUsers = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";
  const { data: usersResp } = useListActiveAllUsers(
    canFetchUsers ? undefined : { query: { enabled: false, queryKey: ["active-all-users-disabled"] } },
  );
  const users = Array.isArray(usersResp) ? usersResp : [];

  const canEdit =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user.id);

  const create = useCreateProjectRaidItem();
  const update = useUpdateRaidItem();
  const del = useDeleteRaidItem();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRaidItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(item: ProjectRaidItem) {
    setEditing(item);
    setForm({
      type: item.type,
      title: item.title,
      description: item.description ?? "",
      impact: item.impact,
      likelihood: item.likelihood,
      status: item.status,
      ownerId: item.ownerId ?? "__none__",
      mitigation: item.mitigation ?? "",
      dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const data = {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      impact: form.impact,
      likelihood: form.likelihood,
      status: form.status,
      ownerId: form.ownerId === "__none__" ? null : form.ownerId,
      mitigation: form.mitigation.trim() || null,
      dueDate: form.dueDate || null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ itemId: editing.id, data });
      } else {
        await create.mutateAsync({ id: projectId, data });
      }
      qc.invalidateQueries({ queryKey: getListProjectRaidItemsQueryKey(projectId) });
      setDialogOpen(false);
      toast({ title: editing ? "RAID item updated" : "RAID item added" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(item: ProjectRaidItem) {
    if (!confirm(`Delete item "${item.title}"?`)) return;
    try {
      await del.mutateAsync({ itemId: item.id });
      qc.invalidateQueries({ queryKey: getListProjectRaidItemsQueryKey(projectId) });
      toast({ title: "RAID item deleted" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  const grouped: Record<RaidType, ProjectRaidItem[]> = {
    RISK: [], ASSUMPTION: [], ISSUE: [], DEPENDENCY: [],
  };
  for (const it of items) grouped[it.type].push(it);

  const summary = {
    open: items.filter((i) => i.status === "OPEN").length,
    mitigating: items.filter((i) => i.status === "MITIGATING").length,
    closed: items.filter((i) => i.status === "CLOSED").length,
    critical: items.filter((i) => i.impact === "CRITICAL" && i.status !== "CLOSED").length,
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">RAID Log</h3>
          <p className="text-sm text-muted-foreground">
            Risks, Assumptions, Issues, Dependencies — audit trail for the project.
          </p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="button-add-raid">
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "Add"} RAID Item</DialogTitle>
                <DialogDescription>
                  Record a risk, assumption, issue, or dependency for the project.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm((s) => ({ ...s, type: v as RaidType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["RISK", "ASSUMPTION", "ISSUE", "DEPENDENCY"] as RaidType[]).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((s) => ({ ...s, status: v as RaidStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="MITIGATING">Mitigating</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Impact</Label>
                  <Select value={form.impact} onValueChange={(v) => setForm((s) => ({ ...s, impact: v as RaidImpact }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Likelihood</Label>
                  <Select value={form.likelihood} onValueChange={(v) => setForm((s) => ({ ...s, likelihood: v as RaidLikelihood }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Owner</Label>
                  <Select value={form.ownerId} onValueChange={(v) => setForm((s) => ({ ...s, ownerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="(unassigned)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No Owner —</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Mitigation / Action</Label>
                  <Textarea
                    rows={2}
                    value={form.mitigation}
                    onChange={(e) => setForm((s) => ({ ...s, mitigation: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
                  {editing ? "Save" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open", value: summary.open, color: "text-red-400" },
          { label: "Mitigating", value: summary.mitigating, color: "text-amber-400" },
          { label: "Closed", value: summary.closed, color: "text-emerald-400" },
          { label: "Critical (active)", value: summary.critical, color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-2xl font-semibold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-12 w-12 text-muted-foreground/50" />}
          title="No RAID items yet"
          description={canEdit ? "Start recording risks / assumptions / issues / dependencies for the project." : "The PM has not recorded any RAID items yet."}
        />
      ) : (
        (Object.keys(grouped) as RaidType[]).map((type) => {
          const list = grouped[type];
          if (list.length === 0) return null;
          const Icon = TYPE_ICONS[type];
          return (
            <Card key={type}>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4" /> {TYPE_LABELS[type]} ({list.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.map((item) => (
                  <div
                    key={item.id}
                    data-testid={`raid-row-${item.id}`}
                    className="border border-border rounded-md p-3 flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={STATUS_COLORS[item.status]}>{item.status}</Badge>
                        <Badge variant="outline" className={IMPACT_COLORS[item.impact]}>{item.impact}</Badge>
                        <Badge variant="outline">L:{item.likelihood}</Badge>
                      </div>
                    </div>
                    {item.mitigation && (
                      <div className="text-sm border-l-2 border-amber-500/40 pl-2 text-muted-foreground">
                        <span className="text-amber-400 font-medium">Mitigation:</span> {item.mitigation}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-3">
                        <span>Owner: <b className="text-foreground">{item.ownerName ?? "—"}</b></span>
                        {item.dueDate && <span>Due: <b className="text-foreground">{formatDate(item.dueDate)}</b></span>}
                        <span>Created by {item.createdByName ?? "—"} · {formatDate(item.createdAt)}</span>
                        {item.closedAt && <span>Closed: {formatDate(item.closedAt)}</span>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(item)}
                            data-testid={`button-edit-raid-${item.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(item)}
                            data-testid={`button-delete-raid-${item.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
