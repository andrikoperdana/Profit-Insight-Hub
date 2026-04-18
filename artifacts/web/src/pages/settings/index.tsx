import { useAuth } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { RoleLabels } from "@/lib/roles";
import { formatIDR } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LoadingPage } from "@/components/common/Loading";

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
    </div>
  );
}
