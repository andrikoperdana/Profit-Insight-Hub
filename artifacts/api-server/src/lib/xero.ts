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

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
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
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await prisma.xeroConnection.upsert({
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
    },
  });
}

export interface XeroConnectionInfo {
  connected: boolean;
  tenantName: string | null;
  connectedAt: string | null;
}

export async function getConnectionInfo(): Promise<XeroConnectionInfo> {
  const conn = await prisma.xeroConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!conn) return { connected: false, tenantName: null, connectedAt: null };
  return {
    connected: true,
    tenantName: conn.tenantName,
    connectedAt: conn.connectedAt.toISOString(),
  };
}

export async function disconnect(): Promise<void> {
  await prisma.xeroConnection.deleteMany({ where: { id: CONNECTION_ID } });
}

export class XeroNotConnectedError extends Error {
  constructor() {
    super("Xero is not connected");
    this.name = "XeroNotConnectedError";
  }
}

// Serialize token refreshes: concurrent API calls that all see an expired
// token must not each fire a refresh (Xero rotates the refresh token, so
// parallel refreshes would invalidate one another).
let refreshInFlight: Promise<{ accessToken: string; tenantId: string }> | null = null;

async function doRefresh(refreshToken: string): Promise<{ accessToken: string; tenantId: string }> {
  const token = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const updated = await prisma.xeroConnection.update({
    where: { id: CONNECTION_ID },
    data: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
    },
  });
  return { accessToken: updated.accessToken, tenantId: updated.tenantId };
}

/**
 * Return a valid access token + tenantId, transparently refreshing when the
 * stored token is at/near expiry. Throws XeroNotConnectedError if no
 * connection exists.
 */
export async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string }> {
  const conn = await prisma.xeroConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!conn) throw new XeroNotConnectedError();
  if (conn.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
    return { accessToken: conn.accessToken, tenantId: conn.tenantId };
  }
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(conn.refreshToken).finally(() => {
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
    throw new Error(`Xero API ${path} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as T;
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
  // DPP (tax-exclusive unit amount) and the VAT/tax amount, both in the
  // project currency.
  unitAmount: number;
  taxAmount: number;
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Status?: string;
  AmountDue?: number;
  AmountPaid?: number;
  Total?: number;
}

function xeroDate(d: Date): string {
  // Xero accepts ISO date (yyyy-mm-dd) for Date/DueDate.
  return d.toISOString().slice(0, 10);
}

/**
 * Create an ACCREC (accounts receivable) sales invoice in Xero with a single
 * line item. We send the line as tax-exclusive with an explicit TaxAmount so
 * the gross matches the milestone total regardless of Xero's tax defaults.
 */
export async function createInvoice(input: InvoiceInput): Promise<{
  invoiceId: string;
  invoiceNumber: string | null;
}> {
  const invoice: Record<string, unknown> = {
    Type: "ACCREC",
    Contact: { ContactID: input.contactId },
    LineAmountTypes: "Exclusive",
    Status: "AUTHORISED",
    ...(input.invoiceNumber ? { InvoiceNumber: input.invoiceNumber } : {}),
    ...(input.reference ? { Reference: input.reference } : {}),
    ...(input.date ? { Date: xeroDate(input.date) } : {}),
    ...(input.dueDate ? { DueDate: xeroDate(input.dueDate) } : {}),
    LineItems: [
      {
        Description: input.lineDescription,
        Quantity: 1,
        UnitAmount: Number(input.unitAmount.toFixed(2)),
        TaxAmount: Number(input.taxAmount.toFixed(2)),
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
  status: string | null;
  amountDue: number | null;
  amountPaid: number | null;
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
      status: inv.Status ?? null,
      amountDue: inv.AmountDue ?? null,
      amountPaid: inv.AmountPaid ?? null,
      // Only Xero's explicit PAID status counts. AmountDue can be 0 for
      // VOIDED/DELETED/credited invoices too, which must not be treated as paid.
      fullyPaid: inv.Status === "PAID",
    });
  }
  return out;
}
