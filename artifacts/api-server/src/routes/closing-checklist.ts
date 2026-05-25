import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { userCanAccessProject, userCanWriteProject } from "../lib/projectAccess.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

export const CLOSING_CHECKLIST_DEFAULTS: Array<{ key: string; label: string; sortOrder: number }> = [
  { key: "BAST_SIGNED", label: "BAST sudah ditandatangani client", sortOrder: 10 },
  { key: "FINAL_REPORT_DELIVERED", label: "Final report sudah dikirim ke client", sortOrder: 20 },
  { key: "INVOICE_ISSUED", label: "Invoice sudah diterbitkan", sortOrder: 30 },
  { key: "PAYMENT_RECEIVED", label: "Pembayaran sudah diterima penuh", sortOrder: 40 },
  { key: "ALL_TIMESHEETS_APPROVED", label: "Semua timesheet sudah disetujui", sortOrder: 50 },
  { key: "ALL_EXPENSES_FINALIZED", label: "Semua expense sudah di-approve/reject (tidak pending)", sortOrder: 60 },
  { key: "SURVEY_SENT", label: "Client satisfaction survey sudah dikirim", sortOrder: 70 },
  { key: "LESSONS_LEARNED", label: "Lessons learned sudah didokumentasikan", sortOrder: 80 },
];

async function ensureChecklist(projectId: string) {
  const existing = await prisma.projectClosingChecklistItem.findMany({ where: { projectId } });
  if (existing.length >= CLOSING_CHECKLIST_DEFAULTS.length) return existing;
  const existingKeys = new Set(existing.map((e) => e.key));
  for (const d of CLOSING_CHECKLIST_DEFAULTS) {
    if (!existingKeys.has(d.key)) {
      await prisma.projectClosingChecklistItem.create({
        data: {
          projectId,
          key: d.key,
          label: d.label,
          sortOrder: d.sortOrder,
          status: "PENDING",
        },
      });
    }
  }
  return prisma.projectClosingChecklistItem.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }],
  });
}

function serialize(it: Awaited<ReturnType<typeof prisma.projectClosingChecklistItem.findFirstOrThrow>>) {
  return {
    id: it.id,
    projectId: it.projectId,
    key: it.key,
    label: it.label,
    status: it.status,
    note: it.note,
    completedAt: it.completedAt ? it.completedAt.toISOString() : null,
    completedById: it.completedById,
    sortOrder: it.sortOrder,
  };
}

router.get("/projects/:id/closing-checklist", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const items = await ensureChecklist(projectId);
  res.json(items.sort((a, b) => a.sortOrder - b.sortOrder).map(serialize));
});

router.patch("/projects/:id/closing-checklist/:itemId", async (req, res) => {
  const projectId = String(req.params.id);
  const itemId = String(req.params.itemId);
  if (!(await userCanWriteProject(projectId, req.user!))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const item = await prisma.projectClosingChecklistItem.findUnique({ where: { id: itemId } });
  if (!item || item.projectId !== projectId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { status, note } = req.body || {};
  const data: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!["PENDING", "DONE", "NA"].includes(String(status))) {
      res.status(400).json({ error: "status must be PENDING|DONE|NA" });
      return;
    }
    data.status = String(status);
    if (status === "DONE" || status === "NA") {
      data.completedAt = new Date();
      data.completedById = req.user!.sub;
    } else {
      data.completedAt = null;
      data.completedById = null;
    }
  }
  if (note !== undefined) data.note = note || null;
  const updated = await prisma.projectClosingChecklistItem.update({ where: { id: itemId }, data });
  res.json(serialize(updated));
});

export default router;
