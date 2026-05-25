import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Prisma ────────────────────────────────────────────────────────────
// projectAccess.userCanAccessProject calls `prisma.project.findFirst({ where })`.
// We capture the `where` arg and return a row only when the where matches a
// fixed scenario, so we can assert that each role builds the right filter.

const findFirstMock = vi.fn();

vi.mock("@workspace/db", () => ({
  prisma: {
    project: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
  },
}));

// Import after mock.
const { userCanAccessProject, userCanWriteProject } = await import("../projectAccess.js");
const { canViewDailyRate } = await import("../serializers.js");

// Separate mock for the write helper — it uses findUnique, not findFirst.
const findUniqueMock = vi.fn();
// Patch the prisma proxy to add project.findUnique. Vi.mock above only created
// findFirst; extend it now by reaching into the mocked module.
const dbModule = await import("@workspace/db");
(dbModule.prisma as any).project.findUnique = (...args: unknown[]) => findUniqueMock(...args);

beforeEach(() => {
  findFirstMock.mockReset();
  findUniqueMock.mockReset();
});

// ─── canViewDailyRate ───────────────────────────────────────────────────────

describe("canViewDailyRate", () => {
  it("allows MANAGEMENT and PROJECT_MANAGER only", () => {
    expect(canViewDailyRate("MANAGEMENT")).toBe(true);
    expect(canViewDailyRate("PROJECT_MANAGER")).toBe(true);
  });
  it("denies FINANCE, HR, SALES, ADMIN_PROJECT, SITE_ADMIN, Principals, delivery roles, and unknown", () => {
    for (const r of [
      "FINANCE",
      "HR",
      "SALES",
      "ADMIN_PROJECT",
      "SITE_ADMIN",
      "PRINCIPAL_KONSULTAN",
      "PRINCIPAL_TECHNICAL_WRITER",
      "PRINCIPAL_ADMIN_PROJECT",
      "KONSULTAN",
      "TECHNICAL_WRITER",
      "WHO_KNOWS",
      "",
    ]) {
      expect(canViewDailyRate(r)).toBe(false);
    }
    expect(canViewDailyRate(null)).toBe(false);
    expect(canViewDailyRate(undefined)).toBe(false);
  });
});

// ─── userCanAccessProject: list/per-id parity ───────────────────────────────

describe("userCanAccessProject", () => {
  it("MANAGEMENT, SITE_ADMIN, FINANCE short-circuit to true without hitting Prisma", async () => {
    for (const role of ["MANAGEMENT", "SITE_ADMIN", "FINANCE"]) {
      const ok = await userCanAccessProject("p1", { sub: "u1", role });
      expect(ok).toBe(true);
    }
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("HR has no project access and skips Prisma", async () => {
    const ok = await userCanAccessProject("p1", { sub: "hr-1", role: "HR" });
    expect(ok).toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("Unknown roles are denied without hitting Prisma", async () => {
    const ok = await userCanAccessProject("p1", { sub: "x", role: "WHO_KNOWS" });
    expect(ok).toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("PROJECT_MANAGER filter is pmId only (no resource OR clause)", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "p1" });
    const ok = await userCanAccessProject("p1", { sub: "pm-1", role: "PROJECT_MANAGER" });
    expect(ok).toBe(true);
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where).toEqual({
      id: "p1",
      deletedAt: null,
      pmId: "pm-1",
    });
    expect(where.OR).toBeUndefined();
    expect(where.resources).toBeUndefined();
  });

  it("SALES filter is salesId only (no resource OR clause)", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "p1" });
    const ok = await userCanAccessProject("p1", { sub: "sales-1", role: "SALES" });
    expect(ok).toBe(true);
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where).toEqual({
      id: "p1",
      deletedAt: null,
      salesId: "sales-1",
    });
    expect(where.OR).toBeUndefined();
    expect(where.resources).toBeUndefined();
  });

  it("KONSULTAN filter requires assignment OR timesheet", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await userCanAccessProject("p1", { sub: "k-1", role: "KONSULTAN" });
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { resources: { some: { userId: "k-1" } } },
      { timesheets: { some: { userId: "k-1" } } },
    ]);
  });

  it("TECHNICAL_WRITER filter includes technicalWriterId branch", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await userCanAccessProject("p1", { sub: "tw-1", role: "TECHNICAL_WRITER" });
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { resources: { some: { userId: "tw-1" } } },
      { timesheets: { some: { userId: "tw-1" } } },
      { technicalWriterId: "tw-1" },
    ]);
  });

  it("ADMIN_PROJECT filter is adminProjectId OR resources", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await userCanAccessProject("p1", { sub: "ap-1", role: "ADMIN_PROJECT" });
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { adminProjectId: "ap-1" },
      { resources: { some: { userId: "ap-1" } } },
    ]);
  });

  it("PRINCIPAL_KONSULTAN scoped to ACTIVE w/ involvement OR all OBSERVATION", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await userCanAccessProject("p1", { sub: "pk-1", role: "PRINCIPAL_KONSULTAN" });
    const where = findFirstMock.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.OR).toEqual([
      {
        status: "ACTIVE",
        OR: [
          { resources: { some: { userId: "pk-1" } } },
          { resources: { some: { user: { principalId: "pk-1" } } } },
        ],
      },
      { status: "OBSERVATION" },
    ]);
  });

  it("PRINCIPAL_TECHNICAL_WRITER scoped to OBSERVATION + ACTIVE (no involvement filter)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await userCanAccessProject("p1", { sub: "pp-1", role: "PRINCIPAL_TECHNICAL_WRITER" });
    const where = findFirstMock.mock.calls.at(-1)![0].where;
    expect(where.status).toEqual({ in: ["OBSERVATION", "ACTIVE"] });
    expect(where.OR).toBeUndefined();
  });

  it("PRINCIPAL_ADMIN_PROJECT scoped to OBSERVATION + ACTIVE + COMPLETE (no involvement filter)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await userCanAccessProject("p1", { sub: "pp-1", role: "PRINCIPAL_ADMIN_PROJECT" });
    const where = findFirstMock.mock.calls.at(-1)![0].where;
    expect(where.status).toEqual({ in: ["OBSERVATION", "ACTIVE", "COMPLETE"] });
    expect(where.OR).toBeUndefined();
  });

  it("returns false when Prisma yields no row (project not in scope)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const ok = await userCanAccessProject("p1", { sub: "pm-x", role: "PROJECT_MANAGER" });
    expect(ok).toBe(false);
  });
});

