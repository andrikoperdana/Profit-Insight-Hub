// Task: catch regressions in the budget-overrun and low-margin alerts.
//
// checkProjectOverrun guarantees:
//   - flags projects where actualCost / contractValue * 100 >= budgetOverrunPct
//   - actualCost = approved timesheet hours/8 × resource dailyRate + approved expenses
//     (timesheets from users without a resource row cost 0)
//   - only queries live ACTIVE/OBSERVATION/PAUSE projects with contractValue > 0
//   - notifies the PM + every MANAGEMENT user (deduped), once per day
//   - message names the top labor contributors and the expense share
// checkLowMargin guarantees:
//   - flags projects where (contractValue - actualCost) / contractValue * 100 < lowMarginPct
//   - skips zero-cost projects entirely
//   - same recipients, dedup, and cost-driver sentence behavior
import { describe, it, expect, vi, beforeEach } from "vitest";

const projectFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const timesheetFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const expenseFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const userFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const notificationFindFirstMock = vi.fn((_a: unknown) => Promise.resolve<unknown>(null));

vi.mock("@workspace/db", () => ({
  prisma: {
    project: { findMany: (a: unknown) => projectFindManyMock(a) },
    timesheet: { findMany: (a: unknown) => timesheetFindManyMock(a) },
    projectExpense: { findMany: (a: unknown) => expenseFindManyMock(a) },
    user: { findMany: (a: unknown) => userFindManyMock(a) },
    notification: { findFirst: (a: unknown) => notificationFindFirstMock(a) },
  },
}));

const notifyUserMock = vi.fn(async (_o: unknown) => {});
vi.mock("../../lib/notifications.js", () => ({
  notifyUser: (o: unknown) => notifyUserMock(o),
}));

vi.mock("../../lib/audit.js", () => ({
  recordAuditAnon: vi.fn(async () => {}),
}));

const SETTINGS = { budgetOverrunPct: 80, lowMarginPct: 20 };
const getAppSettingsMock = vi.fn(async () => SETTINGS);
vi.mock("../../lib/app-settings.js", () => ({
  getAppSettings: () => getAppSettingsMock(),
}));

const { checkProjectOverrun, checkLowMargin } = await import("../../lib/notificationRules.js");

const MGMT = [{ id: "mgmt-1" }, { id: "mgmt-2" }];
const NAMES = [
  { id: "user-a", name: "Alice" },
  { id: "user-b", name: "Bob" },
  { id: "pm-1", name: "Pam" },
];

// user.findMany serves two lookups; tell them apart by the where shape:
//   - MANAGEMENT recipients: where.role === "MANAGEMENT"
//   - fetchUserNames (cost drivers): where.id.in
let dedupHit = false;

beforeEach(() => {
  projectFindManyMock.mockReset().mockResolvedValue([]);
  timesheetFindManyMock.mockReset().mockResolvedValue([]);
  expenseFindManyMock.mockReset().mockResolvedValue([]);
  notifyUserMock.mockClear();
  getAppSettingsMock.mockClear().mockResolvedValue(SETTINGS);
  dedupHit = false;
  notificationFindFirstMock.mockReset().mockImplementation(() =>
    Promise.resolve(dedupHit ? { id: "n-dup" } : null),
  );
  userFindManyMock.mockReset().mockImplementation((a: any) => {
    const where = a?.where ?? {};
    if (where.role === "MANAGEMENT") return Promise.resolve(MGMT);
    const ids: string[] = where.id?.in ?? [];
    return Promise.resolve(NAMES.filter((n) => ids.includes(n.id)));
  });
});

/** A project with one resource (user-a) at 1M/day. contractValue 100M. */
function project(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    name: "Big Build",
    contractValue: 100_000_000,
    pmId: "pm-1",
    resources: [{ id: "res-1", userId: "user-a", dailyRate: 1_000_000 }],
    ...overrides,
  };
}

/** Approved timesheet hours that cost `days` × user-a's daily rate. */
function laborDays(days: number, userId = "user-a", projectId = "proj-1") {
  return { projectId, userId, hours: days * 8 };
}

