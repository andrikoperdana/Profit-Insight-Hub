import { prisma } from "@workspace/db";
import { randomBytes } from "crypto";

export function generateSurveyToken(): string {
  // 24 bytes → 32 chars base64url, cryptographically strong
  return randomBytes(24).toString("base64url");
}

/**
 * Atomically issue a survey token for a project, only if one is not already
 * set. Returns the token currently on the project (existing or newly issued).
 * Retries on the rare unique-constraint collision.
 */
export async function issueSurveyTokenIfMissing(projectId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { surveyToken: true },
    });
    if (existing?.surveyToken) return existing.surveyToken;
    const candidate = generateSurveyToken();
    try {
      const result = await prisma.project.updateMany({
        where: { id: projectId, surveyToken: null },
        data: { surveyToken: candidate },
      });
      if (result.count === 1) return candidate;
      // Lost the race — re-read on next loop
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      // Token collision: regenerate and retry
    }
  }
  throw new Error("Failed to issue survey token after retries");
}

export const DEFAULT_QUESTIONS: {
  key: string;
  text: string;
  type: "RATING" | "TEXT";
  order: number;
  required: boolean;
}[] = [
  { key: "project_management", text: "Project Management — Performance of the Project Manager", type: "RATING", order: 1, required: true },
  { key: "consultant_performance", text: "Consultant Performance — Performance of the consulting team", type: "RATING", order: 2, required: true },
  { key: "report_quality", text: "Report Project — Quality and completeness of the deliverables", type: "RATING", order: 3, required: true },
  { key: "team_overall", text: "Overall Team Performance — Overall performance of the project team", type: "RATING", order: 4, required: true },
  { key: "lesson_learned", text: "Lesson Learned — Suggestions, feedback or lessons learned", type: "TEXT", order: 5, required: false },
];

let initPromise: Promise<void> | null = null;

export async function ensureDefaultSurveyQuestions(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const count = await prisma.surveyQuestion.count();
      if (count > 0) return;
      for (const q of DEFAULT_QUESTIONS) {
        await prisma.surveyQuestion.create({ data: q });
      }
    })().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}
