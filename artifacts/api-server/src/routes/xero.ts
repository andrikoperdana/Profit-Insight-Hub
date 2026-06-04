import { Router, type IRouter, type Request } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import {
  xeroConfigured,
  signState,
  verifyState,
  buildAuthorizeUrl,
  completeConnection,
  getConnectionInfo,
  disconnect,
  upsertContact,
  createInvoice,
  getInvoiceStatuses,
  XeroNotConnectedError,
} from "../lib/xero.js";

const router: IRouter = Router();

// NOTE: requireAuth is applied per-route (not router.use) because the OAuth
// callback arrives as a top-level browser navigation from Xero with no Bearer
// token — it authenticates via the signed `state` instead.

const ADMIN_ROLES = ["MANAGEMENT", "FINANCE"] as const;

/** Absolute redirect URI Xero calls back. Must match a URI registered in the
 *  Xero app config and be identical between connect + token exchange. */
function redirectUri(req: Request): string {
  const env = process.env["XERO_REDIRECT_URI"];
  if (env) return env;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0] || req.get("host");
  return `${proto}://${host}/api/xero/callback`;
}

function splitVat(
  gross: number,
  vatPct: number,
  includesVat: boolean,
): { dpp: number; vat: number; total: number } {
  if (!isFinite(gross) || gross <= 0) return { dpp: 0, vat: 0, total: 0 };
  if (includesVat) {
    const dpp = gross / (1 + vatPct / 100);
    return { dpp, vat: gross - dpp, total: gross };
  }
  const vat = gross * (vatPct / 100);
  return { dpp: gross, vat, total: gross + vat };
}

async function nextInvoiceNumber(date: Date): Promise<string> {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `INV/${year}/${month}/`;
  const existing = await prisma.billingMilestone.findMany({
    where: { invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const suffix = row.invoiceNumber?.slice(prefix.length) ?? "";
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// Postgres advisory-lock namespace for serializing per-milestone Xero invoice
// pushes across concurrent requests (and across instances, since the lock lives
// in the shared database).
const XERO_LOCK_NS = 0x58524f; // "XRO"

async function tryMilestoneLock(milestoneId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${XERO_LOCK_NS}::int4, hashtext(${milestoneId})) AS locked`;
  return rows[0]?.locked === true;
}

async function releaseMilestoneLock(milestoneId: string): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${XERO_LOCK_NS}::int4, hashtext(${milestoneId}))`;
}

/**
 * Reserve a sequential invoiceNumber on the milestone before any Xero call.
 * Writing it first lets the DB unique constraint arbitrate concurrent sequence
 * allocation: a P2002 clash means another row grabbed the number, so we retry
 * with the next one. Returns the reserved number (or a pre-existing one).
 */
async function reserveInvoiceNumber(milestoneId: string, existing: string | null, invoicedAt: Date): Promise<string> {
  const current = existing?.trim();
  if (current) return current;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = await nextInvoiceNumber(invoicedAt);
    try {
      await prisma.billingMilestone.update({
        where: { id: milestoneId },
        data: { invoiceNumber: candidate },
      });
      return candidate;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not allocate a unique invoice number");
}

// --- Connection status -----------------------------------------------------

router.get("/xero/status", requireAuth, requireRole(...ADMIN_ROLES), async (_req, res) => {
  const info = await getConnectionInfo();
  res.json({ ...info, configured: xeroConfigured() });
});

// --- Begin OAuth: return the authorize URL for the browser to navigate to ---

router.post("/xero/connect-url", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!xeroConfigured()) {
    res.status(409).json({ error: "Xero is not configured on the server" });
    return;
  }
  const state = signState({ userId: req.user!.sub });
  const url = buildAuthorizeUrl(redirectUri(req), state);
  res.json({ url });
});

// --- OAuth callback (NO Bearer; verified via signed state) ------------------

router.get("/xero/callback", async (req, res) => {
  const dest = (suffix: string) => `/settings?${suffix}`;
  const error = req.query["error"];
  if (error) {
    logger.warn({ error }, "Xero OAuth returned an error");
    res.redirect(dest("xero=error"));
    return;
  }
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  if (!code || !verifyState(state)) {
    res.redirect(dest("xero=error"));
    return;
  }
  try {
    let userId: string | null = null;
    try {
      const parsed = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8")) as {
        u?: string;
      };
      userId = parsed.u ?? null;
    } catch {
      userId = null;
    }
    await completeConnection(code, redirectUri(req), userId);
    res.redirect(dest("xero=connected"));
  } catch (err) {
    logger.error({ err }, "Xero OAuth callback failed");
    res.redirect(dest("xero=error"));
  }
});

// --- Disconnect ------------------------------------------------------------

router.post("/xero/disconnect", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  await disconnect();
  await recordAudit(req, {
    action: "xero.disconnected",
    entityType: "XeroConnection",
    entityId: "default",
    description: "Disconnected the Xero integration",
  });
  res.json({ success: true });
});

