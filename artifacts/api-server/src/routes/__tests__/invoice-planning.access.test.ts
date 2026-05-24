import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

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
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@workspace/db", () => ({
  prisma: {
    project: { findMany: vi.fn(async () => []) },
    billingMilestone: { findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    businessUnit: { findMany: vi.fn(async () => []) },
  },
}));

const { default: invoicePlanningRouter } = await import("../invoice-planning.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", invoicePlanningRouter);
  return app;
}

function as(role: string) {
  return {
    "x-user-id": `${role.toLowerCase()}-1`,
    "x-user-role": role,
  } as Record<string, string>;
}

const ROLE_ALLOWED: Record<string, boolean> = {
  MANAGEMENT: true,
  FINANCE: true,
  PROJECT_MANAGER: true,
  ADMIN_PROJECT: true,
  SALES: true,
  // commercial-data policy: SITE_ADMIN excluded even though canViewAllProjects includes it
  SITE_ADMIN: false,
  HR: false,
  KONSULTAN: false,
  TECHNICAL_WRITER: false,
  PRINCIPAL_KONSULTAN: false,
  PRINCIPAL_TECHNICAL_WRITER: false,
  PRINCIPAL_ADMIN_PROJECT: false,
};

describe("GET /api/invoice-planning — role access matrix", () => {
  it("enforces the documented allow/deny matrix (SITE_ADMIN is denied)", async () => {
    const app = makeApp();
    for (const [role, allowed] of Object.entries(ROLE_ALLOWED)) {
      const r = await request(app).get("/api/invoice-planning").set(as(role));
      expect(r.status, `role=${role}`).toBe(allowed ? 200 : 403);
    }
  });

  it("rejects unauthenticated requests", async () => {
    const r = await request(makeApp()).get("/api/invoice-planning");
    expect(r.status).toBe(401);
  });
});
