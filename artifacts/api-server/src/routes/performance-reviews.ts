import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanWriteProject } from "../lib/projectAccess.js";

const router: IRouter = Router();
router.use(requireAuth);

const PERIODS = new Set(["Q1", "Q2", "Q3", "Q4", "ANNUAL"]);
const STATUSES = new Set(["DRAFT", "SUBMITTED", "ACKNOWLEDGED"]);

// HR + MGMT can create/list any review. PMs and Principals can create reviews
// for direct reports / supervisees. Subjects can see their own. Everyone else
// is denied.
function canAdministerReviews(role: string): boolean {
  return role === "MANAGEMENT" || role === "HR";
}

function periodRange(period: string, year: number): { start: Date; end: Date } {
  if (period === "ANNUAL") {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) };
  }
  const q = Number(period.slice(1));
  const startMonth = (q - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59)),
  };
}

type ReviewWithRelations = {
  id: string;
  userId: string;
  user: { name: string; role: string; title: string | null } | null;
  reviewerId: string;
  reviewer: { name: string } | null;
  period: string;
  periodYear: number;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  overallRating: number | null;
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  goals: string | null;
  acknowledgement: string | null;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(r: ReviewWithRelations) {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.user?.name ?? null,
    userRole: r.user?.role ?? null,
    userTitle: r.user?.title ?? null,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewer?.name ?? null,
    period: r.period as "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL",
    periodYear: r.periodYear,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    status: r.status as "DRAFT" | "SUBMITTED" | "ACKNOWLEDGED",
    overallRating: r.overallRating,
    summary: r.summary,
    strengths: r.strengths,
    improvements: r.improvements,
    goals: r.goals,
    acknowledgement: r.acknowledgement,
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const reviewInclude = {
  user: { select: { name: true, role: true, title: true } },
  reviewer: { select: { name: true } },
} as const;

type ProjectRating = {
  id: string;
  reviewId: string;
  projectId: string;
  project: { code: string; name: string } | null;
  rating: number;
  comment: string | null;
  ratedById: string;
  ratedBy: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializeRating(pr: ProjectRating) {
  return {
    id: pr.id,
    reviewId: pr.reviewId,
    projectId: pr.projectId,
    projectCode: pr.project?.code ?? null,
    projectName: pr.project?.name ?? null,
    rating: pr.rating,
    comment: pr.comment,
    ratedById: pr.ratedById,
    ratedByName: pr.ratedBy?.name ?? null,
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
  };
}

const ratingInclude = {
  project: { select: { code: true, name: true } },
  ratedBy: { select: { name: true } },
} as const;

async function computeMetrics(userId: string, start: Date, end: Date) {
  const timesheets = await prisma.timesheet.findMany({
    where: {
      userId,
      status: "APPROVED",
      workDate: { gte: start, lte: end },
    },
    include: {
      project: { select: { id: true, code: true, name: true } },
      task: { select: { billable: true } },
    },
  });
  let billable = 0;
  let total = 0;
  const perProject = new Map<string, { projectId: string; projectCode: string; projectName: string; hours: number }>();
  for (const t of timesheets) {
    total += t.hours;
    const isBillable = t.task ? t.task.billable : true;
    if (isBillable) billable += t.hours;
    if (t.project) {
      const existing = perProject.get(t.project.id);
      if (existing) existing.hours += t.hours;
      else perProject.set(t.project.id, {
        projectId: t.project.id,
        projectCode: t.project.code,
        projectName: t.project.name,
        hours: t.hours,
      });
    }
  }
  // Working-day denominator: ~21 working days per month × 8 hours.
  const months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const capacityHours = months * 21 * 8;
  const utilizationPct = capacityHours > 0 ? (billable / capacityHours) * 100 : 0;
  const skills = await prisma.userSkill.findMany({
    where: { userId },
    select: { skillId: true, proficiency: true, skill: { select: { name: true } } },
  });
  return {
    billableHours: Number(billable.toFixed(2)),
    totalHours: Number(total.toFixed(2)),
    utilizationPct: Number(utilizationPct.toFixed(1)),
    projectCount: perProject.size,
    skillCount: skills.length,
    projects: [...perProject.values()].sort((a, b) => b.hours - a.hours),
    skills: skills.map((s) => ({
      skillId: s.skillId,
      skillName: s.skill.name,
      proficiency: s.proficiency,
    })),
  };
}

async function loadDetail(id: string) {
  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: reviewInclude,
  });
  if (!review) return null;
  const ratings = await prisma.performanceReviewProjectRating.findMany({
    where: { reviewId: id },
    include: ratingInclude,
    orderBy: { createdAt: "desc" },
  });
  const metrics = await computeMetrics(review.userId, review.periodStart, review.periodEnd);
  const ratingValues = ratings.map((r) => r.rating);
  const avg = ratingValues.length ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length : null;
  return {
    ...serialize(review),
    projectRatings: ratings.map(serializeRating),
    metrics: {
      ...metrics,
      avgProjectRating: avg !== null ? Number(avg.toFixed(2)) : null,
    },
  };
}

async function canAccessReview(
  review: { userId: string; reviewerId: string },
  user: { sub: string; role: string },
): Promise<boolean> {
  if (canAdministerReviews(user.role)) return true;
  if (review.userId === user.sub) return true;
  if (review.reviewerId === user.sub) return true;
  // PMs and Principals who manage the subject directly.
  const subject = await prisma.user.findUnique({
    where: { id: review.userId },
    select: { managerId: true, principalId: true },
  });
  if (!subject) return false;
  return subject.managerId === user.sub || subject.principalId === user.sub;
}

function canEditReview(
  review: { reviewerId: string; status: string },
  user: { sub: string; role: string },
): boolean {
  if (review.status === "ACKNOWLEDGED") return false;
  if (canAdministerReviews(user.role)) return true;
  return review.reviewerId === user.sub;
}

router.get("/performance-reviews", async (req, res) => {
  const user = req.user!;
  const where: Record<string, unknown> = {};
  if (req.query.userId) where.userId = String(req.query.userId);
  if (req.query.reviewerId) where.reviewerId = String(req.query.reviewerId);
  if (req.query.status) {
    const s = String(req.query.status);
    if (STATUSES.has(s)) where.status = s;
  }
  if (req.query.year) {
    const y = Number(req.query.year);
    if (Number.isFinite(y)) where.periodYear = y;
  }
  // Scope: admins see all; others see those they author, are subject of, or
  // manage the subject (manager/principal).
  if (!canAdministerReviews(user.role)) {
    const supervised = await prisma.user.findMany({
      where: { OR: [{ managerId: user.sub }, { principalId: user.sub }] },
      select: { id: true },
    });
    const allowedSubjectIds = [user.sub, ...supervised.map((u) => u.id)];
    where.OR = [
      { userId: { in: allowedSubjectIds } },
      { reviewerId: user.sub },
    ];
  }
  const reviews = await prisma.performanceReview.findMany({
    where,
    include: reviewInclude,
    orderBy: [{ periodYear: "desc" }, { period: "desc" }, { createdAt: "desc" }],
  });
  res.json(reviews.map(serialize));
});

router.post("/performance-reviews", async (req, res) => {
  const user = req.user!;
  const body = req.body || {};
  const userId = String(body.userId ?? "");
  const period = String(body.period ?? "");
  const periodYear = Number(body.periodYear);
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  if (!PERIODS.has(period)) { res.status(400).json({ error: "period invalid" }); return; }
  if (!Number.isFinite(periodYear) || periodYear < 2000 || periodYear > 2100) {
    res.status(400).json({ error: "periodYear invalid" }); return;
  }
  const subject = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, managerId: true, principalId: true, isActive: true },
  });
  if (!subject) { res.status(404).json({ error: "Subject user not found" }); return; }
  const isManager = subject.managerId === user.sub || subject.principalId === user.sub;
  if (!canAdministerReviews(user.role) && !isManager) {
    res.status(403).json({ error: "Only HR/Management or the subject's direct manager can create a review" });
    return;
  }
  let reviewerId = user.sub;
  if (body.reviewerId && canAdministerReviews(user.role)) {
    reviewerId = String(body.reviewerId);
    const r = await prisma.user.findUnique({ where: { id: reviewerId }, select: { id: true } });
    if (!r) { res.status(400).json({ error: "reviewerId not found" }); return; }
  }
  const { start, end } = periodRange(period, periodYear);
  try {
    const created = await prisma.performanceReview.create({
      data: {
        userId,
        reviewerId,
        period: period as "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL",
        periodYear,
        periodStart: start,
        periodEnd: end,
        status: "DRAFT",
      },
      include: reviewInclude,
    });
    await recordAudit(req, {
      action: "performance_review.created",
      entityType: "PerformanceReview",
      entityId: created.id,
      description: `Created ${period} ${periodYear} review for user ${userId}`,
      after: { id: created.id, userId, reviewerId, period, periodYear },
    });
    res.status(201).json(serialize(created));
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      res.status(409).json({ error: "A review for this user and period already exists" });
      return;
    }
    throw err;
  }
});