// --- Sync a client to a Xero contact ---------------------------------------

router.post(
  "/clients/:id/xero-sync",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const client = await prisma.client.findUnique({ where: { id: String(req.params.id) } });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    try {
      const contactId = await upsertContact({
        name: client.name,
        contactPerson: client.contactPerson,
        email: client.email,
        phone: client.phone,
        existingContactId: client.xeroContactId,
      });
      const updated = await prisma.client.update({
        where: { id: client.id },
        data: { xeroContactId: contactId },
      });
      await recordAudit(req, {
        action: "client.xero_synced",
        entityType: "Client",
        entityId: client.id,
        description: `Synced client "${client.name}" to Xero`,
        after: { xeroContactId: contactId },
      });
      res.json({ id: updated.id, xeroContactId: contactId });
    } catch (err) {
      if (err instanceof XeroNotConnectedError) {
        res.status(409).json({ error: "Xero is not connected" });
        return;
      }
      req.log.error({ err, clientId: client.id }, "Xero client sync failed");
      res.status(502).json({ error: "Failed to sync client to Xero" });
    }
  },
);

// --- Push a billing milestone to Xero as a sales invoice -------------------

router.post(
  "/billing-milestones/:milestoneId/xero-invoice",
  requireAuth,
  async (req, res) => {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const milestone = await prisma.billingMilestone.findUnique({
      where: { id: String(req.params.milestoneId) },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            pmId: true,
            contractValue: true,
            vatPercent: true,
            contractValueIncludesVat: true,
            clientId: true,
            client: {
              select: {
                id: true,
                name: true,
                contactPerson: true,
                email: true,
                phone: true,
                xeroContactId: true,
              },
            },
          },
        },
      },
    });
    if (!milestone) {
      res.status(404).json({ error: "Billing milestone not found" });
      return;
    }
    const isManager =
      role === "MANAGEMENT" ||
      role === "FINANCE" ||
      (role === "PROJECT_MANAGER" && milestone.project.pmId === userId);
    if (!isManager) {
      res.status(403).json({ error: "Only Management, Finance, or the assigned PM can push invoices to Xero" });
      return;
    }
    if (milestone.status === "CANCELLED") {
      res.status(409).json({ error: "Cannot invoice a cancelled milestone" });
      return;
    }
    if (milestone.xeroInvoiceId) {
      res.status(409).json({ error: "This milestone was already pushed to Xero" });
      return;
    }
    const client = milestone.project.client;
    if (!client) {
      res.status(409).json({ error: "Project has no client to invoice" });
      return;
    }

    const vatPct = milestone.project.vatPercent ?? 11;
    const includesVat = milestone.project.contractValueIncludesVat ?? true;
    const baseAmount =
      milestone.amount ??
      ((milestone.project.contractValue ?? 0) * (milestone.percentage || 0)) / 100;
    if (!isFinite(baseAmount) || baseAmount <= 0) {
      res.status(409).json({ error: "Milestone has no billable amount to invoice" });
      return;
    }
    const { dpp, vat } = splitVat(baseAmount, vatPct, includesVat);

    // Serialize concurrent pushes for this milestone so two requests can't each
    // create a Xero invoice before either records the resulting xeroInvoiceId.
    const locked = await tryMilestoneLock(milestone.id);
    if (!locked) {
      res.status(409).json({ error: "An invoice push for this milestone is already in progress" });
      return;
    }
    try {
      // Re-check the claim under the lock (the initial read happened before it).
      const fresh = await prisma.billingMilestone.findUnique({
        where: { id: milestone.id },
        select: { xeroInvoiceId: true, invoiceNumber: true, status: true },
      });
      if (fresh?.xeroInvoiceId) {
        res.status(409).json({ error: "This milestone was already pushed to Xero" });
        return;
      }

      // Ensure the client exists as a Xero contact.
      let contactId = client.xeroContactId;
      if (!contactId) {
        contactId = await upsertContact({
          name: client.name,
          contactPerson: client.contactPerson,
          email: client.email,
          phone: client.phone,
        });
        await prisma.client.update({
          where: { id: client.id },
          data: { xeroContactId: contactId },
        });
      }

      const invoicedAt = milestone.invoicedAt ?? new Date();
      // Reserve the number (and persist it) before calling Xero so a sequence
      // clash can never leave an orphaned invoice in Xero.
      const invoiceNumber = await reserveInvoiceNumber(
        milestone.id,
        fresh?.invoiceNumber ?? null,
        invoicedAt,
      );

      const created = await createInvoice({
        contactId,
        invoiceNumber,
        reference: `${milestone.project.code} — ${milestone.name}`,
        date: invoicedAt,
        dueDate: milestone.dueDate,
        lineDescription: `${milestone.project.name} — ${milestone.name}`,
        unitAmount: dpp,
        taxAmount: vat,
        taxRate: vatPct,
      });

      const updated = await prisma.billingMilestone.update({
        where: { id: milestone.id },
        data: {
          xeroInvoiceId: created.invoiceId,
          xeroInvoiceNumber: created.invoiceNumber ?? invoiceNumber,
          status:
            (fresh?.status ?? milestone.status) === "PLANNED"
              ? "INVOICED"
              : (fresh?.status ?? milestone.status),
          invoicedAt,
        },
      });

      await recordAudit(req, {
        action: "billing_milestone.xero_invoice_created",
        entityType: "BillingMilestone",
        entityId: milestone.id,
        description: `Pushed milestone "${milestone.name}" to Xero as invoice ${created.invoiceNumber ?? invoiceNumber}`,
        after: { xeroInvoiceId: created.invoiceId, xeroInvoiceNumber: created.invoiceNumber },
      });

      res.json({
        id: updated.id,
        status: updated.status,
        xeroInvoiceId: updated.xeroInvoiceId,
        xeroInvoiceNumber: updated.xeroInvoiceNumber,
        invoiceNumber: updated.invoiceNumber,
      });
    } catch (err) {
      if (err instanceof XeroNotConnectedError) {
        res.status(409).json({ error: "Xero is not connected" });
        return;
      }
      req.log.error({ err, milestoneId: milestone.id }, "Xero invoice push failed");
      const detail = (err as { xeroDetail?: string })?.xeroDetail;
      const userFacing = (err as { userFacing?: boolean })?.userFacing;
      if (userFacing) {
        res.status(422).json({ error: (err as Error).message });
        return;
      }
      res.status(502).json({
        error: detail
          ? `Failed to push invoice to Xero: ${detail}`
          : "Failed to push invoice to Xero",
      });
    } finally {
      await releaseMilestoneLock(milestone.id).catch((err) => {
        req.log.warn({ err, milestoneId: milestone.id }, "Failed to release Xero milestone lock");
      });
    }
  },
);

