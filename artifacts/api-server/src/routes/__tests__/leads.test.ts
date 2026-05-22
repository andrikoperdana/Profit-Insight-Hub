import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Auth middleware: read user from x-user-id/x-user-role headers.
vi.mock("../../middlewares/auth.js", () => {
  return {
    requireAuth: (req: any, _res: any, next: any) => {
      const id = req.headers["x-user-id"];
      const role = req.headers["x-user-role"];
      if (id && role) req.user = { sub: String(id), role: String(role) };
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
  };
});

// Prisma stub backed by in-memory arrays.
type LeadRow = {
  id: string;
  ownerId: string;
  title: string;
  stage: string;
  estimatedValue: number;
  probability: number;
  expectedCloseDate: Date | null;
  lostReason: string | null;
  lostAt: Date | null;
  wonAt: Date | null;
  convertedProjectId: string | null;
  deletedAt: Date | null;
  notes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  clientId: string | null;
  prospectiveClientName: string | null;
  industry: string | null;
  source: string | null;
  competitorWon: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type ActivityRow = {
  id: string;
  leadId: string;
  type: string;
  occurredAt: Date;
  outcome: string | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  createdById: string;
  createdAt: Date;
};

const db: {
  leads: LeadRow[];
  activities: ActivityRow[];
  nextId: number;
} = { leads: [], activities: [], nextId: 1 };

function mkId(prefix: string): string {
  return `${prefix}_${db.nextId++}`;
}

function applyInclude(lead: LeadRow, include: any): any {
  const out: any = { ...lead };
  if (include?.client) out.client = lead.clientId ? { name: `Client-${lead.clientId}` } : null;
  if (include?.owner) out.owner = { name: `Owner-${lead.ownerId}` };
  if (include?.activities) {
    let acts = db.activities.filter((a) => a.leadId === lead.id);
    if (include.activities.orderBy?.occurredAt === "desc") {
      acts = acts.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    }
    if (typeof include.activities.take === "number") acts = acts.slice(0, include.activities.take);
    out.activities = acts;
  }
  return out;
}

vi.mock("@workspace/db", () => {
  const prisma = {
    lead: {
      findMany: vi.fn(async (args: any = {}) => {
        const where = args.where || {};
        let rows = db.leads.filter((l) => {
          if (where.deletedAt === null && l.deletedAt) return false;
          if (where.ownerId && l.ownerId !== where.ownerId) return false;
          if (where.stage?.notIn && where.stage.notIn.includes(l.stage)) return false;
          if (where.stage && typeof where.stage === "string" && l.stage !== where.stage) return false;
          if (where.createdAt) {
            if (where.createdAt.gte && l.createdAt < where.createdAt.gte) return false;
            if (where.createdAt.lte && l.createdAt > where.createdAt.lte) return false;
          }
          if (where.lostAt?.gte && (!l.lostAt || l.lostAt < where.lostAt.gte)) return false;
          return true;
        });
        if (args.orderBy) {
          // best-effort: not critical for correctness in tests
        }
        return rows.map((l) => applyInclude(l, args.include));
      }),
      findUnique: vi.fn(async (args: any) => {
        const l = db.leads.find((r) => r.id === args.where.id);
        if (!l) return null;
        return applyInclude(l, args.include);
      }),
      create: vi.fn(async (args: any) => {
        const now = new Date();
        const row: LeadRow = {
          id: mkId("lead"),
          ownerId: args.data.ownerId,
          title: args.data.title,
          stage: args.data.stage || "NEW",
          estimatedValue: args.data.estimatedValue ?? 0,
          probability: args.data.probability ?? 20,
          expectedCloseDate: args.data.expectedCloseDate ?? null,
          lostReason: args.data.lostReason ?? null,
          lostAt: null,
          wonAt: null,
          convertedProjectId: null,
          deletedAt: null,
          notes: args.data.notes ?? null,
          contactName: args.data.contactName ?? null,
          contactEmail: args.data.contactEmail ?? null,
          contactPhone: args.data.contactPhone ?? null,
          clientId: args.data.clientId ?? null,
          prospectiveClientName: args.data.prospectiveClientName ?? null,
          industry: args.data.industry ?? null,
          source: args.data.source ?? null,
          competitorWon: null,
          createdAt: now,
          updatedAt: now,
        };
        db.leads.push(row);
        return applyInclude(row, args.include);
      }),
      update: vi.fn(async (args: any) => {
        const idx = db.leads.findIndex((r) => r.id === args.where.id);
        if (idx === -1) throw new Error("not found");
        db.leads[idx] = { ...db.leads[idx], ...args.data, updatedAt: new Date() };
        return applyInclude(db.leads[idx], args.include);
      }),
    },
    leadActivity: {
      findMany: vi.fn(async (args: any) => {
        let rows = db.activities.filter((a) => a.leadId === args.where.leadId);
        if (args.orderBy?.occurredAt === "desc") {
          rows = rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
        }
        return rows.map((a) => ({ ...a, createdBy: { name: `User-${a.createdById}` } }));
      }),
      findUnique: vi.fn(async (args: any) => {
        return db.activities.find((a) => a.id === args.where.id) ?? null;
      }),
      create: vi.fn(async (args: any) => {
        const row: ActivityRow = {
          id: mkId("act"),
          leadId: args.data.leadId,
          type: args.data.type,
          occurredAt: args.data.occurredAt ?? new Date(),
          outcome: args.data.outcome ?? null,
          nextActionAt: args.data.nextActionAt ?? null,
          nextActionNote: args.data.nextActionNote ?? null,
          createdById: args.data.createdById,
          createdAt: new Date(),
        };
        db.activities.push(row);
        return { ...row, createdBy: { name: `User-${row.createdById}` } };
      }),
      update: vi.fn(async (args: any) => {
        const idx = db.activities.findIndex((a) => a.id === args.where.id);
        if (idx === -1) throw new Error("not found");
        db.activities[idx] = { ...db.activities[idx], ...args.data };
        return { ...db.activities[idx], createdBy: { name: `User-${db.activities[idx].createdById}` } };
      }),
      delete: vi.fn(async (args: any) => {
        const idx = db.activities.findIndex((a) => a.id === args.where.id);
        if (idx === -1) throw new Error("not found");
        const [removed] = db.activities.splice(idx, 1);
        return removed;
      }),
    },
    notification: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    client: { create: vi.fn() },
    project: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma };
});

vi.mock("../../lib/leadNotifications.js", () => ({
  notifyOnceDailyForLead: vi.fn(async () => false),
}));

// Import after mocks are registered.
const { default: leadsRouter } = await import("../leads.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", leadsRouter);
  return app;
}

function reset() {
  db.leads = [];
  db.activities = [];
  db.nextId = 1;
}

function seedLead(overrides: Partial<LeadRow> = {}): LeadRow {
  const now = new Date();
  const l: LeadRow = {
    id: mkId("lead"),
    ownerId: "sales-1",
    title: "T",
    stage: "NEW",
    estimatedValue: 0,
    probability: 20,
    expectedCloseDate: null,
    lostReason: null,
    lostAt: null,
    wonAt: null,
    convertedProjectId: null,
    deletedAt: null,
    notes: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    clientId: null,
    prospectiveClientName: null,
    industry: null,
    source: null,
    competitorWon: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  db.leads.push(l);
  return l;
}

const SALES = { "x-user-id": "sales-1", "x-user-role": "SALES" } as Record<string, string>;
const SALES2 = { "x-user-id": "sales-2", "x-user-role": "SALES" } as Record<string, string>;
const MGMT = { "x-user-id": "mgmt-1", "x-user-role": "MANAGEMENT" } as Record<string, string>;
const PM = { "x-user-id": "pm-1", "x-user-role": "PROJECT_MANAGER" } as Record<string, string>;

beforeEach(() => {
  reset();
});

// ─── Analytics ──────────────────────────────────────────────────────────────

describe("GET /api/leads/analytics", () => {
  it("computes weighted pipeline value per stage (excludes WON/LOST)", async () => {
    seedLead({ stage: "NEW", estimatedValue: 1000, probability: 20 });
    seedLead({ stage: "NEW", estimatedValue: 500, probability: 40 });
    seedLead({ stage: "PROPOSAL", estimatedValue: 2000, probability: 50 });
    seedLead({ stage: "WON", estimatedValue: 9999, probability: 100 });
    seedLead({ stage: "LOST", estimatedValue: 7777, probability: 0 });

    const res = await request(makeApp()).get("/api/leads/analytics").set(MGMT);
    expect(res.status).toBe(200);
    const w = res.body.weightedPipelineByStage;
    // NEW: 1000*0.2 + 500*0.4 = 200 + 200 = 400; count 2; value 1500
    expect(w.NEW).toEqual({ count: 2, value: 1500, weighted: 400 });
    // PROPOSAL: 2000*0.5 = 1000
    expect(w.PROPOSAL).toEqual({ count: 1, value: 2000, weighted: 1000 });
    // WON/LOST excluded from pipeline
    expect(w.WON).toEqual({ count: 0, value: 0, weighted: 0 });
    expect(w.LOST).toEqual({ count: 0, value: 0, weighted: 0 });
  });

  it("expectedRevenueThisQuarter only sums leads with expectedCloseDate in current quarter", async () => {
    const now = new Date();
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
    const inQ = new Date(qStart.getTime() + 1000); // inside
    const beforeQ = new Date(qStart.getTime() - 86400000); // before
    const afterQ = new Date(qEnd.getTime() + 86400000); // after

    seedLead({ stage: "PROPOSAL", estimatedValue: 1000, probability: 50, expectedCloseDate: inQ }); // contributes 500
    seedLead({ stage: "NEGOTIATION", estimatedValue: 2000, probability: 25, expectedCloseDate: inQ }); // contributes 500
    seedLead({ stage: "NEW", estimatedValue: 9999, probability: 100, expectedCloseDate: beforeQ }); // excluded
    seedLead({ stage: "NEW", estimatedValue: 9999, probability: 100, expectedCloseDate: afterQ }); // excluded
    seedLead({ stage: "NEW", estimatedValue: 9999, probability: 100, expectedCloseDate: null }); // excluded
    seedLead({ stage: "WON", estimatedValue: 9999, probability: 100, expectedCloseDate: inQ }); // excluded (closed)

    const res = await request(makeApp()).get("/api/leads/analytics").set(MGMT);
    expect(res.status).toBe(200);
    expect(res.body.expectedRevenueThisQuarter).toBeCloseTo(1000, 6);
  });

  it("computes conversion rates using cumulative reached-stage counts", async () => {
    // Window: default 180 days back to now → use createdAt = now.
    // NEW=2, QUALIFIED=1, PROPOSAL=1, NEGOTIATION=0, WON=1.
    // Reached counts:
    //   NEW: 2+1+1+1 = 5
    //   QUALIFIED: 1+1+1 = 3
    //   PROPOSAL: 1+1 = 2
    //   NEGOTIATION: 0+1 = 1
    //   WON: 1
    seedLead({ stage: "NEW" });
    seedLead({ stage: "NEW" });
    seedLead({ stage: "QUALIFIED" });
    seedLead({ stage: "PROPOSAL" });
    seedLead({ stage: "WON" });
    seedLead({ stage: "LOST" }); // ignored in conversion math

    const res = await request(makeApp()).get("/api/leads/analytics").set(MGMT);
    expect(res.status).toBe(200);
    const cr: any[] = res.body.conversionRates;
    const byPair = Object.fromEntries(cr.map((r) => [`${r.from}->${r.to}`, r]));
    expect(byPair["NEW->QUALIFIED"]).toMatchObject({ fromCount: 5, toCount: 3 });
    expect(byPair["NEW->QUALIFIED"].rate).toBeCloseTo(60, 6);
    expect(byPair["QUALIFIED->PROPOSAL"]).toMatchObject({ fromCount: 3, toCount: 2 });
    expect(byPair["PROPOSAL->NEGOTIATION"]).toMatchObject({ fromCount: 2, toCount: 1 });
    expect(byPair["NEGOTIATION->WON"]).toMatchObject({ fromCount: 1, toCount: 1, rate: 100 });
  });

  it("returns 0 rate when the prior stage has no leads (no divide by zero)", async () => {
    seedLead({ stage: "NEW" });
    const res = await request(makeApp()).get("/api/leads/analytics").set(MGMT);
    expect(res.status).toBe(200);
    const cr: any[] = res.body.conversionRates;
    // QUALIFIED->PROPOSAL: fromCount = 0 ⇒ rate 0
    const q2p = cr.find((r) => r.from === "QUALIFIED" && r.to === "PROPOSAL");
    expect(q2p).toMatchObject({ fromCount: 0, toCount: 0, rate: 0 });
  });

  it("SALES sees only own leads in analytics", async () => {
    seedLead({ ownerId: "sales-1", stage: "NEW", estimatedValue: 1000, probability: 50 });
    seedLead({ ownerId: "sales-2", stage: "NEW", estimatedValue: 4000, probability: 50 });
    const res = await request(makeApp()).get("/api/leads/analytics").set(SALES);
    expect(res.status).toBe(200);
    expect(res.body.weightedPipelineByStage.NEW.count).toBe(1);
    expect(res.body.weightedPipelineByStage.NEW.value).toBe(1000);
    expect(res.body.weightedPipelineByStage.NEW.weighted).toBeCloseTo(500, 6);
  });

  it("forbids non-SALES/MGMT roles from analytics", async () => {
    const res = await request(makeApp()).get("/api/leads/analytics").set(PM);
    expect(res.status).toBe(403);
  });
});

// ─── Lost reason enforcement ────────────────────────────────────────────────

describe("PATCH /api/leads/:id stage=LOST", () => {
  it("requires lostReason when transitioning to LOST", async () => {
    const lead = seedLead({ ownerId: "sales-1", stage: "PROPOSAL" });
    const res = await request(makeApp())
      .patch(`/api/leads/${lead.id}`)
      .set(SALES)
      .send({ stage: "LOST" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lostReason/);
  });

  it("rejects blank/whitespace lostReason", async () => {
    const lead = seedLead({ ownerId: "sales-1", stage: "PROPOSAL" });
    const res = await request(makeApp())
      .patch(`/api/leads/${lead.id}`)
      .set(SALES)
      .send({ stage: "LOST", lostReason: "   " });
    expect(res.status).toBe(400);
  });

  it("accepts LOST with a valid lostReason and stamps lostAt", async () => {
    const lead = seedLead({ ownerId: "sales-1", stage: "PROPOSAL" });
    const res = await request(makeApp())
      .patch(`/api/leads/${lead.id}`)
      .set(SALES)
      .send({ stage: "LOST", lostReason: "PRICE" });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("LOST");
    expect(res.body.lostReason).toBe("PRICE");
    expect(res.body.lostAt).toBeTruthy();
  });

  it("does not require lostReason when stage stays LOST (no transition)", async () => {
    const lead = seedLead({ ownerId: "sales-1", stage: "LOST", lostReason: "PRICE" });
    const res = await request(makeApp())
      .patch(`/api/leads/${lead.id}`)
      .set(SALES)
      .send({ notes: "updated" });
    expect(res.status).toBe(200);
  });
});

// ─── MGMT read-only scope ───────────────────────────────────────────────────

describe("MGMT cannot mutate leads", () => {
  it("403 on POST /api/leads", async () => {
    const res = await request(makeApp())
      .post("/api/leads")
      .set(MGMT)
      .send({ title: "X" });
    expect(res.status).toBe(403);
  });

  it("403 on PATCH /api/leads/:id", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const res = await request(makeApp())
      .patch(`/api/leads/${lead.id}`)
      .set(MGMT)
      .send({ title: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("403 on DELETE /api/leads/:id", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const res = await request(makeApp()).delete(`/api/leads/${lead.id}`).set(MGMT);
    expect(res.status).toBe(403);
  });

  it("200 on GET /api/leads (read-only access works)", async () => {
    seedLead({ ownerId: "sales-1" });
    seedLead({ ownerId: "sales-2" });
    const res = await request(makeApp()).get("/api/leads").set(MGMT);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("forbids unsupported roles entirely (PM gets 403 on listing)", async () => {
    const res = await request(makeApp()).get("/api/leads").set(PM);
    expect(res.status).toBe(403);
  });
});

// ─── Activity CRUD authz ────────────────────────────────────────────────────

describe("Lead activities authorization", () => {
  it("SALES owner can create an activity", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const res = await request(makeApp())
      .post(`/api/leads/${lead.id}/activities`)
      .set(SALES)
      .send({ type: "CALL", outcome: "ok" });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("CALL");
  });

  it("SALES non-owner cannot create on someone else's lead", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const res = await request(makeApp())
      .post(`/api/leads/${lead.id}/activities`)
      .set(SALES2)
      .send({ type: "CALL" });
    expect(res.status).toBe(403);
  });

  it("MGMT cannot create activities (read-only on lead pipeline)", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const res = await request(makeApp())
      .post(`/api/leads/${lead.id}/activities`)
      .set(MGMT)
      .send({ type: "CALL" });
    expect(res.status).toBe(403);
  });

  it("MGMT can list activities", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    db.activities.push({
      id: mkId("act"),
      leadId: lead.id,
      type: "CALL",
      occurredAt: new Date(),
      outcome: null,
      nextActionAt: null,
      nextActionNote: null,
      createdById: "sales-1",
      createdAt: new Date(),
    });
    const res = await request(makeApp()).get(`/api/leads/${lead.id}/activities`).set(MGMT);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("rejects invalid activity type", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const res = await request(makeApp())
      .post(`/api/leads/${lead.id}/activities`)
      .set(SALES)
      .send({ type: "TELEPATHY" });
    expect(res.status).toBe(400);
  });

  it("SALES owner can delete own activity", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const act = {
      id: mkId("act"),
      leadId: lead.id,
      type: "NOTE",
      occurredAt: new Date(),
      outcome: null,
      nextActionAt: null,
      nextActionNote: null,
      createdById: "sales-1",
      createdAt: new Date(),
    };
    db.activities.push(act);
    const res = await request(makeApp())
      .delete(`/api/leads/${lead.id}/activities/${act.id}`)
      .set(SALES);
    expect(res.status).toBe(200);
    expect(db.activities.find((a) => a.id === act.id)).toBeUndefined();
  });

  it("SALES non-owner cannot delete another sales rep's activity", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const act = {
      id: mkId("act"),
      leadId: lead.id,
      type: "NOTE",
      occurredAt: new Date(),
      outcome: null,
      nextActionAt: null,
      nextActionNote: null,
      createdById: "sales-1",
      createdAt: new Date(),
    };
    db.activities.push(act);
    const res = await request(makeApp())
      .delete(`/api/leads/${lead.id}/activities/${act.id}`)
      .set(SALES2);
    expect(res.status).toBe(403);
    expect(db.activities.find((a) => a.id === act.id)).toBeDefined();
  });

  it("MGMT cannot delete an activity", async () => {
    const lead = seedLead({ ownerId: "sales-1" });
    const act = {
      id: mkId("act"),
      leadId: lead.id,
      type: "NOTE",
      occurredAt: new Date(),
      outcome: null,
      nextActionAt: null,
      nextActionNote: null,
      createdById: "sales-1",
      createdAt: new Date(),
    };
    db.activities.push(act);
    const res = await request(makeApp())
      .delete(`/api/leads/${lead.id}/activities/${act.id}`)
      .set(MGMT);
    expect(res.status).toBe(403);
    expect(db.activities.find((a) => a.id === act.id)).toBeDefined();
  });

  it("returns 404 when activity does not belong to lead", async () => {
    const lead1 = seedLead({ ownerId: "sales-1" });
    const lead2 = seedLead({ ownerId: "sales-1" });
    const act = {
      id: mkId("act"),
      leadId: lead2.id,
      type: "NOTE",
      occurredAt: new Date(),
      outcome: null,
      nextActionAt: null,
      nextActionNote: null,
      createdById: "sales-1",
      createdAt: new Date(),
    };
    db.activities.push(act);
    const res = await request(makeApp())
      .delete(`/api/leads/${lead1.id}/activities/${act.id}`)
      .set(SALES);
    expect(res.status).toBe(404);
  });
});
