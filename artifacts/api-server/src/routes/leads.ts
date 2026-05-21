import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

const STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
type Stage = (typeof STAGES)[number];

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
    convertedProjectId: l.convertedProjectId,
    wonAt: l.wonAt ? l.wonAt.toISOString() : null,
    lostAt: l.lostAt ? l.lostAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function scope(req: any) {
  const role = req.user.role;
  if (role === "SALES") return { ownerId: req.user.sub };
  return null;
}

router.get("/leads", async (req: any, res) => {
  const s = scope(req);
  if (s === null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, ...s },
    include: { client: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
  });
  res.json(leads.map(serialize));
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
  if (req.user.role === "SALES" && existing.ownerId !== req.user.sub) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const stageChanged = body.stage && body.stage !== existing.stage;
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
  if (req.user.role === "SALES" && existing.ownerId !== req.user.sub) {
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
  if (req.user.role === "SALES" && lead.ownerId !== req.user.sub) {
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

export default router;
