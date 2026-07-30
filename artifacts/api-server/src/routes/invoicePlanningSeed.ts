import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function startOfIsoWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

/**
 * Seed sample billing milestones for the Invoice Planning matrix.
 *
 * Idempotent: only acts on projects that currently have NO milestones with
 * dueDate >= today. Creates 3 future milestones per qualifying project,
 * spread across the next 12 weeks at varying percentages and statuses so
 * the matrix shows planned/invoiced/paid color coding.
 */
router.post("/invoice-planning/seed-sample", requireRole("MANAGEMENT"), async (req, res) => {
  const today = startOfIsoWeek(new Date());

  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null, archivedAt: null,
      status: { in: ["OBSERVATION", "ACTIVE", "PAUSE"] },
    },
    select: { id: true, contractValue: true, name: true },
    orderBy: { name: "asc" },
  });

  if (projects.length === 0) {
    res.json({ created: 0, projectsSeeded: 0, skipped: 0, message: "No eligible projects." });
    return;
  }

  // Map projects already having future milestones — skip those.
  const projectIds = projects.map((p) => p.id);
  const projectsWithFutureMs = await prisma.billingMilestone.findMany({
    where: {
      projectId: { in: projectIds },
      dueDate: { gte: today },
      status: { in: ["PLANNED", "INVOICED", "PAID"] },
    },
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const skipSet = new Set(projectsWithFutureMs.map((m) => m.projectId));

  // Find a next invoice sequence
  const last = await prisma.billingMilestone.findFirst({
    where: { invoiceNumber: { startsWith: "INV-2026-" } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let invoiceSeq = 1;
  if (last?.invoiceNumber) {
    const m = last.invoiceNumber.match(/INV-2026-(\d+)/);
    if (m) invoiceSeq = parseInt(m[1], 10) + 1;
  }

  let created = 0;
  let projectsSeeded = 0;
  let skipped = 0;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i]!;
    if (skipSet.has(p.id)) {
      skipped++;
      continue;
    }

    // Vary offsets so different projects land in different weeks/months
    const baseWeek = i % 4; // 0..3
    const plan: { name: string; pct: number; weeksFromNow: number; status: "PLANNED" | "INVOICED" | "PAID" }[] = [
      { name: "Installment 1 — Kickoff 30%",   pct: 30, weeksFromNow: baseWeek + 1, status: i % 3 === 0 ? "INVOICED" : "PLANNED" },
      { name: "Installment 2 — Progress 40%",  pct: 40, weeksFromNow: baseWeek + 5, status: "PLANNED" },
      { name: "Installment 3 — Final 30%",     pct: 30, weeksFromNow: baseWeek + 10, status: "PLANNED" },
    ];

    // Add a paid one if scenario picks it
    if (i % 5 === 2) {
      plan[0]!.status = "PAID";
    }

    for (let m = 0; m < plan.length; m++) {
      const item = plan[m]!;
      const dueDate = addDaysUtc(today, item.weeksFromNow * 7);
      let invoicedAt: Date | null = null;
      let paidAt: Date | null = null;
      let invoiceNumber: string | null = null;
      if (item.status === "INVOICED") {
        invoicedAt = addDaysUtc(dueDate, -10);
        invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
      } else if (item.status === "PAID") {
        invoicedAt = addDaysUtc(dueDate, -10);
        paidAt = addDaysUtc(dueDate, 3);
        invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
      }
      await prisma.billingMilestone.create({
        data: {
          projectId: p.id,
          name: item.name,
          percentage: item.pct,
          dueDate,
          status: item.status,
          invoicedAt,
          paidAt,
          invoiceNumber,
          sortOrder: m,
        },
      });
      created++;
    }
    projectsSeeded++;
  }

  req.log.info({ created, projectsSeeded, skipped }, "Invoice planning sample seeded");
  res.json({ created, projectsSeeded, skipped });
});

export default router;
