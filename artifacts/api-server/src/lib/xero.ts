import crypto from "crypto";
import { prisma } from "@workspace/db";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Xero OAuth 2.0 + Accounting API integration (manual, no SDK).
//
// One-way: we push sales invoices and contacts INTO Xero and pull payment
// status back to mark milestones PAID. Single Xero tenant (organisation),
// stored as a singleton XeroConnection row (id="default"). Tokens are
// refreshed on demand; Xero rotates the refresh token on every refresh, so we
// always persist the new pair.
// ---------------------------------------------------------------------------

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";

// Minimal scopes for our one-way push: create Xero invoices + contacts, plus
// offline_access for the refresh token. We use Xero's NEW granular scopes:
// `accounting.invoices` (read+write invoices) replaces the legacy broad
// `accounting.transactions`, which no longer exists for apps created after
// 2 March 2026 and therefore returns invalid_scope. We never read the Xero
// user's identity, so the OpenID Connect scopes (openid/profile/email) are omitted.
const SCOPES = [
  "accounting.invoices",
  "accounting.contacts",
  // Read-only access to the chart of accounts + tax rates so invoice line items
  // can be stamped with a valid revenue AccountCode and TaxType (both mandatory
  // for AUTHORISED ACCREC invoices). Adding this scope requires re-consent: an
  // existing connection must disconnect + reconnect before discovery works.
  "accounting.settings.read",
  "offline_access",
].join(" ");

// Refresh the access token this many ms before it actually expires so an
// in-flight request never races the expiry boundary.
const EXPIRY_BUFFER_MS = 60_000;
// Signed OAuth state is only valid for a short window to limit replay.
const STATE_TTL_MS = 10 * 60_000;

const CONNECTION_ID = "default";

function clientId(): string {
  return process.env["XERO_CLIENT_ID"] ?? "";
}
function clientSecret(): string {
  return process.env["XERO_CLIENT_SECRET"] ?? "";
}
function stateSecret(): string {
  const s = process.env["SESSION_SECRET"];
  // Fail closed: the OAuth callback is intentionally unauthenticated and only
  // trusts the signed `state`. A weak/default secret would let an attacker
  // forge a valid state and complete a connection, so we refuse to sign or
  // verify state without a real secret.
  if (!s) throw new Error("SESSION_SECRET is required for Xero OAuth state signing");
  return s;
}

export function xeroConfigured(): boolean {
  return clientId().length > 0 && clientSecret().length > 0;
}

// --- OAuth state (CSRF) ----------------------------------------------------
// Stateless signed token rather than a cookie, so the callback (which arrives
// as a top-level browser navigation from Xero, with no app cookies guaranteed)
// can verify integrity and freshness without server-side session storage.

