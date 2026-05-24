import { describe, it, expect, vi, beforeEach } from "vitest";
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

const projectFindUniqueMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const billingFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const billingFindUniqueMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const billingCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const billingUpdateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const billingDeleteMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const projectResourceFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const billingFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));

vi.mock("@workspace/db", () => ({
  prisma: {
    project: { findUnique: (a: unknown) => projectFindUniqueMock(a) },
    projectResource: { findFirst: (a: unknown) => projectResourceFindFirstMock(a) },
    billingMilestone: {
      findMany: (a: unknown) => billingFindManyMock(a),
      findUnique: (a: unknown) => billingFindUniqueMock(a),
      findFirst: (a: unknown) => billingFindFirstMock(a),
      create: (a: unknown) => billingCreateMock(a),
      update: (a: unknown) => billingUpdateMock(a),
      delete: (a: unknown) => billingDeleteMock(a),
    },
  },
}));

vi.mock("../../lib/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
}));

const { default: bmRouter } = await import("../billing-milestones.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", bmRouter);
  return app;
}

function as(role: string, id = `${role.toLowerCase()}-1`) {
  return { "x-user-id": id, "x-user-role": role } as Record<string, string>;
}

const PROJECT_ID = "p-1";
const PM_ID = "pm-1";
const SALES_ID = "sales-1";

const ALL_ROLES = [
  "MANAGEMENT",
  "FINANCE",
  "ADMIN_PROJECT",
  "PROJECT_MANAGER",
  "SALES",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "HR",
  "SITE_ADMIN",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
];

beforeEach(() => {
  projectFindUniqueMock.mockReset();
  billingFindManyMock.mockClear();
  billingFindUniqueMock.mockReset();
  billingCreateMock.mockReset();
  billingUpdateMock.mockReset();
  billingDeleteMock.mockReset();
  projectResourceFindFirstMock.mockReset();
  projectResourceFindFirstMock.mockResolvedValue(null);
  projectFindUniqueMock.mockResolvedValue({
    id: PROJECT_ID,
    pmId: PM_ID,
    salesId: SALES_ID,
  });
});

describe("GET /api/projects/:id/billing-milestones — SITE_ADMIN excluded", () => {
  it("MANAGEMENT, FINANCE, ADMIN_PROJECT see all (commercial-data viewers)", async () => {
    const app = makeApp();
    for (const role of ["MANAGEMENT", "FINANCE", "ADMIN_PROJECT"]) {
      const r = await request(app)
        .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
        .set(as(role));
      expect(r.status, `role=${role}`).toBe(200);
    }
  });

  it("SITE_ADMIN is denied (commercial-data policy)", async () => {
    const r = await request(makeApp())
      .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("SITE_ADMIN"));
    expect(r.status).toBe(403);
  });

  it("PROJECT_MANAGER allowed only when owning the project", async () => {
    const app = makeApp();
    const own = await request(app)
      .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("PROJECT_MANAGER", PM_ID));
    expect(own.status).toBe(200);
    const other = await request(app)
      .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("PROJECT_MANAGER", "pm-other"));
    expect(other.status).toBe(403);
  });

  it("SALES allowed only when owning the project", async () => {
    const app = makeApp();
    const own = await request(app)
      .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("SALES", SALES_ID));
    expect(own.status).toBe(200);
    const other = await request(app)
      .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("SALES", "sales-other"));
    expect(other.status).toBe(403);
  });

  it("KONSULTAN and TECHNICAL_WRITER are denied (commercial-data policy)", async () => {
    const app = makeApp();
    for (const role of ["KONSULTAN", "TECHNICAL_WRITER"]) {
      const r = await request(app)
        .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
        .set(as(role));
      expect(r.status, `role=${role}`).toBe(403);
    }
  });

  it("HR and Principals are denied", async () => {
    const app = makeApp();
    for (const role of ["HR", "PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER", "PRINCIPAL_ADMIN_PROJECT"]) {
      const r = await request(app)
        .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
        .set(as(role));
      expect(r.status, `role=${role}`).toBe(403);
    }
  });

  it("full 12-role allow/deny matrix on GET", async () => {
    const app = makeApp();
    const allowed = new Set(["MANAGEMENT", "FINANCE", "ADMIN_PROJECT"]);
    for (const role of ALL_ROLES) {
      // for PM/SALES use an unowning id so deny is expected
      const headers = as(role, `${role.toLowerCase()}-other`);
      const r = await request(app)
        .get(`/api/projects/${PROJECT_ID}/billing-milestones`)
        .set(headers);
      const expect200 = allowed.has(role);
      expect(r.status, `role=${role}`).toBe(expect200 ? 200 : 403);
    }
  });

  it("unauthenticated requests rejected with 401", async () => {
    const app = makeApp();
    const get = await request(app).get(`/api/projects/${PROJECT_ID}/billing-milestones`);
    expect(get.status).toBe(401);
    const post = await request(app)
      .post(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .send({ name: "M", percentage: 50 });
    expect(post.status).toBe(401);
  });
});

