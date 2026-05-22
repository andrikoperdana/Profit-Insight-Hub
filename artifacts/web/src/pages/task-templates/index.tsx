import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListTaskTemplates,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
  useListBusinessUnits,
  getListTaskTemplatesQueryKey,
  type TaskTemplate,
  type TaskTemplateItem,
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
import { ListChecks, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";

export default function TaskTemplatesPage() {
  const { user } = useAuth();
  const isMgmt = user?.role === "MANAGEMENT";
  const { data: templates, isLoading } = useListTaskTemplates();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);

  if (user?.role !== "MANAGEMENT" && user?.role !== "PROJECT_MANAGER") {
    return (
      <EmptyState
        title="Akses ditolak"
        description="Task Templates hanya tersedia untuk Management & Project Manager."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Task Templates</h1>
          <p className="text-muted-foreground">
            Template Work Breakdown Structure (WBS) yang bisa diterapkan ke project baru sekali klik.
          </p>
        </div>
        {isMgmt && (
          <Button onClick={() => { setEditing(null); setOpen(true); }} data-testid="button-new-template">
            <Plus className="h-4 w-4 mr-2" /> Template Baru
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Memuat…</div>
      ) : !templates || templates.length === 0 ? (
        <EmptyState
          title="Belum ada template"
          description={isMgmt ? "Buat template pertama untuk mempercepat setup project." : "Belum ada template yang dibuat."}
          icon={<ListChecks className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="border-border" data-testid={`template-${t.id}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <CardDescription>
                      {t.businessUnitName ? `${t.businessUnitName} • ` : ""}{t.tasks.length} task
                    </CardDescription>
                  </div>
                  {isMgmt && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }} data-testid={`edit-template-${t.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton id={t.id} name={t.name} />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {t.description && <p className="text-xs text-muted-foreground mb-2">{t.description}</p>}
                <div className="space-y-1">
                  {t.tasks.slice(0, 6).map((task, i) => (
                    <div key={i} className="text-xs flex items-center gap-2" style={{ paddingLeft: `${(task.parentIndex != null ? 1 : 0) * 12}px` }}>
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span className="flex-1">{task.title}</span>
                      {task.durationDays && (
                        <Badge variant="outline" className="text-[10px] bg-muted/40">{task.durationDays}d</Badge>
                      )}
                    </div>
                  ))}
                  {t.tasks.length > 6 && <div className="text-[10px] text-muted-foreground">+{t.tasks.length - 6} lagi…</div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <TemplateDialog open={open} onClose={() => setOpen(false)} editing={editing} />
      )}
    </div>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useDeleteTaskTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template dihapus" });
        qc.invalidateQueries({ queryKey: getListTaskTemplatesQueryKey() });
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal hapus", description: e?.message }),
    },
  });
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        if (confirm(`Hapus template "${name}"?`)) del.mutate({ id });
      }}
      data-testid={`delete-template-${id}`}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

function TemplateDialog({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: TaskTemplate | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: bus } = useListBusinessUnits();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [businessUnitId, setBusinessUnitId] = useState(editing?.businessUnitId ?? "");
  const [tasks, setTasks] = useState<TaskTemplateItem[]>(
    editing?.tasks ?? [{ title: "", description: "", durationDays: 5, offsetDays: 0, billable: true, parentIndex: null }],
  );

  const create = useCreateTaskTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template dibuat" });
        qc.invalidateQueries({ queryKey: getListTaskTemplatesQueryKey() });
        onClose();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal simpan", description: e?.message }),
    },
  });
  const update = useUpdateTaskTemplate({
    mutation: {
      onSuccess: () => {
        toast({ title: "Template diupdate" });
        qc.invalidateQueries({ queryKey: getListTaskTemplatesQueryKey() });
        onClose();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal update", description: e?.message }),
    },
  });

  const submit = () => {
    const cleaned = tasks.filter((t) => t.title.trim());
    if (!name.trim() || cleaned.length === 0) {
      toast({ variant: "destructive", title: "Nama dan minimal 1 task wajib diisi" });
      return;
    }
    const payload = {
      name: name.trim(),
      description: description || null,
      businessUnitId: businessUnitId || null,
      tasks: cleaned,
    };
    if (editing) update.mutate({ id: editing.id, data: payload });
    else create.mutate({ data: payload });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Template" : "Template Baru"}</DialogTitle>
          <DialogDescription>Definisikan task-task standar yang otomatis dibuat saat template diterapkan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nama Template *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Pentest Web Standar" data-testid="input-template-name" />
            </div>
            <div>
              <Label>Business Unit</Label>
              <Select value={businessUnitId || "__none"} onValueChange={(v) => setBusinessUnitId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opsional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Semua BU —</SelectItem>
                  {bus?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Deskripsi</Label>
            <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Daftar Task ({tasks.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setTasks([...tasks, { title: "", durationDays: 3, offsetDays: 0, billable: true, parentIndex: null }])}>
                <Plus className="h-3 w-3 mr-1" /> Tambah Task
              </Button>
            </div>
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <div key={i} className="flex gap-2 items-start border border-border/60 rounded p-2 bg-muted/10">
                  <span className="text-xs text-muted-foreground w-6 pt-2">{i + 1}.</span>
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <Input className="col-span-5" placeholder="Judul task" value={t.title} onChange={(e) => {
                      const copy = [...tasks]; copy[i] = { ...t, title: e.target.value }; setTasks(copy);
                    }} data-testid={`input-task-title-${i}`} />
                    <Input className="col-span-2" type="number" min={1} placeholder="Hari" value={t.durationDays ?? ""} onChange={(e) => {
                      const copy = [...tasks]; copy[i] = { ...t, durationDays: e.target.value ? Number(e.target.value) : null }; setTasks(copy);
                    }} />
                    <Input className="col-span-2" type="number" min={0} placeholder="Offset" value={t.offsetDays ?? 0} onChange={(e) => {
                      const copy = [...tasks]; copy[i] = { ...t, offsetDays: Number(e.target.value) || 0 }; setTasks(copy);
                    }} />
                    <Select
                      value={t.parentIndex == null ? "__root" : String(t.parentIndex)}
                      onValueChange={(v) => {
                        const copy = [...tasks];
                        copy[i] = { ...t, parentIndex: v === "__root" ? null : Number(v) };
                        setTasks(copy);
                      }}
                    >
                      <SelectTrigger className="col-span-3 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__root">— Top-level —</SelectItem>
                        {tasks.slice(0, i).map((p, pi) => (
                          <SelectItem key={pi} value={String(pi)}>{pi + 1}. {p.title || "(belum diisi)"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setTasks(tasks.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Hari = durasi. Offset = berapa hari setelah project start. Parent = task induk untuk WBS.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending} data-testid="button-save-template">
            {editing ? "Update" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
