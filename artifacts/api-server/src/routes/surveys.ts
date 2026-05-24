import { Router, type IRouter, type Response } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit, recordAuditAnon } from "../lib/audit.js";
import { ensureDefaultSurveyQuestions, issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { randomBytes } from "node:crypto";

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

// One-time demo seed (MANAGEMENT only) — closes a few projects and
// inserts realistic CSAT responses dated within the current month.
// Idempotent: refuses to run if any SurveyResponse already exists.
const DEMO_RESPONSES = [
  { submitterName: "Mr. Budi Santoso", submitterEmail: "budi.santoso@banknusantara.co.id", lessonLearned: "The team was very professional and the weekly communication cadence really helped us understand progress.", ratings: { project_management: 5, consultant_performance: 5, report_quality: 4, team_overall: 5 } },
  { submitterName: "Ms. Rina Wijaya", submitterEmail: "rina.wijaya@teleselaras.id", lessonLearned: "The final report was very detailed. Suggestion: the kick-off schedule could be brought forward by 1 week for future projects.", ratings: { project_management: 4, consultant_performance: 5, report_quality: 5, team_overall: 4 } },
  { submitterName: "Mr. Andi Pratama", submitterEmail: "andi.pratama@energiprima.co.id", lessonLearned: "The penetration testing results met our expectations. Please include a more concise executive summary.", ratings: { project_management: 4, consultant_performance: 4, report_quality: 4, team_overall: 4 } },
  { submitterName: "Ms. Sari Mulyani", submitterEmail: null, lessonLearned: "Very satisfied. The consultant was highly responsive to our technical questions.", ratings: { project_management: 5, consultant_performance: 5, report_quality: 5, team_overall: 5 } },
  { submitterName: null, submitterEmail: null, lessonLearned: "Generally good. Suggestion: include configuration documentation directly at handover.", ratings: { project_management: 3, consultant_performance: 4, report_quality: 4, team_overall: 4 } },
  { submitterName: "Mr. Reza Hakim", submitterEmail: "reza@retailmaju.co.id", lessonLearned: "Execution was tidy and the recommendations are very actionable. Thank you!", ratings: { project_management: 5, consultant_performance: 4, report_quality: 5, team_overall: 5 } },
];

router.post("/survey/seed-demo", requireAuth, requireRole("MANAGEMENT"), async (req, res) => {
  const existingResponses = await prisma.surveyResponse.count();
  if (existingResponses > 0) {
    res.status(409).json({ error: "Survey responses already exist", existingResponses });
    return;
  }
  await ensureDefaultSurveyQuestions();
  const candidates = await prisma.project.findMany({
    where: { status: { in: ["COMPLETE", "ACTIVE", "PAUSE", "OBSERVATION", "CLOSED"] } },
    take: 6,
    orderBy: { createdAt: "asc" },
    include: { client: true },
  });
  if (candidates.length === 0) {
    res.status(400).json({ error: "No projects found to attach surveys to" });
    return;
  }
  const questions = await prisma.surveyQuestion.findMany({ where: { isActive: true }, orderBy: { order: "asc" } });
  const snapshot = questions.map((q) => ({ key: q.key, text: q.text, type: q.type, order: q.order, required: q.required }));
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const projectsClosed: string[] = [];
  let respCount = 0;
  let respIdx = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const project = candidates[i];
    let surveyToken = project.surveyToken;
    if (project.status !== "CLOSED" || !surveyToken) {
      surveyToken = surveyToken ?? randomBytes(24).toString("base64url");
      await prisma.project.update({ where: { id: project.id }, data: { status: "CLOSED", surveyToken } });
      projectsClosed.push(project.code);
    }
    const count = i < 3 ? 2 : 1;
    for (let k = 0; k < count; k += 1) {
      const tpl = DEMO_RESPONSES[respIdx % DEMO_RESPONSES.length];
      respIdx += 1;
      const dayOffset = Math.floor(((now.getTime() - monthStart.getTime()) / 86400000) * Math.random());
      const createdAt = new Date(monthStart.getTime() + dayOffset * 86400000 + respIdx * 3600000);
      await prisma.surveyResponse.create({
        data: {
          projectId: project.id,
          submitterName: tpl.submitterName,
          submitterEmail: tpl.submitterEmail,
          lessonLearned: tpl.lessonLearned,
          answers: {
            project_management: { rating: tpl.ratings.project_management },
            consultant_performance: { rating: tpl.ratings.consultant_performance },
            report_quality: { rating: tpl.ratings.report_quality },
            team_overall: { rating: tpl.ratings.team_overall },
            lesson_learned: { text: tpl.lessonLearned },
          },
          questionsSnapshot: snapshot,
          createdAt,
        },
      });
      respCount += 1;
    }
  }
  await recordAudit(req, {
    action: "survey.seed_demo",
    entityType: "Survey",
    description: `Seeded ${respCount} CSAT responses across ${projectsClosed.length} closed projects`,
    after: { projectsClosed, responses: respCount },
  });
  res.json({ ok: true, projectsClosed, responses: respCount });
});

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
    where: { id: String(req.params.id) },
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

