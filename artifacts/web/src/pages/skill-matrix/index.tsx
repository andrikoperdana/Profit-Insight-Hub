import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetSkillMatrix } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Award, AlertTriangle, ShieldAlert } from "lucide-react";

export default function SkillMatrixPage() {
  const { user } = useAuth();
  const canView = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";
  const { data, isLoading } = useGetSkillMatrix();
  const [filter, setFilter] = useState("");

  const filteredSkills = useMemo(() => {
    if (!data?.skills) return [];
    const q = filter.toLowerCase().trim();
    if (!q) return data.skills;
    return data.skills.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q),
    );
  }, [data, filter]);

  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.cells?.forEach((c) => m.set(`${c.skillId}::${c.userId}`, c.proficiency));
    return m;
  }, [data]);

  const gapMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["gaps"][number]>();
    data?.gaps?.forEach((g) => m.set(g.skillId, g));
    return m;
  }, [data]);

  const gapsOnly = useMemo(() => data?.gaps?.filter((g) => g.isGap) ?? [], [data]);

  if (!canView) {
    return (
      <EmptyState
        title="Access denied"
        description="Skill Matrix is only available to Management & Project Manager."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Skill Matrix &amp; Gap Analysis</h1>
        <p className="text-muted-foreground">
          Skill coverage across all consultants &amp; technical writers. Cells show proficiency level 1–5.
        </p>
      </div>

      {gapsOnly.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {gapsOnly.length} Skill Gaps detected
            </CardTitle>
            <CardDescription>Skills at risk (no holders / only 1 person / no Senior).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gapsOnly.map((g) => (
                <div key={g.skillId} className="rounded border border-amber-500/20 bg-background/40 p-2 text-xs" data-testid={`gap-${g.skillId}`}>
                  <div className="font-semibold text-amber-200">{g.skillName}</div>
                  <div className="text-muted-foreground">{g.gapReason}</div>
                  <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
                    <span>Total: {g.totalCount}</span>
                    <span>•</span>
                    <span>Sr+Principal: {g.seniorCount + g.principalCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4" /> Skill × People Matrix</CardTitle>
            <CardDescription>Number = proficiency level (1=basic, 5=expert). Empty cell = not yet acquired.</CardDescription>
          </div>
          <Input placeholder="Search skill / category…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" data-testid="input-skill-filter" />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4"><TableSkeleton columns={8} rows={6} /></div>
          ) : !data || data.users.length === 0 ? (
            <EmptyState
              title="No data yet"
              description="No active consultant/TW to map."
              icon={<Award className="h-10 w-10 text-muted-foreground/50" />}
            />
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-muted/40 min-w-[220px]">Skill</th>
                  <th className="text-left p-2 min-w-[60px]">Gap</th>
                  {data.users.map((u) => (
                    <th key={u.userId} className="text-center p-2 min-w-[80px]" title={`${u.userName} (${u.seniority ?? "—"})`}>
                      <div className="text-[10px] font-medium truncate max-w-[80px] mx-auto">{u.userName.split(" ")[0]}</div>
                      <div className="text-[9px] text-muted-foreground font-normal">{u.seniority ?? "—"}</div>
                    </th>
                  ))}
                  <th className="text-right p-2 font-mono">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkills.map((s) => {
                  const gap = gapMap.get(s.id);
                  return (
                    <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20" data-testid={`row-skill-${s.id}`}>
                      <td className="p-2 sticky left-0 bg-background">
                        <div className="font-medium">{s.name}</div>
                        {s.category && <div className="text-[10px] text-muted-foreground">{s.category}</div>}
                      </td>
                      <td className="p-2">
                        {gap?.isGap && (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]" title={gap.gapReason ?? ""}>
                            GAP
                          </Badge>
                        )}
                      </td>
                      {data.users.map((u) => {
                        const p = cellMap.get(`${s.id}::${u.userId}`);
                        const tone =
                          p == null ? "bg-muted/10 text-muted-foreground/30" :
                          p >= 4 ? "bg-emerald-500/25 text-emerald-200 font-semibold" :
                          p === 3 ? "bg-emerald-500/15 text-emerald-300" :
                          "bg-amber-500/10 text-amber-300";
                        return (
                          <td key={u.userId} className={`p-2 text-center font-mono ${tone}`}>
                            {p ?? "—"}
                          </td>
                        );
                      })}
                      <td className="p-2 text-right font-mono">
                        {gap?.totalCount ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
