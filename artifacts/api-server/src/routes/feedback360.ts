import { Router, type IRouter } from "express";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { userCanAccessProject } from "../lib/projectAccess.js";
import { recordAudit } from "../lib/audit.js";
import { validateBody } from "../middlewares/validate.js";
import { SubmitFeedback360Body } from "@workspace/api-zod";

const router: IRouter = Router();
router.use(requireAuth);

const fbInclude = {
  reviewer: { select: { id: true, name: true, role: true } },
  subject: { select: { id: true, name: true, role: true } },
  project: { select: { id: true, code: true, name: true, status: true, pmId: true } },
} satisfies Prisma.ProjectFeedback360Include;

type FbRow = Prisma.ProjectFeedback360GetPayload<{ include: typeof fbInclude }>;

function serialize(fb: FbRow, viewerId: string, canSeeAll: boolean) {
  // Reviewers see their own rating/comment; PM/MGMT see everything once
  // submitted. Other project members only see who owes feedback (status),
  // never the content — 360 answers are semi-confidential.
  const canSeeContent = canSeeAll || fb.reviewerId === viewerId;
  return {
    id: fb.id,
    projectId: fb.projectId,
    projectCode: fb.project.code,
    projectName: fb.project.name,
    reviewerId: fb.reviewerId,
    reviewerName: fb.reviewer.name,
    reviewerRole: fb.reviewer.role,
    subjectId: fb.subjectId,
    subjectName: fb.subject.name,
    subjectRole: fb.subject.role,
    rating: canSeeContent ? fb.rating : null,
    comment: canSeeContent ? fb.comment : null,
    status: fb.status,
    submittedAt: fb.submittedAt ? fb.submittedAt.toISOString() : null,
    createdAt: fb.createdAt.toISOString(),
  };
}

function canSeeAllFor(role: string, pmId: string | null, userId: string): boolean {
  return (
    role === "MANAGEMENT" ||
    role === "SUPER_ADMIN" ||
    (role === "PROJECT_MANAGER" && pmId === userId)
  );
}

// My pending/submitted 360 feedback across all projects (reviewer = me).
router.get("/feedback360/mine", async (req, res) => {
  const rows = await prisma.projectFeedback360.findMany({
    where: { reviewerId: req.user!.sub },
    include: fbInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  res.json(rows.map((r) => serialize(r, req.user!.sub, false)));
});

// All 360 entries for a project. Content visibility: MGMT + assigned PM see
// everything; everyone else with project access sees statuses + own content.
router.get("/projects/:id/feedback360", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await prisma.projectFeedback360.findMany({
    where: { projectId },
    include: fbInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const pmId = rows[0]?.project.pmId ?? null;
  const canSeeAll = canSeeAllFor(
    req.user!.role,
    pmId ??
      (await prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } }))
        ?.pmId ??
      null,
    req.user!.sub,
  );
  res.json(rows.map((r) => serialize(r, req.user!.sub, canSeeAll)));
});

// Submit my 360 feedback entry (reviewer only, PENDING only).
router.patch("/feedback360/:id", validateBody(SubmitFeedback360Body), async (req, res) => {
  const id = String(req.params.id);
  const fb = await prisma.projectFeedback360.findUnique({ where: { id }, include: fbInclude });
  if (!fb || fb.reviewerId !== req.user!.sub) {
    // Identical 404 whether the row is missing or owned by someone else.
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (fb.status === "SUBMITTED") {
    res.status(409).json({ error: "This feedback has already been submitted" });
    return;
  }
  const { rating, comment } = req.body || {};
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ error: "rating must be an integer between 1 and 5" });
    return;
  }
  if (comment !== undefined && comment !== null && String(comment).length > 2000) {
    res.status(400).json({ error: "comment too long (max 2000 chars)" });
    return;
  }
  // Atomic claim: only flip PENDING -> SUBMITTED once, even on double-submit.
  const claimed = await prisma.projectFeedback360.updateMany({
    where: { id, status: "PENDING", reviewerId: req.user!.sub },
    data: {
      rating: ratingNum,
      comment: comment ? String(comment) : null,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    res.status(409).json({ error: "This feedback has already been submitted" });
    return;
  }
  const updated = await prisma.projectFeedback360.findUniqueOrThrow({
    where: { id },
    include: fbInclude,
  });
  await recordAudit(req, {
    action: "feedback360.submitted",
    entityType: "ProjectFeedback360",
    entityId: id,
    description: `360 feedback submitted for ${updated.subject.name} on ${updated.project.code}`,
    after: { rating: updated.rating, status: updated.status },
  });
  res.json(serialize(updated, req.user!.sub, false));
});

export default router;
