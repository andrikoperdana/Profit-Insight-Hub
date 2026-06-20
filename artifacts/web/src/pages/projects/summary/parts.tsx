import { type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionShell({
  id,
  title,
  icon,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className={cn("border-border shadow-sm", className)}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  );
}

export function AsyncState({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyText = "No data.",
  children,
}: {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (isError) {
    const msg =
      error instanceof Error ? error.message : "This section could not be loaded.";
    return (
      <div className="flex items-center gap-2 text-sm text-destructive py-6">
        <AlertCircle className="h-4 w-4 shrink-0" /> {msg}
      </div>
    );
  }
  if (isEmpty) {
    return <p className="text-sm text-muted-foreground py-6">{emptyText}</p>;
  }
  return <>{children}</>;
}

export function KeyVal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value ?? "—"}</span>
    </div>
  );
}

export function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-mono font-semibold mt-1 break-words", color)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function prettify(s?: string | null): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
