import { Router, type IRouter } from "express";
import { prisma, ensureSampleReportData } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();

router.post(
  "/admin/seed-sample-data",
  requireAuth,
  requireRole("SITE_ADMIN"),
  async (req, res) => {
    const before = {
      users: await prisma.user.count(),
      milestones: await prisma.billingMilestone.count(),
      expenses: await prisma.projectExpense.count(),
      timesheets: await prisma.timesheet.count(),
    };

    try {
      await ensureSampleReportData();
    } catch (err) {
      req.log.error({ err }, "ensureSampleReportData failed");
      return res.status(500).json({ error: "Sample data seed failed" });
    }

    const after = {
      users: await prisma.user.count(),
      milestones: await prisma.billingMilestone.count(),
      expenses: await prisma.projectExpense.count(),
      timesheets: await prisma.timesheet.count(),
    };

    const created = {
      users: after.users - before.users,
      billingMilestones: after.milestones - before.milestones,
      expenses: after.expenses - before.expenses,
      timesheets: after.timesheets - before.timesheets,
    };

    await recordAudit(req, {
      action: "admin.sample_data_seeded",
      entityType: "System",
      entityId: "sample-data",
      description: `Sample report data seed: +${created.users} users, +${created.billingMilestones} milestones, +${created.expenses} expenses, +${created.timesheets} timesheets`,
    });

    return res.json({ ok: true, created, totals: after });
  },
);

router.post(
  "/admin/rename-emails",
  requireAuth,
  requireRole("SITE_ADMIN"),
  async (req, res) => {
    const OLD = "@secureprofit.id";
    const NEW = "@itsecasia.com";

    const candidates = await prisma.user.findMany({
      where: { email: { endsWith: OLD } },
      select: { id: true, email: true },
    });

    const updated: { id: string; from: string; to: string }[] = [];
    const skipped: { id: string; email: string; reason: string }[] = [];

    for (const u of candidates) {
      const next = u.email.replace(OLD, NEW);
      const clash = await prisma.user.findUnique({ where: { email: next }, select: { id: true } });
      if (clash && clash.id !== u.id) {
        skipped.push({ id: u.id, email: u.email, reason: `target ${next} already exists` });
        continue;
      }
      await prisma.user.update({ where: { id: u.id }, data: { email: next } });
      updated.push({ id: u.id, from: u.email, to: next });
    }

    await recordAudit(req, {
      action: "admin.emails_renamed",
      entityType: "System",
      entityId: "email-domain-rename",
      description: `Renamed ${updated.length} email(s) from ${OLD} to ${NEW}; skipped ${skipped.length}`,
    });

    return res.json({ ok: true, renamed: updated.length, skippedCount: skipped.length, updated, skipped });
  },
);

export default router;
