import { Router, type IRouter, type Request, type Response } from "express";
import { parse as parseCsvSync } from "csv-parse/sync";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { CreateLeadBody, UpdateLeadBody, ReassignLeadsBody } from "@workspace/api-zod";
import { notifyOnceDailyForLead } from "../lib/leadNotifications.js";
import { validatePdfDataUrl, sanitizeFileName } from "../lib/projectValidators.js";

// Local input shapes for serialize helpers. They mirror the Prisma `include`
// shape used at each call site rather than reaching for full Prisma payload
// types (which would require generic juggling for each variant).
type LeadForSerialize = {
  id: string;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  clientId: string | null;
  client?: { name: string } | null;
  prospectiveClientName: string | null;
  industry: string | null;
  source: string | null;
  region: string | null;
  stage: string;
  estimatedValue: number;
  probability: number;
  expectedCloseDate: Date | null;
  ownerId: string;
  owner?: { name: string } | null;
  notes: string | null;
  lostReason: string | null;
  competitorWon: string | null;
  convertedProjectId: string | null;
  wonAt: Date | null;
  lostAt: Date | null;
  pipedriveDealId: number | null;
  pipedriveUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ActivityForSerialize = {
  id: string;
  leadId: string;
  type: string;
  occurredAt: Date;
  outcome: string | null;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  createdById: string;
  createdBy?: { name: string } | null;
  createdAt: Date;
};

// Narrow `req.user` to non-null. All routes here are mounted under
// `requireAuth`, so this is always defined inside handlers.
type AuthedRequest = Request & { user: NonNullable<Request["user"]> };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const router: IRouter = Router();
router.use(requireAuth);

const STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
type Stage = (typeof STAGES)[number];
const LOST_REASONS = ["PRICE", "TIMELINE", "COMPETITOR", "NO_BUDGET", "NO_DECISION", "OTHER"] as const;
const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

function serialize(l: LeadForSerialize) {
  return {
    id: l.id,
    title: l.title,
    contactName: l.contactName,
    contactEmail: l.contactEmail,
    contactPhone: l.contactPhone,
    clientId: l.clientId,
    clientName: l.client?.name ?? null,
    prospectiveClientName: l.prospectiveClientName,
    industry: l.industry,
    source: l.source,
    region: l.region,
    stage: l.stage,
    estimatedValue: l.estimatedValue,
    probability: l.probability,
    expectedCloseDate: l.expectedCloseDate ? l.expectedCloseDate.toISOString() : null,
    ownerId: l.ownerId,
    ownerName: l.owner?.name ?? null,
    notes: l.notes,
    lostReason: l.lostReason,
    competitorWon: l.competitorWon,
    convertedProjectId: l.convertedProjectId,
    wonAt: l.wonAt ? l.wonAt.toISOString() : null,
    lostAt: l.lostAt ? l.lostAt.toISOString() : null,
    pipedriveDealId: l.pipedriveDealId,
    pipedriveUpdatedAt: l.pipedriveUpdatedAt ? l.pipedriveUpdatedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function serializeActivity(a: ActivityForSerialize) {
  return {
    id: a.id,
    leadId: a.leadId,
    type: a.type,
    occurredAt: a.occurredAt.toISOString(),
    outcome: a.outcome,
    nextActionAt: a.nextActionAt ? a.nextActionAt.toISOString() : null,
    nextActionNote: a.nextActionNote,
    createdById: a.createdById,
    createdByName: a.createdBy?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Returns Prisma `where` scope clause, or `null` if forbidden.
 * SALES: own leads only. MANAGEMENT: read-only, sees all.
 */
function scope(req: AuthedRequest): Record<string, unknown> | null {
  const role = req.user.role;
  if (role === "SALES") return { ownerId: req.user.sub };
  if (role === "MANAGEMENT" || role === "SUPER_ADMIN") return {};
  return null;
}

function canMutate(req: AuthedRequest, lead: { ownerId: string }): boolean {
  if (req.user.role === "SALES") return lead.ownerId === req.user.sub;
  return false;
}

router.get("/leads", async (req: AuthedRequest, res: Response) => {
  const s = scope(req);
  if (s === null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, ...s },
    include: {
      client: { select: { name: true } },
      owner: { select: { name: true } },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { nextActionAt: true },
      },
    },
    orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
  });
  const now = new Date();
  res.json(
    leads.map((l) => {
      const next = l.activities[0]?.nextActionAt ?? null;
      return {
        ...serialize(l),
        nextActionAt: next ? next.toISOString() : null,
        followupOverdue: next ? next.getTime() <= now.getTime() : false,
      };
    }),
  );
});

// Candidate owners for the reassign picker. Available to anyone who can
// reassign (SALES for their own leads, MGMT/SUPER_ADMIN for any). SALES cannot
// call /users/active-all, so this dedicated endpoint exposes only active Sales
// users (id/name/email) — the only valid lead owners.
router.get(
  "/leads/sales-users",
  requireRole("SALES", "MANAGEMENT"),
  async (_req: AuthedRequest, res: Response) => {
    const users = await prisma.user.findMany({
      where: { role: "SALES", isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
    res.json(users);
  },
);

// Reassign one or many leads to a new Sales owner. Single-lead reassign is just
// this with a one-element leadIds. SALES may only move leads they own; MGMT and
// SUPER_ADMIN may move any. The new owner must be an active Sales user.
router.post(
  "/leads/reassign",
  requireRole("SALES", "MANAGEMENT"),
  validateBody(ReassignLeadsBody),
  async (req: AuthedRequest, res: Response) => {
    const body = (req.body ?? {}) as { leadIds?: unknown; ownerId?: unknown };
    const leadIds = Array.isArray(body.leadIds)
      ? Array.from(new Set(body.leadIds.map((x) => String(x)).filter(Boolean)))
      : [];
    const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
    if (leadIds.length === 0) {
      res.status(400).json({ error: "Select at least one lead to reassign." });
      return;
    }
    if (!ownerId) {
      res.status(400).json({ error: "A new owner is required." });
      return;
    }
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, role: "SALES", isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!owner) {
      res.status(400).json({ error: "The new owner must be an active Sales user." });
      return;
    }
    const leadsToMove = await prisma.lead.findMany({
      where: { id: { in: leadIds }, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (leadsToMove.length === 0) {
      res.status(404).json({ error: "No matching leads found." });
      return;
    }
    if (req.user.role === "SALES") {
      const foreign = leadsToMove.some((l) => l.ownerId !== req.user.sub);
      if (foreign) {
        res.status(403).json({ error: "You can only reassign your own leads." });
        return;
      }
    }
    const result = await prisma.lead.updateMany({
      where: { id: { in: leadsToMove.map((l) => l.id) }, deletedAt: null },
      data: { ownerId },
    });
    res.json({ count: result.count });
  },
);

router.get("/leads/analytics", async (req: AuthedRequest, res: Response) => {
  const role = req.user.role;
  if (role !== "SALES" && role !== "MANAGEMENT" && role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const ownerFilter = role === "SALES" ? { ownerId: req.user.sub } : {};
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const allOpen = await prisma.lead.findMany({
    where: { deletedAt: null, ...ownerFilter, stage: { notIn: ["WON", "LOST"] } },
    select: { stage: true, estimatedValue: true, probability: true, expectedCloseDate: true },
  });
  const weightedPipelineByStage: Record<string, { count: number; value: number; weighted: number }> = {};
  for (const s of STAGES) weightedPipelineByStage[s] = { count: 0, value: 0, weighted: 0 };
  for (const l of allOpen) {
    const k = l.stage as string;
    weightedPipelineByStage[k].count += 1;
    weightedPipelineByStage[k].value += l.estimatedValue;
    weightedPipelineByStage[k].weighted += l.estimatedValue * (l.probability / 100);
  }

  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
  const expectedRevenueThisQuarter = allOpen
    .filter((l) => l.expectedCloseDate && l.expectedCloseDate >= qStart && l.expectedCloseDate < qEnd)
    .reduce((s, l) => s + l.estimatedValue * (l.probability / 100), 0);

  // Funnel based on lead creation in window
  const windowLeads = await prisma.lead.findMany({
    where: { deletedAt: null, ...ownerFilter, createdAt: { gte: from, lte: to } },
    select: { stage: true, estimatedValue: true, lostReason: true, lostAt: true },
  });
  const funnel: Record<string, number> = {};
  for (const s of STAGES) funnel[s] = 0;
  for (const l of windowLeads) funnel[l.stage as string] += 1;

  // Conversion rates: NEW -> QUALIFIED -> PROPOSAL -> NEGOTIATION -> WON
  // For "lead reached stage X" we treat any lead currently at >=X as having reached X.
  const ORDER: Stage[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"];
  const stageRank = new Map(ORDER.map((s, i) => [s, i]));
  const reached: number[] = ORDER.map(() => 0);
  for (const l of windowLeads) {
    const r = stageRank.get(l.stage as Stage);
    if (r === undefined) continue; // skip LOST
    for (let i = 0; i <= r; i++) reached[i] += 1;
  }
  const conversionRates = ORDER.slice(0, -1).map((from, i) => {
    const fromCount = reached[i];
    const toCount = reached[i + 1];
    const rate = fromCount > 0 ? (toCount / fromCount) * 100 : 0;
    return { from, to: ORDER[i + 1], fromCount, toCount, rate };
  });

  const lostBreakdown: Record<string, { count: number; value: number }> = {};
  const sixMo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const lostLeads = await prisma.lead.findMany({
    where: { deletedAt: null, ...ownerFilter, stage: "LOST", lostAt: { gte: sixMo } },
    select: { lostReason: true, estimatedValue: true },
  });
  for (const l of lostLeads) {
    const reason = l.lostReason || "OTHER";
    if (!lostBreakdown[reason]) lostBreakdown[reason] = { count: 0, value: 0 };
    lostBreakdown[reason].count += 1;
    lostBreakdown[reason].value += l.estimatedValue;
  }

  res.json({
    weightedPipelineByStage,
    expectedRevenueThisQuarter,
    funnel,
    conversionRates,
    lostReasonBreakdown: lostBreakdown,
    windowFrom: from.toISOString(),
    windowTo: to.toISOString(),
  });
});

function validate(b: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || b.title !== undefined) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (!t) return "title required";
    if (t.length > 200) return "title too long";
  }
  if (b.stage !== undefined && !STAGES.includes(b.stage as Stage)) return "invalid stage";
  if (b.estimatedValue !== undefined && (typeof b.estimatedValue !== "number" || b.estimatedValue < 0)) return "estimatedValue must be a non-negative number";
  if (b.probability !== undefined) {
    if (typeof b.probability !== "number" || b.probability < 0 || b.probability > 100) return "probability must be 0–100";
  }
  return null;
}

// ─── CSV bulk import ─────────────────────────────────────────────────────────

const IMPORT_COLUMNS = [
  "title",
  "contactName",
  "contactEmail",
  "contactPhone",
  "prospectiveClientName",
  "industry",
  "source",
  "estimatedValue",
  "expectedCloseDate",
  "notes",
] as const;

// Parse CSV with a battle-tested library so quoted fields, escaped quotes,
// embedded commas/newlines, ragged rows, and Excel BOMs are handled correctly.
function parseCsv(text: string): string[][] {
  const rows = parseCsvSync(text, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: false,
  }) as string[][];
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

router.post("/leads/import", requireRole("SALES", "MANAGEMENT"), async (req: AuthedRequest, res: Response) => {
  const body = req.body || {};
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    res.status(400).json({ error: "csv body field is required" });
    return;
  }

  let rows: string[][];
  try {
    rows = parseCsv(csv);
  } catch {
    res.status(400).json({ error: "Failed to parse CSV" });
    return;
  }
  if (rows.length < 1) {
    res.status(400).json({ error: "CSV is empty" });
    return;
  }

  const header = rows[0].map((h) => h.trim());
  const colIndex: Record<string, number> = {};
  for (const c of IMPORT_COLUMNS) {
    const idx = header.findIndex((h) => h.toLowerCase() === c.toLowerCase());
    if (idx >= 0) colIndex[c] = idx;
  }
  if (colIndex.title === undefined) {
    res.status(400).json({ error: "CSV must include a 'title' column" });
    return;
  }

  const errors: { row: number; message: string }[] = [];
  const toCreate: Prisma.LeadCreateManyInput[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (key: string): string => {
      const i = colIndex[key];
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };
    const title = get("title");
    if (!title) {
      errors.push({ row: r + 1, message: "title is required" });
      continue;
    }
    if (title.length > 200) {
      errors.push({ row: r + 1, message: "title too long (max 200)" });
      continue;
    }

    const estRaw = get("estimatedValue");
    let estimatedValue = 0;
    if (estRaw) {
      const n = Number(estRaw.replace(/[, ]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        errors.push({ row: r + 1, message: "estimatedValue must be a non-negative number" });
        continue;
      }
      estimatedValue = n;
    }

    let expectedCloseDate: Date | null = null;
    const ecdRaw = get("expectedCloseDate");
    if (ecdRaw) {
      const d = new Date(ecdRaw);
      if (Number.isNaN(d.getTime())) {
        errors.push({ row: r + 1, message: "expectedCloseDate is not a valid date (use YYYY-MM-DD)" });
        continue;
      }
      expectedCloseDate = d;
    }

    const email = get("contactEmail");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: r + 1, message: "contactEmail is not a valid email" });
      continue;
    }

    toCreate.push({
      title,
      contactName: get("contactName") || null,
      contactEmail: email || null,
      contactPhone: get("contactPhone") || null,
      prospectiveClientName: get("prospectiveClientName") || null,
      industry: get("industry") || null,
      source: get("source") || null,
      stage: "NEW" as Stage,
      estimatedValue,
      probability: 10,
      expectedCloseDate,
      ownerId: req.user.sub,
      notes: get("notes") || null,
    });
  }

  let created = 0;
  if (toCreate.length > 0) {
    const result = await prisma.lead.createMany({ data: toCreate });
    created = result.count;
  }

  res.status(200).json({
    total: rows.length - 1,
    created,
    failed: errors.length,
    errors,
  });
});

router.post("/leads", requireRole("SALES"), validateBody(CreateLeadBody), async (req: AuthedRequest, res: Response) => {
  const body = req.body || {};
  const err = validate(body, false);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const ownerId = req.user.role === "SALES" ? req.user.sub : (body.ownerId || req.user.sub);
  const lead = await prisma.lead.create({
    data: {
      title: String(body.title).trim(),
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      clientId: body.clientId || null,
      prospectiveClientName: body.prospectiveClientName || null,
      industry: body.industry || null,
      source: body.source || null,
      stage: (body.stage as Stage) || "NEW",
      estimatedValue: body.estimatedValue ?? 0,
      probability: body.probability ?? 20,
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
      ownerId,
      notes: body.notes || null,
    },
    include: { client: { select: { name: true } }, owner: { select: { name: true } } },
  });
  res.status(201).json(serialize(lead));
});

router.patch("/leads/:id", requireRole("SALES"), validateBody(UpdateLeadBody), async (req: AuthedRequest, res: Response) => {
  const body = req.body || {};
  const err = validate(body, true);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const existing = await prisma.lead.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (!canMutate(req, existing)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const stageChanged = body.stage && body.stage !== existing.stage;
  // If moving to LOST, require lostReason
  if (stageChanged && body.stage === "LOST") {
    const reason = typeof body.lostReason === "string" ? body.lostReason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "lostReason required when stage = LOST" });
      return;
    }
  }
  const data: Prisma.LeadUpdateInput = {
    ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
    ...(body.contactName !== undefined ? { contactName: body.contactName || null } : {}),
    ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail || null } : {}),
    ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone || null } : {}),
    ...(body.clientId !== undefined ? { clientId: body.clientId || null } : {}),
    ...(body.prospectiveClientName !== undefined ? { prospectiveClientName: body.prospectiveClientName || null } : {}),
    ...(body.industry !== undefined ? { industry: body.industry || null } : {}),
    ...(body.source !== undefined ? { source: body.source || null } : {}),
    ...(body.stage !== undefined ? { stage: body.stage } : {}),
    ...(body.estimatedValue !== undefined ? { estimatedValue: body.estimatedValue } : {}),
    ...(body.probability !== undefined ? { probability: body.probability } : {}),
    ...(body.expectedCloseDate !== undefined ? { expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null } : {}),
    ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
    ...(body.lostReason !== undefined ? { lostReason: body.lostReason || null } : {}),
    ...(body.competitorWon !== undefined ? { competitorWon: body.competitorWon || null } : {}),
  };
  if (stageChanged) {
    if (body.stage === "WON") data.wonAt = new Date();
    if (body.stage === "LOST") data.lostAt = new Date();
  }
  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data,
    include: { client: { select: { name: true } }, owner: { select: { name: true } } },
  });
  res.json(serialize(lead));
});

