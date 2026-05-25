import { useState } from "react";
import { Link } from "wouter";
import {
  useListPerformanceReviews,
  useCreatePerformanceReview,
  useListUsers,
  type PerformanceReview,
  type PerformanceReviewPeriod,
  type PerformanceReviewStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Star, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";
import { RoleLabels } from "@/lib/roles";

const STATUS_COLORS: Record<PerformanceReviewStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  SUBMITTED: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  ACKNOWLEDGED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

const PERIODS: PerformanceReviewPeriod[] = ["Q1", "Q2", "Q3", "Q4", "ANNUAL"];

export default function PerformanceReviewsListPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "MANAGEMENT" || user?.role === "HR";

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear()));

  const params: Record<string, string | number> = {};
  if (statusFilter !== "__all__") params.status = statusFilter;
  if (yearFilter) params.year = Number(yearFilter);

  const { data: reviews = [], isLoading, refetch } = useListPerformanceReviews(params);
  const { data: usersResp } = useListUsers(
    isAdmin ? undefined : { query: { enabled: false, queryKey: ["users-disabled"] } },
  );
  const allUsers = Array.isArray(usersResp) ? usersResp : [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newPeriod, setNewPeriod] = useState<PerformanceReviewPeriod>("ANNUAL");
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));

  const create = useCreatePerformanceReview();

  async function handleCreate() {
    if (!newUserId) { toast({ title: "Pilih karyawan", variant: "destructive" }); return; }
    try {
      await create.mutateAsync({
        data: {
          userId: newUserId,
          period: newPeriod,
          periodYear: Number(newYear),
        },
      });
      toast({ title: "Review dibuat" });
      setDialogOpen(false);
      setNewUserId("");
      await refetch();
    } catch (err) {
      toast({
        title: "Gagal membuat review",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Performance Reviews</h1>
          <p className="text-sm text-muted-foreground">
            Quarterly/annual review siklus — terhubung ke skill matrix &amp; billable hours per proyek.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tahun</Label>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-review"><Plus className="mr-2 h-4 w-4" /> Review Baru</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Buat Performance Review</DialogTitle>
                <DialogDescription>
                  {isAdmin
                    ? "Pilih karyawan dan periode."
                    : "Anda dapat membuat review untuk direct report / supervisee Anda."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Karyawan</Label>
                  <Select value={newUserId} onValueChange={setNewUserId}>
                    <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} · {(RoleLabels as Record<string, string>)[u.role] ?? u.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Periode</Label>
                    <Select value={newPeriod} onValueChange={(v) => setNewPeriod(v as PerformanceReviewPeriod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PERIODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tahun</Label>
                    <Select value={newYear} onValueChange={setNewYear}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
                <Button onClick={handleCreate} disabled={create.isPending}>Buat</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Review</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : reviews.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-12 w-12 text-muted-foreground/50" />}
              title="Belum ada review"
              description="Klik 'Review Baru' untuk membuat siklus pertama."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Tanggal Submit</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((r: PerformanceReview) => (
                  <TableRow key={r.id} data-testid={`review-row-${r.id}`}>
                    <TableCell>
                      <div className="font-medium">{r.userName ?? r.userId}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.userRole ? (RoleLabels as Record<string, string>)[r.userRole] ?? r.userRole : ""}
                      </div>
                    </TableCell>
                    <TableCell>{r.period} {r.periodYear}</TableCell>
                    <TableCell>{r.reviewerName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.overallRating ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          {r.overallRating}/5
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.submittedAt ? formatDate(r.submittedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/performance-reviews/${r.id}`}>
                        <Button variant="outline" size="sm">Buka</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
