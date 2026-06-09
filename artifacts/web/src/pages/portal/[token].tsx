import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CalendarDays, CheckCircle2, Circle, Clock } from "lucide-react";
import itsecLogo from "@assets/Logo_Cybersecurity_Delivered_White_1781007162611.png";
import { formatDate } from "@/lib/format";

type Milestone = {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
};

type PortalData = {
  project: {
    name: string;
    clientName: string;
    status: string;
    progressPct: number;
    startDate: string | null;
    endDate: string | null;
  };
  milestones: Milestone[];
};

function MilestoneIcon({ progressPct }: { progressPct: number }) {
  if (progressPct >= 100) return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (progressPct > 0) return <Clock className="h-5 w-5 text-amber-400" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

export default function PublicClientPortal() {
  const params = useParams();
  const token = params.token as string;

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ["client-portal", token],
    queryFn: () => customFetch<PortalData>(`/api/public/client-portal/${token}`),
    retry: false,
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading project status…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Portal unavailable</CardTitle>
            <CardDescription>
              This link is invalid, has expired, or is no longer active. Please contact your project
              contact for an updated link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { project, milestones } = data;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <img src={itsecLogo} alt="ITSEC" className="h-8 w-auto" />
          <span className="font-bold text-lg text-foreground">SecureProfit Hub</span>
        </div>

        <Card className="border-border">
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-2xl">{project.name}</CardTitle>
                <CardDescription className="mt-1">Client: {project.clientName}</CardDescription>
              </div>
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {project.status}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Overall progress</span>
                <span className="font-semibold text-foreground">{project.progressPct}%</span>
              </div>
              <Progress value={project.progressPct} className="h-2" />
            </div>
            {(project.startDate || project.endDate) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                <span>
                  {formatDate(project.startDate)} {project.endDate ? `– ${formatDate(project.endDate)}` : ""}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Timeline & Milestones</CardTitle>
            <CardDescription>Key phases of your project and their current status.</CardDescription>
          </CardHeader>
          <CardContent>
            {milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones have been scheduled yet.</p>
            ) : (
              <ul className="space-y-4">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <MilestoneIcon progressPct={m.progressPct} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="font-medium text-foreground">{m.title}</span>
                        <span className="text-xs text-muted-foreground">{m.status}</span>
                      </div>
                      {(m.startDate || m.endDate) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(m.startDate)} {m.endDate ? `– ${formatDate(m.endDate)}` : ""}
                        </div>
                      )}
                      <Progress value={m.progressPct} className="h-1.5 mt-2" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Powered by SecureProfit Hub · This is a read-only project status page.
        </p>
      </div>
    </div>
  );
}
