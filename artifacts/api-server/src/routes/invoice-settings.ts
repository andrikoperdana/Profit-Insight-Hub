import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import {
  DEFAULT_INVOICE_ISSUER,
  INVOICE_SETTINGS_ID,
  type InvoiceIssuer,
} from "../lib/invoice-config.js";

const router: IRouter = Router();

router.use(requireAuth);

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseAddressLines(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// Finance + Management may view and edit the invoice issuer profile.
const MANAGE_ROLES = ["MANAGEMENT", "FINANCE"] as const;

// GET current invoice settings. Returns the stored row merged over the
// seed defaults so the form always has a complete shape to render.
router.get(
  "/invoice-settings",
  requireRole(...MANAGE_ROLES),
  async (_req, res) => {
    const row = await prisma.invoiceSetting.findUnique({
      where: { id: INVOICE_SETTINGS_ID },
    });
    const merged: InvoiceIssuer = {
      companyName: row?.companyName?.trim() || DEFAULT_INVOICE_ISSUER.companyName,
      brand: row?.brand?.trim() || DEFAULT_INVOICE_ISSUER.brand,
      addressLines:
        row?.addressLines?.length ? row.addressLines : DEFAULT_INVOICE_ISSUER.addressLines,
      npwp: row?.npwp?.trim() || DEFAULT_INVOICE_ISSUER.npwp,
      email: row?.email?.trim() || DEFAULT_INVOICE_ISSUER.email,
      phone: row?.phone?.trim() ?? DEFAULT_INVOICE_ISSUER.phone,
      city: row?.city?.trim() || DEFAULT_INVOICE_ISSUER.city,
      bankName: row?.bankName?.trim() || DEFAULT_INVOICE_ISSUER.bankName,
      bankAccountName:
        row?.bankAccountName?.trim() || DEFAULT_INVOICE_ISSUER.bankAccountName,
      bankAccountNumber:
        row?.bankAccountNumber?.trim() || DEFAULT_INVOICE_ISSUER.bankAccountNumber,
    };
    res.json({ ...merged, updatedAt: row?.updatedAt ?? null, configured: !!row });
  },
);

// PUT (upsert) invoice settings.
router.put(
  "/invoice-settings",
  requireRole(...MANAGE_ROLES),
  async (req, res) => {
    const body = req.body ?? {};

    const companyName = asString(body.companyName);
    if (!companyName) {
      res.status(400).json({ error: "Company name is required" });
      return;
    }

    const data = {
      companyName,
      brand: asString(body.brand) || DEFAULT_INVOICE_ISSUER.brand,
      addressLines: parseAddressLines(body.addressLines),
      npwp: asString(body.npwp),
      email: asString(body.email),
      phone: asString(body.phone),
      city: asString(body.city) || DEFAULT_INVOICE_ISSUER.city,
      bankName: asString(body.bankName),
      bankAccountName: asString(body.bankAccountName),
      bankAccountNumber: asString(body.bankAccountNumber),
      updatedById: req.user?.sub ?? null,
    };

    const before = await prisma.invoiceSetting.findUnique({
      where: { id: INVOICE_SETTINGS_ID },
    });

    const saved = await prisma.invoiceSetting.upsert({
      where: { id: INVOICE_SETTINGS_ID },
      create: { id: INVOICE_SETTINGS_ID, ...data },
      update: data,
    });

    await recordAudit(req, {
      action: "invoice_settings.updated",
      entityType: "InvoiceSetting",
      entityId: saved.id,
      description: `Updated invoice issuer profile (${saved.companyName})`,
      before,
      after: saved,
    });

    res.json({ ...saved, configured: true });
  },
);

export default router;
