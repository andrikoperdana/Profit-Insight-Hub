import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit, recordAuditAnon } from "../lib/audit.js";
import { ensureDefaultSurveyQuestions, issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";

const router: IRouter = Router();

async function getActiveQuestions() {
  await ensureDefaultSurveyQuestions();
  return prisma.surveyQuestion.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });
}

type StoredQuestion = { key: string; text: string; type: string; order: number };

/**
 * Build the union of question keys seen across active questions and the
 * snapshots saved with each response. Falls back to active question metadata
 * for keys that only appear in snapshots; uses snapshot metadata when the
 * active list does not contain the key.
 */
function unionQuestions(
  activeQuestions: StoredQuestion[],
  responses: { questionsSnapshot: unknown }[],
): StoredQuestion[] {
  const map = new Map<string, StoredQuestion>();
  for (const q of activeQuestions) map.set(q.key, q);
  for (const r of responses) {
    const snap = r.questionsSnapshot;
    if (Array.isArray(snap)) {
      for (const sq of snap as StoredQuestion[]) {
        if (sq?.key && !map.has(sq.key)) map.set(sq.key, sq);
      }
    }
  }
  return [...map.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function computeAggregates(
  responses: { answers: unknown }[],
  questions: StoredQuestion[],
) {
  const agg = questions
    .filter((q) => q.type === "RATING")
    .map((q) => {
      let sum = 0;
      let count = 0;
      for (const r of responses) {
        const a = (r.answers as Record<string, { rating?: number }> | null)?.[q.key];
        if (a && typeof a.rating === "number" && a.rating > 0) {
          sum += a.rating;
          count += 1;
        }
      }
      return {
        key: q.key,
        text: q.text,
        order: q.order,
        average: count > 0 ? sum / count : 0,
        responseCount: count,
      };
    })
    .sort((a, b) => a.order - b.order);
  const overallSum = agg.reduce((s, r) => s + r.average, 0);
  const overallAverage = agg.length > 0 ? overallSum / agg.length : 0;
  return { perQuestion: agg, overallAverage };
}

// =====================================================================
// PUBLIC ROUTES (no authentication)
// =====================================================================

router.get("/public/surveys/:token", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { surveyToken: req.params.token },
    include: { client: true },
  });
  if (!project || project.deletedAt || project.status !== "CLOSED") {
    res.status(404).json({ error: "Survey not available" });
    return;
  }
  const questions = await getActiveQuestions();
  res.json({
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      clientName: project.client.name,
    },
    questions: questions.map((q) => ({
      key: q.key,
      text: q.text,
      type: q.type,
      required: q.required,
      order: q.order,
    })),
  });
});

router.post("/public/surveys/:token", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { surveyToken: req.params.token },
  });
  if (!project || project.deletedAt || project.status !== "CLOSED") {
    res.status(404).json({ error: "Survey not available" });
    return;
  }
  const body = req.body || {};
  const questions = await getActiveQuestions();
  const answers: Record<string, { rating?: number; comment?: string; text?: string }> = {};
  let lessonLearned: string | null = null;

  for (const q of questions) {
    const raw = body.answers?.[q.key];
    if (q.type === "RATING") {
      const rating = Number(raw?.rating);
      if (q.required && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
        res.status(400).json({ error: `Question "${q.text}" requires a rating from 1 to 5` });
        return;
      }
      if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
        answers[q.key] = { rating };
        if (typeof raw?.comment === "string" && raw.comment.trim().length > 0) {
          answers[q.key].comment = String(raw.comment).slice(0, 1000);
        }
      }
    } else {
      const text = typeof raw?.text === "string" ? raw.text : typeof raw === "string" ? raw : "";
      if (q.required && !text.trim()) {
        res.status(400).json({ error: `Question "${q.text}" is required` });
        return;
      }
      if (text) {
        answers[q.key] = { text: text.slice(0, 4000) };
        if (q.key === "lesson_learned") lessonLearned = text.slice(0, 4000);
      }
    }
  }

  const submitterName = body.submitterName ? String(body.submitterName).slice(0, 200) : null;
  const submitterEmail = body.submitterEmail ? String(body.submitterEmail).slice(0, 200) : null;

  const created = await prisma.surveyResponse.create({
    data: {
      projectId: project.id,
      submitterName,
      submitterEmail,
      lessonLearned,
      answers,
      questionsSnapshot: questions.map((q) => ({
        key: q.key,
        text: q.text,
        type: q.type,
        order: q.order,
        required: q.required,
      })),
    },
  });

  // Activity (visible to PM/Mgmt) + audit
  await prisma.activity.create({
    data: {
      type: "survey.submitted",
      message: `Customer survey submitted for ${project.code}${submitterName ? ` by ${submitterName}` : ""}`,
      projectId: project.id,
    },
  });
  await recordAuditAnon({
    action: "survey.submitted",
    entityType: "SurveyResponse",
    entityId: created.id,
    userName: submitterName ?? "Anonymous client",
    userRole: "CLIENT",
    description: `Survey response submitted for project ${project.code}`,
    after: { projectId: project.id, answers, submitterName, submitterEmail },
  });

  res.status(201).json({ ok: true });
});

// =====================================================================
// AUTHENTICATED ROUTES
// =====================================================================