describe("GET /api/billing-milestones/vat-recap — MGMT + FINANCE only", () => {
  it("only MANAGEMENT and FINANCE allowed; SITE_ADMIN excluded", async () => {
    const app = makeApp();
    for (const role of ALL_ROLES) {
      const r = await request(app).get("/api/billing-milestones/vat-recap?year=2026").set(as(role));
      const allowed = role === "MANAGEMENT" || role === "FINANCE";
      expect(r.status, `role=${role}`).toBe(allowed ? 200 : 403);
    }
  });
});

describe("Billing mutation gate — MGMT + assigned PM only", () => {
  beforeEach(() => {
    billingFindUniqueMock.mockResolvedValue({
      id: "m-1",
      name: "M1",
      status: "PLANNED",
      percentage: 50,
      project: { id: PROJECT_ID, pmId: PM_ID },
    });
    billingCreateMock.mockResolvedValue({
      id: "m-new",
      projectId: PROJECT_ID,
      name: "M",
      description: null,
      percentage: 50,
      amount: null,
      dueDate: null,
      status: "PLANNED",
      invoiceNumber: null,
      invoicedAt: null,
      paidAt: null,
      sortOrder: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    billingUpdateMock.mockResolvedValue({
      id: "m-1",
      projectId: PROJECT_ID,
      name: "M",
      description: null,
      percentage: 60,
      amount: null,
      dueDate: null,
      status: "PLANNED",
      invoiceNumber: null,
      invoicedAt: null,
      paidAt: null,
      sortOrder: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    billingDeleteMock.mockResolvedValue({});
  });

  it("FINANCE cannot create or edit billing milestones (read-only)", async () => {
    const app = makeApp();
    const post = await request(app)
      .post(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("FINANCE", "f-1"))
      .send({ name: "M", percentage: 50 });
    expect(post.status).toBe(403);

    const patch = await request(app)
      .patch("/api/billing-milestones/m-1")
      .set(as("FINANCE", "f-1"))
      .send({ name: "Renamed" });
    expect(patch.status).toBe(403);

    const del = await request(app).delete("/api/billing-milestones/m-1").set(as("FINANCE", "f-1"));
    expect(del.status).toBe(403);
  });

  it("MANAGEMENT may create, edit, delete", async () => {
    const app = makeApp();
    const post = await request(app)
      .post(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("MANAGEMENT", "m-1"))
      .send({ name: "M", percentage: 50 });
    expect(post.status).toBe(201);

    const patch = await request(app)
      .patch("/api/billing-milestones/m-1")
      .set(as("MANAGEMENT", "m-1"))
      .send({ percentage: 60 });
    expect(patch.status).toBe(200);

    const del = await request(app)
      .delete("/api/billing-milestones/m-1")
      .set(as("MANAGEMENT", "m-1"));
    expect(del.status).toBe(200);
  });

  it("PROJECT_MANAGER assigned may mutate; others denied", async () => {
    const app = makeApp();
    const own = await request(app)
      .post(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("PROJECT_MANAGER", PM_ID))
      .send({ name: "M", percentage: 50 });
    expect(own.status).toBe(201);

    const other = await request(app)
      .post(`/api/projects/${PROJECT_ID}/billing-milestones`)
      .set(as("PROJECT_MANAGER", "pm-other"))
      .send({ name: "M", percentage: 50 });
    expect(other.status).toBe(403);
  });
});