// Annual survey list — paginated client feedback across all projects (MGMT only).
// Returns: paginated responses with per-response avg score + per-question
// ratings + free-text comments, plus year-wide aggregates.
router.get("/survey/responses", requireAuth, requireRole("MANAGEMENT", "SALES"), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const where = { createdAt: { gte: start, lt: end } };
  const [total, allForYear, paged] = await Promise.all([
    prisma.surveyResponse.count({ where }),
    prisma.surveyResponse.findMany({
      where,
      select: { answers: true, questionsSnapshot: true },
    }),
    prisma.surveyResponse.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: {
          select: {
            id: true, code: true, name: true,
            client: { select: { id: true, name: true } },
            pm: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  // Compute per-response average + ratings/comments breakdown using the
  // questions snapshot stored on each response (preserves history).
  function buildResponseRow(r: typeof paged[number]) {
    const snap = Array.isArray(r.questionsSnapshot)
      ? (r.questionsSnapshot as StoredQuestion[])
      : [];
    const answers = (r.answers ?? {}) as Record<string, { rating?: number; comment?: string; text?: string }>;
    const ratings: { key: string; text: string; rating: number; comment: string | null }[] = [];
    const textAnswers: { key: string; text: string; answer: string }[] = [];
    for (const q of snap) {
      const a = answers[q.key];
      if (!a) continue;
      if (q.type === "RATING") {
        const rating = typeof a.rating === "number" ? a.rating : null;
        if (rating !== null && rating > 0) {
          ratings.push({
            key: q.key,
            text: q.text,
            rating,
            comment: a.comment?.trim() ? a.comment : null,
          });
        }
      } else if (q.type === "TEXT") {
        const txt = (a.text ?? "").trim();
        if (txt) textAnswers.push({ key: q.key, text: q.text, answer: txt });
      }
    }
    const avg = ratings.length > 0
      ? ratings.reduce((s, x) => s + x.rating, 0) / ratings.length
      : 0;
    return {
      id: r.id,
      projectId: r.project.id,
      projectCode: r.project.code,
      projectName: r.project.name,
      clientName: r.project.client.name,
      pmName: r.project.pm?.name ?? null,
      submitterName: r.submitterName,
      submitterEmail: r.submitterEmail,
      lessonLearned: r.lessonLearned,
      submittedAt: r.createdAt.toISOString(),
      scoreAvg: avg,
      ratingCount: ratings.length,
      ratings,
      textAnswers,
    };
  }

  // Year-wide aggregates over every response (not just current page).
  let yearSum = 0;
  let yearCount = 0;
  for (const r of allForYear) {
    const snap = Array.isArray(r.questionsSnapshot)
      ? (r.questionsSnapshot as StoredQuestion[])
      : [];
    const answers = (r.answers ?? {}) as Record<string, { rating?: number }>;
    let respSum = 0;
    let respN = 0;
    for (const q of snap) {
      if (q.type !== "RATING") continue;
      const v = answers[q.key]?.rating;
      if (typeof v === "number" && v > 0) {
        respSum += v;
        respN += 1;
      }
    }
    if (respN > 0) {
      yearSum += respSum / respN;
      yearCount += 1;
    }
  }
  const yearAverage = yearCount > 0 ? yearSum / yearCount : 0;

  res.json({
    year,
    page,
    pageSize,
    total,
    yearAverage,
    yearResponseCount: yearCount,
    items: paged.map(buildResponseRow),
  });
});

// =====================================================================
// EXPORT ROUTES — Excel & PDF
// =====================================================================

function ratingFromAnswer(a: unknown): number | null {
  const v = (a as { rating?: number } | null)?.rating;
  return typeof v === "number" && v > 0 ? v : null;
}
function textFromAnswer(a: unknown): string {
  const v = (a as { text?: string } | null)?.text;
  return v ? String(v) : "";
}

async function loadProjectSurvey(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true, pm: { select: { id: true, name: true } } },
  });
  if (!project) return null;
  const activeQuestions = await getActiveQuestions();
  const responses = await prisma.surveyResponse.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const allQuestions = unionQuestions(activeQuestions as StoredQuestion[], responses);
  const aggregates = computeAggregates(responses, allQuestions);
  return { project, allQuestions, responses, aggregates };
}