export function signState(payload: { userId: string }): string {
  const body = JSON.stringify({
    u: payload.userId,
    n: crypto.randomBytes(8).toString("hex"),
    t: Date.now(),
  });
  const b64 = Buffer.from(body).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyState(state: string | undefined): boolean {
  if (!state || typeof state !== "string") return false;
  const dot = state.indexOf(".");
  if (dot === -1) return false;
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto.createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as { t?: number };
    if (typeof parsed.t !== "number") return false;
    if (Date.now() - parsed.t > STATE_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  // Build the query string with encodeURIComponent (space -> %20) rather than
  // URLSearchParams (space -> "+"). Xero interprets a literal "+" in the query
  // as part of the scope value, turning the space-separated scopes into one
  // invalid token ("openid+profile+...") and returning invalid_scope. Xero's
  // docs require the scopes joined with %20.
  const params: Array<[string, string]> = [
    ["response_type", "code"],
    ["client_id", clientId()],
    ["redirect_uri", redirectUri],
    ["scope", SCOPES],
    ["state", state],
  ];
  const qs = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${AUTHORIZE_URL}?${qs}`;
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function requestToken(
  body: URLSearchParams,
  timeoutMs = 12_000,
): Promise<TokenResponse> {
  // Bound the call so it can never outlast the refresh transaction's advisory
  // lock (see doRefresh): a hung Xero endpoint aborts here with a clean error
  // instead of stalling the open transaction toward its timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Xero token request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Xero token request failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as TokenResponse;
}

interface XeroTenant {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

async function fetchTenants(accessToken: string): Promise<XeroTenant[]> {
  const resp = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Xero connections request failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as XeroTenant[];
}

/**
 * Exchange an authorization code for tokens, resolve the connected tenant, and
 * persist the singleton connection. Picks the first ORGANISATION tenant.
 */
export async function completeConnection(
  code: string,
  redirectUri: string,
  connectedById: string | null,
): Promise<void> {
  const token = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
  const tenants = await fetchTenants(token.access_token);
  const tenant =
    tenants.find((t) => t.tenantType === "ORGANISATION") ?? tenants[0];
  if (!tenant) {
    throw new Error("No Xero organisation is connected to this app");
  }

  // Disconnect is a SOFT delete (it only stamps disconnectedAt), so the prior
  // connection row survives and we can still see which organisation we were last
  // bound to. If this connection points at a DIFFERENT Xero organisation than
  // before, every stored external id (contact/invoice) refers to the old org and
  // is meaningless in the new one — clear them so contacts get re-created (and
  // invoices re-pushed) into the newly connected organisation, rather than
  // failing later with "contact/invoice not found" against the wrong tenant.
  // Reconnecting to the SAME org keeps the ids (re-syncing would otherwise hit
  // Xero's unique-contact-name error). First-time connect has no prior tenant.
  const previous = await prisma.xeroConnection.findUnique({
    where: { id: CONNECTION_ID },
    select: { tenantId: true },
  });
  const orgChanged = !!previous && previous.tenantId !== tenant.tenantId;

  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const upsertConnection = prisma.xeroConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      connectedById,
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      connectedById,
      connectedAt: new Date(),
      disconnectedAt: null,
    },
  });

  // Cleanup and the connection upsert run atomically so we never end up with
  // cleared ids but no (re)stored connection, or vice versa.
  if (orgChanged) {
    const [clientsCleared, milestonesCleared] = await prisma.$transaction([
      prisma.client.updateMany({
        where: { xeroContactId: { not: null } },
        data: { xeroContactId: null },
      }),
      prisma.billingMilestone.updateMany({
        where: { xeroInvoiceId: { not: null } },
        data: { xeroInvoiceId: null, xeroInvoiceNumber: null },
      }),
      upsertConnection,
    ]);
    logger.warn(
      {
        previousTenantId: previous?.tenantId,
        newTenantId: tenant.tenantId,
        clientsCleared: clientsCleared.count,
        milestonesCleared: milestonesCleared.count,
      },
      "Xero organisation changed on reconnect — cleared stale contact/invoice ids",
    );
    clearXeroChartCache();
  } else {
    await upsertConnection;
  }
}

export interface XeroConnectionInfo {
  connected: boolean;
  tenantName: string | null;
  connectedAt: string | null;
}

export async function getConnectionInfo(): Promise<XeroConnectionInfo> {
  const conn = await prisma.xeroConnection.findUnique({ where: { id: CONNECTION_ID } });
  // A soft-disconnected row still exists (so we remember the last org), but it
  // must report as not connected.
  if (!conn || conn.disconnectedAt) {
    return { connected: false, tenantName: null, connectedAt: null };
  }
  return {
    connected: true,
    tenantName: conn.tenantName,
    connectedAt: conn.connectedAt.toISOString(),
  };
}

export async function disconnect(): Promise<void> {
  // Soft delete: stamp disconnectedAt instead of removing the row, so a later
  // reconnect can detect whether the user switched to a different Xero org and
  // clear stale contact/invoice ids accordingly. No-op if never connected.
  await prisma.xeroConnection.updateMany({
    where: { id: CONNECTION_ID },
    data: { disconnectedAt: new Date() },
  });
  clearXeroChartCache();
}

export class XeroNotConnectedError extends Error {
  constructor() {
    super("Xero is not connected");
    this.name = "XeroNotConnectedError";
  }
}

// Serialize token refreshes. Xero rotates the refresh token on every refresh,
// so two concurrent refreshes invalidate one another. We guard on two levels:
//   - in-process: a shared `refreshInFlight` promise so concurrent callers in
//     THIS instance fire a single refresh.
//   - cross-instance: a Postgres transaction-level advisory lock so two
//     autoscale instances never refresh in parallel. A transaction-scoped lock
//     (`pg_advisory_xact_lock`) is held on the single pinned connection of the
//     interactive transaction and auto-releases on commit/rollback, unlike
//     session-level locks which Prisma's pool can split across connections.
const XERO_TOKEN_LOCK_NS = 0x58524f; // "XRO"
const XERO_TOKEN_LOCK_KEY = 1; // singleton XeroConnection token refresh
let refreshInFlight: Promise<{ accessToken: string; tenantId: string }> | null = null;

async function doRefresh(): Promise<{ accessToken: string; tenantId: string }> {
  return prisma.$transaction(
    async (tx) => {
      // Block until any concurrent refresher (this or another instance) releases
      // the lock at its transaction end.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${XERO_TOKEN_LOCK_NS}::int4, ${XERO_TOKEN_LOCK_KEY}::int4)`;
      // Re-read under the lock: another refresher may have just rotated the token,
      // in which case we return the fresh one without calling Xero again.
      const conn = await tx.xeroConnection.findUnique({ where: { id: CONNECTION_ID } });
      if (!conn || conn.disconnectedAt) throw new XeroNotConnectedError();
      if (conn.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
        return { accessToken: conn.accessToken, tenantId: conn.tenantId };
      }
      const token = await requestToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: conn.refreshToken,
        }),
      );
      const expiresAt = new Date(Date.now() + token.expires_in * 1000);
      const updated = await tx.xeroConnection.update({
        where: { id: CONNECTION_ID },
        data: {
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt,
        },
      });
      return { accessToken: updated.accessToken, tenantId: updated.tenantId };
    },
    { timeout: 20_000 },
  );
}

