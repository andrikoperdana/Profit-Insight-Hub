import { useAuth } from "@/lib/auth";
import { RoleLabels } from "@/lib/roles";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export default function WelcomeBanner({ subtitle }: { subtitle?: string }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-primary">{greeting()}</p>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mt-1">
        {user.name}
        <span className="text-muted-foreground font-normal text-base md:text-lg ml-2">
          · {RoleLabels[user.role]}
        </span>
      </h1>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
      )}
    </div>
  );
}