router.delete("/leads/:id", requireRole("SALES"), async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.lead.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (!canMutate(req, existing)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await prisma.lead.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  res.json({ success: true });
});

router.post("/leads/:id/convert", requireRole("SALES"), async (req: AuthedRequest, res: Response) => {
  const body = req.body || {};
  const lead = await prisma.lead.findUnique({ where: { id: String(req.params.id) } });
  if (!lead || lead.deletedAt) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (!canMutate(req, lead)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (lead.convertedProjectId) {
    res.status(409).json({ error: "Lead already converted" });
    return;
  }

  const code = (body.code || `LEAD-${lead.id.slice(-6).toUpperCase()}`).toString().trim();
  if (!lead.clientId && !body.clientId) {
    const name = (body.clientName || lead.prospectiveClientName || "").toString().trim();
    if (!name) {
      res.status(400).json({ error: "clientName or clientId required when lead has no linked client" });
      return;
    }
  }
  if (body.contractValue !== undefined && body.contractValue !== null && body.contractValue !== "") {
    const cv = Number(body.contractValue);
    if (Number.isNaN(cv) || cv < 0) {
      res.status(400).json({ error: "contractValue must be a non-negative number" });
      return;
    }
  }
  if (body.vatPercent !== undefined && body.vatPercent !== null && body.vatPercent !== "") {
    const vp = Number(body.vatPercent);
    if (Number.isNaN(vp) || vp < 0 || vp > 100) {
      res.status(400).json({ error: "vatPercent must be between 0 and 100" });
      return;
    }
  }
  if (body.estimatedCost !== undefined && body.estimatedCost !== null && body.estimatedCost !== "") {
    const ec = Number(body.estimatedCost);
    if (Number.isNaN(ec) || ec < 0) {
      res.status(400).json({ error: "estimatedCost must be a non-negative number" });
      return;
    }
  }
  // Lead conversion is Sales-only and must capture initial resource requirements
  // (planned mandays) so the converted project has an initial estimated cost.
  const convertPlannedMandays = Number(body.plannedMandays);
  if (
    body.plannedMandays === undefined ||
    body.plannedMandays === null ||
    body.plannedMandays === "" ||
    Number.isNaN(convertPlannedMandays) ||
    !(convertPlannedMandays > 0)
  ) {
    res.status(400).json({ error: "Resource requirements are required: planned mandays must be greater than 0" });
    return;
  }
  let validatedSpkUrl: string | null | undefined = undefined;
  let validatedContractUrl: string | null | undefined = undefined;
  try {
    if (body.spkFileUrl !== undefined) {
      validatedSpkUrl = validatePdfDataUrl(body.spkFileUrl, "spkFileUrl") ?? null;
    }
    if (body.contractFileUrl !== undefined) {
      validatedContractUrl = validatePdfDataUrl(body.contractFileUrl, "contractFileUrl") ?? null;
    }
  } catch (e: unknown) {
    res.status(400).json({ error: errorMessage(e) || "Invalid PDF file" });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.lead.findUnique({ where: { id: lead.id } });
      if (!fresh || fresh.deletedAt) throw new Error("LEAD_NOT_FOUND");
      if (fresh.convertedProjectId) throw new Error("ALREADY_CONVERTED");

      let clientId = fresh.clientId;
      if (!clientId && body.clientId) {
        const existing = await tx.client.findUnique({ where: { id: String(body.clientId) } });
        if (!existing) throw new Error("CLIENT_NOT_FOUND");
        clientId = existing.id;
      }
      if (!clientId) {
        const name = (body.clientName || fresh.prospectiveClientName || "").toString().trim();
        const created = await tx.client.create({ data: { name, industry: fresh.industry || null } });
        clientId = created.id;
      }

      const existingCode = await tx.project.findUnique({ where: { code } });
      if (existingCode) throw new Error("CODE_EXISTS");

      const contractValueOverride =
        body.contractValue !== undefined && body.contractValue !== null && body.contractValue !== ""
          ? Number(body.contractValue)
          : null;
      const vatPercent =
        body.vatPercent !== undefined && body.vatPercent !== null && body.vatPercent !== ""
          ? Number(body.vatPercent)
          : undefined;
      const contractValueIncludesVat =
        typeof body.contractValueIncludesVat === "boolean" ? body.contractValueIncludesVat : undefined;
      const descriptionOverride =
        typeof body.description === "string" && body.description.trim().length > 0
          ? body.description
          : fresh.notes || null;
      const estimatedCostOverride =
        body.estimatedCost !== undefined && body.estimatedCost !== null && body.estimatedCost !== ""
          ? Number(body.estimatedCost)
          : null;
      const plannedMandaysOverride =
        body.plannedMandays !== undefined && body.plannedMandays !== null && body.plannedMandays !== ""
          ? Number(body.plannedMandays)
          : null;

      const project = await tx.project.create({
        data: {
          code,
          name: fresh.title,
          status: "DRAFT",
          clientId,
          salesId: fresh.ownerId,
          contractValue:
            contractValueOverride !== null && !Number.isNaN(contractValueOverride)
              ? contractValueOverride
              : fresh.estimatedValue,
          description: descriptionOverride,
          ...(estimatedCostOverride !== null && !Number.isNaN(estimatedCostOverride)
            ? { estimatedCost: estimatedCostOverride }
            : {}),
          ...(plannedMandaysOverride !== null && !Number.isNaN(plannedMandaysOverride)
            ? { plannedMandays: plannedMandaysOverride }
            : {}),
          ...(vatPercent !== undefined && !Number.isNaN(vatPercent) ? { vatPercent } : {}),
          ...(contractValueIncludesVat !== undefined ? { contractValueIncludesVat } : {}),
          ...(validatedSpkUrl !== undefined ? { spkFileUrl: validatedSpkUrl } : {}),
          ...(validatedSpkUrl
            ? { spkFileName: sanitizeFileName(body.spkFileName) ?? null }
            : validatedSpkUrl === null
              ? { spkFileName: null }
              : {}),
          ...(validatedContractUrl !== undefined ? { contractFileUrl: validatedContractUrl } : {}),
          ...(validatedContractUrl
            ? { contractFileName: sanitizeFileName(body.contractFileName) ?? null }
            : validatedContractUrl === null
              ? { contractFileName: null }
              : {}),
        },
      });

      await tx.lead.update({
        where: { id: fresh.id },
        data: { stage: "WON", wonAt: new Date(), convertedProjectId: project.id },
      });
      return { projectId: project.id, projectCode: project.code };
    });
    res.status(201).json(result);
  } catch (e: unknown) {
    const msg = errorMessage(e);
    if (msg === "ALREADY_CONVERTED") {
      res.status(409).json({ error: "Lead already converted" });
      return;
    }
    if (msg === "CODE_EXISTS") {
      res.status(409).json({ error: "Project code already exists" });
      return;
    }
    if (msg === "LEAD_NOT_FOUND") {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    if (msg === "CLIENT_NOT_FOUND") {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    throw e;
  }
});

// ─── Activities ──────────────────────────────────────────────────────────────

type LeadRow = Awaited<ReturnType<typeof prisma.lead.findUnique>>;
async function loadLeadForActivity(req: AuthedRequest, res: Response): Promise<NonNullable<LeadRow> | null> {
  const lead = await prisma.lead.findUnique({ where: { id: String(req.params.id) } });
  if (!lead || lead.deletedAt) {
    res.status(404).json({ error: "Lead not found" });
    return null;
  }
  const role = req.user.role;
  if (role === "SALES") {
    if (lead.ownerId !== req.user.sub) {
      res.status(403).json({ error: "Forbidden" });
      return null;
    }
  } else if (role !== "MANAGEMENT" && role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return lead;
}

router.get("/leads/:id/activities", async (req: AuthedRequest, res: Response) => {
  const lead = await loadLeadForActivity(req, res);
  if (!lead) return;
  const activities = await prisma.leadActivity.findMany({
    where: { leadId: lead.id },
    include: { createdBy: { select: { name: true } } },
    orderBy: { occurredAt: "desc" },
  });

  // Lazy notification check: notify the lead owner about overdue follow-ups
  // on read (no cron). Idempotent per day inside notifyOnceDailyForLead.
  await notifyOnceDailyForLead(lead, activities).catch(() => {});

  res.json(activities.map(serializeActivity));
});

router.post("/leads/:id/activities", async (req: AuthedRequest, res: Response) => {
  const lead = await loadLeadForActivity(req, res);
  if (!lead) return;
  if (req.user.role !== "SALES" || lead.ownerId !== req.user.sub) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body || {};
  const type = typeof body.type === "string" ? body.type.toUpperCase() : "";
  if (!ACTIVITY_TYPES.includes(type as ActivityType)) {
    res.status(400).json({ error: "Invalid activity type" });
    return;
  }
  const activity = await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: type as ActivityType,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      outcome: body.outcome || null,
      nextActionAt: body.nextActionAt ? new Date(body.nextActionAt) : null,
      nextActionNote: body.nextActionNote || null,
      createdById: req.user.sub,
    },
    include: { createdBy: { select: { name: true } } },
  });
  res.status(201).json(serializeActivity(activity));
});

