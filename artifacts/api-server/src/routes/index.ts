import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import siteGateRouter from "./site-gate.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import clientsRouter from "./clients.js";
import projectsRouter from "./projects.js";
import projectDemoSeedRouter from "./projectDemoSeed.js";
import resourcesRouter from "./resources.js";
import timesheetsRouter from "./timesheets.js";
import documentsRouter from "./documents.js";
import dashboardRouter from "./dashboard.js";
import uploadsRouter from "./uploads.js";
import capacityRouter from "./capacity.js";
import auditLogsRouter from "./audit-logs.js";
import projectActivityRouter from "./project-activity.js";
import resourceSuggestionsRouter from "./resource-suggestions.js";
import calendarFeedRouter from "./calendar-feed.js";
import biRouter from "./bi.js";
import surveysRouter from "./surveys.js";
import expensesRouter from "./expenses.js";
import tasksRouter from "./tasks.js";
import notificationsRouter from "./notifications.js";
import principalRouter from "./principal.js";
import skillsRouter from "./skills.js";
import businessUnitsRouter from "./business-units.js";
import resourcePlanningRouter from "./resource-planning.js";
import invoicePlanningRouter from "./invoice-planning.js";
import portfolioMonitorRouter from "./portfolio-monitor.js";
import invoicePlanningSeedRouter from "./invoicePlanningSeed.js";
import billingMilestonesRouter from "./billing-milestones.js";
import invoiceSettingsRouter from "./invoice-settings.js";
import appSettingsRouter from "./app-settings.js";
import reportsRouter from "./reports.js";
import leadsRouter from "./leads.js";
import skillMatrixRouter from "./skill-matrix.js";
import taskTemplatesRouter from "./task-templates.js";
import projectTemplatesRouter from "./project-templates.js";
import closingChecklistRouter from "./closing-checklist.js";
import skillDevelopmentRouter from "./skill-development.js";
import leavesRouter from "./leaves.js";
import topPerformersRouter from "./top-performers.js";
import raidRouter from "./raid.js";
import changeRequestsRouter from "./change-requests.js";
import performanceReviewsRouter from "./performance-reviews.js";
import workstreamsRouter from "./workstreams.js";
import projectReportsRouter from "./project-reports.js";
import workHoursRouter from "./work-hours.js";
import xeroRouter from "./xero.js";
import pipedriveRouter from "./pipedrive.js";
import clientPortalRouter from "./client-portal.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(siteGateRouter);
router.use(surveysRouter);
router.use(authRouter);
router.use("/calendar", calendarFeedRouter);
// Mounted BEFORE the blanket-auth routers below (users, clients, ...). The Xero
// OAuth callback (GET /xero/callback) arrives as a top-level browser navigation
// with no Bearer token; xeroRouter applies auth per-route, so the unauthenticated
// callback would otherwise be intercepted by the first sub-router whose top-level
// requireAuth runs for every request, returning 401 before reaching the handler.
router.use(xeroRouter);
// Mounted BEFORE the blanket-auth routers below for the same reason as
// xeroRouter: the inbound webhook (POST /pipedrive/webhook) carries no Bearer
// token (it authenticates via a shared secret), so it must reach its handler
// before any sub-router whose top-level requireAuth would 401 it. Its
// management endpoints apply auth per-route.
router.use(pipedriveRouter);
// Mounted BEFORE the blanket-auth routers below for the same reason as
// xeroRouter: the public client-portal endpoint (GET /public/client-portal/:token)
// has no Bearer token and must reach its handler before any sub-router whose
// top-level requireAuth would 401 it. Its management endpoints apply auth
// per-route, so this ordering is safe.
router.use(clientPortalRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(projectsRouter);
router.use(projectDemoSeedRouter);
router.use(resourcesRouter);
router.use(timesheetsRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(uploadsRouter);
router.use(capacityRouter);
router.use(auditLogsRouter);
router.use(projectActivityRouter);
router.use(resourceSuggestionsRouter);
router.use(biRouter);
router.use(expensesRouter);
router.use(tasksRouter);
router.use(notificationsRouter);
router.use(principalRouter);
router.use(skillsRouter);
router.use(businessUnitsRouter);
router.use(resourcePlanningRouter);
router.use(invoicePlanningRouter);
router.use(portfolioMonitorRouter);
router.use(invoicePlanningSeedRouter);
router.use(billingMilestonesRouter);
router.use(invoiceSettingsRouter);
router.use(appSettingsRouter);
router.use(reportsRouter);
router.use(leadsRouter);
router.use(skillMatrixRouter);
router.use(taskTemplatesRouter);
router.use(projectTemplatesRouter);
router.use(closingChecklistRouter);
router.use(skillDevelopmentRouter);
router.use(leavesRouter);
router.use(topPerformersRouter);
router.use(raidRouter);
router.use(changeRequestsRouter);
router.use(performanceReviewsRouter);
router.use(workstreamsRouter);
router.use(projectReportsRouter);
router.use(workHoursRouter);

export default router;
