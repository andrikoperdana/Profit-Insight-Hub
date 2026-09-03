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

  it.each([
    ["base URL", "configured-api-key", undefined],
    ["API key", undefined, "https://ai.example.test/v1"],
  ])(
    "imports audio safely and fails operations without the %s",
    async (_missingVariable, apiKey, baseUrl) => {
      if (apiKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = apiKey;
      if (baseUrl === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = baseUrl;
      vi.resetModules();

      const audio = await import("@workspace/integrations-openai-ai-server/audio");
      const input = Buffer.from("audio");
      const expectedError =
        "OpenAI AI integration is not configured. Set both required AI integration environment variables before using AI operations.";

      expect(audio.openai).toBeDefined();
      await expect(audio.voiceChat(input)).rejects.toThrow(expectedError);
      await expect(audio.voiceChatStream(input)).rejects.toThrow(expectedError);
      await expect(audio.textToSpeech("hello")).rejects.toThrow(expectedError);
      await expect(audio.textToSpeechStream("hello")).rejects.toThrow(expectedError);
      await expect(audio.speechToText(input)).rejects.toThrow(expectedError);
      await expect(audio.speechToTextStream(input)).rejects.toThrow(expectedError);
    },
  );
});