import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useListSkillDevelopmentGoals,
  useCreateSkillDevelopmentGoal,
  useUpdateSkillDevelopmentGoal,
  useDeleteSkillDevelopmentGoal,
  useListSkillProgressionLogs,
  useLogSkillProgression,
  useListSkills,
  useListUsers,
  getListSkillDevelopmentGoalsQueryKey,
  getListSkillProgressionLogsQueryKey,
  type SkillDevelopmentGoal,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Plus, Trash2, CheckCircle2, Pause, Play, History, Target } from "lucide-react";

const PRIVILEGED = ["MANAGEMENT", "HR", "SITE_ADMIN"];

export default function SkillDevelopmentPage() {
  const { user } = useAuth();
  const isPrivileged = PRIVILEGED.includes(user?.role ?? "");
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id ?? "");
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const { data: users } = useListUsers({ query: { enabled: isPrivileged, queryKey: ["users-skill-dev"] } });
  const { data: goals, isLoading } = useListSkillDevelopmentGoals({
    userId: selectedUserId || undefined,
  });
  const { data: logs } = useListSkillProgressionLogs({ userId: selectedUserId || undefined });

  const goalsList = goals ?? [];
  const active = goalsList.filter((g) => g.status === "ACTIVE");
  const completed = goalsList.filter((g) => g.status === "COMPLETED");
  const paused = goalsList.filter((g) => g.status === "PAUSED");

  const completionRate = goalsList.length > 0
    ? Math.round((completed.length / goalsList.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skill Development Tracker</h1>
          <p className="text-muted-foreground">
            Pantau target peningkatan skill dan riwayat progression untuk pengembangan kompetensi.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLogOpen(true)}>
            <TrendingUp className="h-4 w-4 mr-2" /> Catat Progression
          </Button>
          <Button onClick={() => setNewGoalOpen(true)} data-testid="button-new-goal">
            <Plus className="h-4 w-4 mr-2" /> Goal Baru
          </Button>
        </div>
      </div>

      {isPrivileged && (
        <div className="flex items-center gap-3 max-w-md">
          <Label className="shrink-0 text-xs">Lihat untuk:</Label>
          <Select value={selectedUserId || "__me"} onValueChange={(v) => setSelectedUserId(v === "__me" ? user?.id ?? "" : v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__me">Saya sendiri</SelectItem>
              <SelectItem value="__all">Semua karyawan</SelectItem>
              {users?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Goal Aktif" value={active.length} icon={Target} color="text-primary" />
        <StatCard label="Selesai" value={completed.length} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Paused" value={paused.length} icon={Pause} color="text-amber-500" />
        <StatCard label="Completion Rate" value={`${completionRate}%`} icon={TrendingUp} color="text-primary" />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Aktif ({active.length})</TabsTrigger>
          <TabsTrigger value="completed">Selesai ({completed.length})</TabsTrigger>
          <TabsTrigger value="paused">Paused ({paused.length})</TabsTrigger>
          <TabsTrigger value="history">Riwayat ({logs?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="pt-4">
          {isLoading ? <Loading /> : <GoalsList goals={active} selectedUserId={selectedUserId} />}
        </TabsContent>
        <TabsContent value="completed" className="pt-4">
          <GoalsList goals={completed} selectedUserId={selectedUserId} />
        </TabsContent>
        <TabsContent value="paused" className="pt-4">
          <GoalsList goals={paused} selectedUserId={selectedUserId} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <ProgressionHistory logs={logs ?? []} />
        </TabsContent>
      </Tabs>

      {newGoalOpen && <GoalDialog open={newGoalOpen} onClose={() => setNewGoalOpen(false)} subjectUserId={selectedUserId} />}
      {logOpen && <ProgressionDialog open={logOpen} onClose={() => setLogOpen(false)} subjectUserId={selectedUserId} />}
    </div>
  );
}

function Loading() { return <p className="text-sm text-muted-foreground">Loading…</p>; }

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <Card className="border-border">
      <CardContent className="pt-6 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${color}`} />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalsList({ goals, selectedUserId }: { goals: SkillDevelopmentGoal[]; selectedUserId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateSkillDevelopmentGoal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Goal diupdate" });
        qc.invalidateQueries({ queryKey: getListSkillDevelopmentGoalsQueryKey({ userId: selectedUserId || undefined }) });
      },
    },
  });
  const del = useDeleteSkillDevelopmentGoal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Goal dihapus" });
        qc.invalidateQueries({ queryKey: getListSkillDevelopmentGoalsQueryKey({ userId: selectedUserId || undefined }) });
      },
    },
  });

  if (goals.length === 0) {
    return <EmptyState title="Belum ada goal" description="Buat goal baru untuk mulai melacak pengembangan." icon={<Target className="h-10 w-10 text-muted-foreground/50" />} />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {goals.map((g) => {
        const pct = g.targetLevel > 0 ? Math.min(100, Math.round((g.currentLevel / g.targetLevel) * 100)) : 0;
        const overdue = g.targetDate && new Date(g.targetDate) < new Date() && g.status === "ACTIVE";
        return (
          <Card key={g.id} className="border-border" data-testid={`goal-${g.id}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{g.skillName}</CardTitle>
                  <CardDescription className="truncate">
                    {g.userName} • Lv {g.currentLevel} → {g.targetLevel}
                  </CardDescription>
                </div>
                <div className="flex gap-1 shrink-0">
                  {g.status === "ACTIVE" && (
                    <Button size="icon" variant="ghost" title="Pause" onClick={() => update.mutate({ id: g.id, data: { status: "PAUSED" } })}>
                      <Pause className="h-4 w-4" />
                    </Button>
                  )}
                  {g.status === "PAUSED" && (
                    <Button size="icon" variant="ghost" title="Lanjutkan" onClick={() => update.mutate({ id: g.id, data: { status: "ACTIVE" } })}>
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => {
                    if (confirm(`Hapus goal ${g.skillName}?`)) del.mutate({ id: g.id });
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
              <div className="flex justify-between items-center text-xs">
                {g.targetDate ? (
                  <span className={overdue ? "text-destructive" : "text-muted-foreground"}>
                    Target: {new Date(g.targetDate).toLocaleDateString("id-ID")} {overdue ? "(terlambat)" : ""}
                  </span>
                ) : <span className="text-muted-foreground">Tanpa deadline</span>}
                <Badge variant={g.status === "COMPLETED" ? "default" : "outline"} className="text-[10px]">
                  {g.status}
                </Badge>
              </div>
              {g.notes && <p className="text-xs text-muted-foreground italic">"{g.notes}"</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ProgressionHistory({ logs }: { logs: any[] }) {
  if (logs.length === 0) {
    return <EmptyState title="Belum ada riwayat" description="Riwayat perubahan skill akan tampil di sini." icon={<History className="h-10 w-10 text-muted-foreground/50" />} />;
  }
  return (
    <Card className="border-border">
      <CardContent className="pt-4">
        <ul className="divide-y divide-border">
          {logs.map((l) => (
            <li key={l.id} className="py-3 flex items-center gap-3">
              <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-medium">{l.userName}</span> — {l.skillName}{" "}
                  <Badge variant="outline" className="text-[10px] ml-1">
                    Lv {l.fromLevel ?? "–"} → {l.toLevel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(l.createdAt).toLocaleString("id-ID")} • dicatat oleh {l.changedByName ?? "—"}
                  {l.note && ` — ${l.note}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GoalDialog({ open, onClose, subjectUserId }: { open: boolean; onClose: () => void; subjectUserId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isPrivileged = PRIVILEGED.includes(user?.role ?? "");
  const { data: skills } = useListSkills();
  const { data: users } = useListUsers({ query: { enabled: isPrivileged, queryKey: ["users-skill-dev"] } });

  const [userId, setUserId] = useState(subjectUserId || user?.id || "");
  const [skillId, setSkillId] = useState("");
  const [currentLevel, setCurrentLevel] = useState("1");
  const [targetLevel, setTargetLevel] = useState("3");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");

  const create = useCreateSkillDevelopmentGoal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Goal dibuat" });
        qc.invalidateQueries({ queryKey: getListSkillDevelopmentGoalsQueryKey({ userId: subjectUserId || undefined }) });
        onClose();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e?.message }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Goal Baru</DialogTitle>
          <DialogDescription>Tentukan target level skill dan deadline pencapaian.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {isPrivileged && (
            <div>
              <Label>Untuk Karyawan</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                <SelectContent>
                  {users?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Skill *</Label>
            <Select value={skillId} onValueChange={setSkillId}>
              <SelectTrigger><SelectValue placeholder="Pilih skill" /></SelectTrigger>
              <SelectContent>
                {skills?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Level Saat Ini (1-5)</Label>
              <Input type="number" min={1} max={5} value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)} />
            </div>
            <div>
              <Label>Target Level (1-5)</Label>
              <Input type="number" min={1} max={5} value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Target Date</Label>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div>
            <Label>Catatan (opsional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={create.isPending}
            onClick={() => {
              if (!skillId) { toast({ variant: "destructive", title: "Pilih skill" }); return; }
              create.mutate({
                data: {
                  userId: isPrivileged ? userId : undefined,
                  skillId,
                  currentLevel: Number(currentLevel),
                  targetLevel: Number(targetLevel),
                  targetDate: targetDate || null,
                  notes: notes || null,
                },
              });
            }}
          >Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressionDialog({ open, onClose, subjectUserId }: { open: boolean; onClose: () => void; subjectUserId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isPrivileged = PRIVILEGED.includes(user?.role ?? "");
  const { data: skills } = useListSkills();
  const { data: users } = useListUsers({ query: { enabled: isPrivileged, queryKey: ["users-skill-dev"] } });

  const [userId, setUserId] = useState(subjectUserId || user?.id || "");
  const [skillId, setSkillId] = useState("");
  const [toLevel, setToLevel] = useState("3");
  const [note, setNote] = useState("");

  const log = useLogSkillProgression({
    mutation: {
      onSuccess: () => {
        toast({ title: "Progression dicatat" });
        qc.invalidateQueries({ queryKey: getListSkillProgressionLogsQueryKey({ userId: subjectUserId || undefined }) });
        qc.invalidateQueries({ queryKey: getListSkillDevelopmentGoalsQueryKey({ userId: subjectUserId || undefined }) });
        onClose();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e?.message }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat Progression Skill</DialogTitle>
          <DialogDescription>Update level skill. Jika ada goal aktif yang mencapai target, otomatis ditandai selesai.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {isPrivileged && (
            <div>
              <Label>Karyawan</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {users?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Skill *</Label>
            <Select value={skillId} onValueChange={setSkillId}>
              <SelectTrigger><SelectValue placeholder="Pilih skill" /></SelectTrigger>
              <SelectContent>
                {skills?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Level Baru (1-5)</Label>
            <Input type="number" min={1} max={5} value={toLevel} onChange={(e) => setToLevel(e.target.value)} />
          </div>
          <div>
            <Label>Catatan</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Contoh: lulus sertifikasi OSCP" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={log.isPending}
            onClick={() => {
              if (!skillId) { toast({ variant: "destructive", title: "Pilih skill" }); return; }
              log.mutate({
                data: {
                  userId: isPrivileged ? userId : undefined,
                  skillId,
                  toLevel: Number(toLevel),
                  note: note || null,
                },
              });
            }}
          >Catat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
