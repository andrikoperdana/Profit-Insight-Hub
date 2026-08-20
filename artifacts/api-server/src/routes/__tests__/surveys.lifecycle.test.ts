import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn(),
  projectUpdateMany: vi.fn(),
  questionFindMany: vi.fn(),
  responseFindMany: vi.fn(),
  responseCount: vi.fn(),
  responseCreate: vi.fn(),
  answerCreateMany: vi.fn(),
  activityCreate: vi.fn(),
  userFindMany: vi.fn(),
  recordAudit: vi.fn(),
  recordAuditAnon: vi.fn(),
  issueToken: vi.fn(),
}));

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
    if (!roles.includes(req.user.role) && req.user.role !== "SUPER_ADMIN") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
}));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      project: {
        findUnique: mocks.projectFindUnique,
        update: mocks.projectUpdate,
        updateMany: mocks.projectUpdateMany,
        findMany: vi.fn(async () => []),
      },
      surveyQuestion: { findMany: mocks.questionFindMany },
      surveyResponse: {
        findMany: mocks.responseFindMany,
        count: mocks.responseCount,
        create: mocks.responseCreate,
      },
      projectFeedback360: { count: vi.fn(async () => 0) },
      user: { findMany: mocks.userFindMany },
      activity: { create: mocks.activityCreate },
    },
  };
});

vi.mock("../../lib/audit.js", () => ({
  recordAudit: mocks.recordAudit,
  recordAuditAnon: mocks.recordAuditAnon,
}));

vi.mock("../../lib/surveyDefaults.js", () => ({
  ensureDefaultSurveyQuestions: vi.fn(async () => {}),
  issueSurveyTokenIfMissing: mocks.issueToken,
}));

vi.mock("../../lib/projectAccess.js", () => ({
  assertProjectWritable: vi.fn(async () => true),
}));

vi.mock("../../lib/rateLimit.js", () => ({
  rateLimitAllow: vi.fn(async () => true),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../lib/notifications.js", () => ({
  notifyUser: vi.fn(async () => {}),
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

function publicProject(status: string, override: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    projectId: "PRJ/2026/001",
    code: "LEGACY-001",
    name: "Client Project",
    kind: "CLIENT",
    status,
    surveyToken: "survey-token",
    surveyEnabled: true,
    surveyExpiresAt: null,
    deletedAt: null,
    archivedAt: null,
    client: { name: "Acme" },
    ...override,
  };
}

function waiverProject(override: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    projectId: "PRJ/2026/001",
    code: "LEGACY-001",
    name: "Client Project",
    kind: "CLIENT",
    status: "COMPLETE",
    deletedAt: null,
    archivedAt: null,
    csatWaivedAt: null,
    csatWaivedById: null,
    csatWaiverReason: null,
    ...override,
  };
}

describe("public CSAT lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.questionFindMany.mockResolvedValue([
      {
        key: "question-1",
        order: 1,
        text: "How satisfied are you?",
        type: "RATING",
        required: true,
        active: true,
      },
    ]);
    mocks.responseFindMany.mockResolvedValue([]);
    mocks.responseCount.mockResolvedValue(0);
    mocks.userFindMany.mockResolvedValue([]);
    mocks.responseCreate.mockResolvedValue({
      id: "response-1",
      projectId: "project-1",
      respondentName: null,
      respondentEmail: null,
    });
    mocks.answerCreateMany.mockResolvedValue({ count: 1 });
    mocks.activityCreate.mockResolvedValue({ id: "activity-1" });
    mocks.projectUpdateMany.mockResolvedValue({ count: 1 });
  });

  it.each(["COMPLETE", "CLOSED"])(
    "serves the public survey while the project is %s",
    async (status) => {
      mocks.projectFindUnique.mockResolvedValue(publicProject(status));
      const res = await request(makeApp()).get(
        "/api/public/surveys/survey-token",
      );
      expect(res.status).toBe(200);
      expect(res.body.project.id).toBe("project-1");
      expect(res.body.questions).toHaveLength(1);
    },
  );

  it.each(["COMPLETE", "CLOSED"])(
    "accepts a public response while the project is %s",
    async (status) => {
    mocks.projectFindUnique.mockResolvedValue(publicProject(status));
    const res = await request(makeApp())
      .post("/api/public/surveys/survey-token")
      .send({
        answers: { "question-1": { rating: 5 } },
      });
    expect(res.status).toBe(201);
    expect(mocks.responseCreate).toHaveBeenCalledOnce();
    expect(mocks.recordAuditAnon).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["before COMPLETE", publicProject("ACTIVE")],
    ["archived", publicProject("COMPLETE", { archivedAt: new Date() })],
    ["deleted", publicProject("COMPLETE", { deletedAt: new Date() })],
    ["disabled", publicProject("COMPLETE", { surveyEnabled: false })],
    [
      "expired",
      publicProject("COMPLETE", {
        surveyExpiresAt: new Date(Date.now() - 60_000),
      }),
    ],
  ])("rejects a public link when the project is %s", async (_label, project) => {
    mocks.projectFindUnique.mockResolvedValue(project);
    const res = await request(makeApp()).get(
      "/api/public/surveys/survey-token",
    );
    expect(res.status).toBe(404);
  });

  it.each([
    ["before COMPLETE", publicProject("ACTIVE")],
    ["archived", publicProject("COMPLETE", { archivedAt: new Date() })],
    ["deleted", publicProject("COMPLETE", { deletedAt: new Date() })],
    ["disabled", publicProject("COMPLETE", { surveyEnabled: false })],
    [
      "expired",
      publicProject("COMPLETE", {
        surveyExpiresAt: new Date(Date.now() - 60_000),
      }),
    ],
  ])("rejects a public submission when the project is %s", async (_label, project) => {
    mocks.projectFindUnique.mockResolvedValue(project);
    const res = await request(makeApp())
      .post("/api/public/surveys/survey-token")
      .send({ answers: { "question-1": { rating: 5 } } });
    expect(res.status).toBe(404);
    expect(mocks.responseCreate).not.toHaveBeenCalled();
  });

  it("does not expose an active link for an archived authenticated project", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      ...publicProject("COMPLETE", { archivedAt: new Date() }),
      pmId: "pm-1",
      csatWaivedAt: null,
      csatWaiverReason: null,
      csatWaivedBy: null,
    });
    const res = await request(makeApp())
      .get("/api/projects/project-1/survey")
      .set(as("MANAGEMENT"));
    expect(res.status).toBe(200);
    expect(res.body.surveyAvailable).toBe(false);
    expect(res.body.linkActive).toBe(false);
    expect(res.body.surveyToken).toBeNull();
    expect(res.body.publicUrl).toBeNull();
  });
});

