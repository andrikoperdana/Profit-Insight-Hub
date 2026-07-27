import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanWriteProject } from "../lib/projectAccess.js";

const router: IRouter = Router();
router.use(requireAuth);

const PERIODS = new Set(["Q1", "Q2", "Q3", "Q4", "ANNUAL"]);
const STATUSES = new Set(["DRAFT", "SUBMITTED", "ACKNOWLEDGED"]);

const PRINCIPAL_ROLES = new Set([
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
]);

const PERFORMANCE_REVIEW_ROLES = new Set<string>([
  "MANAGEMENT",
  "SUPER_ADMIN",
  "PROJECT_MANAGER",
  ...PRINCIPAL_ROLES,
]);

// Performance Reviews are restricted to three role buckets:
//   - MANAGEMENT (PMO Director): reviews PROJECT_MANAGER subjects only
//   - PROJECT_MANAGER: reviews team members on their own projects
//   - PRINCIPAL_*: reviews users whose principalId === own id
// No other role may read or write any review.
// NOTE: this is mounted under the explicit "/performance-reviews" path prefix so
// it never runs for sibling routers mounted via router.use(subRouter) in routes/index.ts.
const requirePerfReviewRole = (req: any, res: any, next: any) => {
  if (!PERFORMANCE_REVIEW_ROLES.has(req.user!.role)) {
    res.status(403).json({
      error:
        "Performance Reviews are only accessible to PMO Director (Management), Project Managers, and Principals",
    });
    return;
  }
  next();
};
router.use("/performance-reviews", requirePerfReviewRole);

// Returns the set of subject userIds the caller is allowed to review.
async function allowedSubjectIds(user: { sub: string; role: string }): Promise<string[]> {
  if (user.role === "SUPER_ADMIN") {
    const everyone = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    return everyone.map((u) => u.id);
  }
  if (user.role === "MANAGEMENT") {
    const pms = await prisma.user.findMany({
      where: { role: "PROJECT_MANAGER" },
      select: { id: true },
    });
    return pms.map((u) => u.id);
  }
  if (user.role === "PROJECT_MANAGER") {
    const projects = await prisma.project.findMany({
      where: { pmId: user.sub },
      select: { id: true, adminProjectId: true, technicalWriterId: true },
    });
    const ids = new Set<string>();
    for (const p of projects) {
      if (p.adminProjectId) ids.add(p.adminProjectId);
      if (p.technicalWriterId) ids.add(p.technicalWriterId);
    }
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length > 0) {
      const [resources, ts] = await Promise.all([
        prisma.projectResource.findMany({
          where: { projectId: { in: projectIds } },
          select: { userId: true },
        }),
        prisma.timesheet.findMany({
          where: { projectId: { in: projectIds }, status: "APPROVED" },
          select: { userId: true },
          distinct: ["userId"],
        }),
      ]);
      resources.forEach((r) => ids.add(r.userId));
      ts.forEach((t) => ids.add(t.userId));
    }
    return [...ids];
  }
  if (PRINCIPAL_ROLES.has(user.role)) {
    const subs = await prisma.user.findMany({
      where: { principalId: user.sub },
      select: { id: true },
    });
    return subs.map((u) => u.id);
  }
  return [];
}

