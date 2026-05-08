import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { serializeProject, projectInclude } from "../lib/serializers.js";

const router: IRouter = Router();
router.use(requireAuth);

const PRINCIPAL_TO_REPORT_ROLE: Record<string, UserRole> = {
  PRINCIPAL_KONSULTAN: "KONSULTAN",
  PRINCIPAL_TECHNICAL_WRITER: "TECHNICAL_WRITER",
  PRINCIPAL_ADMIN_PROJECT: "ADMIN_PROJECT",
};

// Lists in-flight projects that need a resource of the calling Principal's
// supervised role. Used by the PrincipalDashboard to surface staffing gaps.
router.get("/principal/projects-needing-resource", async (req, res) => {
  const callerRole = req.user!.role;
  if (!callerRole.startsWith("PRINCIPAL_")) {
    res.status(403).json({ error: "Only Principal roles may use this endpoint" });
    return;
  }
  const reportRole = PRINCIPAL_TO_REPORT_ROLE[callerRole];
  let projects;
  if (reportRole === "KONSULTAN") {
    // Projects in OBSERVATION/ACTIVE without any KONSULTAN resource
    projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { in: ["OBSERVATION", "ACTIVE"] },
        NOT: { resources: { some: { user: { role: "KONSULTAN" } } } },
      },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
  } else if (reportRole === "TECHNICAL_WRITER") {
    // Multi-pick: list projects with no TECHNICAL_WRITER ProjectResource
    // (mirrors the KONSULTAN branch). The legacy single-pick technicalWriterId
    // field is no longer used to determine staffing gaps.
    projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { in: ["OBSERVATION", "ACTIVE"] },
        NOT: { resources: { some: { user: { role: "TECHNICAL_WRITER" } } } },
      },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
  } else {
    // ADMIN_PROJECT
    projects = await prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { in: ["OBSERVATION", "ACTIVE", "COMPLETE"] },
        adminProjectId: null,
      },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
  }
  res.json(projects.map((p) => serializeProject(p, req.user?.role)));
});

export default router;