// ─── userCanWriteProject (FINANCE no longer short-circuits) ─────────────────

describe("userCanWriteProject", () => {
  it("MANAGEMENT short-circuits to true without hitting Prisma", async () => {
    const ok = await userCanWriteProject("p1", { sub: "u1", role: "MANAGEMENT" });
    expect(ok).toBe(true);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("FINANCE is NOT a project owner — must fall through and be denied", async () => {
    // After cleanup, FINANCE no longer has blanket write power on every project.
    // Their narrow INVOICE/CONTRACT right is enforced explicitly in documents.ts.
    findUniqueMock.mockResolvedValueOnce({
      pmId: "pm-1",
      adminProjectId: "ap-1",
      deletedAt: null,
    });
    const ok = await userCanWriteProject("p1", { sub: "finance-1", role: "FINANCE" });
    expect(ok).toBe(false);
  });

  it("PROJECT_MANAGER allowed only when they lead the project", async () => {
    findUniqueMock.mockResolvedValueOnce({ pmId: "pm-1", adminProjectId: null, deletedAt: null });
    expect(await userCanWriteProject("p1", { sub: "pm-1", role: "PROJECT_MANAGER" })).toBe(true);
    findUniqueMock.mockResolvedValueOnce({ pmId: "pm-other", adminProjectId: null, deletedAt: null });
    expect(await userCanWriteProject("p1", { sub: "pm-1", role: "PROJECT_MANAGER" })).toBe(false);
  });

  it("ADMIN_PROJECT allowed only when they are the project's Admin Project", async () => {
    findUniqueMock.mockResolvedValueOnce({ pmId: null, adminProjectId: "ap-1", deletedAt: null });
    expect(await userCanWriteProject("p1", { sub: "ap-1", role: "ADMIN_PROJECT" })).toBe(true);
    findUniqueMock.mockResolvedValueOnce({ pmId: null, adminProjectId: "ap-other", deletedAt: null });
    expect(await userCanWriteProject("p1", { sub: "ap-1", role: "ADMIN_PROJECT" })).toBe(false);
  });

  it("soft-deleted projects deny all roles except MGMT short-circuit", async () => {
    findUniqueMock.mockResolvedValueOnce({ pmId: "pm-1", adminProjectId: null, deletedAt: new Date() });
    expect(await userCanWriteProject("p1", { sub: "pm-1", role: "PROJECT_MANAGER" })).toBe(false);
  });

  it("missing project denies all non-MGMT roles", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    expect(await userCanWriteProject("p1", { sub: "pm-1", role: "PROJECT_MANAGER" })).toBe(false);
  });

  it("SALES, KONSULTAN, TECHNICAL_WRITER, HR, SITE_ADMIN, Principals all denied", async () => {
    for (const role of [
      "SALES",
      "KONSULTAN",
      "TECHNICAL_WRITER",
      "HR",
      "SITE_ADMIN",
      "PRINCIPAL_KONSULTAN",
      "PRINCIPAL_TECHNICAL_WRITER",
      "PRINCIPAL_ADMIN_PROJECT",
    ]) {
      findUniqueMock.mockResolvedValueOnce({ pmId: "pm-x", adminProjectId: "ap-x", deletedAt: null });
      expect(await userCanWriteProject("p1", { sub: "u1", role }), `role=${role}`).toBe(false);
    }
  });
});
