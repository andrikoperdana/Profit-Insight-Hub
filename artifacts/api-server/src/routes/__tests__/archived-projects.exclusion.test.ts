// Task: exclude archived projects from mobile app lists and calculations.
//
// The Expo mobile app consumes:
//   - GET /api/projects (project pickers on the timesheet/expense screens and
//     the Projects tab; the dashboard adds ?status=ACTIVE)
//   - POST /api/timesheets (new timesheet entry)
//   - POST /api/projects/:id/expenses (new expense claim)
//
// These tests prove that archived projects (archivedAt != null) are excluded
// from the default project list (so they never reach mobile pickers) and that
// new timesheet/expense entries against an archived project are rejected.
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

const projectFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const projectCountMock = vi.fn((_a: unknown) => Promise.resolve(0));
const projectFindUniqueMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const projectFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const timesheetCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const expenseCreateMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const projectResourceFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));
const appSettingFindUniqueMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));

vi.mock("@workspace/db", () => ({
  prisma: {
    project: {
      findMany: (a: unknown) => projectFindManyMock(a),
      count: (a: unknown) => projectCountMock(a),
      findUnique: (a: unknown) => projectFindUniqueMock(a),
      findFirst: (a: unknown) => projectFindFirstMock(a),
    },
    projectResource: { findFirst: (a: unknown) => projectResourceFindFirstMock(a) },
    timesheet: { create: (a: unknown) => timesheetCreateMock(a) },
    projectExpense: { create: (a: unknown) => expenseCreateMock(a) },
    appSetting: { findUnique: (a: unknown) => appSettingFindUniqueMock(a) },
  },
}));

vi.mock("../../lib/audit.js", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("../../lib/notifications.js", () => ({ notifyUser: vi.fn(async () => {}) }));
vi.mock("../../lib/workstreams.js", () => ({
  validateWorkstreamId: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../lib/app-settings.js", () => ({
  getAppSettings: vi.fn(async () => ({ timesheetBackdateDays: 30 })),
}));

const { default: projectsRouter } = await import("../projects.js");
const { default: timesheetsRouter } = await import("../timesheets.js");
const { default: expensesRouter } = await import("../expenses.js");
const { assertProjectWritable } = await import("../../lib/projectAccess.js");

function makeApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

function as(role: string, id = `${role.toLowerCase()}-1`) {
  return { "x-user-id": id, "x-user-role": role } as Record<string, string>;
}

const ARCHIVED_PROJECT_ID = "proj-archived-1";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  projectFindManyMock.mockReset().mockResolvedValue([]);
  projectCountMock.mockReset().mockResolvedValue(0);
  projectFindUniqueMock.mockReset().mockResolvedValue(null);
  projectFindFirstMock.mockReset().mockResolvedValue(null);
  timesheetCreateMock.mockReset();
  expenseCreateMock.mockReset();
  projectResourceFindFirstMock.mockReset().mockResolvedValue(null);
});

describe("GET /projects excludes archived projects from lists/pickers", () => {
  it("filters archivedAt = null by default (mobile pickers, Projects tab)", async () => {
    const res = await request(makeApp(projectsRouter))
      .get("/api/projects")
      .set(as("MANAGEMENT"));
    expect(res.status).toBe(200);
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where.archivedAt).toBeNull();
    expect(where.deletedAt).toBeNull();
  });

  it("filters archivedAt = null with ?status=ACTIVE (mobile dashboard)", async () => {
    const res = await request(makeApp(projectsRouter))
      .get("/api/projects?status=ACTIVE")
      .set(as("KONSULTAN"));
    expect(res.status).toBe(200);
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where.archivedAt).toBeNull();
    expect(where.status).toBe("ACTIVE");
  });

  it("ignores includeArchived=true for non-management roles", async () => {
    const res = await request(makeApp(projectsRouter))
      .get("/api/projects?includeArchived=true")
      .set(as("KONSULTAN"));
    expect(res.status).toBe(200);
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where.archivedAt).toBeNull();
  });

  it("honors includeArchived=true only for MANAGEMENT", async () => {
    const res = await request(makeApp(projectsRouter))
      .get("/api/projects?includeArchived=true")
      .set(as("MANAGEMENT"));
    expect(res.status).toBe(200);
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where.archivedAt).toBeUndefined();
  });
});

describe("assertProjectWritable blocks archived projects", () => {
  function fakeRes() {
    const out: { code?: number; body?: unknown } = {};
    return {
      res: {
        status(code: number) {
          out.code = code;
          return { json: (b: unknown) => (out.body = b) };
        },
      },
      out,
    };
  }

  it("returns false with 400 for an archived project", async () => {
    projectFindUniqueMock.mockResolvedValue({ deletedAt: null, archivedAt: new Date() });
    const { res, out } = fakeRes();
    expect(await assertProjectWritable(ARCHIVED_PROJECT_ID, res)).toBe(false);
    expect(out.code).toBe(400);
    expect(String((out.body as any).error)).toMatch(/archived/i);
  });

  it("returns true for a live project", async () => {
    projectFindUniqueMock.mockResolvedValue({ deletedAt: null, archivedAt: null });
    const { res, out } = fakeRes();
    expect(await assertProjectWritable("proj-live-1", res)).toBe(true);
    expect(out.code).toBeUndefined();
  });
});

describe("POST /timesheets blocks new entries on archived projects", () => {
  it("rejects with 400 and never creates the timesheet", async () => {
    // assertProjectWritable's select: { deletedAt, archivedAt }
    projectFindUniqueMock.mockResolvedValue({ deletedAt: null, archivedAt: new Date() });
    const res = await request(makeApp(timesheetsRouter))
      .post("/api/timesheets")
      .set(as("KONSULTAN"))
      .send({
        projectId: ARCHIVED_PROJECT_ID,
        workDate: isoDaysAgo(1),
        hours: 2,
        description: "test entry",
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/archived/i);
    expect(timesheetCreateMock).not.toHaveBeenCalled();
  });
});

describe("POST /projects/:id/expenses blocks new claims on archived projects", () => {
  it("rejects with 400 and never creates the expense", async () => {
    // Route first loads the project for role checks, then assertProjectWritable
    // re-selects { deletedAt, archivedAt }.
    projectFindUniqueMock.mockResolvedValue({
      id: ARCHIVED_PROJECT_ID,
      pmId: "pm-1",
      salesId: "sales-1",
      deletedAt: null,
      archivedAt: new Date(),
    });
    const res = await request(makeApp(expensesRouter))
      .post(`/api/projects/${ARCHIVED_PROJECT_ID}/expenses`)
      .set(as("MANAGEMENT"))
      .send({
        category: "TRAVEL",
        description: "test claim",
        amount: 1000,
        spentAt: isoDaysAgo(1),
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/archived/i);
    expect(expenseCreateMock).not.toHaveBeenCalled();
  });
});
