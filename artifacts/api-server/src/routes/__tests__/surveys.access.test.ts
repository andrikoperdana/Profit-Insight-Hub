import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// Auth middleware: read user from x-user-id/x-user-role headers; enforce role gate.
vi.mock("../../middlewares/auth.js", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const id = req.headers["x-user-id"];
    const role = req.headers["x-user-role"];
    if (!id || !role) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = { sub: String(id), role: String(role) };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
}));

// Stub Prisma — handlers under test only call read APIs; we return empty sets
// so they reach a 200 response without touching a real database.
vi.mock("@workspace/db", () => ({
  prisma: {
    surveyQuestion: { findMany: vi.fn(async () => []) },
    surveyResponse: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    project: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  },
}));

vi.mock("../../lib/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
  recordAuditAnon: vi.fn(async () => {}),
}));

vi.mock("../../lib/surveyDefaults.js", () => ({
  ensureDefaultSurveyQuestions: vi.fn(async () => {}),
  issueSurveyTokenIfMissing: vi.fn(async () => null),
}));

const { default: surveysRouter } = await import("../surveys.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", surveysRouter);
  return app;
}

function as(role: string, id = `${role.toLowerCase()}-1`) {
  return { "x-user-id": id, "x-user-role": role } as Record<string, string>;
}

// All non-public, non-MGMT-only roles we care about for the access matrix.
const ALL_ROLES = [
  "MANAGEMENT",
  "SALES",
  "PROJECT_MANAGER",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "ADMIN_PROJECT",
  "FINANCE",
  "HR",
  "SITE_ADMIN",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
];

describe("GET /api/survey/responses (read-only access matrix)", () => {
  it("allows MANAGEMENT and SALES; denies everyone else", async () => {
    const app = makeApp();
    for (const role of ALL_ROLES) {
      const res = await request(app).get("/api/survey/responses?year=2026").set(as(role));
      const allowed = role === "MANAGEMENT" || role === "SALES";
      expect(res.status, `role=${role}`).toBe(allowed ? 200 : 403);
    }
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(makeApp()).get("/api/survey/responses?year=2026");
    expect(res.status).toBe(401);
  });
});

describe("Survey admin endpoints stay MANAGEMENT-only (SALES must not escalate)", () => {
  it.each([
    ["GET", "/api/survey/template"],
    ["PUT", "/api/survey/template"],
    ["POST", "/api/survey/seed-demo"],
  ] as const)("%s %s rejects SALES", async (method, path) => {
    const app = makeApp();
    const r = method === "GET"
      ? await request(app).get(path).set(as("SALES"))
      : method === "PUT"
      ? await request(app).put(path).set(as("SALES")).send({ questions: [] })
      : await request(app).post(path).set(as("SALES")).send({});
    expect(r.status).toBe(403);
  });
});

describe("GET /api/survey/summary stays MGMT + PM only", () => {
  it("rejects SALES", async () => {
    const r = await request(makeApp()).get("/api/survey/summary").set(as("SALES"));
    expect(r.status).toBe(403);
  });
  it("allows MANAGEMENT and PROJECT_MANAGER", async () => {
    const app = makeApp();
    const mgmt = await request(app).get("/api/survey/summary").set(as("MANAGEMENT"));
    expect(mgmt.status).toBe(200);
    const pm = await request(app).get("/api/survey/summary").set(as("PROJECT_MANAGER"));
    expect(pm.status).toBe(200);
  });
});
