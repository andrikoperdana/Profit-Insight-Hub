import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  useGetMe,
  customFetch,
  type User,
  useGetXeroStatus,
  getGetXeroStatusQueryKey,
  useGetXeroConnectUrl,
  useDisconnectXero,
  useSyncXeroPayments,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { RoleLabels } from "@/lib/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingPage } from "@/components/common/Loading";
import { Calendar, Copy, RefreshCw, Check, KeyRound, Upload, Trash2, Link2, Unlink, Loader2, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AVATAR_MAX_BYTES = 300 * 1024;

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function AvatarBlock({ profile }: { profile: User }) {
  const { toast } = useToast();
  const { updateUser, user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const initials = profile.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  const onPick = () => fileRef.current?.click();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      toast({ title: "Unsupported file", description: "Please choose a PNG, JPEG, WebP, or GIF image.", variant: "destructive" });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast({
        title: "Image too large",
        description: `Max ${Math.round(AVATAR_MAX_BYTES / 1024)} KB. Your file is ${(file.size / 1024).toFixed(0)} KB.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const updated = await customFetch<User>("/api/auth/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (user) updateUser({ ...user, avatarDataUrl: updated.avatarDataUrl });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Photo updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      const updated = await customFetch<User>("/api/auth/avatar", { method: "DELETE" });
      if (user) updateUser({ ...user, avatarDataUrl: updated.avatarDataUrl });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Photo removed" });
    } catch (err: any) {
      toast({ title: "Failed to remove photo", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <Avatar className="h-20 w-20 border-2 border-border">
        {profile.avatarDataUrl ? <AvatarImage src={profile.avatarDataUrl} alt={profile.name} /> : null}
        <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <h3 className="text-xl font-medium">{profile.name}</h3>
        <p className="text-muted-foreground">{profile.email}</p>
        <div className="flex items-center gap-2 mt-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onChange}
            data-testid="input-avatar-file"
          />
          <Button type="button" size="sm" variant="outline" onClick={onPick} disabled={busy} data-testid="button-upload-avatar">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {profile.avatarDataUrl ? "Change Photo" : "Upload Photo"}
          </Button>
          {profile.avatarDataUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={busy} data-testid="button-remove-avatar">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Optional · PNG/JPEG/WebP/GIF · max {Math.round(AVATAR_MAX_BYTES / 1024)} KB
          </span>
        </div>
      </div>
    </div>
  );
}

function XeroIntegrationCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: status, isLoading } = useGetXeroStatus({
    query: { queryKey: getGetXeroStatusQueryKey() },
  });

  const connectUrl = useGetXeroConnectUrl({
    mutation: {
      onSuccess: (res) => {
        // The app may run inside the Replit preview iframe. Xero's login page
        // refuses to be framed, so navigate the top-level window to break out
        // of the iframe; fall back to a new tab if cross-origin top access is
        // blocked. In production (no iframe) this is just a normal navigation.
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = res.url;
          } else {
            window.location.href = res.url;
          }
        } catch {
          window.open(res.url, "_blank", "noopener");
        }
      },
      onError: (e: any) =>
        toast({ title: "Could not start Xero connection", description: e?.message, variant: "destructive" }),
    },
  });

  const disconnect = useDisconnectXero({
    mutation: {
      onSuccess: () => {
        toast({ title: "Xero disconnected" });
        qc.invalidateQueries({ queryKey: getGetXeroStatusQueryKey() });
      },
      onError: (e: any) =>
        toast({ title: "Disconnect failed", description: e?.message, variant: "destructive" }),
    },
  });

  const syncPayments = useSyncXeroPayments({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Payment sync complete",
          description: `Checked ${res.checked} invoice(s), marked ${res.updated} as paid.`,
        });
      },
      onError: (e: any) =>
        toast({ title: "Payment sync failed", description: e?.message, variant: "destructive" }),
    },
  });

  const connected = !!status?.connected;
  const configured = status?.configured ?? false;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Xero Accounting
        </CardTitle>
        <CardDescription>
          Connect Xero to push billing milestones as sales invoices, sync clients to Xero contacts,
          and pull payment status back into the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading connection status…</p>
        ) : !configured ? (
          <p className="text-sm text-muted-foreground">
            Xero is not configured on the server. Add the Xero credentials to enable this integration.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              <div>
                <p className="font-medium">
                  {connected ? `Connected${status?.tenantName ? ` — ${status.tenantName}` : ""}` : "Not connected"}
                </p>
                {connected && status?.connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Since {new Date(status.connectedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {connected ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => syncPayments.mutate()}
                    disabled={syncPayments.isPending}
                  >
                    {syncPayments.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Payments
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Disconnect the Xero integration?")) disconnect.mutate();
                    }}
                    disabled={disconnect.isPending}
                  >
                    {disconnect.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={() => connectUrl.mutate()} disabled={connectUrl.isPending}>
                  {connectUrl.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-2" />
                  )}
                  Connect to Xero
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AppSettingsShape {
  defaultVatPercent: number;
  timesheetBackdateDays: number;
  lowMarginPct: number;
  budgetOverrunPct: number;
  invoiceDueSoonDays: number;
  lateTimesheetDays: number;
}

function BusinessRulesCard() {
  const { toast } = useToast();
  const [vat, setVat] = useState("");
  const [days, setDays] = useState("");
  const [lowMargin, setLowMargin] = useState("");
  const [budgetOverrun, setBudgetOverrun] = useState("");
  const [invoiceDueSoon, setInvoiceDueSoon] = useState("");
  const [lateTimesheet, setLateTimesheet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await customFetch<AppSettingsShape>("/api/app-settings");
        if (!active) return;
        setVat(String(s.defaultVatPercent));
        setDays(String(s.timesheetBackdateDays));
        setLowMargin(String(s.lowMarginPct));
        setBudgetOverrun(String(s.budgetOverrunPct));
        setInvoiceDueSoon(String(s.invoiceDueSoonDays));
        setLateTimesheet(String(s.lateTimesheetDays));
      } catch (e: any) {
        if (active) toast({ title: "Failed to load business rules", description: e?.message, variant: "destructive" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const vatNum = Number(vat);
    const daysNum = Number(days);
    const lowMarginNum = Number(lowMargin);
    const budgetOverrunNum = Number(budgetOverrun);
    const invoiceDueSoonNum = Number(invoiceDueSoon);
    const lateTimesheetNum = Number(lateTimesheet);
    if (!Number.isFinite(vatNum) || vatNum < 0 || vatNum > 100) {
      toast({ title: "Invalid VAT", description: "Default VAT must be between 0 and 100.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(daysNum) || daysNum < 0 || daysNum > 60) {
      toast({ title: "Invalid limit", description: "Timesheet backdate days must be a whole number between 0 and 60.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(lowMarginNum) || lowMarginNum < 0 || lowMarginNum > 100) {
      toast({ title: "Invalid threshold", description: "Low-margin alert must be between 0 and 100.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(budgetOverrunNum) || budgetOverrunNum < 0 || budgetOverrunNum > 100) {
      toast({ title: "Invalid threshold", description: "Budget overrun alert must be between 0 and 100.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(invoiceDueSoonNum) || invoiceDueSoonNum < 1 || invoiceDueSoonNum > 90) {
      toast({ title: "Invalid window", description: "Invoice due-soon window must be a whole number between 1 and 90.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(lateTimesheetNum) || lateTimesheetNum < 1 || lateTimesheetNum > 30) {
      toast({ title: "Invalid window", description: "Late timesheet window must be a whole number between 1 and 30.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await customFetch("/api/app-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defaultVatPercent: vatNum,
          timesheetBackdateDays: daysNum,
          lowMarginPct: lowMarginNum,
          budgetOverrunPct: budgetOverrunNum,
          invoiceDueSoonDays: invoiceDueSoonNum,
          lateTimesheetDays: lateTimesheetNum,
        }),
      });
      toast({ title: "Business rules saved", description: "New defaults and alert thresholds apply going forward." });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" /> Business Rules
        </CardTitle>
        <CardDescription>
          Configure organisation-wide defaults and alert thresholds. Defaults apply to new projects
          and timesheet entries; the alert thresholds drive the in-app notification checks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form className="space-y-6 max-w-md" onSubmit={save}>
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Defaults</p>
              <div className="space-y-1.5">
                <Label htmlFor="default-vat">Default VAT (%)</Label>
                <Input
                  id="default-vat"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  data-testid="input-default-vat"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timesheet-days">Timesheet backdate limit (working days)</Label>
                <Input
                  id="timesheet-days"
                  type="number"
                  min={0}
                  max={60}
                  step="1"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  data-testid="input-timesheet-days"
                />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notification alert thresholds</p>
              <div className="space-y-1.5">
                <Label htmlFor="low-margin">Low-margin alert when margin below (%)</Label>
                <Input
                  id="low-margin"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={lowMargin}
                  onChange={(e) => setLowMargin(e.target.value)}
                  data-testid="input-low-margin"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget-overrun">Budget overrun alert when cost above (% of contract)</Label>
                <Input
                  id="budget-overrun"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={budgetOverrun}
                  onChange={(e) => setBudgetOverrun(e.target.value)}
                  data-testid="input-budget-overrun"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-due-soon">Invoice due-soon window (days)</Label>
                <Input
                  id="invoice-due-soon"
                  type="number"
                  min={1}
                  max={90}
                  step="1"
                  value={invoiceDueSoon}
                  onChange={(e) => setInvoiceDueSoon(e.target.value)}
                  data-testid="input-invoice-due-soon"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="late-timesheet">Late timesheet window (days)</Label>
                <Input
                  id="late-timesheet"
                  type="number"
                  min={1}
                  max={30}
                  step="1"
                  value={lateTimesheet}
                  onChange={(e) => setLateTimesheet(e.target.value)}
                  data-testid="input-late-timesheet"
                />
              </div>
            </div>

            <Button type="submit" disabled={saving} data-testid="button-save-business-rules">
              {saving ? "Saving…" : "Save Business Rules"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading } = useGetMe({
    query: { enabled: !!user, queryKey: ["me"] }
  });

  const canManageXero = user?.role === "MANAGEMENT" || user?.role === "FINANCE";
  const canManageBusinessRules = user?.role === "MANAGEMENT";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xero = params.get("xero");
    if (xero === "connected") {
      toast({ title: "Xero connected", description: "Your Xero organisation is now linked." });
    } else if (xero === "error") {
      toast({ title: "Xero connection failed", description: "Please try connecting again.", variant: "destructive" });
    }
    if (xero) {
      params.delete("xero");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, [toast]);

  if (isLoading || !profile) return <LoadingPage />;

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
          <AvatarBlock profile={profile} />

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

      {canManageBusinessRules && <BusinessRulesCard />}

      {canManageXero && <XeroIntegrationCard />}

      <ChangePasswordCard />

      <CalendarFeedCard />
    </div>
  );
}
