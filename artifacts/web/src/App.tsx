import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";
import { SiteGate } from "@/components/SiteGate";

// Eager: hot-path screens that the user lands on first / hits frequently. Anything
// else is lazy-loaded so the initial JS bundle is much smaller (faster first paint).
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";

const ProjectsList = lazy(() => import("@/pages/projects"));
const ProjectDetail = lazy(() => import("@/pages/projects/[id]"));
const ProjectSummary = lazy(() => import("@/pages/projects/summary"));
const NewProject = lazy(() => import("@/pages/projects/new"));
const TimesheetsList = lazy(() => import("@/pages/timesheets"));
const ApprovalInbox = lazy(() => import("@/pages/approvals"));
const ClientsList = lazy(() => import("@/pages/clients"));
const UsersList = lazy(() => import("@/pages/users"));
const UserDetail = lazy(() => import("@/pages/users/[id]"));
const Settings = lazy(() => import("@/pages/settings"));
const Resources = lazy(() => import("@/pages/resources"));
const CapacityPlanning = lazy(() => import("@/pages/capacity"));
const AuditLogPage = lazy(() => import("@/pages/audit-logs"));
const BusinessIntelligence = lazy(() => import("@/pages/business-intelligence"));
const PmDashboardsPage = lazy(() => import("@/pages/pm-dashboards"));
const ExpensesPage = lazy(() => import("@/pages/expenses"));
const SkillsPage = lazy(() => import("@/pages/skills"));
const BusinessUnitsPage = lazy(() => import("@/pages/business-units"));
const ResourcePlanningPage = lazy(() => import("@/pages/resource-planning"));
const InvoicePlanningPage = lazy(() => import("@/pages/invoice-planning"));
const VatRecapPage = lazy(() => import("@/pages/vat-recap"));
const InvoiceSettingsPage = lazy(() => import("@/pages/invoice-settings"));
const TopPerformersPage = lazy(() => import("@/pages/top-performers"));
const SurveyResultsPage = lazy(() => import("@/pages/survey-results"));
const LeadsPage = lazy(() => import("@/pages/leads"));
const BenchPage = lazy(() => import("@/pages/bench"));
const SkillMatrixPage = lazy(() => import("@/pages/skill-matrix"));
const TaskTemplatesPage = lazy(() => import("@/pages/task-templates"));
const ProjectTemplatesPage = lazy(() => import("@/pages/project-templates"));
const SkillDevelopmentPage = lazy(() => import("@/pages/skill-development"));
const ReportsIndex = lazy(() => import("@/pages/reports"));
const ReportRunner = lazy(() => import("@/pages/reports/[id]"));
const LeavesPage = lazy(() => import("@/pages/leaves"));
const WorkHoursPage = lazy(() => import("@/pages/work-hours"));
const OrgChartPage = lazy(() => import("@/pages/org-chart"));
const MyTasksPage = lazy(() => import("@/pages/my-tasks"));
const MyTimesheetsPage = lazy(() => import("@/pages/my-timesheets"));
const MyExpensesPage = lazy(() => import("@/pages/my-expenses"));
const PerformanceReviewsListPage = lazy(() => import("@/pages/performance-reviews"));
const PerformanceReviewDetailPage = lazy(() => import("@/pages/performance-reviews/[id]"));
const SurveyTemplateEditor = lazy(() => import("@/pages/settings/SurveyTemplate"));
const PublicSurveyPage = lazy(() => import("@/pages/survey/[token]"));
const PublicClientPortal = lazy(() => import("@/pages/portal/[token]"));
import { ThemeProvider } from "@/lib/theme";

// Personal "My …" views are open to PMs (who can be staffed as a project
// resource and assigned tasks), delivery roles, their Principal supervisors,
// and Sales. Kept identical to Sidebar's `canSeeMyViews` so the URL-bar policy
// and the visible menu policy never drift.
const MY_VIEW_ROLES = [
  "PROJECT_MANAGER",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "ADMIN_PROJECT",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
  "SALES",
];

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

