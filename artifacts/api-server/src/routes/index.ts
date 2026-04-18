import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import clientsRouter from "./clients.js";
import projectsRouter from "./projects.js";
import resourcesRouter from "./resources.js";
import timesheetsRouter from "./timesheets.js";
import documentsRouter from "./documents.js";
import dashboardRouter from "./dashboard.js";
import uploadsRouter from "./uploads.js";
import capacityRouter from "./capacity.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(projectsRouter);
router.use(resourcesRouter);
router.use(timesheetsRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(uploadsRouter);
router.use(capacityRouter);

export default router;
