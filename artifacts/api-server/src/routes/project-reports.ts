import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanAccessProject } from "../lib/projectAccess.js";
import { notifyUsers } from "../lib/notifications.js";

const router: IRouter = Router();
router.use(requireAuth);

type ReportRow = {
  id: string;
  projectId: string;
  title: string;
  coverUrl: string | null;
  link: string | null;
  note: string | null;
  workstreamId: string | null;
  workstream: { id: string; name: string; code: string } | null;
  submittedAt: Date | null;
  createdById: string | null;
  createdBy: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(r: ReportRow) {
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    coverUrl: r.coverUrl,
    link: r.link,
    note: r.note,
    workstreamId: r.workstreamId,
    workstreamName: r.workstream?.name ?? null,
    workstreamCode: r.workstream?.code ?? null,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    createdById: r.createdById,
    createdByName: r.createdBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const include = {
  workstream: { select: { id: true, name: true, code: true } },
  createdBy: { select: { name: true } },
} as const;

async function canWrite(projectId: string, user: { sub: string; role: string }): Promise<boolean> {
  if (user.role === "MANAGEMENT") return true;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { pmId: true, technicalWriterId: true },
  });
  if (!p) return false;
  if (user.role === "PROJECT_MANAGER" && p.pmId === user.sub) return true;
  if (user.role === "TECHNICAL_WRITER" && p.technicalWriterId === user.sub) return true;
  return false;
}

router.get("/projects/:id/reports", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10) || 10));
  const [total, items] = await Promise.all([
    prisma.projectReport.count({ where: { projectId } }),
    prisma.projectReport.findMany({
      where: { projectId },
      include,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  res.json({
    items: items.map(serialize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.post("/projects/:id/reports", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await canWrite(projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project, assigned Technical Writer, or Management can add reports" });
    return;
  }
  const b = req.body || {};
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  let workstreamId: string | null = null;
  if (b.workstreamId) {
    const ws = await prisma.projectWorkstream.findFirst({
      where: { id: String(b.workstreamId), projectId },
      select: { id: true },
    });
    if (!ws) {
      res.status(400).json({ error: "workstreamId not found on this project" });
      return;
    }
    workstreamId = ws.id;
  }
  const coverUrl = b.coverUrl ? String(b.coverUrl) : null;
  const link = b.link ? String(b.link).trim() || null : null;
  const note = b.note ? String(b.note).trim() || null : null;
  const submittedAt = coverUrl && link ? new Date() : null;
  const created = await prisma.projectReport.create({
    data: {
      projectId,
      title,
      coverUrl,
      link,
      note,
      workstreamId,
      submittedAt,
      createdById: req.user!.sub,
    },
    include,
  });
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { code: true, name: true, pmId: true, adminProjectId: true },
  });
  await recordAudit(req, {
    action: "project_report.created",
    entityType: "ProjectReport",
    entityId: created.id,
    description: `Added report "${created.title}" on project ${project?.code ?? projectId}`,
    after: { id: created.id, title: created.title, workstreamId: created.workstreamId },
  });
  if (submittedAt && project) {
    await notifyUsers([project.pmId, project.adminProjectId], {
      type: "report.submitted",
      title: "Report submitted",
      message: `Report "${created.title}" for ${project.code} — ${project.name} is ready for review`,
      link: `/projects/${projectId}`,
    });
  }
  res.status(201).json(serialize(created));
});

router.patch("/project-reports/:reportId", async (req, res) => {
  const id = String(req.params.reportId);
  const before = await prisma.projectReport.findUnique({ where: { id }, include });
  if (!before) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  if (!(await canWrite(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project, assigned Technical Writer, or Management can edit reports" });
    return;
  }
  const b = req.body || {};
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) {
    const t = String(b.title).trim();
    if (!t) {
      res.status(400).json({ error: "title cannot be empty" });
      return;
    }
    data.title = t;
  }
  if (b.coverUrl !== undefined) data.coverUrl = b.coverUrl ? String(b.coverUrl) : null;
  if (b.link !== undefined) data.link = b.link ? String(b.link).trim() || null : null;
  if (b.note !== undefined) data.note = b.note ? String(b.note).trim() || null : null;
  if (b.workstreamId !== undefined) {
    if (b.workstreamId === null || b.workstreamId === "") {
      data.workstreamId = null;
    } else {
      const ws = await prisma.projectWorkstream.findFirst({
        where: { id: String(b.workstreamId), projectId: before.projectId },
        select: { id: true },
      });
      if (!ws) {
        res.status(400).json({ error: "workstreamId not found on this project" });
        return;
      }
      data.workstreamId = ws.id;
    }
  }
  const nextCover = data.coverUrl !== undefined ? data.coverUrl : before.coverUrl;
  const nextLink = data.link !== undefined ? data.link : before.link;
  const wasComplete = !!(before.coverUrl && before.link);
  const nowComplete = !!(nextCover && nextLink);
  if (nowComplete && !wasComplete) data.submittedAt = new Date();
  else if (!nowComplete) data.submittedAt = null;

  const updated = await prisma.projectReport.update({ where: { id }, data, include });
  await recordAudit(req, {
    action: "project_report.updated",
    entityType: "ProjectReport",
    entityId: id,
    description: `Updated report "${updated.title}" on project ${updated.projectId}`,
    before: { title: before.title, coverUrl: before.coverUrl, link: before.link, workstreamId: before.workstreamId },
    after: { title: updated.title, coverUrl: updated.coverUrl, link: updated.link, workstreamId: updated.workstreamId },
  });
  if (nowComplete && !wasComplete) {
    const project = await prisma.project.findUnique({
      where: { id: updated.projectId },
      select: { code: true, name: true, pmId: true, adminProjectId: true },
    });
    if (project) {
      await notifyUsers([project.pmId, project.adminProjectId], {
        type: "report.submitted",
        title: "Report submitted",
        message: `Report "${updated.title}" for ${project.code} — ${project.name} is ready for review`,
        link: `/projects/${updated.projectId}`,
      });
    }
  }
  res.json(serialize(updated));
});

router.delete("/project-reports/:reportId", async (req, res) => {
  const id = String(req.params.reportId);
  const before = await prisma.projectReport.findUnique({ where: { id } });
  if (!before) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  if (!(await canWrite(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project, assigned Technical Writer, or Management can delete reports" });
    return;
  }
  await prisma.projectReport.delete({ where: { id } });
  await recordAudit(req, {
    action: "project_report.deleted",
    entityType: "ProjectReport",
    entityId: id,
    description: `Deleted report "${before.title}" on project ${before.projectId}`,
    before: { id, title: before.title, projectId: before.projectId },
  });
  res.json({ message: "Report deleted" });
});

export default router;
