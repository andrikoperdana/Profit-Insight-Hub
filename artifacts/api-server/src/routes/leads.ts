import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { notifyOnceDailyForLead } from "../lib/leadNotifications.js";

const router: IRouter = Router();
router.use(requireAuth);

const STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
type Stage = (typeof STAGES)[number];
const LOST_REASONS = ["PRICE", "TIMELINE", "COMPETITOR", "NO_BUDGET", "NO_DECISION", "OTHER"] as const;
const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

function serialize(l: any) {
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
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function serializeActivity(a: any) {
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
function scope(req: any): Record<string, unknown> | null {
  const role = req.user.role;
  if (role === "SALES") return { ownerId: req.user.sub };
  if (role === "MANAGEMENT") return {};
  return null;
}

function canMutate(req: any, lead: { ownerId: string }): boolean {
  if (req.user.role === "SALES") return lead.ownerId === req.user.sub;
  return false;
}

router.get("/leads", async (req: any, res) => {
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

router.get("/leads/analytics", async (req: any, res) => {
  const role = req.user.role;
  if (role !== "SALES" && role !== "MANAGEMENT") {
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

function validate(b: any, partial: boolean): string | null {
  if (!partial || b.title !== undefined) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (!t) return "title required";
    if (t.length > 200) return "title too long";
  }
  if (b.stage !== undefined && !STAGES.includes(b.stage)) return "invalid stage";
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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

router.post("/leads/import", requireRole("SALES", "MANAGEMENT"), async (req: any, res) => {
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
  const toCreate: any[] = [];

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

router.post("/leads", requireRole("SALES"), async (req: any, res) => {
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

router.patch("/leads/:id", requireRole("SALES"), async (req: any, res) => {
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
  const data: any = {
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

router.delete("/leads/:id", requireRole("SALES"), async (req: any, res) => {
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

router.post("/leads/:id/convert", requireRole("SALES"), async (req: any, res) => {
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
  if (!lead.clientId) {
    const name = (body.clientName || lead.prospectiveClientName || "").toString().trim();
    if (!name) {
      res.status(400).json({ error: "clientName required when lead has no linked client" });
      return;
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.lead.findUnique({ where: { id: lead.id } });
      if (!fresh || fresh.deletedAt) throw new Error("LEAD_NOT_FOUND");
      if (fresh.convertedProjectId) throw new Error("ALREADY_CONVERTED");

      let clientId = fresh.clientId;
      if (!clientId) {
        const name = (body.clientName || fresh.prospectiveClientName || "").toString().trim();
        const created = await tx.client.create({ data: { name, industry: fresh.industry || null } });
        clientId = created.id;
      }

      const existingCode = await tx.project.findUnique({ where: { code } });
      if (existingCode) throw new Error("CODE_EXISTS");

      const project = await tx.project.create({
        data: {
          code,
          name: fresh.title,
          status: "DRAFT",
          clientId,
          salesId: fresh.ownerId,
          contractValue: fresh.estimatedValue,
          description: fresh.notes || null,
        },
      });

      await tx.lead.update({
        where: { id: fresh.id },
        data: { stage: "WON", wonAt: new Date(), convertedProjectId: project.id },
      });
      return { projectId: project.id, projectCode: project.code };
    });
    res.status(201).json(result);
  } catch (e: any) {
    if (e?.message === "ALREADY_CONVERTED") {
      res.status(409).json({ error: "Lead already converted" });
      return;
    }
    if (e?.message === "CODE_EXISTS") {
      res.status(409).json({ error: "Project code already exists" });
      return;
    }
    if (e?.message === "LEAD_NOT_FOUND") {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    throw e;
  }
});

// ─── Activities ──────────────────────────────────────────────────────────────

async function loadLeadForActivity(req: any, res: any): Promise<any | null> {
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
  } else if (role !== "MANAGEMENT") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return lead;
}

router.get("/leads/:id/activities", async (req: any, res) => {
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

router.post("/leads/:id/activities", async (req: any, res) => {
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

router.patch("/leads/:id/activities/:activityId", async (req: any, res) => {
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

router.delete("/leads/:id/activities/:activityId", async (req: any, res) => {
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
