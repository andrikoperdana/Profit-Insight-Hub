import OpenAI from "openai";

export const DEFAULT_AI_MODEL = "gpt-5.4";
export const AI_MODEL = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;

export function getAiConfiguration() {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() || "";
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || "";
  return {
    baseUrl,
    apiKeyConfigured: Boolean(apiKey),
    baseUrlConfigured: Boolean(baseUrl),
    configured: Boolean(baseUrl && apiKey),
    model: AI_MODEL,
    modelSource: process.env.AI_MODEL?.trim() ? "environment" as const : "default" as const,
  };
}

const configuration = getAiConfiguration();

// Keep the API available when AI is not configured so administrators can open
// the AI Setup diagnostics page. The loopback discard endpoint prevents a
// missing base URL from silently falling back to the public OpenAI endpoint.
export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "ai-not-configured",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "http://127.0.0.1:9",
});
