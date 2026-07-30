// Task: catch regressions in the auto-archive retention rule.
//
// checkStaleClosedProjects guarantees:
//   - policy disabled (autoArchiveClosedMonths = 0) does nothing
//   - warning phase creates MGMT PROJECT_AUTO_ARCHIVE_WARNING but never archives
//   - archive happens only past the deadline AND only once a warning has been
//     on the books for >= 3 days (grace), writing a project.auto_archived audit
//     entry and PROJECT_AUTO_ARCHIVED notifications
import { describe, it, expect, vi, beforeEach } from "vitest";

const projectFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const projectUpdateManyMock = vi.fn((_a: unknown) => Promise.resolve({ count: 1 }));
const userFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const notificationFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));

vi.mock("@workspace/db", () => ({
  prisma: {
    project: {
      findMany: (a: unknown) => projectFindManyMock(a),
      updateMany: (a: unknown) => projectUpdateManyMock(a),
    },
    user: { findMany: (a: unknown) => userFindManyMock(a) },
    notification: { findFirst: (a: unknown) => notificationFindFirstMock(a) },
  },
}));

const notifyUserMock = vi.fn(async (_o: unknown) => {});
vi.mock("../../lib/notifications.js", () => ({
  notifyUser: (o: unknown) => notifyUserMock(o),
}));

const recordAuditAnonMock = vi.fn(async (_o: unknown) => {});
vi.mock("../../lib/audit.js", () => ({
  recordAuditAnon: (o: unknown) => recordAuditAnonMock(o),
}));

const getAppSettingsMock = vi.fn(async () => ({ autoArchiveClosedMonths: 6 }));
vi.mock("../../lib/app-settings.js", () => ({
  getAppSettings: () => getAppSettingsMock(),
}));

const { checkStaleClosedProjects } = await import("../../lib/notificationRules.js");

const RETENTION_MONTHS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/** closedAt such that the archive deadline (closedAt + retention) lands `daysFromNow` days from now. */
function closedAtWithDeadlineIn(daysFromNow: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return new Date(d.getTime() + daysFromNow * DAY_MS);
}

const PROJECT = {
  id: "proj-1",
  name: "Legacy Rollout",
  code: "LR-1",
  projectId: "PRJ-2025-001",
  closedAt: closedAtWithDeadlineIn(3),
};
const MGMT = [{ id: "mgmt-1" }, { id: "mgmt-2" }];

// notification.findFirst serves two lookups; tell them apart by shape:
//   - earliest-warning lookup: type PROJECT_AUTO_ARCHIVE_WARNING, no userId
//   - notifyOnceDaily dedup: has userId
let earliestWarning: { createdAt: Date } | null = null;
let dedupHit = false;

beforeEach(() => {
  projectFindManyMock.mockReset().mockResolvedValue([]);
  projectUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
  userFindManyMock.mockReset().mockResolvedValue(MGMT);
  notifyUserMock.mockClear();
  recordAuditAnonMock.mockClear();
  getAppSettingsMock.mockClear().mockResolvedValue({ autoArchiveClosedMonths: RETENTION_MONTHS });
  earliestWarning = null;
  dedupHit = false;
  notificationFindFirstMock.mockReset().mockImplementation((a: any) => {
    const where = a?.where ?? {};
    if (!where.userId && where.type === "PROJECT_AUTO_ARCHIVE_WARNING") {
      return Promise.resolve(earliestWarning);
    }
    return Promise.resolve(dedupHit ? { id: "n-dup" } : null);
  });
});

describe("policy disabled", () => {
  it("does nothing when autoArchiveClosedMonths is 0", async () => {
    getAppSettingsMock.mockResolvedValue({ autoArchiveClosedMonths: 0 });
    const created = await checkStaleClosedProjects();
    expect(created).toBe(0);
    expect(projectFindManyMock).not.toHaveBeenCalled();
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
    expect(recordAuditAnonMock).not.toHaveBeenCalled();
  });
});

