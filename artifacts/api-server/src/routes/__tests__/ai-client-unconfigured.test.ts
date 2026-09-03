import { afterEach, describe, expect, it, vi } from "vitest";

const originalBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const originalApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = originalApiKey;
  vi.resetModules();
});

describe("AI client without credentials", () => {
  it("imports safely and reports unconfigured when both variables are absent", async () => {
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    vi.resetModules();

    const { getAiConfiguration, openai } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    expect(getAiConfiguration()).toMatchObject({
      configured: false,
      baseUrlConfigured: false,
      apiKeyConfigured: false,
      baseUrl: "",
    });
    expect(openai).toBeDefined();
  });
});