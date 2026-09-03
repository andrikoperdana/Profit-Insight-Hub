import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const configuration = {
  baseUrl: "",
  apiKeyConfigured: false,
  baseUrlConfigured: false,
  configured: false,
  model: "secure-test-model",
  modelSource: "environment" as const,
};
const completionCreateMock = vi.fn();
const rateLimitAllowMock = vi.fn();

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  AI_MODEL: "secure-test-model",
  getAiConfiguration: () => ({ ...configuration }),
  openai: {
    chat: {
      completions: {
        create: (...args: unknown[]) => completionCreateMock(...args),
      },
    },
  },
}));

vi.mock("../../lib/rateLimit.js", () => ({
  rateLimitAllow: (...args: unknown[]) => rateLimitAllowMock(...args),
}));

vi.mock("../../middlewares/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const role = req.headers["x-user-role"];
    if (!role) return res.status(401).json({ error: "Unauthorized" });
    req.user = { sub: String(req.headers["x-user-id"] || "user-1"), role: String(role) };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role !== "SUPER_ADMIN" && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  },
}));

const { default: router, safeBaseUrl } = await import("../ai-setup.js");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", router);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(configuration, {
    baseUrl: "",
    apiKeyConfigured: false,
    baseUrlConfigured: false,
    configured: false,
    model: "secure-test-model",
    modelSource: "environment",
  });
  rateLimitAllowMock.mockResolvedValue(true);
  completionCreateMock.mockResolvedValue({ model: "secure-test-model" });
});

describe("AI setup authorization and unconfigured availability", () => {
  it.each([
    ["get", "/api/ai-setup"],
    ["post", "/api/ai-setup/test"],
  ] as const)("%s %s rejects unauthenticated and non-super-admin users", async (method, url) => {
    expect((await (request(app()) as any)[method](url)).status).toBe(401);
    expect(
      (await (request(app()) as any)[method](url).set("x-user-role", "MANAGEMENT")).status,
    ).toBe(403);
  });

  it("keeps status available without either AI credential variable", async () => {
    const response = await request(app())
      .get("/api/ai-setup")
      .set("x-user-role", "SUPER_ADMIN");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configured: false,
      baseUrlConfigured: false,
      apiKeyConfigured: false,
      baseUrl: null,
    });
    expect(completionCreateMock).not.toHaveBeenCalled();
  });
});

describe("AI setup redaction and validation", () => {
  it("returns only an HTTPS origin and never reflects URL credentials or path data", async () => {
    const pathSecret = "path-secret-value";
    const querySecret = "query-secret-value";
    Object.assign(configuration, {
      baseUrl: `https://provider.example.com/${pathSecret}?api_key=${querySecret}#token`,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      configured: true,
    });

    const response = await request(app())
      .get("/api/ai-setup")
      .set("x-user-role", "SUPER_ADMIN");
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body.baseUrl).toBe("https://provider.example.com");
    expect(serialized).not.toContain(pathSecret);
    expect(serialized).not.toContain(querySecret);
  });

  it.each([
    "http://api-key-value@provider.example.com/secret",
    "https://api-key-value@provider.example.com",
    "not-a-url-api-key-value",
  ])("rejects and redacts invalid configured URL %s", async (baseUrl) => {
    Object.assign(configuration, {
      baseUrl,
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      configured: true,
    });

    const response = await request(app())
      .post("/api/ai-setup/test")
      .set("x-user-role", "SUPER_ADMIN");

    expect(response.status).toBe(422);
    expect(response.body.missing).toContain("VALID_HTTPS_AI_BASE_URL");
    expect(JSON.stringify(response.body)).not.toContain("api-key-value");
    expect(completionCreateMock).not.toHaveBeenCalled();
  });

  it("classifies provider failures without reflecting raw provider errors", async () => {
    Object.assign(configuration, {
      baseUrl: "https://provider.example.com/v1/credential-in-path",
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      configured: true,
    });
    completionCreateMock.mockRejectedValue({
      status: 401,
      message: "Rejected key super-secret-key-value",
    });

    const response = await request(app())
      .post("/api/ai-setup/test")
      .set("x-user-role", "SUPER_ADMIN");

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("AUTHENTICATION_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("super-secret-key-value");
    expect(JSON.stringify(response.body)).not.toContain("credential-in-path");
  });

  it("recognizes only credential-free HTTPS URLs as valid", () => {
    expect(safeBaseUrl("https://provider.example.com/v1")).toEqual({
      displayValue: "https://provider.example.com",
      valid: true,
    });
    expect(safeBaseUrl("http://provider.example.com").valid).toBe(false);
    expect(safeBaseUrl("https://user:pass@provider.example.com").valid).toBe(false);
  });
});

describe("AI provider test controls", () => {
  beforeEach(() => {
    Object.assign(configuration, {
      baseUrl: "https://provider.example.com/v1",
      baseUrlConfigured: true,
      apiKeyConfigured: true,
      configured: true,
    });
  });

  it("uses the shared model with a 15-second timeout and no retry", async () => {
    const response = await request(app())
      .post("/api/ai-setup/test")
      .set("x-user-role", "SUPER_ADMIN")
      .set("x-user-id", "admin-42");

    expect(response.status).toBe(200);
    expect(completionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "secure-test-model" }),
      { timeout: 15_000, maxRetries: 0 },
    );
    expect(rateLimitAllowMock).toHaveBeenNthCalledWith(
      1,
      "ai:setup:test:admin-42",
      3,
      10 * 60_000,
    );
    expect(rateLimitAllowMock).toHaveBeenNthCalledWith(
      2,
      "ai:setup:test:global",
      5,
      10 * 60_000,
    );
  });

  it.each([
    { decisions: [false, true], label: "per-user" },
    { decisions: [true, false], label: "global" },
  ])("blocks provider calls when the $label limit is exhausted", async ({ decisions }) => {
    rateLimitAllowMock
      .mockResolvedValueOnce(decisions[0])
      .mockResolvedValueOnce(decisions[1]);

    const response = await request(app())
      .post("/api/ai-setup/test")
      .set("x-user-role", "SUPER_ADMIN");

    expect(response.status).toBe(429);
    expect(completionCreateMock).not.toHaveBeenCalled();
    expect(rateLimitAllowMock).toHaveBeenCalledTimes(2);
  });
});

describe("AI feature model consistency", () => {
  it("routes all four text AI features through the shared AI_MODEL export", () => {
    const sourceRoot = path.resolve(import.meta.dirname, "../..");
    const featureFiles = [
      "lib/ai-assistant.ts",
      "lib/ai-report-draft.ts",
      "lib/ai-digest.ts",
      "routes/executive-copilot.ts",
    ];

    for (const relativePath of featureFiles) {
      const source = fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
      expect(source, relativePath).toMatch(
        /import\s*\{\s*AI_MODEL as MODEL,\s*openai\s*\}\s*from\s*"@workspace\/integrations-openai-ai-server"/,
      );
      expect(source, relativePath).toMatch(/model:\s*MODEL/);
      expect(source, relativePath).not.toMatch(/model:\s*["'`]/);
    }
  });
});