router.get("/performance-reviews/:id", async (req, res) => {
  const id = String(req.params.id);
  const review = await prisma.performanceReview.findUnique({ where: { id } });
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  if (!(await canAccessReview(review, req.user!))) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const detail = await loadDetail(id);
  res.json(detail);
});

router.patch("/performance-reviews/:id", async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.performanceReview.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: "Review not found" }); return; }
  if (!canEditReview(before, req.user!)) {
    res.status(403).json({ error: "Only the reviewer or HR/Management can edit, and not after acknowledgement" });
    return;
  }
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  if (body.overallRating !== undefined) {
    if (body.overallRating === null) data.overallRating = null;
    else {
      const r = Number(body.overallRating);
      if (!Number.isInteger(r) || r < 1 || r > 5) { res.status(400).json({ error: "overallRating must be 1..5" }); return; }
      data.overallRating = r;
    }
  }
  for (const f of ["summary", "strengths", "improvements", "goals"] as const) {
    if (body[f] !== undefined) data[f] = body[f] ? String(body[f]) : null;
  }
  // acknowledgement only writable by subject via /acknowledge endpoint; ignore here.
  const updated = await prisma.performanceReview.update({
    where: { id },
    data,
    include: reviewInclude,
  });
  await recordAudit(req, {
    action: "performance_review.updated",
    entityType: "PerformanceReview",
    entityId: id,
    description: `Updated review ${id}`,
  });
  const detail = await loadDetail(updated.id);
  res.json(detail);
});

