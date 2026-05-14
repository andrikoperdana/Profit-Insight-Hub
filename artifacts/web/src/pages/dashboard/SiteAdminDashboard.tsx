import { Link } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ScrollText, ChevronRight, Shield, Database, Loader2 } from "lucide-react";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { useListUsers } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface SeedResponse {
  ok: boolean;
  created: { users: number; billingMilestones: number; expenses: number; timesheets: number };
  totals: { users: number; milestones: number; expenses: number; timesheets: number };
}

interface AuditLogItem {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  description: string;
  createdAt: string;
}
interface AuditResp {
  items: AuditLogItem[];
  total: number;
}

export default function SiteAdminDashboard() {
  const { data: users } = useListUsers();
  const { data: audit } = useQuery<AuditResp>({
    queryKey: ["site-admin-recent-audit"],
    queryFn: () => customFetch<AuditResp>("/api/audit-logs?page=1&pageSize=8"),
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lastSeed, setLastSeed] = useState<SeedResponse["created"] | null>(null);

  const seedMutation = useMutation<SeedResponse, Error, void>({
    mutationFn: () =>
      customFetch<SeedResponse>("/api/admin/seed-sample-data", { method: "POST" }),
    onSuccess: (data) => {
      setLastSeed(data.created);
      const c = data.created;
      const total = c.users + c.billingMilestones + c.expenses + c.timesheets;
      toast({
        title: total === 0 ? "Sample data already present" : "Sample data created",
        description:
          total === 0
            ? "Nothing was added — sample data already exists for all reports."
            : `Added: ${c.users} user(s), ${c.billingMilestones} billing milestone(s), ${c.expenses} expense(s), ${c.timesheets} timesheet(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["site-admin-recent-audit"] });
    },
    onError: (err) => {
      toast({
        title: "Seed failed",
        description: err.message || "Could not seed sample data.",
        variant: "destructive",
      });
    },
  });

  const activeUsers = (users ?? []).filter((u) => u.isActive).length;
  const totalUsers = (users ?? []).length;

  return (
    <div className="space-y-6">
      <WelcomeBanner />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                Users
              </CardTitle>
              <CardDescription>Manage accounts, roles, and supervisors</CardDescription>
            </div>
            <Shield className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-3xl font-bold">{activeUsers}</p>
                <p className="text-xs text-muted-foreground">Active users ({totalUsers} total)</p>
              </div>
            </div>
            <Link href="/users">
              <Button className="w-full" data-testid="link-manage-users">
                Manage Users <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScrollText className="h-5 w-5 text-primary" />
                Audit Log
              </CardTitle>
              <CardDescription>Inspect every change across the platform</CardDescription>
            </div>
            <Shield className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-3xl font-bold">{audit?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total recorded events</p>
              </div>
            </div>
            <Link href="/audit-logs">
              <Button className="w-full" data-testid="link-open-audit-log">
                Open Audit Log <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-primary" />
              Seed Sample Report Data
            </CardTitle>
            <CardDescription>
              Populate billing milestones, expenses, and timesheets so all 10 reports show meaningful results. Idempotent — safe to run multiple times.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-sample-data"
          >
            {seedMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Seeding…</>
            ) : (
              <>Run Sample Data Seed</>
            )}
          </Button>
          {lastSeed && (
            <div className="mt-3 text-xs text-muted-foreground">
              Last run added: {lastSeed.users} user(s), {lastSeed.billingMilestones} milestone(s), {lastSeed.expenses} expense(s), {lastSeed.timesheets} timesheet(s).
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <CardDescription>Latest 8 events from the audit log</CardDescription>
        </CardHeader>
        <CardContent>
          {!audit ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : audit.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="divide-y">
              {audit.items.map((a) => (
                <div key={a.id} className="py-2.5 flex items-start justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{a.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.userName} · {a.action}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
