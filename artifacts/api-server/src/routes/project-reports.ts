import { Router, type IRouter } from "express";
import { prisma, type ProjectReportType } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanAccessProject, assertProjectWritable } from "../lib/projectAccess.js";
import { notifyUsers } from "../lib/notifications.js";

const router: IRouter = Router();
router.use(requireAuth);

type ReportRow = {
  id: string;
  projectId: string;
  title: string;
  reportNumber: string | null;
  version: string | null;
  reportType: ProjectReportType | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  author: string | null;
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

const REPORT_TYPES = new Set(["DRAFT", "INTERIM", "FINAL"]);

function validateLink(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`${field} must be a valid http(s) URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`${field} must use http:// or https://`);
  }
  return s;
}

function validateCoverUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Allow data: image URIs (used by inline base64 upload) OR http(s) URLs.
  if (s.startsWith("data:image/")) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`${field} must be a data:image/* URI or a valid http(s) URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`${field} must use http:// or https://`);
  }
  return s;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function parseOptionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const s = String(value).trim();
  if (!DATE_ONLY_RE.test(s) && !DATE_TIME_RE.test(s)) {
    throw new Error(`${field} must be YYYY-MM-DD or ISO 8601 date-time`);
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`${field} invalid`);
  // Strict calendar check for date-only values: reject normalizations like 2026-02-31.
  if (DATE_ONLY_RE.test(s)) {
    const [y, m, day] = s.split("-").map(Number);
    if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
      throw new Error(`${field} is not a valid calendar date`);
    }
  }
  return d;
}

function serialize(r: ReportRow) {
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    reportNumber: r.reportNumber,
    version: r.version,
    reportType: r.reportType,
    periodStart: r.periodStart ? r.periodStart.toISOString() : null,
    periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
    author: r.author,
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
  if (user.role === "MANAGEMENT" || user.role === "SUPER_ADMIN") return true;
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
  if (!(await assertProjectWritable(projectId, res))) return;
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
  let coverUrl: string | null;
  let link: string | null;
  try {
    coverUrl = validateCoverUrl(b.coverUrl, "coverUrl");
    link = validateLink(b.link, "link");
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Invalid URL" });
    return;
  }
  const note = b.note ? String(b.note).trim() || null : null;
  const reportNumber = b.reportNumber ? String(b.reportNumber).trim() || null : null;
  const version = b.version ? String(b.version).trim() || null : null;
  const author = b.author ? String(b.author).trim() || null : null;
  let reportType: ProjectReportType | null = null;
  if (b.reportType) {
    const rt = String(b.reportType).toUpperCase();
    if (!REPORT_TYPES.has(rt)) {
      res.status(400).json({ error: `reportType must be one of ${[...REPORT_TYPES].join(", ")}` });
      return;
    }
    reportType = rt as ProjectReportType;
  }
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  try {
    const ps = parseOptionalDate(b.periodStart, "periodStart");
    const pe = parseOptionalDate(b.periodEnd, "periodEnd");
    if (ps !== undefined) periodStart = ps;
    if (pe !== undefined) periodEnd = pe;
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Invalid date" });
    return;
  }
  if (periodStart && periodEnd && periodEnd < periodStart) {
    res.status(400).json({ error: "periodEnd must be on or after periodStart" });
    return;
  }
  const submittedAt = coverUrl && link ? new Date() : null;
  const created = await prisma.projectReport.create({
    data: {
      projectId,
      title,
      reportNumber,
      version,
      reportType,
      periodStart,
      periodEnd,
      author,
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
  if (!(await assertProjectWritable(before.projectId, res))) return;
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
  if (b.coverUrl !== undefined) {
    try {
      data.coverUrl = validateCoverUrl(b.coverUrl, "coverUrl");
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "Invalid coverUrl" });
      return;
    }
  }
  if (b.link !== undefined) {
    try {
      data.link = validateLink(b.link, "link");
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "Invalid link" });
      return;
    }
  }
  if (b.note !== undefined) data.note = b.note ? String(b.note).trim() || null : null;
  if (b.reportNumber !== undefined) data.reportNumber = b.reportNumber ? String(b.reportNumber).trim() || null : null;
  if (b.version !== undefined) data.version = b.version ? String(b.version).trim() || null : null;
  if (b.author !== undefined) data.author = b.author ? String(b.author).trim() || null : null;
  if (b.reportType !== undefined) {
    if (b.reportType === null || b.reportType === "") {
      data.reportType = null;
    } else {
      const rt = String(b.reportType).toUpperCase();
      if (!REPORT_TYPES.has(rt)) {
        res.status(400).json({ error: `reportType must be one of ${[...REPORT_TYPES].join(", ")}` });
        return;
      }
      data.reportType = rt as ProjectReportType;
    }
  }
  try {
    const ps = parseOptionalDate(b.periodStart, "periodStart");
    const pe = parseOptionalDate(b.periodEnd, "periodEnd");
    if (ps !== undefined) data.periodStart = ps;
    if (pe !== undefined) data.periodEnd = pe;
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Invalid date" });
    return;
  }
  const nextStart = (data.periodStart !== undefined ? data.periodStart : before.periodStart) as Date | null;
  const nextEnd = (data.periodEnd !== undefined ? data.periodEnd : before.periodEnd) as Date | null;
  if (nextStart && nextEnd && nextEnd < nextStart) {
    res.status(400).json({ error: "periodEnd must be on or after periodStart" });
    return;
  }
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
  if (!(await assertProjectWritable(before.projectId, res))) return;
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
