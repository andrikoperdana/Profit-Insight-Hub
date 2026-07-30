import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { AiAssistantChatBody, GenerateAiReportDraftBody } from "@workspace/api-zod";
import { rateLimitAllow } from "../lib/rateLimit.js";
import { runAssistantChat, type AssistantMessage } from "../lib/ai-assistant.js";
import {
  reportDraftProjectSelect,
  canDraftReport,
  canSeeProjectMoney,
  buildReportDraftFacts,
  generateReportDraft,
} from "../lib/ai-report-draft.js";
import { getLatestDigest, generateWeeklyDigest } from "../lib/ai-digest.js";

const router: IRouter = Router();
router.use(requireAuth);

// POST /ai/assistant/chat — the "ask your data" assistant. Available to every
// authenticated role; the tools inside runAssistantChat enforce per-role data
// scope (default-deny), so a broad audience here is safe.
router.post("/ai/assistant/chat", validateBody(AiAssistantChatBody), async (req, res) => {
  const userId = String(req.user!.sub);
  if (!(await rateLimitAllow(`ai:chat:${userId}`, 20, 10 * 60_000))) {
    res.status(429).json({ error: "Too many questions in a short time — please wait a few minutes." });
    return;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true },
  });
  if (!dbUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const history: AssistantMessage[] = (req.body.messages as AssistantMessage[]).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content).slice(0, 4000),
  }));
  try {
    const { reply, model } = await runAssistantChat(
      { id: dbUser.id, role: dbUser.role, name: dbUser.name },
      history,
    );
    res.json({ reply, model, generatedAt: new Date().toISOString() });
  } catch (err) {
    // Never log the provider request/response body (it can echo commercial data).
    req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "ai assistant chat failed");
    res.status(502).json({ error: "AI assistant is unavailable right now — please try again." });
  }
});

// POST /ai/report-draft — monthly report draft for one project. Gated to the
// project's PM / Admin Project / Technical Writer, or management.
router.post("/ai/report-draft", validateBody(GenerateAiReportDraftBody), async (req, res) => {
  const userId = String(req.user!.sub);
  const role = req.user!.role;
  if (!(await rateLimitAllow(`ai:draft:${userId}`, 10, 10 * 60_000))) {
    res.status(429).json({ error: "Too many drafts in a short time — please wait a few minutes." });
    return;
  }
  const periodMonth = String(req.body.periodMonth);
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m || y < 2000 || y > 2100 || m < 1 || m > 12) {
    res.status(400).json({ error: "periodMonth must be a valid month (YYYY-MM)" });
    return;
  }
  const language = req.body.language === "en" ? ("en" as const) : ("id" as const);
  const project = await prisma.project.findFirst({
    where: { id: String(req.body.projectId), deletedAt: null, archivedAt: null },
    select: reportDraftProjectSelect,
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const user = { id: userId, role };
  if (!canDraftReport(user, project)) {
    res.status(403).json({ error: "Only the project's PM/team leads or management can generate report drafts." });
    return;
  }
  try {
    const facts = buildReportDraftFacts(project, periodMonth, canSeeProjectMoney(user, project));
    const { draft, model } = await generateReportDraft(facts, language);
    res.json({
      generatedAt: new Date().toISOString(),
      model,
      projectId: project.id,
      projectName: project.name,
      periodMonth,
      draft,
    });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "ai report draft failed");
    res.status(502).json({ error: "Could not generate the draft right now — please try again." });
  }
});

// GET /ai/weekly-digest — latest stored digest (management only; SUPER_ADMIN
// passes every requireRole gate automatically).
router.get("/ai/weekly-digest", requireRole("MANAGEMENT"), async (_req, res) => {
  const digest = await getLatestDigest();
  res.json({ hasDigest: !!digest, digest });
});

// POST /ai/weekly-digest/generate — regenerate this week's digest on demand.
router.post("/ai/weekly-digest/generate", requireRole("MANAGEMENT"), async (req, res) => {
  if (!(await rateLimitAllow(`ai:digest:${req.user!.sub}`, 4, 60 * 60_000))) {
    res.status(429).json({ error: "Digest was refreshed very recently — please wait a bit." });
    return;
  }
  try {
    const result = await generateWeeklyDigest({ force: true });
    res.json(result);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "ai weekly digest failed");
    res.status(502).json({ error: "Could not generate the digest right now — please try again." });
  }
});

export default router;