function canViewProjectSurvey(role: string, pmId: string | null, userId: string) {
  return role === "MANAGEMENT" || role === "AUDITOR" || (role === "PROJECT_MANAGER" && pmId === userId);
}

// ---- Per-project Excel export ----
router.get(
  "/projects/:id/survey/export.xlsx",
  requireAuth,
  async (req, res) => {
    const data = await loadProjectSurvey(String(req.params.id));
    if (!data) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!canViewProjectSurvey(req.user!.role, data.project.pmId, req.user!.sub)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "SecureProfit Hub";
    wb.created = new Date();

    // Sheet 1: Summary
    const s1 = wb.addWorksheet("Summary");
    s1.columns = [
      { header: "Field", key: "k", width: 28 },
      { header: "Value", key: "v", width: 60 },
    ];
    s1.getRow(1).font = { bold: true };
    s1.addRows([
      { k: "Project Code", v: data.project.code },
      { k: "Project Name", v: data.project.name },
      { k: "Client", v: data.project.client.name },
      { k: "Status", v: data.project.status },
      { k: "Project Manager", v: data.project.pm?.name ?? "" },
      { k: "Total Responses", v: data.responses.length },
      { k: "Overall Average (out of 5)", v: Number(data.aggregates.overallAverage.toFixed(2)) },
      { k: "Generated At", v: new Date().toISOString() },
    ]);
    s1.addRow({});
    s1.addRow({ k: "Per-Question Average", v: "" }).font = { bold: true };
    s1.addRow({ k: "Question", v: "Average / Responses" }).font = { bold: true };
    for (const q of data.aggregates.perQuestion) {
      s1.addRow({ k: q.text, v: `${q.average.toFixed(2)} (${q.responseCount} resp.)` });
    }

    // Sheet 2: Responses
    const s2 = wb.addWorksheet("Responses");
    const headers = [
      { header: "#", key: "n", width: 5 },
      { header: "Submitted At", key: "ts", width: 22 },
      { header: "Submitter", key: "name", width: 24 },
      { header: "Email", key: "email", width: 28 },
    ];
    for (const q of data.allQuestions) {
      headers.push({ header: q.text, key: `q_${q.key}`, width: 28 });
    }
    s2.columns = headers;
    s2.getRow(1).font = { bold: true };
    s2.getRow(1).alignment = { vertical: "middle", wrapText: true };

    data.responses.forEach((r, i) => {
      const row: Record<string, unknown> = {
        n: i + 1,
        ts: r.createdAt.toISOString().replace("T", " ").slice(0, 19),
        name: r.submitterName ?? "(Anonymous)",
        email: r.submitterEmail ?? "",
      };
      for (const q of data.allQuestions) {
        const a = (r.answers as Record<string, unknown> | null)?.[q.key];
        row[`q_${q.key}`] = q.type === "RATING" ? ratingFromAnswer(a) ?? "" : textFromAnswer(a);
      }
      s2.addRow(row);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="survey-${data.project.code}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  },
);

// ---- Per-project PDF export ----
function streamPdfReport(
  res: Response,
  filename: string,
  build: (doc: PDFKit.PDFDocument) => void,
) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 60, right: 60 } });
  doc.pipe(res);
  build(doc);
  doc.end();
}

function pdfHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.save();
  doc.rect(0, 0, doc.page.width, 90).fillColor("#0f172a").fill();
  doc.restore();
  doc.save();
  doc.rect(0, 90, doc.page.width, 3).fillColor("#22c55e").fill();
  doc.restore();
  doc.fillColor("#22c55e").font("Helvetica-Bold").fontSize(14).text("SecureProfit Hub", 60, 28);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(title, 60, 50);
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(10).text(subtitle, 60, 72);
  doc.moveDown(4);
  doc.fillColor("#0f172a");
}

router.get(
  "/projects/:id/survey/export.pdf",
  requireAuth,
  async (req, res) => {
    const data = await loadProjectSurvey(String(req.params.id));
    if (!data) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!canViewProjectSurvey(req.user!.role, data.project.pmId, req.user!.sub)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    streamPdfReport(res, `survey-${data.project.code}.pdf`, (doc) => {
      pdfHeader(doc, "Customer Satisfaction Report", `${data.project.code} — ${data.project.name}`);
      doc.font("Helvetica").fontSize(10).fillColor("#1f2937");
      doc.text(`Client: ${data.project.client.name}`);
      doc.text(`Project Manager: ${data.project.pm?.name ?? "—"}`);
      doc.text(`Status: ${data.project.status}`);
      doc.text(`Total Responses: ${data.responses.length}`);
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();

      // Overall average highlight
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Overall Average");
      doc.font("Helvetica-Bold").fontSize(28).fillColor("#22c55e")
        .text(`${data.aggregates.overallAverage.toFixed(2)} / 5.00`);
      doc.moveDown();

      // Per-question table
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Per-Question Averages");
      doc.moveDown(0.3);
      const left = 60;
      const colW = [320, 80, 80];
      const drawRow = (cells: string[], opts: { head?: boolean; alt?: boolean } = {}) => {
        const y = doc.y;
        const rowH = 22;
        if (opts.head) {
          doc.save(); doc.rect(left, y, colW[0] + colW[1] + colW[2], rowH).fillColor("#0f172a").fill(); doc.restore();
          doc.fillColor("#e2e8f0").font("Helvetica-Bold").fontSize(10);
        } else {
          if (opts.alt) { doc.save(); doc.rect(left, y, colW[0] + colW[1] + colW[2], rowH).fillColor("#f8fafc").fill(); doc.restore(); }
          doc.fillColor("#1f2937").font("Helvetica").fontSize(10);
        }
        let x = left + 6;
        for (let i = 0; i < cells.length; i += 1) {
          doc.text(cells[i], x, y + 6, { width: colW[i] - 12, lineBreak: false, ellipsis: true });
          x += colW[i];
        }
        doc.x = left;
        doc.y = y + rowH;
      };
      drawRow(["Question", "Average", "Responses"], { head: true });
      data.aggregates.perQuestion.forEach((q, i) => {
        drawRow([q.text, q.average.toFixed(2), String(q.responseCount)], { alt: i % 2 === 1 });
      });

      doc.moveDown();
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Comments / Lessons Learned");
      doc.moveDown(0.3);
      const withText = data.responses.filter((r) => (r.lessonLearned ?? "").trim());
      if (withText.length === 0) {
        doc.font("Helvetica-Oblique").fontSize(10).fillColor("#64748b").text("No textual feedback provided.");
      } else {
        for (const r of withText) {
          if (doc.y > doc.page.height - 100) doc.addPage();
          doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a")
            .text(`${r.submitterName ?? "(Anonymous)"} — ${r.createdAt.toISOString().slice(0, 10)}`);
          doc.font("Helvetica").fontSize(10).fillColor("#1f2937").text(r.lessonLearned ?? "", { lineGap: 2 });
          doc.moveDown(0.5);
        }
      }
    });
  },
);