function ProtectedRoute({
  component: Component,
  denyRoles,
  allowRoles,
}: {
  component: any;
  denyRoles?: string[];
  allowRoles?: string[];
}) {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  // Super Admin is the top-level god account: it bypasses every route gate
  // (both deny and allow lists) so it can reach any page.
  if (user?.role === "SUPER_ADMIN") {
    return (
      <Layout>
        <Component />
      </Layout>
    );
  }

  // Hard-deny: redirect users whose role is explicitly disallowed for this
  // route to the dashboard (their landing page). Mirrors server-side gating
  // so URL bar / bookmarks can't reach a forbidden page even if the API
  // returns empty/404.
  if (denyRoles && user?.role && denyRoles.includes(user.role)) {
    setLocation("/");
    return null;
  }
  // Hard-allow: only listed roles may reach the route; everyone else lands on /.
  if (allowRoles && (!user?.role || !allowRoles.includes(user.role))) {
    setLocation("/");
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
        <Route path="/portal/:token" component={PublicClientPortal} />
        <Route path="/settings/survey-template" component={() => <ProtectedRoute component={SurveyTemplateEditor} />} />
        <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
        <Route path="/projects" component={() => <ProtectedRoute component={ProjectsList} denyRoles={["HR"]} />} />
        <Route path="/projects/new" component={() => <ProtectedRoute component={NewProject} denyRoles={["HR"]} />} />
        <Route path="/projects/:id/summary" component={() => <ProtectedRoute component={ProjectSummary} denyRoles={["HR"]} />} />
        <Route path="/projects/:id" component={() => <ProtectedRoute component={ProjectDetail} denyRoles={["HR"]} />} />
        <Route path="/timesheets" component={() => <ProtectedRoute component={TimesheetsList} />} />
        <Route path="/approvals" component={() => <ProtectedRoute component={ApprovalInbox} />} />
        <Route path="/resources" component={() => <ProtectedRoute component={Resources} />} />
        <Route path="/capacity" component={() => <ProtectedRoute component={CapacityPlanning} />} />
        <Route path="/clients" component={() => <ProtectedRoute component={ClientsList} />} />
        <Route path="/users" component={() => <ProtectedRoute component={UsersList} />} />
        <Route path="/users/:id" component={() => <ProtectedRoute component={UserDetail} />} />
        <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
        <Route path="/audit-logs" component={() => <ProtectedRoute component={AuditLogPage} />} />
        <Route path="/business-intelligence" component={() => <ProtectedRoute component={BusinessIntelligence} />} />
        <Route path="/pm-dashboards" component={() => <ProtectedRoute component={PmDashboardsPage} allowRoles={["MANAGEMENT"]} />} />
        <Route path="/reports" component={() => <ProtectedRoute component={ReportsIndex} />} />
        <Route path="/reports/:id" component={() => <ProtectedRoute component={ReportRunner} />} />
        <Route path="/expenses" component={() => <ProtectedRoute component={ExpensesPage} />} />
        <Route path="/skills" component={() => <ProtectedRoute component={SkillsPage} />} />
        <Route path="/business-units" component={() => <ProtectedRoute component={BusinessUnitsPage} />} />
        <Route path="/resource-planning" component={() => <ProtectedRoute component={ResourcePlanningPage} />} />
        <Route path="/invoice-planning" component={() => <ProtectedRoute component={InvoicePlanningPage} />} />
        <Route path="/vat-recap" component={() => <ProtectedRoute component={VatRecapPage} />} />
        <Route path="/invoice-settings" component={() => <ProtectedRoute component={InvoiceSettingsPage} allowRoles={["MANAGEMENT","FINANCE"]} />} />
        <Route path="/top-performers" component={() => <ProtectedRoute component={TopPerformersPage} />} />
        <Route path="/survey-results" component={() => <ProtectedRoute component={SurveyResultsPage} />} />
        <Route path="/leads" component={() => <ProtectedRoute component={LeadsPage} />} />
        <Route path="/bench" component={() => <ProtectedRoute component={BenchPage} />} />
        <Route path="/skill-matrix" component={() => <ProtectedRoute component={SkillMatrixPage} />} />
        <Route path="/task-templates" component={() => <ProtectedRoute component={TaskTemplatesPage} />} />
        <Route path="/project-templates" component={() => <ProtectedRoute component={ProjectTemplatesPage} />} />
        <Route path="/skill-development" component={() => <ProtectedRoute component={SkillDevelopmentPage} />} />
        <Route path="/leaves" component={() => <ProtectedRoute component={LeavesPage} />} />
        <Route path="/work-hours" component={() => <ProtectedRoute component={WorkHoursPage} allowRoles={["HR","MANAGEMENT","PRINCIPAL_KONSULTAN","PRINCIPAL_TECHNICAL_WRITER","PRINCIPAL_ADMIN_PROJECT"]} />} />
        <Route path="/org-chart" component={() => <ProtectedRoute component={OrgChartPage} />} />
        <Route path="/my-tasks" component={() => <ProtectedRoute component={MyTasksPage} allowRoles={MY_VIEW_ROLES} />} />
        <Route path="/my-timesheets" component={() => <ProtectedRoute component={MyTimesheetsPage} allowRoles={MY_VIEW_ROLES} />} />
        <Route path="/my-expenses" component={() => <ProtectedRoute component={MyExpensesPage} allowRoles={MY_VIEW_ROLES} />} />
        <Route path="/performance-reviews" component={() => <ProtectedRoute component={PerformanceReviewsListPage} allowRoles={["MANAGEMENT","PROJECT_MANAGER","PRINCIPAL_KONSULTAN","PRINCIPAL_TECHNICAL_WRITER","PRINCIPAL_ADMIN_PROJECT"]} />} />
        <Route path="/performance-reviews/:id" component={() => <ProtectedRoute component={PerformanceReviewDetailPage} allowRoles={["MANAGEMENT","PROJECT_MANAGER","PRINCIPAL_KONSULTAN","PRINCIPAL_TECHNICAL_WRITER","PRINCIPAL_ADMIN_PROJECT"]} />} />
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
        <SiteGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
        </SiteGate>
        <Toaster />
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
