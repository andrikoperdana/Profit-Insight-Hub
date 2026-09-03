import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const dnsLookupMock = vi.fn();
vi.mock("node:dns", () => ({ promises: { lookup: (...args: unknown[]) => dnsLookupMock(...args) } }));

const httpsRequestMock = vi.fn();
vi.mock("node:https", () => ({
  default: { request: (...args: unknown[]) => httpsRequestMock(...args) },
}));

vi.mock("../../middlewares/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const role = req.headers["x-user-role"];
    if (!role) return res.status(401).json({ error: "Unauthorized" });
    req.user = { sub: "user-1", role: String(role) };
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

const row: Record<string, any> = {
  id: "default",
  integrationPublicBaseUrl: "https://old.example.com",
  integrationDraftBaseUrl: "https://new.example.com",
  integrationPreviousBaseUrl: "https://older.example.com",
  integrationDraftValidatedAt: new Date("2026-09-01T00:00:00Z"),
  pipedriveManagedWebhookId: null,
  pipedriveManagedWebhookUrl: null,
  pipedriveWebhookSecret: null,
};
const updateMock = vi.fn();
const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const transactionMock = vi.fn();
vi.mock("@workspace/db", () => ({
  prisma: {
    appSetting: {
      upsert: (...args: unknown[]) => upsertMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("../../lib/audit.js", () => ({ recordAudit: vi.fn(async () => {}) }));
const pipedriveConfiguredMock = vi.fn();
const replaceManagedPipedriveWebhookMock = vi.fn();
vi.mock("../../lib/pipedrive.js", () => ({
  pipedriveConfigured: (...args: unknown[]) => pipedriveConfiguredMock(...args),
  replaceManagedPipedriveWebhook: (...args: unknown[]) =>
    replaceManagedPipedriveWebhookMock(...args),
}));
vi.mock("../../lib/xero.js", () => ({ xeroConfigured: vi.fn(() => false) }));

const { default: router, normalizePublicOrigin, isPrivateAddress } = await import("../host-setup.js");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", router);
  return instance;
}
const mutations = [
  ["put", "/api/host-setup/draft"],
  ["post", "/api/host-setup/validate"],
  ["post", "/api/host-setup/pipedrive/repair"],
  ["post", "/api/host-setup/activate"],
  ["post", "/api/host-setup/restore"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(row, {
    integrationPublicBaseUrl: "https://old.example.com",
    integrationDraftBaseUrl: "https://new.example.com",
    integrationPreviousBaseUrl: "https://older.example.com",
    integrationDraftValidatedAt: new Date("2026-09-01T00:00:00Z"),
  });
  upsertMock.mockResolvedValue(row);
  updateMock.mockImplementation(async ({ data }: any) => Object.assign(row, data));
  findUniqueMock.mockResolvedValue(row);
  transactionMock.mockImplementation(async (fn: any) =>
    fn({ appSetting: { findUnique: findUniqueMock, update: updateMock } }),
  );
  pipedriveConfiguredMock.mockResolvedValue(false);
});

describe("host setup authorization", () => {
  it.each(mutations)("%s %s rejects unauthenticated requests", async (method, path) => {
    const res = await (request(app()) as any)[method](path).send({ host: "https://new.example.com" });
    expect(res.status).toBe(401);
  });
  it.each(["MANAGEMENT", "SITE_ADMIN"])("rejects every mutation for %s", async (role) => {
    for (const [method, path] of mutations) {
      const res = await (request(app()) as any)[method](path)
        .set("x-user-role", role)
        .send({ host: "https://new.example.com" });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});

describe("public host validation", () => {
  it("requires an HTTPS DNS origin", () => {
    expect(() => normalizePublicOrigin("http://example.com")).toThrow("HTTPS");
    expect(() => normalizePublicOrigin("https://127.0.0.1")).toThrow("public DNS");
    expect(() => normalizePublicOrigin("https://example.com/path")).toThrow("without a path");
  });
  it.each(["10.0.0.1", "169.254.1.1", "::1", "fd00::1", "::ffff:192.168.1.2"])(
    "recognizes %s as private",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );
  it("rejects if any DNS answer is private before opening TLS", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const res = await request(app())
      .post("/api/host-setup/validate")
      .set("x-user-role", "SUPER_ADMIN");
    expect(res.status).toBe(422);
    expect(httpsRequestMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
  it.each([
    { status: 503, expected: "HTTP 503" },
    { error: new Error("certificate expired"), expected: "certificate expired" },
  ])("does not validate a failed TLS/health probe", async ({ status, error, expected }) => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    httpsRequestMock.mockImplementation((options: any, callback: any) => {
      expect(options.lookup).toBeTypeOf("function");
      options.lookup("new.example.com", {}, (_err: unknown, address: string) => {
        expect(address).toBe("93.184.216.34");
      });
      const req = new EventEmitter() as any;
      req.end = () => {
        if (error) req.emit("error", error);
        else callback({ statusCode: status, resume: vi.fn() });
      };
      req.destroy = (err: Error) => req.emit("error", err);
      return req;
    });
    const res = await request(app())
      .post("/api/host-setup/validate")
      .set("x-user-role", "SUPER_ADMIN");
    expect(res.status).toBe(422);
    expect(res.body.error).toContain(expected);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("atomic host transitions", () => {
  it("activates draft and preserves the old active host in one transaction", async () => {
    const res = await request(app())
      .post("/api/host-setup/activate")
      .set("x-user-role", "SUPER_ADMIN");
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        integrationPublicBaseUrl: "https://new.example.com",
        integrationPreviousBaseUrl: "https://old.example.com",
        integrationDraftBaseUrl: null,
      }),
    }));
  });
  it("restores previous and retains the displaced active host", async () => {
    const res = await request(app())
      .post("/api/host-setup/restore")
      .set("x-user-role", "SUPER_ADMIN");
    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        integrationPublicBaseUrl: "https://older.example.com",
        integrationPreviousBaseUrl: "https://old.example.com",
      }),
    }));
  });
});

describe("Pipedrive repair failure safety", () => {
  it("keeps the working webhook record when provider registration fails", async () => {
    Object.assign(row, {
      pipedriveManagedWebhookId: "old-11",
      pipedriveManagedWebhookUrl: "https://old.example.com/api/pipedrive/webhook",
      pipedriveWebhookSecret: "existing-secret",
    });
    pipedriveConfiguredMock.mockResolvedValue(true);
    replaceManagedPipedriveWebhookMock.mockRejectedValue(new Error("provider unavailable"));

    const res = await request(app())
      .post("/api/host-setup/pipedrive/repair")
      .set("x-user-role", "SUPER_ADMIN");

    expect(res.status).toBe(500);
    expect(replaceManagedPipedriveWebhookMock).toHaveBeenCalledWith({
      subscriptionUrl: "https://new.example.com/api/pipedrive/webhook",
      secret: "existing-secret",
      previousId: "old-11",
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(row.pipedriveManagedWebhookId).toBe("old-11");
  });
});