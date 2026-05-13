import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";

// Eager: hot-path screens that the user lands on first / hits frequently. Anything
// else is lazy-loaded so the initial JS bundle is much smaller (faster first paint).
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";

const ProjectsList = lazy(() => import("@/pages/projects"));
const ProjectDetail = lazy(() => import("@/pages/projects/[id]"));
const NewProject = lazy(() => import("@/pages/projects/new"));
const TimesheetsList = lazy(() => import("@/pages/timesheets"));
const ApprovalInbox = lazy(() => import("@/pages/approvals"));
const ClientsList = lazy(() => import("@/pages/clients"));
const UsersList = lazy(() => import("@/pages/users"));
const Settings = lazy(() => import("@/pages/settings"));
const Resources = lazy(() => import("@/pages/resources"));
const CapacityPlanning = lazy(() => import("@/pages/capacity"));
const AuditLogPage = lazy(() => import("@/pages/audit-logs"));
const BusinessIntelligence = lazy(() => import("@/pages/business-intelligence"));
const ExpensesPage = lazy(() => import("@/pages/expenses"));
const SurveyTemplateEditor = lazy(() => import("@/pages/settings/SurveyTemplate"));
const PublicSurveyPage = lazy(() => import("@/pages/survey/[token]"));
import { ThemeProvider } from "@/lib/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Cache responses for 30 seconds to avoid re-fetching the same data on
      // every back/forward nav and tab switch. Mutations still call
      // invalidateQueries, so freshness on writes is unchanged.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
      Loading…
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/survey/:token" component={PublicSurveyPage} />
        <Route path="/settings/survey-template" component={() => <ProtectedRoute component={SurveyTemplateEditor} />} />
        <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
        <Route path="/projects" component={() => <ProtectedRoute component={ProjectsList} />} />
        <Route path="/projects/new" component={() => <ProtectedRoute component={NewProject} />} />
        <Route path="/projects/:id" component={() => <ProtectedRoute component={ProjectDetail} />} />
        <Route path="/timesheets" component={() => <ProtectedRoute component={TimesheetsList} />} />
        <Route path="/approvals" component={() => <ProtectedRoute component={ApprovalInbox} />} />
        <Route path="/resources" component={() => <ProtectedRoute component={Resources} />} />
        <Route path="/capacity" component={() => <ProtectedRoute component={CapacityPlanning} />} />
        <Route path="/clients" component={() => <ProtectedRoute component={ClientsList} />} />
        <Route path="/users" component={() => <ProtectedRoute component={UsersList} />} />
        <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route path="/audit-logs" component={() => <ProtectedRoute component={AuditLogPage} />} />
        <Route path="/business-intelligence" component={() => <ProtectedRoute component={BusinessIntelligence} />} />
        <Route path="/expenses" component={() => <ProtectedRoute component={ExpensesPage} />} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