describe("Management CSAT waiver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindUnique.mockResolvedValue(waiverProject());
    mocks.projectUpdateMany.mockResolvedValue({ count: 1 });
  });

  it.each(["PROJECT_MANAGER", "SALES", "KONSULTAN"])(
    "rejects %s from granting a waiver",
    async (role) => {
      const res = await request(makeApp())
        .put("/api/projects/project-1/survey-waiver")
        .set(as(role))
        .send({
          waived: true,
          reason: "Client did not respond after several follow-ups.",
        });
      expect(res.status).toBe(403);
      expect(mocks.projectUpdateMany).not.toHaveBeenCalled();
    },
  );

  it("requires a meaningful reason", async () => {
    const res = await request(makeApp())
      .put("/api/projects/project-1/survey-waiver")
      .set(as("MANAGEMENT"))
      .send({ waived: true, reason: "No reply" });
    expect(res.status).toBe(400);
    expect(mocks.projectUpdateMany).not.toHaveBeenCalled();
  });

  it("records a Management grant in the audit log", async () => {
    mocks.projectFindUnique
      .mockResolvedValueOnce(waiverProject())
      .mockResolvedValueOnce({
        csatWaivedAt: new Date("2026-08-20T00:00:00.000Z"),
        csatWaiverReason: "Client did not respond after several follow-ups.",
        csatWaivedBy: { id: "management-1", name: "Management User" },
      });
    const res = await request(makeApp())
      .put("/api/projects/project-1/survey-waiver")
      .set(as("MANAGEMENT", "management-1"))
      .send({
        waived: true,
        reason: "Client did not respond after several follow-ups.",
      });
    expect(res.status).toBe(200);
    expect(res.body.csatWaived).toBe(true);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.csat_waived" }),
    );
  });

  it("allows Management to remove a waiver and audits the removal", async () => {
    mocks.projectFindUnique
      .mockResolvedValueOnce(waiverProject({
        csatWaivedAt: new Date("2026-08-20T00:00:00.000Z"),
        csatWaivedById: "management-1",
        csatWaiverReason: "Client did not respond after several follow-ups.",
      }))
      .mockResolvedValueOnce({
        csatWaivedAt: null,
        csatWaiverReason: null,
        csatWaivedBy: null,
      });
    const res = await request(makeApp())
      .put("/api/projects/project-1/survey-waiver")
      .set(as("MANAGEMENT", "management-1"))
      .send({ waived: false });
    expect(res.status).toBe(200);
    expect(res.body.csatWaived).toBe(false);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.csat_waiver_removed" }),
    );
  });

  it.each([
    ["archived", waiverProject({ archivedAt: new Date() }), 400],
    ["non-client", waiverProject({ kind: "INTERNAL" }), 400],
    ["already closed", waiverProject({ status: "CLOSED" }), 400],
    ["deleted", waiverProject({ deletedAt: new Date() }), 404],
  ])("rejects a waiver for an %s project", async (_label, project, status) => {
    mocks.projectFindUnique.mockResolvedValue(project);
    const res = await request(makeApp())
      .put("/api/projects/project-1/survey-waiver")
      .set(as("MANAGEMENT"))
      .send({
        waived: true,
        reason: "Client did not respond after several follow-ups.",
      });
    expect(res.status).toBe(status);
    expect(mocks.projectUpdateMany).not.toHaveBeenCalled();
  });

  it("allows SUPER_ADMIN to grant a waiver", async () => {
    mocks.projectFindUnique
      .mockResolvedValueOnce(waiverProject())
      .mockResolvedValueOnce({
        csatWaivedAt: new Date("2026-08-20T00:00:00.000Z"),
        csatWaiverReason: "Client did not respond after several follow-ups.",
        csatWaivedBy: { id: "super-1", name: "Super Admin" },
      });
    const res = await request(makeApp())
      .put("/api/projects/project-1/survey-waiver")
      .set(as("SUPER_ADMIN", "super-1"))
      .send({
        waived: true,
        reason: "Client did not respond after several follow-ups.",
      });
    expect(res.status).toBe(200);
  });

  it("returns a conflict and does not audit if project state changes", async () => {
    mocks.projectUpdateMany.mockResolvedValue({ count: 0 });
    const res = await request(makeApp())
      .put("/api/projects/project-1/survey-waiver")
      .set(as("MANAGEMENT"))
      .send({
        waived: true,
        reason: "Client did not respond after several follow-ups.",
      });
    expect(res.status).toBe(409);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});