/**
 * Return a valid access token + tenantId, transparently refreshing when the
 * stored token is at/near expiry. Throws XeroNotConnectedError if no
 * connection exists.
 */
export async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string }> {
  const conn = await prisma.xeroConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!conn || conn.disconnectedAt) throw new XeroNotConnectedError();
  if (conn.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
    return { accessToken: conn.accessToken, tenantId: conn.tenantId };
  }
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function xeroApi<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { accessToken, tenantId } = await getValidAccessToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    logger.warn({ path, status: resp.status, text: text.slice(0, 500) }, "Xero API error");
    // Extract Xero's structured ValidationErrors so the failure reason survives
    // back to the UI instead of being swallowed by a generic 502.
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as {
        Message?: string;
        Elements?: Array<{
          ValidationErrors?: Array<{ Message?: string }>;
          LineItems?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
        }>;
      };
      const msgs: string[] = [];
      for (const el of parsed.Elements ?? []) {
        for (const ve of el.ValidationErrors ?? []) if (ve.Message) msgs.push(ve.Message);
        for (const li of el.LineItems ?? [])
          for (const ve of li.ValidationErrors ?? []) if (ve.Message) msgs.push(ve.Message);
      }
      if (msgs.length === 0 && parsed.Message) msgs.push(parsed.Message);
      if (msgs.length) detail = [...new Set(msgs)].join("; ");
    } catch {
      // Non-JSON body — fall back to the raw text slice above.
    }
    const err = new Error(`Xero API ${path} failed (${resp.status}): ${detail}`) as Error & {
      xeroStatus?: number;
      xeroDetail?: string;
    };
    err.xeroStatus = resp.status;
    err.xeroDetail = detail;
    throw err;
  }
  return (await resp.json()) as T;
}

// --- Chart of accounts / tax rates (for invoice line items) ----------------

interface XeroAccount {
  Code?: string;
  Name?: string;
  Type?: string;
  Class?: string;
  Status?: string;
}

interface XeroTaxRate {
  TaxType?: string;
  Name?: string;
  EffectiveRate?: number;
  Status?: string;
  CanApplyToRevenue?: boolean;
}

const CHART_TTL_MS = 30 * 60_000;
// Intentionally per-instance (in-memory): reference data keyed by tenant with
// a long TTL; clearXeroChartCache() only clears THIS instance, which is fine —
// other instances refresh on TTL expiry at worst.
const chartCache = new Map<
  string,
  { at: number; accounts: XeroAccount[]; taxRates: XeroTaxRate[] }
>();

/** Drop any cached chart-of-accounts data (e.g. after an org switch). */
export function clearXeroChartCache(): void {
  chartCache.clear();
}

