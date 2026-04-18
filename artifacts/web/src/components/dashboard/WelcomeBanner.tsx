import { useAuth } from "@/lib/auth";
import { RoleLabels } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function WelcomeBanner({ subtitle }: { subtitle?: string }) {
  const { user } = useAuth();
  if (!user) return null;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{greeting()}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, <span className="text-primary">{user.name.split(" ")[0]}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-medium">
              {RoleLabels[user.role]}
            </Badge>
            <span className="text-xs text-muted-foreground">{today}</span>
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground pt-2 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