describe("warning phase (inside the 7-day window, before the deadline)", () => {
  it("notifies every MGMT user with PROJECT_AUTO_ARCHIVE_WARNING and never archives", async () => {
    projectFindManyMock.mockResolvedValue([PROJECT]);
    const created = await checkStaleClosedProjects();
    expect(created).toBe(2);
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(recordAuditAnonMock).not.toHaveBeenCalled();
    const calls = notifyUserMock.mock.calls.map((c) => c[0] as any);
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((c) => c.userId))).toEqual(new Set(["mgmt-1", "mgmt-2"]));
    for (const c of calls) {
      expect(c.type).toBe("PROJECT_AUTO_ARCHIVE_WARNING");
      expect(c.link).toBe("/projects/proj-1");
    }
  });

  it("skips projects still outside the warning window entirely", async () => {
    projectFindManyMock.mockResolvedValue([
      { ...PROJECT, closedAt: closedAtWithDeadlineIn(30) },
    ]);
    const created = await checkStaleClosedProjects();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
  });

  it("dedups: no duplicate warning when one was already sent today", async () => {
    projectFindManyMock.mockResolvedValue([PROJECT]);
    dedupHit = true;
    const created = await checkStaleClosedProjects();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("only considers unarchived, non-deleted CLOSED projects with a closedAt", async () => {
    projectFindManyMock.mockResolvedValue([]);
    await checkStaleClosedProjects();
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where).toMatchObject({
      deletedAt: null,
      archivedAt: null,
      status: "CLOSED",
      closedAt: { not: null },
    });
  });
});

describe("past the deadline", () => {
  const pastDeadline = { ...PROJECT, closedAt: closedAtWithDeadlineIn(-2) };

  it("does NOT archive when no warning has ever been sent — warns instead", async () => {
    projectFindManyMock.mockResolvedValue([pastDeadline]);
    earliestWarning = null;
    const created = await checkStaleClosedProjects();
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(recordAuditAnonMock).not.toHaveBeenCalled();
    expect(created).toBe(2);
    for (const c of notifyUserMock.mock.calls.map((x) => x[0] as any)) {
      expect(c.type).toBe("PROJECT_AUTO_ARCHIVE_WARNING");
    }
  });

  it("does NOT archive while the earliest warning is younger than the 3-day grace", async () => {
    projectFindManyMock.mockResolvedValue([pastDeadline]);
    earliestWarning = { createdAt: new Date(Date.now() - 1 * DAY_MS) };
    const created = await checkStaleClosedProjects();
    expect(projectUpdateManyMock).not.toHaveBeenCalled();
    expect(created).toBe(2);
    for (const c of notifyUserMock.mock.calls.map((x) => x[0] as any)) {
      expect(c.type).toBe("PROJECT_AUTO_ARCHIVE_WARNING");
    }
  });

  it("archives once the warning is >= 3 days old: guarded update + audit + MGMT notice", async () => {
    projectFindManyMock.mockResolvedValue([pastDeadline]);
    earliestWarning = { createdAt: new Date(Date.now() - 4 * DAY_MS) };
    const created = await checkStaleClosedProjects();

    expect(projectUpdateManyMock).toHaveBeenCalledOnce();
    const args = projectUpdateManyMock.mock.calls[0]![0] as any;
    // Concurrency guard: only archive if still an unarchived, live CLOSED project.
    expect(args.where).toMatchObject({
      id: "proj-1",
      archivedAt: null,
      deletedAt: null,
      status: "CLOSED",
    });
    expect(args.data.archivedAt).toBeInstanceOf(Date);

    expect(recordAuditAnonMock).toHaveBeenCalledOnce();
    const audit = recordAuditAnonMock.mock.calls[0]![0] as any;
    expect(audit.action).toBe("project.auto_archived");
    expect(audit.entityType).toBe("Project");
    expect(audit.entityId).toBe("proj-1");

    expect(created).toBe(2);
    for (const c of notifyUserMock.mock.calls.map((x) => x[0] as any)) {
      expect(c.type).toBe("PROJECT_AUTO_ARCHIVED");
    }
  });

  it("skips audit + notifications when the guarded update loses the race (count 0)", async () => {
    projectFindManyMock.mockResolvedValue([pastDeadline]);
    earliestWarning = { createdAt: new Date(Date.now() - 4 * DAY_MS) };
    projectUpdateManyMock.mockResolvedValue({ count: 0 });
    const created = await checkStaleClosedProjects();
    expect(created).toBe(0);
    expect(recordAuditAnonMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