router.delete("/performance-reviews/:id", async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.performanceReview.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: "Review not found" }); return; }
  if (!canAdministerReviews(req.user!.role)) {
    res.status(403).json({ error: "Only HR/Management can delete reviews" });
    return;
  }
  await prisma.performanceReview.delete({ where: { id } });
  await recordAudit(req, {
    action: "performance_review.deleted",
    entityType: "PerformanceReview",
    entityId: id,
    description: `Deleted review ${id}`,
  });
  res.json({ message: "Review deleted" });
});

router.post("/performance-reviews/:id/submit", async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.performanceReview.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: "Review not found" }); return; }
  if (!canEditReview(before, req.user!)) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  if (before.status !== "DRAFT") {
    res.status(409).json({ error: "Only DRAFT reviews can be submitted" });
    return;
  }
  if (!before.overallRating) {
    res.status(400).json({ error: "Set an overall rating before submitting" });
    return;
  }
  await prisma.performanceReview.update({
    where: { id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await recordAudit(req, {
    action: "performance_review.submitted",
    entityType: "PerformanceReview",
    entityId: id,
    description: `Submitted review ${id}`,
  });
  const detail = await loadDetail(id);
  res.json(detail);
});

router.post("/performance-reviews/:id/acknowledge", async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.performanceReview.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: "Review not found" }); return; }
  if (before.userId !== req.user!.sub) {
    res.status(403).json({ error: "Only the subject can acknowledge their review" });
    return;
  }
  if (before.status !== "SUBMITTED") {
    res.status(409).json({ error: "Review must be SUBMITTED before acknowledgement" });
    return;
  }
  const ack = req.body?.acknowledgement ? String(req.body.acknowledgement) : null;
  await prisma.performanceReview.update({
    where: { id },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgement: ack },
  });
  await recordAudit(req, {
    action: "performance_review.acknowledged",
    entityType: "PerformanceReview",
    entityId: id,
    description: `Acknowledged review ${id}`,
  });
  const detail = await loadDetail(id);
  res.json(detail);
});

