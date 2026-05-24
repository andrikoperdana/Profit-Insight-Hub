import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { parsePagination } from "../../lib/pagination.js";

describe("parsePagination", () => {
  it("returns defaults when no params provided", () => {
    expect(parsePagination({}, { defaultLimit: 100, maxLimit: 500 })).toEqual({
      limit: 100,
      offset: 0,
      requested: false,
    });
  });

  it("clamps limit to maxLimit", () => {
    expect(parsePagination({ limit: "9999" }, { defaultLimit: 100, maxLimit: 500 })).toEqual({
      limit: 500,
      offset: 0,
      requested: true,
    });
  });

  it("rejects negative/zero/NaN limit, falls back to default", () => {
    expect(parsePagination({ limit: "-5" }, { defaultLimit: 50, maxLimit: 500 }).limit).toBe(50);
    expect(parsePagination({ limit: "0" }, { defaultLimit: 50, maxLimit: 500 }).limit).toBe(50);
    expect(parsePagination({ limit: "abc" }, { defaultLimit: 50, maxLimit: 500 }).limit).toBe(50);
  });

  it("rejects negative/NaN offset, clamps to 0", () => {
    expect(parsePagination({ offset: "-3" }, { defaultLimit: 50, maxLimit: 500 }).offset).toBe(0);
    expect(parsePagination({ offset: "xyz" }, { defaultLimit: 50, maxLimit: 500 }).offset).toBe(0);
  });

  it("floors fractional values", () => {
    const r = parsePagination({ limit: "25.7", offset: "10.9" }, { defaultLimit: 100, maxLimit: 500 });
    expect(r.limit).toBe(25);
    expect(r.offset).toBe(10);
    expect(r.requested).toBe(true);
  });

  it("marks requested=true even with only offset", () => {
    expect(parsePagination({ offset: "5" }, { defaultLimit: 100, maxLimit: 500 }).requested).toBe(true);
  });
});

vi.mock("../../middlewares/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: "u-1", role: req.headers["x-user-role"] ?? "MANAGEMENT" };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const userFindManyMock = vi.fn((_a: unknown) => Promise.resolve<unknown[]>([]));
const userCountMock = vi.fn((_a: unknown) => Promise.resolve<number>(0));

vi.mock("@workspace/db", () => ({
  prisma: {
    user: {
      findMany: (a: unknown) => userFindManyMock(a),
      count: (a: unknown) => userCountMock(a),
    },
  },
}));

vi.mock("../../lib/serializers.js", () => ({
  serializeUser: (u: unknown) => u,
}));
vi.mock("../../lib/audit.js", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("../../lib/auth.js", () => ({ hashPassword: vi.fn(async () => "x") }));

const { default: usersRouter } = await import("../users.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", usersRouter);
  return app;
}

describe("GET /api/users pagination", () => {
  beforeEach(() => {
    userFindManyMock.mockReset();
    userCountMock.mockReset();
    userFindManyMock.mockResolvedValue([{ id: "a" }]);
    userCountMock.mockResolvedValue(42);
  });

  it("no pagination params → no X-Total-Count, no count() call, uses default take=500 skip=0", async () => {
    const res = await request(makeApp()).get("/api/users").set("x-user-role", "MANAGEMENT");
    expect(res.status).toBe(200);
    expect(res.headers["x-total-count"]).toBeUndefined();
    expect(userCountMock).not.toHaveBeenCalled();
    const arg = userFindManyMock.mock.calls[0]![0] as { take: number; skip: number };
    expect(arg.take).toBe(500);
    expect(arg.skip).toBe(0);
  });

  it("with ?limit=10&offset=20 → sets X-Total-Count and clamps limit/offset", async () => {
    const res = await request(makeApp())
      .get("/api/users?limit=10&offset=20")
      .set("x-user-role", "MANAGEMENT");
    expect(res.status).toBe(200);
    expect(res.headers["x-total-count"]).toBe("42");
    const arg = userFindManyMock.mock.calls[0]![0] as { take: number; skip: number };
    expect(arg.take).toBe(10);
    expect(arg.skip).toBe(20);
  });

  it("clamps ?limit=99999 to maxLimit=500", async () => {
    await request(makeApp())
      .get("/api/users?limit=99999")
      .set("x-user-role", "MANAGEMENT");
    const arg = userFindManyMock.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBe(500);
  });

  it("?q=foo → adds case-insensitive OR filter on name/email", async () => {
    await request(makeApp())
      .get("/api/users?q=foo")
      .set("x-user-role", "MANAGEMENT");
    const arg = userFindManyMock.mock.calls[0]![0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(arg.where.OR).toEqual([
      { name: { contains: "foo", mode: "insensitive" } },
      { email: { contains: "foo", mode: "insensitive" } },
    ]);
  });

  it("?q= with only whitespace is ignored (no OR filter)", async () => {
    await request(makeApp())
      .get("/api/users?q=%20%20")
      .set("x-user-role", "MANAGEMENT");
    const arg = userFindManyMock.mock.calls[0]![0] as {
      where: { OR?: unknown };
    };
    expect(arg.where.OR).toBeUndefined();
  });

  it("denies non-allowed role with 403", async () => {
    const res = await request(makeApp()).get("/api/users").set("x-user-role", "KONSULTAN");
    expect(res.status).toBe(403);
    expect(userFindManyMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/users/active-all back-compat", () => {
  beforeEach(() => {
    userFindManyMock.mockReset();
    userCountMock.mockReset();
    userFindManyMock.mockResolvedValue([]);
    userCountMock.mockResolvedValue(0);
  });

  it("no params → no skip/take (uncapped, legacy behavior)", async () => {
    await request(makeApp()).get("/api/users/active-all").set("x-user-role", "MANAGEMENT");
    const arg = userFindManyMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.skip).toBeUndefined();
    expect(arg.take).toBeUndefined();
    expect(userCountMock).not.toHaveBeenCalled();
  });

  it("with ?limit → applies skip/take and sets X-Total-Count", async () => {
    userCountMock.mockResolvedValue(7);
    const res = await request(makeApp())
      .get("/api/users/active-all?limit=5")
      .set("x-user-role", "MANAGEMENT");
    expect(res.headers["x-total-count"]).toBe("7");
    const arg = userFindManyMock.mock.calls[0]![0] as { skip: number; take: number };
    expect(arg.take).toBe(5);
    expect(arg.skip).toBe(0);
  });
});

describe("GET /api/users/under-supervision back-compat", () => {
  beforeEach(() => {
    userFindManyMock.mockReset();
    userCountMock.mockReset();
    userFindManyMock.mockResolvedValue([]);
    userCountMock.mockResolvedValue(0);
  });

  it("no params → no skip/take (uncapped, legacy behavior)", async () => {
    await request(makeApp())
      .get("/api/users/under-supervision")
      .set("x-user-role", "PRINCIPAL_KONSULTAN");
    const arg = userFindManyMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.skip).toBeUndefined();
    expect(arg.take).toBeUndefined();
    expect(userCountMock).not.toHaveBeenCalled();
  });

  it("with ?offset → applies skip/take and sets X-Total-Count", async () => {
    userCountMock.mockResolvedValue(3);
    const res = await request(makeApp())
      .get("/api/users/under-supervision?offset=1")
      .set("x-user-role", "PRINCIPAL_KONSULTAN");
    expect(res.headers["x-total-count"]).toBe("3");
    const arg = userFindManyMock.mock.calls[0]![0] as { skip: number; take: number };
    expect(arg.skip).toBe(1);
    expect(arg.take).toBe(500);
  });
});
