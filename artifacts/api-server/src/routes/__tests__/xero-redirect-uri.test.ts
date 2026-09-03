import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const findUniqueMock = vi.fn();
vi.mock("@workspace/db", () => ({
  prisma: {
    appSetting: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    billingMilestone: {},
  },
}));
vi.mock("../../middlewares/auth.js", () => ({
  requireAuth: vi.fn(),
  requireRole: () => vi.fn(),
}));
vi.mock("../../lib/audit.js", () => ({ recordAudit: vi.fn() }));
vi.mock("../../lib/rateLimit.js", () => ({ rateLimitAllow: vi.fn() }));
vi.mock("../../lib/xero.js", () => ({
  xeroConfigured: vi.fn(),
  signState: vi.fn(),
  verifyState: vi.fn(),
  buildAuthorizeUrl: vi.fn(),
  completeConnection: vi.fn(),
  getConnectionInfo: vi.fn(),
  disconnect: vi.fn(),
  upsertContact: vi.fn(),
  createInvoice: vi.fn(),
  getInvoiceStatuses: vi.fn(),
  XeroNotConnectedError: class extends Error {},
}));

const originalEnv = { ...process.env };
const { redirectUri } = await import("../xero.js");

beforeEach(() => {
  findUniqueMock.mockReset();
  delete process.env["XERO_REDIRECT_URI"];
  delete process.env["APP_BASE_URL"];
  delete process.env["REPLIT_DOMAINS"];
  delete process.env["REPLIT_DEV_DOMAIN"];
});
afterAll(() => {
  process.env = originalEnv;
});

describe("Xero callback selection", () => {
  it("uses the activated wizard host before environment configuration", async () => {
    findUniqueMock.mockResolvedValue({ integrationPublicBaseUrl: "https://active.example.com" });
    process.env["XERO_REDIRECT_URI"] = "https://legacy.example.com/api/xero/callback";
    expect(await redirectUri()).toBe("https://active.example.com/api/xero/callback");
  });
  it("retains the explicit environment fallback when no wizard host exists", async () => {
    findUniqueMock.mockResolvedValue({ integrationPublicBaseUrl: null });
    process.env["XERO_REDIRECT_URI"] = "https://legacy.example.com/api/xero/callback";
    expect(await redirectUri()).toBe("https://legacy.example.com/api/xero/callback");
  });
  it("retains the base-domain fallback when no explicit redirect is set", async () => {
    findUniqueMock.mockResolvedValue(null);
    process.env["APP_BASE_URL"] = "https://fallback.example.com/";
    expect(await redirectUri()).toBe("https://fallback.example.com/api/xero/callback");
  });
});