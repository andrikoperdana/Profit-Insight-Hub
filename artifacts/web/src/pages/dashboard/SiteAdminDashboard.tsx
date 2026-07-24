import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, ScrollText, ChevronRight, Shield, UserPlus } from "lucide-react";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import {
  useListUsers,
  useListAccessRequests,
  useApproveAccessRequest,
  useRejectAccessRequest,
  useListBusinessUnits,
  getListAccessRequestsQueryKey,
  getListUsersQueryKey,
  UserRole,
  type AccessRequest,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { RoleLabels } from "@/lib/roles";

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

const NONE = "__none__";

const SENIORITY_OPTIONS = [
  { value: "JUNIOR", label: "Junior" },
  { value: "MID", label: "Mid" },
  { value: "SENIOR", label: "Senior" },
  { value: "PRINCIPAL", label: "Principal" },
];

// SUPER_ADMIN is seed-only and deliberately never assignable from the UI.
const ASSIGNABLE_ROLES = Object.values(UserRole).filter((r) => r !== UserRole.SUPER_ADMIN);

function ApproveDialog({
  request,
  onClose,
}: {
  request: AccessRequest;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: businessUnits } = useListBusinessUnits();
  const [name, setName] = useState(request.name);
  const [role, setRole] = useState<string>("");
  const [title, setTitle] = useState("");
  const [seniority, setSeniority] = useState<string>(NONE);
  const [businessUnitId, setBusinessUnitId] = useState<string>(NONE);

  const approveMutation = useApproveAccessRequest({
    mutation: {
      onSuccess: (user) => {
        queryClient.invalidateQueries({ queryKey: getListAccessRequestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({
          title: "Access approved",
          description: `${user.name} can now sign in with Google.`,
        });
        onClose();
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Approval failed",
          description: error?.message || "Please try again.",
        });
      },
    },
  });

  const submit = () => {
    if (!role) {
      toast({ variant: "destructive", title: "Role is required" });
      return;
    }
    approveMutation.mutate({
      id: request.id,
      data: {
        role: role as UserRole,
        name: name.trim() || undefined,
        title: title.trim() || undefined,
        seniority: seniority === NONE ? undefined : (seniority as any),
        businessUnitId: businessUnitId === NONE ? undefined : businessUnitId,
      },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve access request</DialogTitle>
          <DialogDescription>
            Creates a user account for {request.email}. They will sign in with Google.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ar-name">Name</Label>
            <Input
              id="ar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-approve-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-approve-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{RoleLabels[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ar-title">Title (optional)</Label>
            <Input
              id="ar-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Security Consultant"
              data-testid="input-approve-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Seniority</Label>
              <Select value={seniority} onValueChange={setSeniority}>
                <SelectTrigger data-testid="select-approve-seniority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {SENIORITY_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Business Unit</Label>
              <Select value={businessUnitId} onValueChange={setBusinessUnitId}>
                <SelectTrigger data-testid="select-approve-bu">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(businessUnits ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={approveMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={approveMutation.isPending}
            data-testid="button-confirm-approve"
          >
            {approveMutation.isPending ? "Approving…" : "Approve & Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessRequestsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: requests } = useListAccessRequests({ status: "PENDING" });
  const [approving, setApproving] = useState<AccessRequest | null>(null);

  const rejectMutation = useRejectAccessRequest({
    mutation: {
      onSuccess: (ar) => {
        queryClient.invalidateQueries({ queryKey: getListAccessRequestsQueryKey() });
        toast({ title: "Request rejected", description: `${ar.email} was denied access.` });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Rejection failed",
          description: error?.message || "Please try again.",
        });
      },
    },
  });

  const pending = requests ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-primary" />
            Access Requests
          </CardTitle>
          <CardDescription>
            Google sign-in requests awaiting your approval
          </CardDescription>
        </div>
        {pending.length > 0 && (
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground"
            data-testid="badge-pending-count"
          >
            {pending.length}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-requests">
            No pending requests.
          </p>
        ) : (
          <div className="divide-y">
            {pending.map((ar) => (
              <div
                key={ar.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
                data-testid={`row-access-request-${ar.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{ar.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ar.email} · requested {formatDistanceToNow(new Date(ar.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setApproving(ar)}
                    data-testid={`button-approve-${ar.id}`}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate({ id: ar.id })}
                    data-testid={`button-reject-${ar.id}`}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {approving && (
        <ApproveDialog request={approving} onClose={() => setApproving(null)} />
      )}
    </Card>
  );
}

export default function SiteAdminDashboard() {
  const { data: users } = useListUsers();
  const { data: audit } = useQuery<AuditResp>({
    queryKey: ["site-admin-recent-audit"],
    queryFn: () => customFetch<AuditResp>("/api/audit-logs?page=1&pageSize=8"),
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

      <AccessRequestsCard />

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
