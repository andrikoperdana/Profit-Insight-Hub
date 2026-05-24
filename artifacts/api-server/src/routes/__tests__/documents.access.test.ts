import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

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

const projectFindUniqueMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const documentCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const documentFindUniqueMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const documentDeleteMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const documentFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const activityCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>({}));

vi.mock("@workspace/db", () => ({
  prisma: {
    project: {
      findUnique: (a: unknown) => projectFindUniqueMock(a),
      update: vi.fn(async () => ({})),
    },
    document: {
      create: (a: unknown) => documentCreateMock(a),
      findUnique: (a: unknown) => documentFindUniqueMock(a),
      findMany: (a: unknown) => documentFindManyMock(a),
      delete: (a: unknown) => documentDeleteMock(a),
    },
    activity: { create: (a: unknown) => activityCreateMock(a) },
  },
}));

vi.mock("../../lib/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
}));

vi.mock("../../lib/surveyDefaults.js", () => ({
  issueSurveyTokenIfMissing: vi.fn(async () => null),
}));

const { default: documentsRouter } = await import("../documents.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", documentsRouter);
  return app;
}

function as(role: string, id = `${role.toLowerCase()}-1`) {
  return { "x-user-id": id, "x-user-role": role } as Record<string, string>;
}

const PROJECT_ID = "p-1";
const PM_ID = "pm-1";
const ADMIN_ID = "admin-1";

const validBody = {
  type: "INVOICE",
  fileName: "inv.pdf",
  fileUrl: "https://x/y.pdf",
  invoiceNumber: "INV-1",
};

beforeEach(() => {
  projectFindUniqueMock.mockReset();
  documentCreateMock.mockReset();
  documentFindUniqueMock.mockReset();
  documentDeleteMock.mockReset();
  activityCreateMock.mockClear();
  // Default: project exists, owned by PM_ID, admin = ADMIN_ID, status DRAFT,
  // not deleted. Auto-close path checks `status === "COMPLETE"` so DRAFT is safe.
  projectFindUniqueMock.mockResolvedValue({
    pmId: PM_ID,
    adminProjectId: ADMIN_ID,
    deletedAt: null,
    status: "DRAFT",
    code: "P1",
    documents: [],
  });
  documentCreateMock.mockResolvedValue({
    id: "d-1",
    projectId: PROJECT_ID,
    type: "INVOICE",
    fileName: "inv.pdf",
    fileUrl: "https://x/y.pdf",
    invoiceNumber: "INV-1",
    invoiceAmount: null,
    invoiceStatus: null,
    notes: null,
    uploadedAt: new Date(),
    uploadedBy: { id: "u", name: "U" },
  });
});

describe("POST /api/projects/:id/documents — FINANCE narrow carve-out", () => {
  it("FINANCE may upload INVOICE on any project (bypasses ownership)", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("FINANCE", "finance-x"))
      .send(validBody);
    expect(r.status).toBe(201);
    expect(documentCreateMock).toHaveBeenCalledOnce();
  });

  it("FINANCE may upload CONTRACT on any project", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("FINANCE", "finance-x"))
      .send({ ...validBody, type: "CONTRACT" });
    expect(r.status).toBe(201);
  });

  it.each(["BAST", "REPORT", "OTHER"])(
    "FINANCE forbidden from uploading %s (type gate)",
    async (type) => {
      const r = await request(makeApp())
        .post(`/api/projects/${PROJECT_ID}/documents`)
        .set(as("FINANCE", "finance-x"))
        .send({ ...validBody, type });
      expect(r.status).toBe(403);
      expect(documentCreateMock).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/projects/:id/documents — ownership for non-finance roles", () => {
  it("PROJECT_MANAGER assigned to project may upload", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("PROJECT_MANAGER", PM_ID))
      .send({ ...validBody, type: "BAST" });
    expect(r.status).toBe(201);
  });

  it("PROJECT_MANAGER NOT assigned is forbidden (key regression: no FINANCE-style bypass)", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("PROJECT_MANAGER", "pm-other"))
      .send({ ...validBody, type: "BAST" });
    expect(r.status).toBe(403);
    expect(documentCreateMock).not.toHaveBeenCalled();
  });

  it("ADMIN_PROJECT assigned may upload", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("ADMIN_PROJECT", ADMIN_ID))
      .send({ ...validBody, type: "BAST" });
    expect(r.status).toBe(201);
  });

  it("ADMIN_PROJECT not assigned is forbidden", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("ADMIN_PROJECT", "admin-other"))
      .send({ ...validBody, type: "BAST" });
    expect(r.status).toBe(403);
  });

  it("MANAGEMENT may upload regardless of assignment", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(as("MANAGEMENT", "mgmt-x"))
      .send({ ...validBody, type: "BAST" });
    expect(r.status).toBe(201);
  });
});

