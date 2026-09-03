import { Router, type IRouter } from "express";
import {
  AI_MODEL,
  getAiConfiguration,
  openai,
} from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { rateLimitAllow } from "../lib/rateLimit.js";

const router: IRouter = Router();
router.use("/ai-setup", requireAuth, requireRole("SUPER_ADMIN"));

const features = [
  {
    name: "AI Assistant",
    description: "Answers questions using role-scoped SecureProfit data.",
  },
  {
    name: "AI Report Draft",
    description: "Creates evidence-based project report drafts.",
  },
  {
    name: "Weekly AI Digest",
    description: "Generates the management weekly summary.",
  },
  {
    name: "Executive Copilot",
    description: "Produces executive portfolio briefings.",
  },
];

function safeBaseUrl(value: string) {
  if (!value) return { displayValue: null, valid: false };
  try {
    const url = new URL(value);
    const valid =
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return {
      displayValue: valid ? url.toString().replace(/\/$/, "") : "Configured value is invalid",
      valid,
    };
  } catch {
    return { displayValue: "Configured value is invalid", valid: false };
  }
}

function statusPayload() {
  const configuration = getAiConfiguration();
  const safeUrl = safeBaseUrl(configuration.baseUrl);
  return {
    configured: configuration.configured && safeUrl.valid,
    baseUrlConfigured: configuration.baseUrlConfigured,
    baseUrlValid: safeUrl.valid,
    baseUrl: safeUrl.displayValue,
    apiKeyConfigured: configuration.apiKeyConfigured,
    model: configuration.model,
    modelSource: configuration.modelSource,
    features,
  };
}

router.get("/ai-setup", (_req, res) => {
  res.json(statusPayload());
});

router.post("/ai-setup/test", async (req, res) => {
  const userAllowed = await rateLimitAllow(
    `ai:setup:test:${req.user!.sub}`,
    3,
    10 * 60_000,
  );
  const globalAllowed = await rateLimitAllow("ai:setup:test:global", 5, 10 * 60_000);
  if (!userAllowed || !globalAllowed) {
    return res.status(429).json({
      error: "AI_TEST_RATE_LIMITED",
      message: "Too many AI connection tests. Wait before trying again.",
    });
  }

  const configuration = getAiConfiguration();
  const safeUrl = safeBaseUrl(configuration.baseUrl);
  if (!configuration.configured || !safeUrl.valid) {
    return res.status(422).json({
      error: "AI_CONFIGURATION_INCOMPLETE",
      message: "Set a valid AI base URL and API key on the server before testing.",
      missing: [
        ...(!configuration.baseUrlConfigured ? ["AI_INTEGRATIONS_OPENAI_BASE_URL"] : []),
        ...(!configuration.apiKeyConfigured ? ["AI_INTEGRATIONS_OPENAI_API_KEY"] : []),
        ...(configuration.baseUrlConfigured && !safeUrl.valid
          ? ["VALID_AI_BASE_URL"]
          : []),
      ],
    });
  }

  const startedAt = Date.now();
  try {
    const result = await openai.chat.completions.create(
      {
        model: AI_MODEL,
        max_completion_tokens: 16,
        messages: [
          {
            role: "user",
            content: "Reply with the single word OK.",
          },
        ],
      },
      {
        timeout: 15_000,
        maxRetries: 0,
      },
    );

    return res.json({
      ok: true,
      model: result.model || AI_MODEL,
      latencyMs: Date.now() - startedAt,
      message: "The AI provider accepted the request and returned a response.",
    });
  } catch (error) {
    const providerError = error as {
      status?: number;
      code?: string;
      type?: string;
      message?: string;
    };
    const status = providerError.status;
    let category = "PROVIDER_ERROR";
    let message = "The AI provider could not complete the test request.";

    if (status === 401 || status === 403) {
      category = "AUTHENTICATION_ERROR";
      message = "The AI provider rejected the API key or its permissions.";
    } else if (status === 404) {
      category = "MODEL_OR_ENDPOINT_NOT_FOUND";
      message = "The configured model or API endpoint was not found.";
    } else if (status === 429) {
      category = "RATE_LIMIT_OR_QUOTA";
      message = "The AI provider rejected the request because of rate limits or quota.";
    } else if (
      providerError.code === "ETIMEDOUT" ||
      providerError.code === "ECONNABORTED" ||
      providerError.code === "ECONNREFUSED"
    ) {
      category = "CONNECTION_ERROR";
      message = "The AI endpoint could not be reached within the test timeout.";
    }

    return res.status(502).json({
      error: category,
      message,
      status: status ?? null,
      model: AI_MODEL,
      latencyMs: Date.now() - startedAt,
    });
  }
});

export default router;