// --- Pull payment status: mark fully-paid Xero invoices as PAID ------------

export async function runPaymentSync(): Promise<{ checked: number; updated: number }> {
  const pending = await prisma.billingMilestone.findMany({
    where: {
      xeroInvoiceId: { not: null },
      status: { in: ["INVOICED", "PLANNED"] },
    },
    select: { id: true, xeroInvoiceId: true },
  });
  if (pending.length === 0) return { checked: 0, updated: 0 };

  // Chunk to keep the IDs query string bounded.
  const CHUNK = 40;
  let updated = 0;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    const ids = slice.map((m) => m.xeroInvoiceId!).filter(Boolean);
    const statuses = await getInvoiceStatuses(ids);
    for (const m of slice) {
      const st = statuses.get(m.xeroInvoiceId!);
      if (st?.fullyPaid) {
        await prisma.billingMilestone.update({
          where: { id: m.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        updated++;
      }
    }
  }
  return { checked: pending.length, updated };
}

router.post("/xero/sync-payments", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await runPaymentSync();
    res.json(result);
  } catch (err) {
    if (err instanceof XeroNotConnectedError) {
      res.status(409).json({ error: "Xero is not connected" });
      return;
    }
    req.log.error({ err }, "Xero payment sync failed");
    res.status(502).json({ error: "Failed to sync payments from Xero" });
  }
});

export default router;