describe("checkProjectOverrun", () => {
  it("only queries live ACTIVE/OBSERVATION/PAUSE projects with contractValue > 0", async () => {
    await checkProjectOverrun();
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where).toMatchObject({
      deletedAt: null,
      archivedAt: null,
      status: { in: ["ACTIVE", "OBSERVATION", "PAUSE"] },
      contractValue: { gt: 0 },
    });
    // Only APPROVED timesheets and expenses count toward actual cost.
    expect((timesheetFindManyMock.mock.calls[0]![0] as any).where.status).toBe("APPROVED");
    expect((expenseFindManyMock.mock.calls[0]![0] as any).where.status).toBe("APPROVED");
  });

  it("does not flag a project below the threshold", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 79 days × 1M = 79M = 79% < 80%
    timesheetFindManyMock.mockResolvedValue([laborDays(79)]);
    const created = await checkProjectOverrun();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("flags exactly at the threshold and notifies PM + all MANAGEMENT", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 80 days × 1M = 80M = exactly 80%
    timesheetFindManyMock.mockResolvedValue([laborDays(80)]);
    const created = await checkProjectOverrun();
    expect(created).toBe(3);
    const calls = notifyUserMock.mock.calls.map((c) => c[0] as any);
    expect(new Set(calls.map((c) => c.userId))).toEqual(new Set(["pm-1", "mgmt-1", "mgmt-2"]));
    for (const c of calls) {
      expect(c.type).toBe("PROJECT_OVERRUN");
      expect(c.link).toBe("/projects/proj-1");
      expect(c.title).toBe("Budget nearing limit: Big Build");
      expect(c.message).toContain("80% of the contract value");
    }
  });

  it("sums labor (hours/8 × dailyRate) and approved expenses into actual cost", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 40 days labor = 40M, expenses 45M => 85M = 85% >= 80%
    timesheetFindManyMock.mockResolvedValue([laborDays(40)]);
    expenseFindManyMock.mockResolvedValue([
      { projectId: "proj-1", amount: 30_000_000 },
      { projectId: "proj-1", amount: 15_000_000 },
    ]);
    const created = await checkProjectOverrun();
    expect(created).toBe(3);
    expect((notifyUserMock.mock.calls[0]![0] as any).message).toContain("85% of the contract value");
  });

  it("ignores timesheets from users without a resource row (rate 0)", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // user-b has no resource row: 500 days would blow the budget if counted.
    timesheetFindManyMock.mockResolvedValue([laborDays(500, "user-b")]);
    const created = await checkProjectOverrun();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it('uses the "Budget exceeded" title at >= 100%', async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    timesheetFindManyMock.mockResolvedValue([laborDays(110)]);
    await checkProjectOverrun();
    expect((notifyUserMock.mock.calls[0]![0] as any).title).toBe("Budget exceeded: Big Build");
  });

  it("does not double-notify a PM who is also in MANAGEMENT", async () => {
    projectFindManyMock.mockResolvedValue([project({ pmId: "mgmt-1" })]);
    timesheetFindManyMock.mockResolvedValue([laborDays(90)]);
    const created = await checkProjectOverrun();
    expect(created).toBe(2);
    expect(new Set(notifyUserMock.mock.calls.map((c) => (c[0] as any).userId))).toEqual(
      new Set(["mgmt-1", "mgmt-2"]),
    );
  });

  it("still notifies MANAGEMENT when the project has no PM", async () => {
    projectFindManyMock.mockResolvedValue([project({ pmId: null })]);
    timesheetFindManyMock.mockResolvedValue([laborDays(90)]);
    const created = await checkProjectOverrun();
    expect(created).toBe(2);
  });

  it("dedups: no repeat notification when one was already sent today", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    timesheetFindManyMock.mockResolvedValue([laborDays(90)]);
    dedupHit = true;
    const created = await checkProjectOverrun();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("names the top 2 labor contributors and the expense share in the cost-driver sentence", async () => {
    projectFindManyMock.mockResolvedValue([
      project({
        resources: [
          { id: "r1", userId: "user-a", dailyRate: 1_000_000 },
          { id: "r2", userId: "user-b", dailyRate: 1_000_000 },
          { id: "r3", userId: "pm-1", dailyRate: 1_000_000 },
        ],
      }),
    ]);
    // Alice 50M > Bob 20M > Pam 5M; expenses 10M. Total 85M = 85%.
    timesheetFindManyMock.mockResolvedValue([
      laborDays(50, "user-a"),
      laborDays(20, "user-b"),
      laborDays(5, "pm-1"),
    ]);
    expenseFindManyMock.mockResolvedValue([{ projectId: "proj-1", amount: 10_000_000 }]);
    await checkProjectOverrun();
    const msg = (notifyUserMock.mock.calls[0]![0] as any).message as string;
    expect(msg).toContain("Main cost drivers:");
    expect(msg).toContain("Alice Rp 50 M labor");
    expect(msg).toContain("Bob Rp 20 M labor");
    expect(msg).not.toContain("Pam"); // only top 2 contributors
    expect(msg).toContain("expenses Rp 10 M");
  });
});

