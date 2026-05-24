import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetMe, customFetch } from "@workspace/api-client-react";
import { RoleLabels } from "@/lib/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingPage } from "@/components/common/Loading";
import { Calendar, Copy, RefreshCw, Check, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CalendarFeedCard() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const resp = await customFetch<{ token: string }>("/api/calendar/token");
      setToken(resp.token);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? "Unable to create token", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async () => {
    setLoading(true);
    try {
      const resp = await customFetch<{ token: string }>("/api/calendar/regenerate", { method: "POST" });
      setToken(resp.token);
      toast({ title: "URL updated", description: "The previous URL has been automatically invalidated." });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? "Unable to regenerate", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = token ? `${origin}/api/calendar/ics?token=${token}` : "";

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "URL copied", description: "Paste it into Google/Outlook/Apple Calendar." });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> Calendar Feed (ICS)
        </CardTitle>
        <CardDescription>
          Subscribe so project deadlines, assigned tasks, and billing milestones appear automatically in
          Google Calendar / Outlook / Apple Calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!token ? (
          <Button onClick={generate} disabled={loading}>
            <Calendar className="h-4 w-4 mr-2" />
            {loading ? "Creating URL..." : "Create Subscribe URL"}
          </Button>
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono text-xs" data-testid="ics-url" />
              <Button variant="outline" onClick={copy} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" onClick={regenerate} disabled={loading} className="shrink-0" title="Regenerate – immediately invalidates the previous URL">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Google Calendar:</strong> Other calendars → From URL → paste the link above.</p>
              <p><strong>Outlook:</strong> Add calendar → Subscribe from web → paste link.</p>
              <p><strong>Apple Calendar:</strong> File → New Calendar Subscription → paste link.</p>
              <p className="pt-1">The URL is valid for 365 days. Do not share it with anyone — anyone with this URL can view your agenda.</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "New password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "New password and confirmation must be identical.", variant: "destructive" });
      return;
    }
    if (newPassword === currentPassword) {
      toast({ title: "Choose a different password", description: "New password must differ from the current one.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await customFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast({ title: "Password updated", description: "Use the new password on your next login." });
      reset();
    } catch (e: any) {
      toast({
        title: "Failed to change password",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" /> Change Password
        </CardTitle>
        <CardDescription>
          Update your account password. Minimum 8 characters. You will stay signed in on this device after the change.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4 max-w-md" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              data-testid="input-confirm-password"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || !currentPassword || !newPassword || !confirmPassword} data-testid="button-change-password">
              {submitting ? "Updating…" : "Update Password"}
            </Button>
            {(currentPassword || newPassword || confirmPassword) && (
              <Button type="button" variant="ghost" onClick={reset} disabled={submitting}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useGetMe({
    query: { enabled: !!user, queryKey: ["me"] }
  });

  if (isLoading || !profile) return <LoadingPage />;

  const initials = profile.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your personal details and role assignment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-xl font-medium">{profile.name}</h3>
              <p className="text-muted-foreground">{profile.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Role</p>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-sm">
                {RoleLabels[profile.role]}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Job Title</p>
              <p className="font-medium">{profile.title || "Not specified"}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Account Status</p>
              <div className="flex items-center">
                <div className={`h-2 w-2 rounded-full mr-2 ${profile.isActive ? "bg-primary" : "bg-destructive"}`} />
                <p className="font-medium">{profile.isActive ? "Active" : "Inactive"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordCard />

      <CalendarFeedCard />
    </div>
  );
}