describe("Documents — unauthenticated", () => {
  it("POST without auth headers → 401", async () => {
    const r = await request(makeApp())
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .send(validBody);
    expect(r.status).toBe(401);
  });
  it("DELETE without auth headers → 401", async () => {
    const r = await request(makeApp()).delete("/api/documents/d-1");
    expect(r.status).toBe(401);
  });
});

describe("POST /api/projects/:id/documents — requireRole gate", () => {
  it.each(["SALES", "KONSULTAN", "TECHNICAL_WRITER", "HR", "SITE_ADMIN", "PRINCIPAL_KONSULTAN"])(
    "%s is blocked at requireRole (403)",
    async (role) => {
      const r = await request(makeApp())
        .post(`/api/projects/${PROJECT_ID}/documents`)
        .set(as(role))
        .send(validBody);
      expect(r.status).toBe(403);
    },
  );
});

describe("DELETE /api/documents/:id — FINANCE carve-out mirrors POST", () => {
  it("FINANCE may delete an INVOICE on any project", async () => {
    documentFindUniqueMock.mockResolvedValueOnce({
      id: "d-1",
      projectId: PROJECT_ID,
      type: "INVOICE",
      fileName: "inv.pdf",
      fileUrl: "x",
      invoiceNumber: null,
      invoiceAmount: null,
      invoiceStatus: null,
      notes: null,
      uploadedAt: new Date(),
      uploadedBy: { id: "u", name: "U" },
    });
    documentDeleteMock.mockResolvedValueOnce({});
    const r = await request(makeApp()).delete("/api/documents/d-1").set(as("FINANCE", "f-1"));
    expect(r.status).toBe(200);
    expect(documentDeleteMock).toHaveBeenCalledOnce();
  });

  it("FINANCE forbidden from deleting non-INVOICE/CONTRACT", async () => {
    documentFindUniqueMock.mockResolvedValueOnce({
      id: "d-1",
      projectId: PROJECT_ID,
      type: "BAST",
      fileName: "bast.pdf",
      fileUrl: "x",
      invoiceNumber: null,
      invoiceAmount: null,
      invoiceStatus: null,
      notes: null,
      uploadedAt: new Date(),
      uploadedBy: { id: "u", name: "U" },
    });
    const r = await request(makeApp()).delete("/api/documents/d-1").set(as("FINANCE", "f-1"));
    expect(r.status).toBe(403);
    expect(documentDeleteMock).not.toHaveBeenCalled();
  });

  it("FINANCE may delete a CONTRACT on any project", async () => {
    documentFindUniqueMock.mockResolvedValueOnce({
      id: "d-2",
      projectId: PROJECT_ID,
      type: "CONTRACT",
      fileName: "c.pdf",
      fileUrl: "x",
      invoiceNumber: null,
      invoiceAmount: null,
      invoiceStatus: null,
      notes: null,
      uploadedAt: new Date(),
      uploadedBy: { id: "u", name: "U" },
    });
    documentDeleteMock.mockResolvedValueOnce({});
    const r = await request(makeApp()).delete("/api/documents/d-2").set(as("FINANCE", "f-1"));
    expect(r.status).toBe(200);
    expect(documentDeleteMock).toHaveBeenCalledOnce();
  });

  it("PROJECT_MANAGER not assigned cannot delete (no FINANCE-style bypass)", async () => {
    documentFindUniqueMock.mockResolvedValueOnce({
      id: "d-1",
      projectId: PROJECT_ID,
      type: "BAST",
      fileName: "bast.pdf",
      fileUrl: "x",
      invoiceNumber: null,
      invoiceAmount: null,
      invoiceStatus: null,
      notes: null,
      uploadedAt: new Date(),
      uploadedBy: { id: "u", name: "U" },
    });
    const r = await request(makeApp()).delete("/api/documents/d-1").set(as("PROJECT_MANAGER", "pm-other"));
    expect(r.status).toBe(403);
  });
});
