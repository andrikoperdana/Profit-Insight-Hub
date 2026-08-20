// Task: closedAt bookkeeping that drives the auto-archive retention rule.
//
// PATCH /projects/:id must set closedAt when a project enters CLOSED and
// clear it when it leaves CLOSED; the documents BAST+INVOICE auto-close path
// must also stamp closedAt. If either regresses, checkStaleClosedProjects
// silently stops seeing stale CLOSED projects.
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
const projectUpdateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>({}));
const projectUpdateManyMock = vi.fn((_a: unknown) =>
  Promise.resolve<unknown>({ count: 1 }),
);
const checklistCountMock = vi.fn((_a: unknown) => Promise.resolve(0));
const activityCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>({}));
const documentCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const documentFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const documentUpdateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>({}));

vi.mock("@workspace/db", () => {
  const tx = {
    document: {
      create: (a: unknown) => documentCreateMock(a),
      findFirst: (a: unknown) => documentFindFirstMock(a),
      update: (a: unknown) => documentUpdateMock(a),
    },
  };
  return {
    prisma: {
      project: {
        findUnique: (a: unknown) => projectFindUniqueMock(a),
        update: (a: unknown) => projectUpdateMock(a),
        updateMany: (a: unknown) => projectUpdateManyMock(a),
      },
      projectClosingChecklistItem: { count: (a: unknown) => checklistCountMock(a) },
      activity: { create: (a: unknown) => activityCreateMock(a) },
      document: {
        create: (a: unknown) => documentCreateMock(a),
        findFirst: (a: unknown) => documentFindFirstMock(a),
        update: (a: unknown) => documentUpdateMock(a),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)),
    },
  };
});

vi.mock("../../lib/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
  recordAuditAnon: vi.fn(async () => {}),
}));
vi.mock("../../lib/notifications.js", () => ({
  notifyUser: vi.fn(async () => {}),
  notifyUsers: vi.fn(async () => {}),
}));
vi.mock("../../lib/surveyDefaults.js", () => ({
  issueSurveyTokenIfMissing: vi.fn(async () => null),
}));
vi.mock("../../lib/feedback360.js", () => ({
  checkCloseRequirements: vi.fn(async () => []),
  createFeedback360PairsIfMissing: vi.fn(async () => ({ created: 0, reviewerIds: [] })),
  projectCloseReadinessWhere: vi.fn((projectId: string) => ({ id: projectId })),
}));
vi.mock("../../lib/app-settings.js", () => ({
  getAppSettings: vi.fn(async () => ({})),
}));
// Keep serialization out of scope: these tests assert what is WRITTEN, not
// how the response is shaped.
vi.mock("../../lib/serializers.js", () => ({
  serializeProject: (p: any) => p,
  projectInclude: {},
  computeMetrics: () => ({}),
  computeProfitOutlook: () => ({}),
  computeEvm: () => ({}),
  canViewProjectFinancials: () => true,
  canViewDailyRate: () => true,
}));

const { default: projectsRouter } = await import("../projects.js");
const { default: documentsRouter } = await import("../documents.js");

function makeApp(router: express.Router) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api", router);
  return app;
}

const MGMT = { "x-user-id": "mgmt-1", "x-user-role": "MANAGEMENT" } as Record<string, string>;
const PROJECT_ID = "proj-1";

const baseProject = {
  id: PROJECT_ID,
  code: "P1",
  projectId: "PRJ-2025-001",
  name: "Test Project",
  kind: "CLIENT",
  status: "COMPLETE",
  deletedAt: null,
  archivedAt: null,
  pmId: "pm-1",
  salesId: "sales-1",
  clientId: "client-1",
  technicalWriterId: null,
  adminProjectId: null,
  surveyToken: "tok",
  closedAt: null,
  documents: [],
};

beforeEach(() => {
  projectFindUniqueMock.mockReset();
  projectUpdateMock.mockReset();
  projectUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
  checklistCountMock.mockReset();
  activityCreateMock.mockClear();
  documentCreateMock.mockReset();
  documentFindFirstMock.mockReset().mockResolvedValue(null);
  documentUpdateMock.mockReset();
});