async function getChart(): Promise<{ accounts: XeroAccount[]; taxRates: XeroTaxRate[] }> {
  const { tenantId } = await getValidAccessToken();
  const cached = chartCache.get(tenantId);
  if (cached && Date.now() - cached.at < CHART_TTL_MS) return cached;
  const [a, t] = await Promise.all([
    xeroApi<{ Accounts: XeroAccount[] }>("/Accounts"),
    xeroApi<{ TaxRates: XeroTaxRate[] }>("/TaxRates"),
  ]);
  const value = { at: Date.now(), accounts: a.Accounts ?? [], taxRates: t.TaxRates ?? [] };
  chartCache.set(tenantId, value);
  return value;
}

/**
 * Choose the revenue account code to post sales invoice lines to. An explicit
 * XERO_SALES_ACCOUNT_CODE env wins; otherwise prefer Xero's default "Sales"
 * (code 200), then any SALES-type account, then the first active revenue
 * account.
 */
function pickSalesAccountCode(accounts: XeroAccount[]): string {
  const override = process.env["XERO_SALES_ACCOUNT_CODE"]?.trim();
  if (override) return override;
  const active = accounts.filter(
    (a) => a.Status === "ACTIVE" && a.Class === "REVENUE" && a.Code,
  );
  const chosen =
    active.find((a) => a.Code === "200") ??
    active.find((a) => a.Type === "SALES") ??
    active[0];
  if (!chosen?.Code) {
    const err = new Error(
      "No active revenue account found in Xero to post the invoice line to. " +
        "Add a sales/revenue account in Xero, or set XERO_SALES_ACCOUNT_CODE.",
    ) as Error & { userFacing?: boolean };
    err.userFacing = true;
    throw err;
  }
  return chosen.Code;
}

/**
 * Choose the output (sales) tax type whose effective rate matches the project's
 * VAT percentage, so the explicit TaxAmount we send agrees with Xero. An
 * explicit XERO_SALES_TAX_TYPE env wins.
 */
function pickSalesTaxType(taxRates: XeroTaxRate[], ratePct: number): string {
  const override = process.env["XERO_SALES_TAX_TYPE"]?.trim();
  if (override) return override;
  const active = taxRates.filter((t) => t.Status === "ACTIVE" && t.CanApplyToRevenue);
  const matches = active.filter(
    (t) => Math.abs((t.EffectiveRate ?? -1) - ratePct) < 0.001,
  );
  const chosen =
    matches.find((t) => /output|sales|keluaran/i.test(t.Name ?? "")) ?? matches[0];
  if (!chosen?.TaxType) {
    const err = new Error(
      `No active Xero sales tax rate at ${ratePct}% was found. Create an output ` +
        `VAT rate at ${ratePct}% in Xero (Settings → Tax rates), or set XERO_SALES_TAX_TYPE.`,
    ) as Error & { userFacing?: boolean };
    err.userFacing = true;
    throw err;
  }
  return chosen.TaxType;
}

// --- Contacts --------------------------------------------------------------

interface XeroContact {
  ContactID: string;
  Name: string;
}

export interface ContactInput {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  existingContactId?: string | null;
}

/**
 * Create or update a Xero contact for a client. When existingContactId is
 * supplied we update in place; otherwise we create a new contact. Returns the
 * Xero ContactID.
 */
export async function upsertContact(input: ContactInput): Promise<string> {
  const firstName = input.contactPerson?.trim().split(/\s+/)[0] || undefined;
  const lastName =
    input.contactPerson?.trim().split(/\s+/).slice(1).join(" ") || undefined;
  const contact: Record<string, unknown> = {
    Name: input.name,
    ...(input.existingContactId ? { ContactID: input.existingContactId } : {}),
    ...(input.email ? { EmailAddress: input.email } : {}),
    ...(firstName ? { FirstName: firstName } : {}),
    ...(lastName ? { LastName: lastName } : {}),
    ...(input.phone
      ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: input.phone }] }
      : {}),
  };
  const result = await xeroApi<{ Contacts: XeroContact[] }>("/Contacts", {
    method: "POST",
    body: { Contacts: [contact] },
  });
  const saved = result.Contacts?.[0];
  if (!saved?.ContactID) throw new Error("Xero did not return a contact id");
  return saved.ContactID;
}

// --- Invoices --------------------------------------------------------------

