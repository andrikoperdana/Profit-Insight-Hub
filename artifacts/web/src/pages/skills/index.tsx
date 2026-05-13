import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { canManageUsers } from "@/lib/roles";
import {
  useListSkills,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  getListSkillsQueryKey,
  type Skill,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Plus, Pencil, Trash2, ShieldAlert, Award } from "lucide-react";

export default function SkillsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: skills, isLoading } = useListSkills();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListSkillsQueryKey() });

  const createM = useCreateSkill({
    mutation: {
      onSuccess: () => { toast({ title: "Skill ditambahkan" }); setCreateOpen(false); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e?.message }),
    },
  });
  const updateM = useUpdateSkill({
    mutation: {
      onSuccess: () => { toast({ title: "Skill diperbarui" }); setEditing(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e?.message }),
    },
  });
  const deleteM = useDeleteSkill({
    mutation: {
      onSuccess: () => { toast({ title: "Skill dihapus" }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e?.message }),
    },
  });

  if (!canManageUsers(user?.role)) {
    return (
      <EmptyState
        title="Akses ditolak"
        description="Hanya Site Admin yang dapat mengelola skill catalog."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skill Catalog</h1>
          <p className="text-muted-foreground">
            Daftar skill yang dapat dipasang ke profil resource (mis. Web Pentest, ISO Audit, DFIR).
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-skill"><Plus className="h-4 w-4 mr-2" /> Skill Baru</Button>
          </DialogTrigger>
          <SkillFormDialog
            title="Tambah Skill"
            onSubmit={(data) => createM.mutate({ data })}
            isPending={createM.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <TableSkeleton columns={4} rows={6} />
      ) : !skills?.length ? (
        <EmptyState
          title="Belum ada skill"
          description="Tambahkan skill pertama untuk mulai memetakan kompetensi tim."
          icon={<Award className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <Card className="overflow-hidden border-border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Nama Skill</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Pemilik</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right w-[120px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((s) => (
                <TableRow key={s.id} data-testid={`row-skill-${s.id}`}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.category ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{s.userCount ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={s.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                      {s.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(s)} data-testid={`button-edit-skill-${s.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Hapus skill "${s.name}"?`)) deleteM.mutate({ id: s.id });
                      }}
                      data-testid={`button-delete-skill-${s.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <SkillFormDialog
            title="Edit Skill"
            initial={editing}
            onSubmit={(data) => updateM.mutate({ id: editing.id, data })}
            isPending={updateM.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

function SkillFormDialog({
  title, initial, onSubmit, isPending,
}: {
  title: string;
  initial?: Skill;
  onSubmit: (data: { name: string; category?: string | null; isActive?: boolean }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  return (
    <DialogContent className="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Kategori opsional (mis. "Pentest", "Compliance", "Forensics").</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <Label>Nama *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Web Pentest" data-testid="input-skill-name" />
        </div>
        <div>
          <Label>Kategori</Label>
          <Input value={category ?? ""} onChange={(e) => setCategory(e.target.value)} placeholder="Pentest" data-testid="input-skill-category" />
        </div>
        {initial && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Aktif
          </label>
        )}
      </div>
      <DialogFooter>
        <Button
          disabled={!name.trim() || isPending}
          onClick={() => onSubmit({ name: name.trim(), category: category?.trim() || null, ...(initial ? { isActive } : {}) })}
          data-testid="button-save-skill"
        >
          {isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
