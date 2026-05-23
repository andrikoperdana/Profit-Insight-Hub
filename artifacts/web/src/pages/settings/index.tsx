import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetMe, customFetch } from "@workspace/api-client-react";
import { RoleLabels } from "@/lib/roles";
import { formatIDR } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingPage } from "@/components/common/Loading";
import { Calendar, Copy, RefreshCw, Check } from "lucide-react";
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

            {(profile.role === "KONSULTAN" || profile.role === "TECHNICAL_WRITER" || profile.role === "PROJECT_MANAGER") && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Daily Rate</p>
                <p className="font-medium font-mono">{formatIDR(profile.dailyRate)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CalendarFeedCard />
    </div>
  );
}