describe("checkLowMargin", () => {
  it("only queries live ACTIVE/OBSERVATION/PAUSE projects with contractValue > 0", async () => {
    await checkLowMargin();
    const where = (projectFindManyMock.mock.calls[0]![0] as any).where;
    expect(where).toMatchObject({
      deletedAt: null,
      archivedAt: null,
      status: { in: ["ACTIVE", "OBSERVATION", "PAUSE"] },
      contractValue: { gt: 0 },
    });
  });

  it("skips zero-cost projects even though their margin is 100%-safe math", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    const created = await checkLowMargin();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not flag a margin at or above the threshold", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 80M cost → margin exactly 20% (not < 20%)
    timesheetFindManyMock.mockResolvedValue([laborDays(80)]);
    const created = await checkLowMargin();
    expect(created).toBe(0);
  });

  it("flags a margin below the threshold and notifies PM + all MANAGEMENT", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 85M cost → margin 15% < 20%
    timesheetFindManyMock.mockResolvedValue([laborDays(85)]);
    const created = await checkLowMargin();
    expect(created).toBe(3);
    const calls = notifyUserMock.mock.calls.map((c) => c[0] as any);
    expect(new Set(calls.map((c) => c.userId))).toEqual(new Set(["pm-1", "mgmt-1", "mgmt-2"]));
    for (const c of calls) {
      expect(c.type).toBe("LOW_MARGIN");
      expect(c.link).toBe("/projects/proj-1");
      expect(c.title).toBe("Thin margin: Big Build");
      expect(c.message).toContain("Current margin is 15.0%");
    }
  });

  it('uses the "Negative margin" title when cost exceeds contract value', async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 110M cost → margin -10%
    timesheetFindManyMock.mockResolvedValue([laborDays(110)]);
    await checkLowMargin();
    const c = notifyUserMock.mock.calls[0]![0] as any;
    expect(c.title).toBe("Negative margin: Big Build");
    expect(c.message).toContain("-10.0%");
  });

  it("counts expenses toward the margin", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    // 10M labor + 80M expenses = 90M → margin 10% < 20%
    timesheetFindManyMock.mockResolvedValue([laborDays(10)]);
    expenseFindManyMock.mockResolvedValue([{ projectId: "proj-1", amount: 80_000_000 }]);
    const created = await checkLowMargin();
    expect(created).toBe(3);
    expect((notifyUserMock.mock.calls[0]![0] as any).message).toContain("10.0%");
  });

  it("dedups: no repeat notification when one was already sent today", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    timesheetFindManyMock.mockResolvedValue([laborDays(90)]);
    dedupHit = true;
    const created = await checkLowMargin();
    expect(created).toBe(0);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("includes the cost-driver sentence naming labor and expenses", async () => {
    projectFindManyMock.mockResolvedValue([project()]);
    timesheetFindManyMock.mockResolvedValue([laborDays(70, "user-a")]);
    expenseFindManyMock.mockResolvedValue([{ projectId: "proj-1", amount: 20_000_000 }]);
    await checkLowMargin();
    const msg = (notifyUserMock.mock.calls[0]![0] as any).message as string;
    expect(msg).toContain("Main cost drivers: Alice Rp 70 M labor, expenses Rp 20 M.");
  });
});