export interface InvoiceInput {
  contactId: string;
  invoiceNumber?: string | null;
  reference?: string | null;
  date?: Date | null;
  dueDate?: Date | null;
  lineDescription: string;
  // Tax-inclusive gross total for the line (DPP + VAT), in the project
  // currency. Sent as an Inclusive line amount so Xero back-computes the DPP
  // and tax and the invoice total matches the milestone total exactly.
  grossAmount: number;
  // VAT percentage for the line, used to pick a matching Xero output tax type.
  taxRate?: number;
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Status?: string;
  AmountDue?: number;
  AmountPaid?: number;
  AmountCredited?: number;
  Total?: number;
}

function xeroDate(d: Date): string {
  // Xero accepts ISO date (yyyy-mm-dd) for Date/DueDate.
  return d.toISOString().slice(0, 10);
}

/**
 * Create an ACCREC (accounts receivable) sales invoice in Xero with a single
 * line item. The line is tax-INCLUSIVE (UnitAmount = gross total) with a
 * discovered TaxType whose rate matches the project VAT, so Xero back-computes
 * the DPP and tax and the invoice total equals the milestone total to the
 * cent. We deliberately do NOT send an explicit TaxAmount: a 0.01 rounding
 * difference vs Xero's own calculation would trip a validation rejection, and
 * exclusive line amounts can drift the total by a cent.
 */
export async function createInvoice(input: InvoiceInput): Promise<{
  invoiceId: string;
  invoiceNumber: string | null;
}> {
  // AUTHORISED ACCREC line items must carry a revenue AccountCode and a TaxType;
  // discover both from the connected org's chart of accounts / tax rates.
  const chart = await getChart();
  const accountCode = pickSalesAccountCode(chart.accounts);
  const taxType = pickSalesTaxType(chart.taxRates, input.taxRate ?? 11);
  logger.info({ accountCode, taxType }, "Xero invoice line configuration");
  const invoice: Record<string, unknown> = {
    Type: "ACCREC",
    Contact: { ContactID: input.contactId },
    LineAmountTypes: "Inclusive",
    Status: "AUTHORISED",
    ...(input.invoiceNumber ? { InvoiceNumber: input.invoiceNumber } : {}),
    ...(input.reference ? { Reference: input.reference } : {}),
    ...(input.date ? { Date: xeroDate(input.date) } : {}),
    ...(input.dueDate ? { DueDate: xeroDate(input.dueDate) } : {}),
    LineItems: [
      {
        Description: input.lineDescription,
        Quantity: 1,
        UnitAmount: Number(input.grossAmount.toFixed(2)),
        AccountCode: accountCode,
        TaxType: taxType,
      },
    ],
  };
  const result = await xeroApi<{ Invoices: XeroInvoice[] }>("/Invoices", {
    method: "POST",
    body: { Invoices: [invoice] },
  });
  const saved = result.Invoices?.[0];
  if (!saved?.InvoiceID) throw new Error("Xero did not return an invoice id");
  return { invoiceId: saved.InvoiceID, invoiceNumber: saved.InvoiceNumber ?? null };
}

export interface XeroInvoiceStatus {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  amountCredited: number | null;
  fullyPaid: boolean;
}

/**
 * Fetch the current status for a set of Xero invoices by id. Returns a map
 * keyed by InvoiceID. Used by the payment-sync poller.
 */
export async function getInvoiceStatuses(
  invoiceIds: string[],
): Promise<Map<string, XeroInvoiceStatus>> {
  const out = new Map<string, XeroInvoiceStatus>();
  if (invoiceIds.length === 0) return out;
  // Xero supports filtering by a comma-separated IDs query parameter.
  const ids = invoiceIds.join(",");
  const result = await xeroApi<{ Invoices: XeroInvoice[] }>(
    `/Invoices?IDs=${encodeURIComponent(ids)}`,
  );
  for (const inv of result.Invoices ?? []) {
    out.set(inv.InvoiceID, {
      invoiceId: inv.InvoiceID,
      invoiceNumber: inv.InvoiceNumber ?? null,
      status: inv.Status ?? null,
      amountDue: inv.AmountDue ?? null,
      amountPaid: inv.AmountPaid ?? null,
      amountCredited: inv.AmountCredited ?? null,
      // Only Xero's explicit PAID status counts. AmountDue can be 0 for
      // VOIDED/DELETED/credited invoices too, which must not be treated as paid.
      fullyPaid: inv.Status === "PAID",
    });
  }
  return out;
}