router.patch("/leads/:id/activities/:activityId", async (req: AuthedRequest, res: Response) => {
  const lead = await loadLeadForActivity(req, res);
  if (!lead) return;
  if (req.user.role !== "SALES" || lead.ownerId !== req.user.sub) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = await prisma.leadActivity.findUnique({ where: { id: String(req.params.activityId) } });
  if (!existing || existing.leadId !== lead.id) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  const body = req.body || {};
  if (body.type !== undefined && !ACTIVITY_TYPES.includes(String(body.type).toUpperCase() as ActivityType)) {
    res.status(400).json({ error: "Invalid activity type" });
    return;
  }
  const activity = await prisma.leadActivity.update({
    where: { id: existing.id },
    data: {
      ...(body.type !== undefined ? { type: String(body.type).toUpperCase() as ActivityType } : {}),
      ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date() } : {}),
      ...(body.outcome !== undefined ? { outcome: body.outcome || null } : {}),
      ...(body.nextActionAt !== undefined ? { nextActionAt: body.nextActionAt ? new Date(body.nextActionAt) : null } : {}),
      ...(body.nextActionNote !== undefined ? { nextActionNote: body.nextActionNote || null } : {}),
    },
    include: { createdBy: { select: { name: true } } },
  });
  res.json(serializeActivity(activity));
});

router.delete("/leads/:id/activities/:activityId", async (req: AuthedRequest, res: Response) => {
  const lead = await loadLeadForActivity(req, res);
  if (!lead) return;
  if (req.user.role !== "SALES" || lead.ownerId !== req.user.sub) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = await prisma.leadActivity.findUnique({ where: { id: String(req.params.activityId) } });
  if (!existing || existing.leadId !== lead.id) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  await prisma.leadActivity.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

export default router;

export { LOST_REASONS };
