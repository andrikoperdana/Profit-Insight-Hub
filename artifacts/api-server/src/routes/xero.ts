import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { rateLimitAllow } from "../lib/rateLimit.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { canInvoiceProjectStatus } from "../lib/roles.js";
import { assertProjectWritable } from "../lib/projectAccess.js";
import { splitVat, nextInvoiceNumber } from "../lib/invoicing.js";
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
 *  Xero app config and be identical between connect + token exchange.
 *
 *  SECURITY: derived exclusively from server-side configuration — never from
 *  request headers (Host / X-Forwarded-Host / X-Forwarded-Proto), which are
 *  attacker-controllable and would allow redirect_uri poisoning of the OAuth
 *  flow. Returns null when no trusted origin is configured, and callers must
 *  refuse to proceed. */
function redirectUri(): string | null {
  const env = process.env["XERO_REDIRECT_URI"]?.trim();
  if (env) return env;
  // Trusted server-side origins, in preference order: explicit app base URL,
  // the published Replit domain, then the dev domain.
  const base =
    process.env["APP_BASE_URL"]?.trim() ||
    process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim() ||
    process.env["REPLIT_DEV_DOMAIN"]?.trim();
  if (!base) return null;
  const origin = base.startsWith("http://") || base.startsWith("https://") ? base : `https://${base}`;
  return `${origin.replace(/\/+$/, "")}/api/xero/callback`;
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
  const uri = redirectUri();
  if (!uri) {
    res.status(409).json({
      error:
        "No trusted redirect URI is configured for the Xero OAuth flow. Set XERO_REDIRECT_URI (or APP_BASE_URL) on the server.",
    });
    return;
  }
  const state = signState({ userId: req.user!.sub });
  const url = buildAuthorizeUrl(uri, state);
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
    const uri = redirectUri();
    if (!uri) {
      logger.error("Xero OAuth callback received but no trusted redirect URI is configured");
      res.redirect(dest("xero=error"));
      return;
    }
    await completeConnection(code, uri, userId);
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
            status: true,
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
      role === "SUPER_ADMIN" ||
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
    // Archived projects are read-only: no invoice pushes.
    if (!(await assertProjectWritable(milestone.project.id, res))) return;
    if (!canInvoiceProjectStatus(milestone.project.status)) {
      res.status(409).json({
        error: `Cannot invoice this milestone: the project is not active yet (status: ${milestone.project.status}). Set the project to Active before invoicing.`,
      });
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
    const { total } = splitVat(baseAmount, vatPct, includesVat);

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
        select: {
          xeroInvoiceId: true,
          invoiceNumber: true,
          status: true,
          project: { select: { status: true } },
        },
      });
      if (fresh?.xeroInvoiceId) {
        res.status(409).json({ error: "This milestone was already pushed to Xero" });
        return;
      }
      // Re-check project status under the lock in case it was changed between
      // the initial read and acquiring the lock (TOCTOU).
      if (!canInvoiceProjectStatus(fresh?.project?.status)) {
        res.status(409).json({
          error: `Cannot invoice this milestone: the project is not active yet (status: ${fresh?.project?.status}). Set the project to Active before invoicing.`,
        });
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
        grossAmount: total,
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
  // Recently-paid milestones are still polled so that invoice-number edits and
  // credit notes applied in Xero after payment keep their snapshot accurate,
  // bounded by a lookback window to keep the polled set small.
  const paidLookback = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const pending = await prisma.billingMilestone.findMany({
    where: {
      xeroInvoiceId: { not: null },
      // Archived (or deleted) projects are read-only: their milestones are
      // excluded from payment-sync mutations until unarchived.
      project: { deletedAt: null, archivedAt: null },
      OR: [
        { status: { in: ["INVOICED", "PLANNED"] } },
        { status: "PAID", paidAt: { gte: paidLookback } },
      ],
    },
    select: { id: true, xeroInvoiceId: true, xeroInvoiceNumber: true, status: true },
  });
  return syncMilestonePaymentStatuses(pending);
}

/**
 * Targeted variant used by the inbound webhook: refresh only the milestones
 * linked to the given Xero invoice ids. Events for invoices we never pushed
 * resolve to zero rows and cost no Xero API call.
 */
export async function runPaymentSyncFor(
  xeroInvoiceIds: string[],
): Promise<{ checked: number; updated: number }> {
  if (xeroInvoiceIds.length === 0) return { checked: 0, updated: 0 };
  // Same eligibility scope as runPaymentSync: a webhook event must never
  // resurrect a CANCELLED (or otherwise out-of-scope) milestone to PAID just
  // because it mentioned the linked invoice; recently-paid rows stay eligible
  // for snapshot refreshes, long-settled ones are left alone.
  const paidLookback = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const rows = await prisma.billingMilestone.findMany({
    where: {
      xeroInvoiceId: { in: xeroInvoiceIds },
      // Same archived read-only rule as runPaymentSync.
      project: { deletedAt: null, archivedAt: null },
      OR: [
        { status: { in: ["INVOICED", "PLANNED"] } },
        { status: "PAID", paidAt: { gte: paidLookback } },
      ],
    },
    select: { id: true, xeroInvoiceId: true, xeroInvoiceNumber: true, status: true },
  });
  return syncMilestonePaymentStatuses(rows);
}