describe("PATCH /projects/:id — closedAt bookkeeping", () => {
  it("sets closedAt when the project enters CLOSED", async () => {
    projectFindUniqueMock
      .mockResolvedValueOnce({ ...baseProject, status: "COMPLETE" })
      .mockResolvedValueOnce({
        ...baseProject,
        status: "CLOSED",
        closedAt: new Date("2026-08-20T00:00:00.000Z"),
      });
    // Closing checklist gate: first count = pending (0), second = total (2).
    checklistCountMock.mockImplementation((a: any) =>
      Promise.resolve(a?.where?.status === "PENDING" ? 0 : 2),
    );
    const res = await request(makeApp(projectsRouter))
      .patch(`/api/projects/${PROJECT_ID}`)
      .set(MGMT)
      .send({ status: "CLOSED" });

    expect(res.status).toBe(200);
    expect(projectUpdateManyMock).toHaveBeenCalledOnce();
    const data = (projectUpdateManyMock.mock.calls[0]![0] as any).data;
    expect(data.status).toBe("CLOSED");
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it("rejects a direct close transition from a status before COMPLETE", async () => {
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "ACTIVE",
    });
    const res = await request(makeApp(projectsRouter))
      .patch(`/api/projects/${PROJECT_ID}`)
      .set(MGMT)
      .send({ status: "CLOSED" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PROJECT_NOT_COMPLETE");
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns a conflict if readiness changes before the atomic close update", async () => {
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "COMPLETE",
    });
    checklistCountMock.mockImplementation((a: any) =>
      Promise.resolve(a?.where?.status === "PENDING" ? 0 : 2),
    );
    projectUpdateManyMock.mockResolvedValue({ count: 0 });

    const res = await request(makeApp(projectsRouter))
      .patch(`/api/projects/${PROJECT_ID}`)
      .set(MGMT)
      .send({ status: "CLOSED" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CLOSE_REQUIREMENTS_CHANGED");
    expect(projectUpdateMock).not.toHaveBeenCalled();
  });

  it("clears closedAt when the project leaves CLOSED", async () => {
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "CLOSED",
      closedAt: new Date("2026-01-01T00:00:00Z"),
    });
    projectUpdateMock.mockImplementation((a: any) =>
      Promise.resolve({ ...baseProject, status: "PAUSE", ...a.data }),
    );

    const res = await request(makeApp(projectsRouter))
      .patch(`/api/projects/${PROJECT_ID}`)
      .set(MGMT)
      .send({ status: "PAUSE", statusChangeReason: "Reopening for warranty work" });

    expect(res.status).toBe(200);
    const data = (projectUpdateMock.mock.calls[0]![0] as any).data;
    expect(data.status).toBe("PAUSE");
    expect(data.closedAt).toBeNull();
  });

  it("leaves closedAt untouched on non-status edits of a CLOSED project", async () => {
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "CLOSED",
      closedAt: new Date("2026-01-01T00:00:00Z"),
    });
    projectUpdateMock.mockImplementation((a: any) =>
      Promise.resolve({ ...baseProject, status: "CLOSED", ...a.data }),
    );

    const res = await request(makeApp(projectsRouter))
      .patch(`/api/projects/${PROJECT_ID}`)
      .set(MGMT)
      .send({ name: "Renamed Project" });

    expect(res.status).toBe(200);
    const data = (projectUpdateMock.mock.calls[0]![0] as any).data;
    expect(data.closedAt).toBeUndefined();
    expect(data.status).toBeUndefined();
  });

  it("does not stamp closedAt again when already CLOSED and re-sent CLOSED", async () => {
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "CLOSED",
      closedAt: new Date("2026-01-01T00:00:00Z"),
    });
    projectUpdateMock.mockImplementation((a: any) =>
      Promise.resolve({ ...baseProject, status: "CLOSED", ...a.data }),
    );

    const res = await request(makeApp(projectsRouter))
      .patch(`/api/projects/${PROJECT_ID}`)
      .set(MGMT)
      .send({ status: "CLOSED" });

    expect(res.status).toBe(200);
    const data = (projectUpdateMock.mock.calls[0]![0] as any).data;
    expect(data.closedAt).toBeUndefined();
  });
});

describe("documents BAST+INVOICE auto-close stamps closedAt", () => {
  const uploadedDoc = {
    id: "d-1",
    projectId: PROJECT_ID,
    type: "BAST",
    kind: "FILE",
    fileName: "bast.pdf",
    fileUrl: "https://x/bast.pdf",
    invoiceNumber: null,
    invoiceAmount: null,
    invoiceStatus: null,
    notes: null,
    billingMilestoneId: null,
    billingMilestone: null,
    uploadedById: "mgmt-1",
    uploadedAt: new Date(),
    uploadedBy: { id: "mgmt-1", name: "Mgmt" },
    version: 1,
    parentDocumentId: null,
    isLatest: true,
  };

  it("sets status CLOSED with closedAt when BAST + INVOICE exist on a COMPLETE project", async () => {
    // Same findUnique serves the ownership check and the auto-close re-fetch;
    // the re-fetch sees both documents after this BAST upload.
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "COMPLETE",
      documents: [{ type: "INVOICE" }, { type: "BAST" }],
    });
    documentCreateMock.mockResolvedValue(uploadedDoc);
    projectUpdateManyMock.mockResolvedValue({ count: 1 });

    const res = await request(makeApp(documentsRouter))
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(MGMT)
      .send({ type: "BAST", fileName: "bast.pdf", fileUrl: "https://x/bast.pdf" });

    expect(res.status).toBe(201);
    expect(projectUpdateManyMock).toHaveBeenCalledOnce();
    const args = projectUpdateManyMock.mock.calls[0]![0] as any;
    expect(args.data.status).toBe("CLOSED");
    expect(args.data.closedAt).toBeInstanceOf(Date);
  });

  it("does not auto-close when the INVOICE is still missing", async () => {
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "COMPLETE",
      documents: [{ type: "BAST" }],
    });
    documentCreateMock.mockResolvedValue(uploadedDoc);

    const res = await request(makeApp(documentsRouter))
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(MGMT)
      .send({ type: "BAST", fileName: "bast.pdf", fileUrl: "https://x/bast.pdf" });

    expect(res.status).toBe(201);
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not auto-close when close requirements are unmet", async () => {
    const { checkCloseRequirements } = await import("../../lib/feedback360.js");
    (checkCloseRequirements as any).mockResolvedValueOnce(["Client survey response"]);
    projectFindUniqueMock.mockResolvedValue({
      ...baseProject,
      status: "COMPLETE",
      documents: [{ type: "INVOICE" }, { type: "BAST" }],
    });
    documentCreateMock.mockResolvedValue(uploadedDoc);

    const res = await request(makeApp(documentsRouter))
      .post(`/api/projects/${PROJECT_ID}/documents`)
      .set(MGMT)
      .send({ type: "BAST", fileName: "bast.pdf", fileUrl: "https://x/bast.pdf" });

    expect(res.status).toBe(201);
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
  });
});