// ---- Cross-portfolio summary (this month) — Excel & PDF ----
async function loadSummaryThisMonth(role: string, userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const where: { createdAt: { gte: Date }; project?: { pmId: string } } = {
    createdAt: { gte: monthStart },
  };
  if (role === "PROJECT_MANAGER") where.project = { pmId: userId };
  const responses = await prisma.surveyResponse.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { project: { include: { client: true } } },
  });
  const activeRating = await prisma.surveyQuestion.findMany({
    where: { isActive: true, type: "RATING" },
  });
  const allQuestions = unionQuestions(activeRating as StoredQuestion[], responses)
    .filter((q) => q.type === "RATING");
  const aggregates = computeAggregates(responses, allQuestions);
  return { monthStart, responses, allQuestions, aggregates };
}

router.get(
  "/survey/summary/export.xlsx",
  requireAuth,
  requireRole("MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => {
    const data = await loadSummaryThisMonth(req.user!.role, req.user!.sub);
    const wb = new ExcelJS.Workbook();
    wb.creator = "SecureProfit Hub";
    wb.created = new Date();

    const s1 = wb.addWorksheet("Summary");
    s1.columns = [
      { header: "Field", key: "k", width: 30 },
      { header: "Value", key: "v", width: 50 },
    ];
    s1.getRow(1).font = { bold: true };
    s1.addRows([
      { k: "Period (Month Start)", v: data.monthStart.toISOString().slice(0, 10) },
      { k: "Total Responses", v: data.responses.length },
      { k: "Overall Average (out of 5)", v: Number(data.aggregates.overallAverage.toFixed(2)) },
      { k: "Generated At", v: new Date().toISOString() },
    ]);
    s1.addRow({});
    s1.addRow({ k: "Per-Question Average", v: "" }).font = { bold: true };
    s1.addRow({ k: "Question", v: "Average / Responses" }).font = { bold: true };
    for (const q of data.aggregates.perQuestion) {
      s1.addRow({ k: q.text, v: `${q.average.toFixed(2)} (${q.responseCount} resp.)` });
    }

    const s2 = wb.addWorksheet("Responses");
    const headers = [
      { header: "Submitted At", key: "ts", width: 22 },
      { header: "Project Code", key: "code", width: 18 },
      { header: "Project Name", key: "name", width: 36 },
      { header: "Client", key: "client", width: 28 },
      { header: "Submitter", key: "subm", width: 24 },
      { header: "Email", key: "email", width: 28 },
    ];
    for (const q of data.allQuestions) headers.push({ header: q.text, key: `q_${q.key}`, width: 24 });
    headers.push({ header: "Lesson Learned", key: "ll", width: 60 });
    s2.columns = headers;
    s2.getRow(1).font = { bold: true };
    s2.getRow(1).alignment = { vertical: "middle", wrapText: true };

    for (const r of data.responses) {
      const row: Record<string, unknown> = {
        ts: r.createdAt.toISOString().replace("T", " ").slice(0, 19),
        code: r.project.code,
        name: r.project.name,
        client: r.project.client.name,
        subm: r.submitterName ?? "(Anonymous)",
        email: r.submitterEmail ?? "",
        ll: r.lessonLearned ?? "",
      };
      for (const q of data.allQuestions) {
        const a = (r.answers as Record<string, unknown> | null)?.[q.key];
        row[`q_${q.key}`] = ratingFromAnswer(a) ?? "";
      }
      s2.addRow(row);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="csat-summary-${data.monthStart.toISOString().slice(0, 7)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  },
);

router.get(
  "/survey/summary/export.pdf",
  requireAuth,
  requireRole("MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => {
    const data = await loadSummaryThisMonth(req.user!.role, req.user!.sub);
    const monthLabel = data.monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
    streamPdfReport(res, `csat-summary-${data.monthStart.toISOString().slice(0, 7)}.pdf`, (doc) => {
      pdfHeader(doc, "Customer Satisfaction Summary", `Period: ${monthLabel}`);
      doc.font("Helvetica").fontSize(10).fillColor("#1f2937");
      doc.text(`Total Responses: ${data.responses.length}`);
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Overall Average");
      doc.font("Helvetica-Bold").fontSize(28).fillColor("#22c55e")
        .text(`${data.aggregates.overallAverage.toFixed(2)} / 5.00`);
      doc.moveDown();

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Per-Question Averages");
      doc.moveDown(0.3);
      const left = 60;
      const colW = [320, 80, 80];
      const drawRow = (cells: string[], opts: { head?: boolean; alt?: boolean } = {}) => {
        const y = doc.y;
        const rowH = 22;
        if (opts.head) {
          doc.save(); doc.rect(left, y, colW[0] + colW[1] + colW[2], rowH).fillColor("#0f172a").fill(); doc.restore();
          doc.fillColor("#e2e8f0").font("Helvetica-Bold").fontSize(10);
        } else {
          if (opts.alt) { doc.save(); doc.rect(left, y, colW[0] + colW[1] + colW[2], rowH).fillColor("#f8fafc").fill(); doc.restore(); }
          doc.fillColor("#1f2937").font("Helvetica").fontSize(10);
        }
        let x = left + 6;
        for (let i = 0; i < cells.length; i += 1) {
          doc.text(cells[i], x, y + 6, { width: colW[i] - 12, lineBreak: false, ellipsis: true });
          x += colW[i];
        }
        doc.x = left;
        doc.y = y + rowH;
      };
      drawRow(["Question", "Average", "Responses"], { head: true });
      data.aggregates.perQuestion.forEach((q, i) => {
        drawRow([q.text, q.average.toFixed(2), String(q.responseCount)], { alt: i % 2 === 1 });
      });

      doc.moveDown();
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Recent Responses");
      doc.moveDown(0.3);
      for (const r of data.responses.slice(0, 30)) {
        if (doc.y > doc.page.height - 100) doc.addPage();
        const ratings = data.allQuestions
          .map((q) => {
            const v = ratingFromAnswer((r.answers as Record<string, unknown> | null)?.[q.key]);
            return v ? `${q.key.split("_")[0]}=${v}` : null;
          })
          .filter(Boolean)
          .join(", ");
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a")
          .text(`${r.project.code} — ${r.project.client.name}`);
        doc.font("Helvetica").fontSize(9).fillColor("#64748b")
          .text(`${r.createdAt.toISOString().slice(0, 10)} • ${r.submitterName ?? "(Anonymous)"} • ${ratings}`);
        if (r.lessonLearned) {
          doc.font("Helvetica-Oblique").fontSize(9).fillColor("#1f2937")
            .text(`"${r.lessonLearned}"`, { lineGap: 1 });
        }
        doc.moveDown(0.4);
      }
    });
  },
);

export default router;