async function syncMilestonePaymentStatuses(
  rows: {
    id: string;
    xeroInvoiceId: string | null;
    xeroInvoiceNumber: string | null;
    status: string;
  }[],
): Promise<{ checked: number; updated: number }> {
  if (rows.length === 0) return { checked: 0, updated: 0 };

  // Chunk to keep the IDs query string bounded.
  const CHUNK = 40;
  let updated = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const ids = slice.map((m) => m.xeroInvoiceId!).filter(Boolean);
    const statuses = await getInvoiceStatuses(ids);
    for (const m of slice) {
      const st = statuses.get(m.xeroInvoiceId!);
      if (!st) continue;
      // Always refresh the financial snapshot pulled from Xero (outstanding
      // balance after partial payments, total paid, total credited via credit
      // notes) and the official invoice number, which Xero accounting staff may
      // have edited after the invoice was issued.
      const data: Record<string, unknown> = {
        xeroAmountDue: st.amountDue,
        xeroAmountPaid: st.amountPaid,
        xeroAmountCredited: st.amountCredited,
        xeroSyncedAt: new Date(),
      };
      if (st.invoiceNumber && st.invoiceNumber !== m.xeroInvoiceNumber) {
        data.xeroInvoiceNumber = st.invoiceNumber;
      }
      // Only Xero's explicit PAID status flips a not-yet-paid milestone to PAID;
      // already-PAID rows just get their snapshot refreshed (no re-stamp).
      if (st.fullyPaid && m.status !== "PAID") {
        data.status = "PAID";
        data.paidAt = new Date();
        updated++;
      }
      await prisma.billingMilestone.update({ where: { id: m.id }, data });
    }
  }
  return { checked: rows.length, updated };
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

// --- Inbound webhook: instant payment updates -------------------------------
//
// Xero delivers invoice change events here (developer portal → app → Webhooks,
// subscribed to Invoices), so paid invoices are reflected within seconds
// instead of waiting for the 30-minute poll — which stays on as a backstop for
// missed deliveries. UNAUTHENTICATED by design: authenticity comes from the
// x-xero-signature header = base64(HMAC-SHA256(raw body, XERO_WEBHOOK_KEY)).
// The raw Buffer body is provided by an express.raw() mount in app.ts.
//
// Xero's delivery contract (its intent-to-receive validation enforces this):
//   - correctly signed   → HTTP 200, empty body, within 5 seconds
//   - incorrectly signed → HTTP 401
// Event processing therefore happens after the response is sent, and the
// payload is only a hint (invoice ids): the actual status is re-fetched from
// the Xero API, never trusted from the webhook body.

function xeroSignatureValid(rawBody: Buffer, signature: string, key: string): boolean {
  const expected = createHmac("sha256", key).update(rawBody).digest();
  const provided = Buffer.from(signature, "base64");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

router.post("/xero/webhook", (req, res) => {
  // Fail closed until the signing key is configured — an unverifiable webhook
  // must never trigger processing.
  const key = process.env["XERO_WEBHOOK_KEY"]?.trim();
  const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
  const signature = req.get("x-xero-signature")?.trim() ?? "";
  if (!key || !raw || !signature || !xeroSignatureValid(raw, signature, key)) {
    res.status(401).end();
    return;
  }

  // Ack immediately — Xero requires the response within 5 seconds and counts
  // slow answers as delivery failures (eventually disabling the webhook).
  res.status(200).end();

  let invoiceIds: string[] = [];
  try {
    const payload = JSON.parse(raw.toString("utf8")) as {
      events?: { resourceId?: unknown; eventCategory?: unknown }[];
    };
    invoiceIds = [
      ...new Set(
        (payload.events ?? [])
          .filter(
            (e) => e?.eventCategory === "INVOICE" && typeof e?.resourceId === "string",
          )
          .map((e) => e.resourceId as string),
      ),
    ];
  } catch {
    // A signed-but-unparseable body should never happen; drop it quietly.
    return;
  }
  // Intent-to-receive probes carry no events — the 200 above is all they need.
  if (invoiceIds.length === 0) return;

  void (async () => {
    // Signed payloads can be replayed by anyone who captured one (Xero's
    // scheme has no timestamp/nonce), so cap how often deliveries may trigger
    // Xero API round trips. All legitimate traffic is a single sender, so one
    // global bucket is the right key — per-IP would be spoofable via
    // X-Forwarded-For anyway. Dropped events are picked up later by the
    // 30-minute poll or a manual sync.
    if (!(await rateLimitAllow("xero:webhook-sync", 30, 5 * 60_000))) {
      logger.warn(
        { events: invoiceIds.length },
        "Xero webhook sync rate-limited; deferring to poll",
      );
      return;
    }
    const result = await runPaymentSyncFor(invoiceIds);
    if (result.updated > 0) {
      logger.info(result, "Xero webhook updated milestone payment status");
    }
  })().catch((err) => {
    if (err instanceof XeroNotConnectedError) return;
    logger.warn({ err }, "Xero webhook payment sync failed (poll will catch up)");
  });
});

export default router;
