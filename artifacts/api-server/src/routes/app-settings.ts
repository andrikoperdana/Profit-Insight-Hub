import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import {
  APP_SETTINGS_ID,
  getAppSettings,
  invalidateAppSettingsCache,
} from "../lib/app-settings.js";

const router: IRouter = Router();

router.use(requireAuth);

const MANAGE_ROLES = ["MANAGEMENT"] as const;

// GET current business-rule settings (merged over defaults).
router.get("/app-settings", requireRole(...MANAGE_ROLES), async (_req, res) => {
  const settings = await getAppSettings();
  res.json(settings);
});

// PUT (upsert) business-rule settings.
router.put("/app-settings", requireRole(...MANAGE_ROLES), async (req, res) => {
  const body = req.body ?? {};

  const vat = Number(body.defaultVatPercent);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
    res.status(400).json({ error: "defaultVatPercent must be a number between 0 and 100" });
    return;
  }

  const days = Number(body.timesheetBackdateDays);
  if (!Number.isInteger(days) || days < 0 || days > 60) {
    res.status(400).json({ error: "timesheetBackdateDays must be a whole number between 0 and 60" });
    return;
  }

  const lowMarginPct = Number(body.lowMarginPct);
  if (!Number.isFinite(lowMarginPct) || lowMarginPct < 0 || lowMarginPct > 100) {
    res.status(400).json({ error: "lowMarginPct must be a number between 0 and 100" });
    return;
  }

  const budgetOverrunPct = Number(body.budgetOverrunPct);
  if (!Number.isFinite(budgetOverrunPct) || budgetOverrunPct < 0 || budgetOverrunPct > 100) {
    res.status(400).json({ error: "budgetOverrunPct must be a number between 0 and 100" });
    return;
  }

  const invoiceDueSoonDays = Number(body.invoiceDueSoonDays);
  if (!Number.isInteger(invoiceDueSoonDays) || invoiceDueSoonDays < 1 || invoiceDueSoonDays > 90) {
    res.status(400).json({ error: "invoiceDueSoonDays must be a whole number between 1 and 90" });
    return;
  }

  const lateTimesheetDays = Number(body.lateTimesheetDays);
  if (!Number.isInteger(lateTimesheetDays) || lateTimesheetDays < 1 || lateTimesheetDays > 30) {
    res.status(400).json({ error: "lateTimesheetDays must be a whole number between 1 and 30" });
    return;
  }

  if (body.xeroAutoSyncEnabled !== undefined && typeof body.xeroAutoSyncEnabled !== "boolean") {
    res.status(400).json({ error: "xeroAutoSyncEnabled must be true or false" });
    return;
  }

  const before = await prisma.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } });
  // Optional field: when omitted (e.g. an older client/stale tab), preserve the
  // current stored value rather than rejecting or silently resetting it.
  const xeroAutoSyncEnabled =
    typeof body.xeroAutoSyncEnabled === "boolean"
      ? body.xeroAutoSyncEnabled
      : (before?.xeroAutoSyncEnabled ?? false);
  const data = {
    defaultVatPercent: vat,
    timesheetBackdateDays: days,
    lowMarginPct,
    budgetOverrunPct,
    invoiceDueSoonDays,
    lateTimesheetDays,
    xeroAutoSyncEnabled,
    updatedById: req.user?.sub ?? null,
  };
  const saved = await prisma.appSetting.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID, ...data },
    update: data,
  });
  invalidateAppSettingsCache();

  await recordAudit(req, {
    action: "app_settings.updated",
    entityType: "AppSetting",
    entityId: saved.id,
    description: `Updated business rules (default VAT ${saved.defaultVatPercent}%, timesheet backdate ${saved.timesheetBackdateDays} working days, low-margin alert <${saved.lowMarginPct}%, budget overrun >${saved.budgetOverrunPct}%, invoice due-soon ${saved.invoiceDueSoonDays}d, late timesheet ${saved.lateTimesheetDays}d, Xero auto-sync ${saved.xeroAutoSyncEnabled ? "enabled" : "disabled"})`,
    before,
    after: saved,
  });

  res.json(saved);
});

export default router;
