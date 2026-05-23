import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { RoleLabels } from "@/lib/roles";

type Item = {
  id: string;
  userId: string | null;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  createdAt: string;
};
type Resp = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  filters: { actions: string[]; users: { id: string; name: string }[] };
};

function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action.endsWith(".deleted") || action.endsWith(".rejected")) return "destructive";
  if (action.endsWith(".created") || action.endsWith(".approved")) return "default";
  if (action.endsWith(".updated")) return "secondary";
  return "outline";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityTab({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const pageSize = 30;

  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (actionFilter !== "all") qs.set("action", actionFilter);
  if (userFilter !== "all") qs.set("userId", userFilter);
  if (from) qs.set("from", new Date(from).toISOString());
  if (to) {
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    qs.set("to", t.toISOString());
  }

  const { data, isLoading } = useQuery<Resp>({
    queryKey: ["project-activity", projectId, qs.toString()],
    queryFn: () => customFetch<Resp>(`/api/projects/${projectId}/activity?${qs.toString()}`),
    staleTime: 15_000,
  });

  if (isLoading || !data) return <LoadingPage />;

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Project Audit Trail
          </CardTitle>
          <CardDescription>
            History of changes on this project — who, when, and what was changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">User</label>
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {data.filters.users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Action</label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {data.filters.actions.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">From date</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To date</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
          </div>

          {data.items.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-8 w-8" />}
              title="No activity yet"
              description="No changes have been recorded on this project yet."
            />
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">User</th>
                    <th className="p-2 font-medium">Action</th>
                    <th className="p-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="p-2 whitespace-nowrap text-muted-foreground">{formatDateTime(it.createdAt)}</td>
                      <td className="p-2 whitespace-nowrap">
                        <div className="font-medium">{it.userName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {RoleLabels[it.userRole as keyof typeof RoleLabels] ?? it.userRole}
                        </div>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <Badge variant={actionBadgeVariant(it.action)}>{it.action}</Badge>
                      </td>
                      <td className="p-2">{it.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              {data.total} entries · page {data.page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