// Template management — MANAGEMENT only
router.get("/survey/template", requireAuth, requireRole("MANAGEMENT"), async (_req, res) => {
  await ensureDefaultSurveyQuestions();
  const questions = await prisma.surveyQuestion.findMany({
    orderBy: { order: "asc" },
  });
  res.json(questions);
});

router.put("/survey/template", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const items = Array.isArray(req.body?.questions) ? req.body.questions : null;
  if (!items) {
    res.status(400).json({ error: "questions array is required" });
    return;
  }
  const before = await prisma.surveyQuestion.findMany({ orderBy: { order: "asc" } });

  // Validate
  const seenKeys = new Set<string>();
  for (const it of items) {
    if (!it.key || !it.text) {
      res.status(400).json({ error: "Each question requires key and text" });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(String(it.key))) {
      res.status(400).json({ error: `Invalid key "${it.key}". Use lowercase letters, numbers, underscores only.` });
      return;
    }
    if (seenKeys.has(it.key)) {
      res.status(400).json({ error: `Duplicate key "${it.key}"` });
      return;
    }
    seenKeys.add(it.key);
    if (it.type && !["RATING", "TEXT"].includes(it.type)) {
      res.status(400).json({ error: `Invalid type "${it.type}". Must be RATING or TEXT.` });
      return;
    }
  }

  // Upsert each, deactivate missing ones (keep history for keys still
  // referenced by historic responses)
  const incomingKeys = new Set<string>(items.map((i: { key: string }) => i.key));
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      await tx.surveyQuestion.upsert({
        where: { key: String(it.key) },
        create: {
          key: String(it.key),
          text: String(it.text),
          type: String(it.type ?? "RATING"),
          order: Number(it.order ?? i + 1),
          required: it.required !== false,
          isActive: it.isActive !== false,
        },
        update: {
          text: String(it.text),
          type: String(it.type ?? "RATING"),
          order: Number(it.order ?? i + 1),
          required: it.required !== false,
          isActive: it.isActive !== false,
        },
      });
    }
    for (const q of before) {
      if (!incomingKeys.has(q.key) && q.isActive) {
        await tx.surveyQuestion.update({
          where: { id: q.id },
          data: { isActive: false },
        });
      }
    }
  });

  const after = await prisma.surveyQuestion.findMany({ orderBy: { order: "asc" } });
  await recordAudit(req, {
    action: "survey.template_updated",
    entityType: "SurveyTemplate",
    description: `Survey template updated (${after.length} active questions)`,
    before: { questions: before },
    after: { questions: after },
  });
  res.json(after);
});

// Per-project survey view — PM owners + MANAGEMENT
router.get("/projects/:id/survey", requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, code: true, name: true, status: true, pmId: true, deletedAt: true, surveyToken: true },
  });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && !(role === "PROJECT_MANAGER" && project.pmId === req.user!.sub)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Atomically issue token if project is closed and missing one
  let token = project.surveyToken;
  if (project.status === "CLOSED" && !token) {
    token = await issueSurveyTokenIfMissing(project.id);
  }

  const activeQuestions = await getActiveQuestions();
  const responses = await prisma.surveyResponse.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
  });
  // Use the union of currently-active questions plus any historical questions
  // captured in response snapshots so historical responses remain readable
  // even after Management edits the template.
  const allQuestions = unionQuestions(activeQuestions as StoredQuestion[], responses);
  const aggregates = computeAggregates(responses, allQuestions);

  // Build public URL — best-effort using request host
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const proto = (req.get("x-forwarded-proto") || (req.secure ? "https" : "http")).split(",")[0];
  const publicUrl = token ? `${proto}://${host}/survey/${token}` : null;

  res.json({
    project: { id: project.id, code: project.code, name: project.name, status: project.status },
    surveyAvailable: project.status === "CLOSED",
    surveyToken: token,
    publicUrl,
    questions: allQuestions.map((q) => ({
      key: q.key,
      text: q.text,
      type: q.type,
      order: q.order,
      required: (q as { required?: boolean }).required ?? false,
    })),
    aggregates,
    responses: responses.map((r) => ({
      id: r.id,
      submitterName: r.submitterName,
      submitterEmail: r.submitterEmail,
      lessonLearned: r.lessonLearned,
      answers: r.answers,
      questionsSnapshot: r.questionsSnapshot,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// Dashboard widget — average satisfaction this month (MANAGEMENT)
router.get("/survey/summary", requireAuth, requireRole("MANAGEMENT", "PROJECT_MANAGER"), async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const where: { createdAt: { gte: Date }; project?: { pmId: string } } = {
    createdAt: { gte: monthStart },
  };
  if (req.user!.role === "PROJECT_MANAGER") {
    where.project = { pmId: req.user!.sub };
  }
  const responses = await prisma.surveyResponse.findMany({
    where,
    select: { answers: true, projectId: true, questionsSnapshot: true },
  });
  const activeRatingQuestions = await prisma.surveyQuestion.findMany({
    where: { isActive: true, type: "RATING" },
  });
  // Union with snapshotted historical questions so the summary still reflects
  // ratings against questions that were since edited or deactivated.
  const allQuestions = unionQuestions(
    activeRatingQuestions as StoredQuestion[],
    responses,
  ).filter((q) => q.type === "RATING");
  const { perQuestion, overallAverage } = computeAggregates(responses, allQuestions);
  res.json({
    monthStart: monthStart.toISOString(),
    responseCount: responses.length,
    overallAverage,
    perQuestion,
  });
});

export default router;
