import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";

vi.mock("../../middlewares/auth.js", () => ({
  requireAuth: (_req: any, res: any) => res.status(401).json({ error: "Unauthorized" }),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const findManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const updateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));

vi.mock("@workspace/db", () => ({
  prisma: {
    billingMilestone: {
      findMany: (a: unknown) => findManyMock(a),
      update: (a: unknown) => updateMock(a),
    },
  },
}));

vi.mock("../../lib/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
}));

const rateLimitAllowMock = vi.fn(async (_k: string, _m: number, _w: number) => true);
vi.mock("../../lib/rateLimit.js", () => ({
  rateLimitAllow: (k: string, m: number, w: number) => rateLimitAllowMock(k, m, w),
}));

const getInvoiceStatusesMock = vi.fn(async (_ids: string[]) => new Map());
vi.mock("../../lib/xero.js", () => ({
  xeroConfigured: () => false,
  signState: vi.fn(),
  verifyState: vi.fn(),
  buildAuthorizeUrl: vi.fn(),
  completeConnection: vi.fn(),
  getConnectionInfo: vi.fn(),
  disconnect: vi.fn(),
  upsertContact: vi.fn(),
  createInvoice: vi.fn(),
  getInvoiceStatuses: (ids: string[]) => getInvoiceStatusesMock(ids),
  XeroNotConnectedError: class XeroNotConnectedError extends Error {},
}));

const { default: xeroRouter } = await import("../xero.js");

const TEST_KEY = "test-webhook-signing-key";
const ORIGINAL_KEY = process.env["XERO_WEBHOOK_KEY"];

// Mirrors the mounting order in app.ts: the webhook path is parsed as a raw
// Buffer BEFORE the JSON parser, and the router is mounted under /api.
function makeApp() {
  const app = express();
  app.use("/api/xero/webhook", express.raw({ type: "*/*", limit: "1mb" }));
  app.use(express.json());
  app.use("/api", xeroRouter);
  return app;
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(Buffer.from(body)).digest("base64");
}

function post(app: express.Express, body: string, signature?: string) {
  const req = request(app)
    .post("/api/xero/webhook")
    .set("content-type", "application/json");
  if (signature !== undefined) req.set("x-xero-signature", signature);
  return req.send(body);
}

const ITR_BODY = JSON.stringify({
  events: [],
  firstEventSequence: 0,
  lastEventSequence: 0,
  entropy: "S0m3r4Nd0mt3xt",
});

function invoiceEventsBody(ids: string[]): string {
  return JSON.stringify({
    events: ids.map((id) => ({
      resourceUrl: `https://api.xero.com/api.xro/2.0/Invoices/${id}`,
      resourceId: id,
      tenantId: "tenant-1",
      tenantType: "ORGANISATION",
      eventCategory: "INVOICE",
      eventType: "UPDATE",
      eventDateUtc: "2026-07-27T08:00:00.000Z",
    })),
    firstEventSequence: 1,
    lastEventSequence: ids.length,
    entropy: "S0m3r4Nd0mt3xt",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findManyMock.mockResolvedValue([]);
  rateLimitAllowMock.mockResolvedValue(true);
  process.env["XERO_WEBHOOK_KEY"] = TEST_KEY;
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env["XERO_WEBHOOK_KEY"];
  else process.env["XERO_WEBHOOK_KEY"] = ORIGINAL_KEY;
});

describe("POST /api/xero/webhook", () => {
  it("fails closed with 401 when no signing key is configured", async () => {
    delete process.env["XERO_WEBHOOK_KEY"];
    const res = await post(makeApp(), ITR_BODY, sign(ITR_BODY, TEST_KEY));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    const res = await post(makeApp(), ITR_BODY);
    expect(res.status).toBe(401);
  });

  it("rejects an incorrect signature with 401 (intent-to-receive negative case)", async () => {
    const res = await post(makeApp(), ITR_BODY, sign(ITR_BODY, "wrong-key"));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("rejects a signature computed over a different body", async () => {
    const res = await post(makeApp(), ITR_BODY, sign(invoiceEventsBody(["a"]), TEST_KEY));
    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed intent-to-receive probe with an empty 200", async () => {
    const res = await post(makeApp(), ITR_BODY, sign(ITR_BODY, TEST_KEY));
    expect(res.status).toBe(200);
    expect(res.text ?? "").toBe("");
    // No events → no processing.
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("marks a linked milestone PAID when Xero reports the invoice as PAID", async () => {
    findManyMock.mockResolvedValue([
      { id: "m1", xeroInvoiceId: "inv-1", xeroInvoiceNumber: "X-1", status: "INVOICED" },
    ]);
    getInvoiceStatusesMock.mockResolvedValue(
      new Map([
        [
          "inv-1",
          {
            invoiceId: "inv-1",
            invoiceNumber: "INV-0042",
            status: "PAID",
            amountDue: 0,
            amountPaid: 110,
            amountCredited: 0,
            fullyPaid: true,
          },
        ],
      ]),
    );

    const body = invoiceEventsBody(["inv-1"]);
    const res = await post(makeApp(), body, sign(body, TEST_KEY));
    expect(res.status).toBe(200);

    // Processing happens after the response is acked.
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const arg = updateMock.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ id: "m1" });
    expect(arg.data["status"]).toBe("PAID");
    expect(arg.data["paidAt"]).toBeInstanceOf(Date);
    expect(arg.data["xeroAmountPaid"]).toBe(110);
    expect(arg.data["xeroInvoiceNumber"]).toBe("INV-0042");
    // Targeted lookup by the event's invoice ids, scoped to the same status
    // eligibility as the 30-min poll — a webhook event must never flip a
    // CANCELLED or long-settled milestone (the scope lives in the DB query,
    // which is mocked here, so we assert the where-clause shape).
    const findArg = findManyMock.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(findArg.where["xeroInvoiceId"]).toEqual({ in: ["inv-1"] });
    expect(findArg.where["OR"]).toEqual([
      { status: { in: ["INVOICED", "PLANNED"] } },
      { status: "PAID", paidAt: { gte: expect.any(Date) } },
    ]);
  });

  it("does not call the Xero API for events about invoices we never pushed", async () => {
    findManyMock.mockResolvedValue([]);
    const body = invoiceEventsBody(["unknown-1", "unknown-2"]);
    const res = await post(makeApp(), body, sign(body, TEST_KEY));
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(findManyMock).toHaveBeenCalledTimes(1));
    expect(getInvoiceStatusesMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("ignores non-INVOICE event categories", async () => {
    const body = JSON.stringify({
      events: [
        {
          resourceId: "c-1",
          eventCategory: "CONTACT",
          eventType: "UPDATE",
        },
      ],
    });
    const res = await post(makeApp(), body, sign(body, TEST_KEY));
    expect(res.status).toBe(200);
    // Give the (absent) async pipeline a tick to run.
    await new Promise((r) => setTimeout(r, 25));
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("still acks 200 but skips processing when the replay rate limit trips", async () => {
    rateLimitAllowMock.mockResolvedValue(false);
    findManyMock.mockResolvedValue([
      { id: "m1", xeroInvoiceId: "inv-1", xeroInvoiceNumber: null, status: "INVOICED" },
    ]);
    const body = invoiceEventsBody(["inv-1"]);
    const res = await post(makeApp(), body, sign(body, TEST_KEY));
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 25));
    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