async function canReviewSubject(subjectUserId: string, user: { sub: string; role: string }): Promise<boolean> {
  const ids = await allowedSubjectIds(user);
  return ids.includes(subjectUserId);
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
  // Independent queries — run in parallel to save a round-trip on the remote DB.
  const [timesheets, skills] = await Promise.all([
    prisma.timesheet.findMany({
      where: {
        userId,
        status: "APPROVED",
        workDate: { gte: start, lte: end },
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        task: { select: { billable: true } },
      },
    }),
    prisma.userSkill.findMany({
      where: { userId },
      select: { skillId: true, proficiency: true, skill: { select: { name: true } } },
    }),
  ]);
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
  // Ratings only need the review id, so fetch them alongside the review itself.
  const [review, ratings] = await Promise.all([
    prisma.performanceReview.findUnique({
      where: { id },
      include: reviewInclude,
    }),
    prisma.performanceReviewProjectRating.findMany({
      where: { reviewId: id },
      include: ratingInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!review) return null;
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
  review: { userId: string },
  user: { sub: string; role: string },
): Promise<boolean> {
  // Access is granted only if the caller currently has the subject within
  // their reviewable scope (MGMT→PMs, PM→team, Principal→supervisees).
  return canReviewSubject(review.userId, user);
}

async function canEditReview(
  review: { userId: string; reviewerId: string; status: string },
  user: { sub: string; role: string },
): Promise<boolean> {
  if (review.status === "ACKNOWLEDGED") return false;
  // Only the original reviewer may edit, and only while the subject is still
  // within their reviewable scope. MGMT may also edit reviews of PM subjects
  // even if another MGMT user authored them.
  if (!(await canReviewSubject(review.userId, user))) return false;
  if (user.role === "MANAGEMENT" || user.role === "SUPER_ADMIN") return true;
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
  // Scope: subjects must be in the caller's reviewable set.
  const allowed = await allowedSubjectIds(user);
  if (req.query.userId) {
    const requested = String(req.query.userId);
    if (!allowed.includes(requested)) {
      res.json([]);
      return;
    }
    where.userId = requested;
  } else {
    where.userId = { in: allowed };
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
    select: { id: true, role: true, isActive: true },
  });
  if (!subject) { res.status(404).json({ error: "Subject user not found" }); return; }
  if (!(await canReviewSubject(userId, user))) {
    res.status(403).json({
      error:
        user.role === "MANAGEMENT"
          ? "Management can only review Project Managers"
          : user.role === "PROJECT_MANAGER"
          ? "Project Managers can only review team members on their own projects"
          : "Principals can only review their direct supervisees",
    });
    return;
  }
  let reviewerId = user.sub;
  if (body.reviewerId && (user.role === "MANAGEMENT" || user.role === "SUPER_ADMIN")) {
    reviewerId = String(body.reviewerId);
    const r = await prisma.user.findUnique({ where: { id: reviewerId }, select: { id: true, role: true } });
    if (!r) { res.status(400).json({ error: "reviewerId not found" }); return; }
    if (!PERFORMANCE_REVIEW_ROLES.has(r.role)) {
      res.status(400).json({ error: "reviewerId must be a Management, Project Manager, or Principal user" });
      return;
    }
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
  if (!(await canEditReview(before, req.user!))) {
    res.status(403).json({ error: "Only the reviewer (or Management for PM reviews) can edit, and not after acknowledgement" });
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
  if ((req.user!.role !== "MANAGEMENT" && req.user!.role !== "SUPER_ADMIN") || !(await canReviewSubject(before.userId, req.user!))) {
    res.status(403).json({ error: "Only Management can delete reviews, and only for Project Manager subjects" });
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
  if (!(await canEditReview(before, req.user!))) {
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
  // Write-level guard: only the original reviewer (or Management) may add or
  // overwrite project ratings — a read-scope check would let any PM who
  // shares the subject on another project tamper with the recorded scores.
  if (!(await canEditReview(review, req.user!))) {
    res.status(403).json({ error: "Not allowed to edit this review" });
    return;
  }
  // Ratings are part of the review content: lock them once the review leaves
  // DRAFT so a SUBMITTED review is read-only for the subject to acknowledge.
  if (review.status !== "DRAFT") {
    res.status(409).json({ error: "Ratings can only be added while the review is in DRAFT" });
    return;
  }
  const body = req.body || {};
  const projectId = String(body.projectId ?? "");
  const rating = Number(body.rating);
  if (!projectId) { res.status(400).json({ error: "projectId required" }); return; }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be 1..5" }); return;
  }
  // Only MGMT or the project's PM can rate, AND the project must be linked
  // to the review subject within the review period (via approved timesheet
  // or an active resource assignment). This blocks PMs from rating
  // unrelated subjects with their own projects.
  const isMgmt = req.user!.role === "MANAGEMENT" || req.user!.role === "SUPER_ADMIN";
  const canWrite = isMgmt || (await userCanWriteProject(projectId, req.user!));
  if (!canWrite) {
    res.status(403).json({ error: "Only the project's PM or Management can rate this project" });
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
  // Write-level guard: same rules as adding/updating ratings — only the
  // original reviewer (or Management) may mutate review content.
  if (!(await canEditReview(review, req.user!))) {
    res.status(403).json({ error: "Not allowed to edit this review" });
    return;
  }
  // Ratings are part of the review content: lock them once the review leaves
  // DRAFT so a SUBMITTED review stays read-only for the subject to acknowledge.
  if (review.status !== "DRAFT") {
    res.status(409).json({ error: "Ratings can only be removed while the review is in DRAFT" });
    return;
  }
  const isMgmt = req.user!.role === "MANAGEMENT" || req.user!.role === "SUPER_ADMIN";
  const isOwner = rating.ratedById === req.user!.sub;
  if (!isMgmt && !isOwner) {
    res.status(403).json({ error: "Only the rater or Management can delete this rating" });
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
