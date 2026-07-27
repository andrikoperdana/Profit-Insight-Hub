import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  useGetAiWeeklyDigest,
  useGenerateAiWeeklyDigest,
  getGetAiWeeklyDigestQueryKey,
} from "@workspace/api-client-react";
import type { Notification, AiWeeklyDigestHighlight } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  AlertTriangle,
  AlertCircle,
  Info,
  Sparkles,
  RefreshCw,
  ArrowRight,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Severity = "CRITICAL" | "WARNING" | "INFO";

// Deterministic mapping: alert severity comes from the notification type, not
// from the AI (rule notifications themselves contain no AI text either).
const TYPE_SEVERITY: Record<string, Severity> = {
  LOW_MARGIN: "CRITICAL",
  PROJECT_OVERRUN: "CRITICAL",
  INVOICE_DUE_SOON: "WARNING",
  TIMESHEET_LATE: "WARNING",
  TIMESHEET_LATE_REPORT: "WARNING",
  PROJECT_DELAYED: "WARNING",
  "timesheet.rejected": "WARNING",
  "expense.rejected": "WARNING",
};

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; badge: string; dot: string; label: string }> = {
  CRITICAL: {
    icon: AlertCircle,
    badge: "bg-destructive/10 text-destructive border-destructive/30",
    dot: "text-destructive",
    label: "Critical",
  },
  WARNING: {
    icon: AlertTriangle,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    dot: "text-amber-500",
    label: "Warning",
  },
  INFO: {
    icon: Info,
    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
    dot: "text-sky-500",
    label: "Info",
  },
};

function severityOf(n: Notification): Severity {
  return TYPE_SEVERITY[n.type] ?? "INFO";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function DigestCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetAiWeeklyDigest({
    query: { queryKey: getGetAiWeeklyDigestQueryKey() },
  });
  const gen = useGenerateAiWeeklyDigest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAiWeeklyDigestQueryKey() });
        toast({ title: "Digest refreshed" });
      },
      onError: (e: any) => {
        toast({
          title: "Could not refresh digest",
          description:
            e?.status === 429 ? "Refreshed very recently — please wait a bit." : e?.message ?? "Please try again.",
          variant: "destructive",
        });
      },
    },
  });
  const [, navigate] = useLocation();
  const digest = data?.digest;

  return (
    <Card className="border-primary/30 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Weekly AI Digest
          </CardTitle>
          <CardDescription>
            Generated every Monday morning from live portfolio data — the AI only phrases computed facts.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
          data-testid="button-digest-refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", gen.isPending && "animate-spin")} />
          {gen.isPending ? "Generating…" : digest ? "Refresh" : "Generate now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading digest…</p>
        ) : !digest ? (
          <p className="text-sm text-muted-foreground">
            No digest yet. The first one is generated automatically on Monday morning, or click "Generate now".
          </p>
        ) : (
          <>
            <p className="font-medium" data-testid="digest-headline">{digest.headline}</p>
            <div className="space-y-2">
              {digest.highlights.map((h: AiWeeklyDigestHighlight, i: number) => {
                const style = SEVERITY_STYLE[h.severity] ?? SEVERITY_STYLE.INFO;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md border border-border p-3"
                    data-testid={`digest-highlight-${i}`}
                  >
                    <Badge variant="outline" className={cn("text-[10px] shrink-0 mt-0.5", style.badge)}>
                      {style.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{h.title}</p>
                      <p className="text-xs text-muted-foreground">{h.detail}</p>
                    </div>
                    {h.link && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-7 px-2 text-xs"
                        onClick={() => navigate(h.link!)}
                      >
                        Open <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">{digest.narrative}</p>
            <p className="text-[11px] text-muted-foreground">
              Week {digest.weekKey.replace("-W", " · W")} — generated {timeAgo(digest.generatedAt)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AlertsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"all" | "unread">("all");

  const { data: notifications, isLoading } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey() },
  });
  const markRead = useMarkNotificationRead({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) },
  });
  const markAllRead = useMarkAllNotificationsRead({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) },
  });

  const isMgmt = user?.role === "MANAGEMENT" || user?.role === "SUPER_ADMIN";
  const all = notifications ?? [];
  const unreadCount = all.filter((n) => !n.readAt).length;
  const shown = tab === "unread" ? all.filter((n) => !n.readAt) : all;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6 text-primary" />
            Smart Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rule-based alerts about margins, budgets, invoices and timesheets — with the cause attached.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={() => markAllRead.mutate()} data-testid="button-mark-all-read">
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read ({unreadCount})
          </Button>
        )}
      </div>

      {isMgmt && <DigestCard />}

      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Alerts</CardTitle>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium capitalize",
                  tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setTab(t)}
                data-testid={`tab-${t}`}
              >
                {t === "all" ? `All (${all.length})` : `Unread (${unreadCount})`}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<BellRing className="h-12 w-12 text-muted-foreground/50" />}
              title={tab === "unread" ? "No unread alerts" : "No alerts yet"}
              description="Alerts appear here when a project's margin drops, budget is at risk, an invoice is due, or timesheets run late."
            />
          ) : (
            <div className="divide-y divide-border">
              {shown.map((n) => {
                const sev = severityOf(n);
                const style = SEVERITY_STYLE[sev];
                const Icon = style.icon;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={cn(
                      "w-full flex items-start gap-3 py-3 text-left hover:bg-muted/40 rounded-md px-2 -mx-2",
                      !n.readAt && "bg-primary/[0.03]",
                    )}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate({ id: n.id });
                      if (n.link) navigate(n.link);
                    }}
                    data-testid={`alert-${n.id}`}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", style.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p>
                        <Badge variant="outline" className={cn("text-[10px]", style.badge)}>
                          {style.label}
                        </Badge>
                        {!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{n.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {n.link && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