router.post("/performance-reviews/:id/project-ratings", async (req, res) => {
  const id = String(req.params.id);
  const review = await prisma.performanceReview.findUnique({ where: { id } });
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  if (!(await canAccessReview(review, req.user!))) {
    res.status(403).json({ error: "Not allowed to view this review" });
    return;
  }
  if (review.status === "ACKNOWLEDGED") {
    res.status(409).json({ error: "Cannot add ratings after acknowledgement" });
    return;
  }
  const body = req.body || {};
  const projectId = String(body.projectId ?? "");
  const rating = Number(body.rating);
  if (!projectId) { res.status(400).json({ error: "projectId required" }); return; }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be 1..5" }); return;
  }
  // Only MGMT/HR or the project's PM can rate, AND the project must be
  // linked to the review subject within the review period (via approved
  // timesheet or an active resource assignment). This blocks PMs from
  // rating unrelated subjects with their own projects.
  const isAdminOrHr = canAdministerReviews(req.user!.role);
  const canWrite = isAdminOrHr || (await userCanWriteProject(projectId, req.user!));
  if (!canWrite) {
    res.status(403).json({ error: "Only the project's PM or HR/Management can rate this project" });
    return;
  }
  const [tsLink, resourceLink] = await Promise.all([
    prisma.timesheet.findFirst({
      where: {
        userId: review.userId,
        projectId,
        status: "APPROVED",
        workDate: { gte: review.periodStart, lte: review.periodEnd },
      },
      select: { id: true },
    }),
    prisma.projectResource.findFirst({
      where: { userId: review.userId, projectId },
      select: { id: true },
    }),
  ]);
  if (!tsLink && !resourceLink) {
    res.status(400).json({
      error: "Project is not linked to this employee within the review period (no approved timesheets or resource assignment)",
    });
    return;
  }
  const comment = body.comment ? String(body.comment) : null;
  const existing = await prisma.performanceReviewProjectRating.findUnique({
    where: { reviewId_projectId: { reviewId: id, projectId } },
  });
  let saved;
  if (existing) {
    saved = await prisma.performanceReviewProjectRating.update({
      where: { id: existing.id },
      data: { rating, comment, ratedById: req.user!.sub },
      include: ratingInclude,
    });
  } else {
    saved = await prisma.performanceReviewProjectRating.create({
      data: { reviewId: id, projectId, rating, comment, ratedById: req.user!.sub },
      include: ratingInclude,
    });
  }
  await recordAudit(req, {
    action: "performance_review.project_rated",
    entityType: "PerformanceReviewProjectRating",
    entityId: saved.id,
    description: `Rated project ${projectId} as ${rating}/5 on review ${id}`,
    after: { reviewId: id, projectId, rating },
  });
  res.json(serializeRating(saved));
});

router.delete("/performance-reviews/:id/project-ratings/:ratingId", async (req, res) => {
  const id = String(req.params.id);
  const ratingId = String(req.params.ratingId);
  const rating = await prisma.performanceReviewProjectRating.findUnique({ where: { id: ratingId } });
  if (!rating || rating.reviewId !== id) { res.status(404).json({ error: "Rating not found" }); return; }
  const review = await prisma.performanceReview.findUnique({ where: { id } });
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  if (review.status === "ACKNOWLEDGED") {
    res.status(409).json({ error: "Cannot delete ratings after acknowledgement" });
    return;
  }
  const isAdminOrHr = canAdministerReviews(req.user!.role);
  const isOwner = rating.ratedById === req.user!.sub;
  if (!isAdminOrHr && !isOwner) {
    res.status(403).json({ error: "Only the rater or HR/Management can delete this rating" });
    return;
  }
  await prisma.performanceReviewProjectRating.delete({ where: { id: ratingId } });
  await recordAudit(req, {
    action: "performance_review.project_rating_removed",
    entityType: "PerformanceReviewProjectRating",
    entityId: ratingId,
    description: `Removed rating ${ratingId} from review ${id}`,
  });
  res.json({ message: "Rating removed" });
});

export default router;
