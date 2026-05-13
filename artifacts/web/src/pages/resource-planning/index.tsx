import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetResourcePlanning } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Grid3x3, ShieldAlert } from "lucide-react";

export default function ResourcePlanningPage() {
  const { user } = useAuth();
  const isPM = user?.role === "PROJECT_MANAGER" || user?.role === "MANAGEMENT";

  const today = new Date();
  const day = today.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const defaultStart = new Date(today);
  defaultStart.setDate(today.getDate() + monOffset);
  const defaultStartIso = defaultStart.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStartIso);
  const [weeks, setWeeks] = useState<number>(8);

  const { data, isLoading } = useGetResourcePlanning({ startDate, weeks });

  const weekHeaders = useMemo(() => {
    if (!data?.weekStarts) return [];
    return data.weekStarts.map((iso) => {
      const d = new Date(iso);
      const m = d.toLocaleDateString("id-ID", { month: "short" });
      return { iso, label: `${d.getDate()} ${m}` };
    });
  }, [data]);

  if (!isPM) {
    return (
      <EmptyState
        title="Akses ditolak"
        description="Resource Planning hanya untuk Project Manager dan Management."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Resource Planning</h1>
        <p className="text-muted-foreground">
          Matrix alokasi mingguan per resource, dikelompokkan per Business Unit. Angka = total mandays planned dari semua project di minggu itu.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>Atur tanggal mulai (Senin) dan rentang minggu (1–26).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="rp-start">Mulai (Senin)</Label>
              <Input id="rp-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-planning-start" />
            </div>
            <div>
              <Label htmlFor="rp-weeks">Jumlah Minggu</Label>
              <Input
                id="rp-weeks"
                type="number"
                min={1}
                max={26}
                value={weeks}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setWeeks(Math.min(26, Math.max(1, Math.floor(v))));
                }}
                data-testid="input-planning-weeks"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => { setStartDate(defaultStartIso); setWeeks(8); }} data-testid="button-reset-planning">
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton columns={6} rows={5} />
      ) : !data?.groups?.length ? (
        <EmptyState
          title="Belum ada data alokasi"
          description="Belum ada resource planned pada rentang ini."
          icon={<Grid3x3 className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <div className="space-y-6">
          {data.groups.map((g) => (
            <Card key={g.businessUnitId ?? "_none"} className="border-border overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{g.businessUnitName}</span>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                    {g.rows.length} resource
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[200px]">Resource</th>
                      <th className="text-left p-2 min-w-[100px]">Seniority</th>
                      <th className="text-left p-2 min-w-[160px]">Skills</th>
                      {weekHeaders.map((w) => (
                        <th key={w.iso} className="text-right p-2 font-mono whitespace-nowrap">{w.label}</th>
                      ))}
                      <th className="text-right p-2 font-mono">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const total = r.cells.reduce((s, c) => s + (c.plannedMandays ?? 0), 0);
                      return (
                        <tr key={r.userId} className="border-t border-border/40 hover:bg-muted/20" data-testid={`row-planning-${r.userId}`}>
                          <td className="p-2 sticky left-0 bg-background font-medium">{r.userName}</td>
                          <td className="p-2 text-muted-foreground">{r.seniority ?? "—"}</td>
                          <td className="p-2 text-muted-foreground max-w-[220px]">
                            {r.skills && r.skills.length > 0 ? (
                              <div className="flex flex-wrap gap-0.5">
                                {r.skills.slice(0, 3).map((s) => (
                                  <Badge key={s} variant="outline" className="text-[9px] px-1 py-0 bg-muted/40">{s}</Badge>
                                ))}
                                {r.skills.length > 3 && <span className="text-[9px] text-muted-foreground">+{r.skills.length - 3}</span>}
                              </div>
                            ) : "—"}
                          </td>
                          {r.cells.map((c) => {
                            const v = c.plannedMandays ?? 0;
                            const tone =
                              v >= 6 ? "bg-destructive/30 text-destructive font-bold" :
                              v >= 4 ? "bg-amber-500/20 text-amber-300 font-semibold" :
                              v > 0 ? "bg-emerald-500/15 text-emerald-300" :
                              "text-muted-foreground/50";
                            const allocs = c.allocations ?? [];
                            const tooltip = allocs.length > 0
                              ? allocs.map((a) => `${a.projectName}: ${a.mandays}md`).join("\n")
                              : "Tidak ada alokasi";
                            return (
                              <td key={c.weekStart} className={`p-2 text-right font-mono ${tone}`} title={tooltip}>
                                {v > 0 ? v.toFixed(1) : "—"}
                              </td>
                            );
                          })}
                          <td className="p-2 text-right font-mono font-semibold border-l border-border/40">{total.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
