import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingPage } from "@/components/common/Loading";
import { useAuth } from "@/lib/auth";
import { useListReports } from "@workspace/api-client-react";
import { TrendingUp, Activity, Wallet, FileCheck, AlertCircle, ChevronRight } from "lucide-react";

const CATEGORY_META: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  profitability: { label: "Profitability", icon: TrendingUp, color: "text-emerald-500" },
  operations: { label: "Operations & Resource", icon: Activity, color: "text-blue-500" },
  cashflow: { label: "Cash Flow & Billing", icon: Wallet, color: "text-amber-500" },
  compliance: { label: "Compliance & Tax", icon: FileCheck, color: "text-purple-500" },
};

export default function ReportsIndex() {
  const { user } = useAuth();
  const allowed = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";
  const { data: reports, isLoading } = useListReports({
    query: { enabled: allowed, queryKey: ["reports"] },
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="rounded-xl border-destructive/40">
          <CardContent className="p-6 flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            The Reports page is only accessible to Management and Project Manager roles.
          </CardContent>
        </Card>
      </div>
    );
  }
  if (isLoading || !reports) return <LoadingPage />;

  const grouped = (reports as any[]).reduce<Record<string, any[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            10 ready-to-use reports with filters, charts, and CSV / Excel / PDF export.
          </p>
        </div>

        {Object.entries(CATEGORY_META).map(([cat, meta]) => {
          const items = grouped[cat] ?? [];
          if (items.length === 0) return null;
          const Icon = meta.icon;
          return (
            <section key={cat} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${meta.color}`} />
                <h2 className="text-lg font-semibold">{meta.label}</h2>
                <Badge variant="outline" className="ml-1">{items.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((r) => (
                  <Link key={r.id} href={`/reports/${r.id}`}>
                    <Card className="cursor-pointer transition border-border hover:border-primary/60 hover:shadow-md h-full" data-testid={`card-report-${r.id}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                          <span>{r.name}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </CardTitle>
                        <CardDescription className="text-xs leading-snug">{r.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
