import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Auth middleware: read user from x-user-id/x-user-role headers.
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
  requireRole:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
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

// Zod body validation: passthrough — this test exercises the handler's own
// semantic guards (mandatory task + hour cap), not the structural schema.
vi.mock("../../middlewares/validate.js", () => ({
  validateBody: () => (_req: any, _res: any, next: any) => next(),
}));

const taskFindUnique = vi.fn();
const tsAggregate = vi.fn();
const tsCreate = vi.fn();

vi.mock("@workspace/db", () => ({
  prisma: {
    task: { findUnique: (...a: any[]) => taskFindUnique(...a) },
    timesheet: {
      aggregate: (...a: any[]) => tsAggregate(...a),
      create: (...a: any[]) => tsCreate(...a),
    },
    activity: { create: vi.fn(async () => ({})) },
    project: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("../../lib/audit.js", () => ({
  recordAudit: vi.fn(async () => {}),
}));
vi.mock("../../lib/notifications.js", () => ({
  notifyUser: vi.fn(async () => {}),
}));
vi.mock("../../lib/workstreams.js", () => ({
  validateWorkstreamId: vi.fn(async () => ({ ok: true, workstreamId: null })),
}));
vi.mock("../../lib/app-settings.js", () => ({
  getAppSettings: vi.fn(async () => ({ timesheetBackdateDays: 5 })),
}));

const { default: timesheetsRouter } = await import("../timesheets.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", timesheetsRouter);
  return app;
}

const TODAY = new Date().toISOString().slice(0, 10);
const PROJECT_ID = "proj1";
const TASK_ID = "task1";
const USER_ID = "kon1";

function taskRow(plannedHours: number | null) {
  return {
    id: TASK_ID,
    projectId: PROJECT_ID,
    workstreamId: null,
    assigneeId: USER_ID,
    plannedHours,
    assignees: [{ userId: USER_ID }],
  };
}

function createdTsRow() {
  return {
    id: "ts1",
    projectId: PROJECT_ID,
    workstreamId: null,
    userId: USER_ID,
    taskId: TASK_ID,
    workDate: new Date(TODAY),
    hours: 1,
    description: "test entry",
    status: "SUBMITTED",
    approvedById: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: USER_ID, name: "Konsultan", email: "k@x.id", role: "KONSULTAN" },
    project: { id: PROJECT_ID, name: "Proj", code: "P-1", pmId: "pm1" },
    approvedBy: null,
    task: { id: TASK_ID, title: "Task" },
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    workDate: TODAY,
    hours: 2,
    description: "test entry",
    ...overrides,
  };
}

beforeEach(() => {
  taskFindUnique.mockReset();
  tsAggregate.mockReset();
  tsCreate.mockReset();
  tsCreate.mockResolvedValue(createdTsRow());
});

describe("POST /api/timesheets — F4 mandatory task + hour cap", () => {
  for (const role of ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"]) {
    it(`rejects ${role} without taskId (TASK_REQUIRED)`, async () => {
      const res = await request(makeApp())
        .post("/api/timesheets")
        .set("x-user-id", USER_ID)
        .set("x-user-role", role)
        .send(body());
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("TASK_REQUIRED");
    });
  }

  it("allows MANAGEMENT without taskId (task not mandatory)", async () => {
    const res = await request(makeApp())
      .post("/api/timesheets")
      .set("x-user-id", "mgmt1")
      .set("x-user-role", "MANAGEMENT")
      .send(body());
    expect(res.status).toBe(201);
  });

  it("rejects hours over the remaining cap (TASK_HOURS_CAP_EXCEEDED)", async () => {
    taskFindUnique.mockResolvedValue(taskRow(3));
    tsAggregate.mockResolvedValue({ _sum: { hours: 2 } }); // 1h remains
    const res = await request(makeApp())
      .post("/api/timesheets")
      .set("x-user-id", USER_ID)
      .set("x-user-role", "KONSULTAN")
      .send(body({ taskId: TASK_ID, hours: 2 }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TASK_HOURS_CAP_EXCEEDED");
    expect(res.body.remainingHours).toBe(1);
    expect(res.body.plannedHours).toBe(3);
    // The cap counts DRAFT+SUBMITTED+APPROVED across ALL users of the task.
    expect(tsAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: TASK_ID, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
      }),
    );
  });

  it("accepts hours exactly at the remaining cap", async () => {
    taskFindUnique.mockResolvedValue(taskRow(3));
    tsAggregate.mockResolvedValue({ _sum: { hours: 2 } }); // 1h remains
    const res = await request(makeApp())
      .post("/api/timesheets")
      .set("x-user-id", USER_ID)
      .set("x-user-role", "KONSULTAN")
      .send(body({ taskId: TASK_ID, hours: 1 }));
    expect(res.status).toBe(201);
  });

  it("does not cap tasks with plannedHours = null", async () => {
    taskFindUnique.mockResolvedValue(taskRow(null));
    const res = await request(makeApp())
      .post("/api/timesheets")
      .set("x-user-id", USER_ID)
      .set("x-user-role", "KONSULTAN")
      .send(body({ taskId: TASK_ID, hours: 12 }));
    expect(res.status).toBe(201);
    expect(tsAggregate).not.toHaveBeenCalled();
  });

  it("bulk: rejects delivery-role entries without taskId per entry", async () => {
    const res = await request(makeApp())
      .post("/api/timesheets/bulk")
      .set("x-user-id", USER_ID)
      .set("x-user-role", "KONSULTAN")
      .send({ entries: [body()] });
    expect(res.status).toBe(201);
    expect(res.body.failed).toBe(1);
    expect(res.body.results[0].error).toMatch(/task selection is required/i);
  });
});
