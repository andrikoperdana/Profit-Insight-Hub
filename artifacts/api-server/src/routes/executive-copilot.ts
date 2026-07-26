import { Router, type IRouter } from "express";
import { prisma, Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { GenerateExecutiveBriefingResponse } from "@workspace/api-zod";
import {
  buildExecutiveCopilotFacts,
  type ExecutiveCopilotFacts,
} from "../lib/executive-copilot.js";
import { streamExecutiveBriefingPdf } from "../lib/executive-copilot-pdf.js";

const router: IRouter = Router();
router.use(requireAuth);

const MODEL = "gpt-5.4";

// A briefing older than this is served with `stale: true` so the UI can nudge a
// refresh, but it is never auto-evicted (we keep the last briefing available so
// GET stays cheap and never silently empties).
const STALE_MS = 10 * 60 * 1000;

// Zod parser for the LLM's JSON output. Reuse the generated response schema's
// `briefing` shape so the contract is the single source of truth.
const briefingSchema = GenerateExecutiveBriefingResponse.shape.briefing;
type BriefingNarrative = ReturnType<typeof briefingSchema.parse>;

interface BriefingResult {
  generatedAt: string;
  model: string;
  stale: boolean;
  facts: ExecutiveCopilotFacts;
  briefing: BriefingNarrative;
}

// L1: last generated briefing, kept in-process for cheap reads. Identical for
// every executive viewer (portfolio-wide, no per-user scope), so a single slot
// is correct. The durable copy lives in the ExecutiveBriefing DB row (single
// "default" row) so a briefing generated on one autoscale instance is visible
// on every other instance and survives restarts; loadBriefing() reads through
// to it whenever the L1 copy is missing or older than STALE_MS.
let lastResult: BriefingResult | null = null;
// Single-flight: concurrent generates on THIS instance share one in-flight LLM
// call. Deliberately per-instance — generation is button-driven and rare, so a
// duplicate LLM call across instances is unlikely and harmless (last write wins).
let pendingGenerate: Promise<BriefingResult> | null = null;

const BRIEFING_ID = "default";

async function persistBriefing(result: BriefingResult): Promise<void> {
  const data = {
    generatedAt: new Date(result.generatedAt),
    model: result.model,
    // Facts/briefing are plain JSON-serializable objects; the cast bridges the
    // interface (no index signature) to Prisma's InputJsonValue.
    payload: { facts: result.facts, briefing: result.briefing } as unknown as Prisma.InputJsonValue,
  };
  await prisma.executiveBriefing.upsert({
    where: { id: BRIEFING_ID },
    create: { id: BRIEFING_ID, ...data },
    update: data,
  });
}

// Returns the newest known briefing: the in-process copy when still fresh,
// otherwise reads through to the persisted row (which may have been written by
// another instance) and rehydrates L1 from it when newer. `stale` on the
// returned object is NOT meaningful here — callers recompute it from
// generatedAt at response time.
async function loadBriefing(): Promise<BriefingResult | null> {
  if (lastResult) {
    const ageMs = Date.now() - new Date(lastResult.generatedAt).getTime();
    if (ageMs <= STALE_MS) return lastResult;
  }
  try {
    const row = await prisma.executiveBriefing.findUnique({ where: { id: BRIEFING_ID } });
    if (row) {
      const rowGeneratedAt = row.generatedAt.toISOString();
      if (!lastResult || rowGeneratedAt > lastResult.generatedAt) {
        // We wrote this payload shape ourselves in persistBriefing().
        const payload = row.payload as unknown as {
          facts: ExecutiveCopilotFacts;
          briefing: BriefingNarrative;
        };
        lastResult = {
          generatedAt: rowGeneratedAt,
          model: row.model,
          stale: false,
          facts: payload.facts,
          briefing: payload.briefing,
        };
      }
    }
  } catch {
    // DB read failure must not take down the endpoint — fall back to whatever
    // this instance has in memory (possibly null).
  }
  return lastResult;
}

function isExecutive(role: string | null | undefined): boolean {
  return role === "MANAGEMENT" || role === "SUPER_ADMIN";
}

const SYSTEM_PROMPT = `You are an executive briefing writer for SecureProfit Hub, a project management and delivery platform for an IT security consulting firm.

You will receive a JSON object of pre-computed, authoritative portfolio FACTS. Write a concise, executive-level briefing for the management team, in ENGLISH.

STRICT RULES:
- Use ONLY the numbers and entities present in the FACTS. NEVER invent, estimate, or alter any figure, percentage, count, project name, or project code.
- You may restate numbers from the FACTS in prose, but do not compute new ones beyond trivial rephrasing.
- Echo "portfolioHealthScore" and "healthLabel" exactly from facts.portfolio.
- Currency amounts are Indonesian Rupiah (IDR). When you mention amounts, refer to them in plain terms (e.g. "outstanding invoices of around IDR X"); the UI renders exact figures separately, so prefer rounded, readable phrasing.
- Be direct and decisive. Each summary field is 1-3 sentences. No markdown, no headings, no emojis, no bullet characters inside string fields.
- "recommendedActions": provide the TOP 5 most impactful actions, each with a short "title", a one-sentence "detail", and a "priority" of exactly "HIGH", "MEDIUM", or "LOW". Base them strictly on signals in the FACTS (margin erosion, overdue billing, delayed projects, open critical/high RAID, idle/overloaded staff, outstanding invoices).
- If a category has no notable signal in the FACTS, say so plainly rather than inventing concerns.

Respond with a SINGLE JSON object with EXACTLY these keys:
{
  "headline": string,
  "healthLabel": string,
  "portfolioHealthScore": number,
  "revenueSummary": string,
  "marginSummary": string,
  "utilizationSummary": string,
  "cashFlowSummary": string,
  "outstandingInvoicesSummary": string,
  "consultantAvailabilitySummary": string,
  "delayedProjectsSummary": string,
  "highRiskProjectsSummary": string,
  "recommendedActions": [ { "title": string, "detail": string, "priority": "HIGH" | "MEDIUM" | "LOW" } ]
}`;

async function generateBriefing(): Promise<BriefingResult> {
  const facts = await buildExecutiveCopilotFacts();

  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Portfolio FACTS (authoritative, do not alter):\n${JSON.stringify(
          facts,
        )}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  // Never log the provider response body (may echo commercial figures); only the
  // length is safe to record for debugging.
  if (!raw) {
    throw new Error("Empty AI response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  // Defensively cap the action list at 5 before validation so an occasional
  // extra item from the model does not fail the bounded schema (maxItems: 5).
  if (
    parsedJson &&
    typeof parsedJson === "object" &&
    Array.isArray((parsedJson as { recommendedActions?: unknown }).recommendedActions)
  ) {
    const obj = parsedJson as { recommendedActions: unknown[] };
    obj.recommendedActions = obj.recommendedActions.slice(0, 5);
  }

  const briefing = briefingSchema.parse(parsedJson);
  // The score/label are deterministic — overwrite whatever the model echoed so
  // the narrative can never drift from the computed facts.
  briefing.portfolioHealthScore = facts.portfolio.portfolioHealthScore;
  briefing.healthLabel = facts.portfolio.healthLabel;

  return {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    stale: false,
    facts,
    briefing,
  };
}

router.post("/executive-copilot/briefing/generate", async (req, res) => {
  if (!isExecutive(req.user?.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    if (!pendingGenerate) {
      pendingGenerate = generateBriefing();
    }
    let result: BriefingResult;
    try {
      result = await pendingGenerate;
    } finally {
      pendingGenerate = null;
    }
    lastResult = result;
    // Persist so other instances (and future restarts) see this briefing. A
    // persist failure must not waste the LLM call — serve the result anyway;
    // this instance still has it in memory.
    try {
      await persistBriefing(result);
    } catch (err) {
      req.log.warn(
        { err: err instanceof Error ? err.message : "unknown" },
        "executive briefing persist failed (serving from memory)",
      );
    }
    res.json(result);
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "executive briefing generation failed",
    );
    res
      .status(502)
      .json({ error: "Failed to generate executive briefing. Please try again." });
  }
});

router.get("/executive-copilot/briefing", async (req, res) => {
  if (!isExecutive(req.user?.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const result = await loadBriefing();
  if (!result) {
    res.json({ hasBriefing: false });
    return;
  }
  const ageMs = Date.now() - new Date(result.generatedAt).getTime();
  res.json({
    hasBriefing: true,
    result: { ...result, stale: ageMs > STALE_MS },
  });
});

// Professional PDF export of the current cached briefing. Binary stream (not in
// the OpenAPI codegen) — the frontend downloads it with an auth header. Numbers
// come from the deterministic facts; the AI prose is narrative only.
router.get("/executive-copilot/briefing/export.pdf", async (req, res) => {
  if (!isExecutive(req.user?.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const result = await loadBriefing();
  if (!result) {
    res.status(409).json({ error: "Generate a briefing first." });
    return;
  }
  try {
    const ageMs = Date.now() - new Date(result.generatedAt).getTime();
    streamExecutiveBriefingPdf(res, {
      ...result,
      stale: ageMs > STALE_MS,
    });
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "executive briefing PDF export failed",
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to export the briefing PDF." });
    } else {
      res.end();
    }
  }
});

export default router;
