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

export default router;
