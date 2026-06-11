import { prisma, type Prisma } from "@workspace/db";
import { logger } from "./logger.js";
import { APP_SETTINGS_ID } from "./app-settings.js";

// ---------------------------------------------------------------------------
// Pipedrive one-way import (Pipedrive -> SecureProfit Hub).
//
// The sales team lives in Pipedrive; their Deals flow INTO the app's existing
// Leads pipeline. This module owns the connector seam, the REST helpers, the
// field mapping, and the idempotent per-deal upsert ("import") core.
//
// Auth: Pipedrive is reached with a personal API token (PIPEDRIVE_API_TOKEN
// secret) scoped to the account's API domain (PIPEDRIVE_API_DOMAIN). The token
// is read fresh from the environment per request via `getPipedriveConn()` and
// is NEVER cached or logged. A Replit-connector OAuth path can slot into the
// same seam later by returning a Bearer header instead of x-api-token.
// ---------------------------------------------------------------------------

export type LeadStage =
  | "NEW"
  | "QUALIFIED"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export class PipedriveNotConnectedError extends Error {
  constructor(message = "Pipedrive is not connected") {
    super(message);
    this.name = "PipedriveNotConnectedError";
  }
}

export class OwnerUnresolvedError extends Error {
  constructor(public dealId: number) {
    super(
      `Deal ${dealId} owner could not be matched to an active Sales user and no default owner is configured`,
    );
    this.name = "OwnerUnresolvedError";
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Connector seam
// ---------------------------------------------------------------------------

/**
 * Returns the Pipedrive API base domain plus the auth headers to attach to
 * every REST call. Read fresh from the environment per request; never cached.
 *
 * Current mode: personal API token via the `x-api-token` header. Throws
 * PipedriveNotConnectedError when no credentials are configured so every caller
 * degrades gracefully (status = not connected, sync returns a clear error)
 * rather than crashing.
 */
async function getPipedriveConn(): Promise<{
  apiDomain: string;
  authHeaders: Record<string, string>;
}> {
  const token = process.env["PIPEDRIVE_API_TOKEN"]?.trim();
  const apiDomain = process.env["PIPEDRIVE_API_DOMAIN"]?.trim();
  if (token && apiDomain) {
    return { apiDomain, authHeaders: { "x-api-token": token } };
  }
  throw new PipedriveNotConnectedError();
}

/** True when the Pipedrive connector is authorized and reachable. */
export async function pipedriveConfigured(): Promise<boolean> {
  try {
    await getPipedriveConn();
    return true;
  } catch {
    return false;
  }
}

async function pdFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiDomain, authHeaders } = await getPipedriveConn();
  const base = apiDomain.replace(/\/+$/, "");
  const url = `${base}/api/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pipedrive ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Pipedrive REST shapes (tolerant: refs come back as a bare id or an object)
// ---------------------------------------------------------------------------

type PdEmail = { value?: string; primary?: boolean };
type PdPhone = { value?: string; primary?: boolean };
type PdRefObject = {
  value?: number;
  name?: string;
  // Pipedrive is inconsistent: person/org refs return contact fields as an
  // array of {value, primary}; the user (owner) ref returns a plain string.
  email?: PdEmail[] | string;
  phone?: PdPhone[] | string;
};
type PdRef = number | PdRefObject | null | undefined;

type PdDeal = {
  id: number;
  title?: string;
  value?: number;
  currency?: string;
  status?: string; // open | won | lost | deleted
  stage_id?: number;
  pipeline_id?: number;
  probability?: number | null;
  expected_close_date?: string | null;
  add_time?: string;
  update_time?: string;
  won_time?: string | null;
  lost_time?: string | null;
  lost_reason?: string | null;
  user_id?: PdRef; // owner
  person_id?: PdRef;
  org_id?: PdRef;
};

type PdUser = { id: number; email?: string; name?: string; active_flag?: boolean };
type PdStage = { id: number; name?: string; pipeline_id?: number; order_nr?: number };

type PdPagination = { more_items_in_collection?: boolean; next_start?: number };
type PdList<T> = {
  success?: boolean;
  data?: T[] | null;
  additional_data?: { pagination?: PdPagination };
};

async function pdListAll<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T[]> {
  const out: T[] = [];
  let start = 0;
  const limit = 100;
  // Safety cap so a malformed pagination response can't loop forever.
  for (let guard = 0; guard < 1000; guard++) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    qs.set("start", String(start));
    qs.set("limit", String(limit));
    const page = await pdFetch<PdList<T>>(`${path}?${qs.toString()}`);
    if (page.data) out.push(...page.data);
    const pg = page.additional_data?.pagination;
    if (pg?.more_items_in_collection && typeof pg.next_start === "number") {
      start = pg.next_start;
    } else {
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Pull a single contact value from a Pipedrive ref field. Person/org refs use
 * an array of {value, primary}; the user (owner) ref uses a plain string. Empty
 * strings (Pipedrive's placeholder for "no value") are normalized to null.
 */
function pickRefContact(
  v: PdEmail[] | PdPhone[] | string | null | undefined,
): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  const primary = v.find((x) => x.primary)?.value;
  return (primary || v[0]?.value || "").trim() || null;
}

function refParts(ref: PdRef): {
  id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
} {
  if (ref == null) return { id: null, name: null, email: null, phone: null };
  if (typeof ref === "number") return { id: ref, name: null, email: null, phone: null };
  return {
    id: typeof ref.value === "number" ? ref.value : null,
    name: ref.name ?? null,
    email: pickRefContact(ref.email),
    phone: pickRefContact(ref.phone),
  };
}

/** Parse a Pipedrive date/datetime (UTC) into a Date, or null. */
function pdDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = s.includes(" ") ? `${s.replace(" ", "T")}Z` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STAGE_DEFAULT_PROBABILITY: Record<LeadStage, number> = {
  NEW: 20,
  QUALIFIED: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  WON: 100,
  LOST: 0,
};

function deriveStage(deal: PdDeal, stageMap: Map<number, LeadStage>): LeadStage {
  const status = (deal.status ?? "").toLowerCase();
  if (status === "won") return "WON";
  if (status === "lost") return "LOST";
  if (typeof deal.stage_id === "number") {
    const mapped = stageMap.get(deal.stage_id);
    if (mapped) return mapped;
  }
  return "NEW";
}

async function loadStageMap(): Promise<Map<number, LeadStage>> {
  const rows = await prisma.pipedriveStageMapping.findMany();
  const m = new Map<number, LeadStage>();
  for (const r of rows) m.set(r.pipedriveStageId, r.leadStage as LeadStage);
  return m;
}

/** Pipedrive user id -> lowercase email. */
async function loadOwnerEmailMap(): Promise<Map<number, string>> {
  const users = await pdListAll<PdUser>("/users");
  const m = new Map<number, string>();
  for (const u of users) if (u.email) m.set(u.id, u.email.toLowerCase());
  return m;
}

/** Lowercase email -> active Sales userId (owner must be an active SALES user). */
async function loadSalesByEmail(): Promise<Map<string, string>> {
  const sales = await prisma.user.findMany({
    where: { role: "SALES", isActive: true, deletedAt: null },
    select: { id: true, email: true },
  });
  const m = new Map<string, string>();
  for (const u of sales) m.set(u.email.toLowerCase(), u.id);
  return m;
}

// ---------------------------------------------------------------------------
// Import core
// ---------------------------------------------------------------------------

// Advisory-lock namespace for serializing per-deal imports across instances.
const PD_LOCK_NS = 0x504452; // "PDR"
// Fixed key guarding a single concurrent full sync.
const PD_SYNC_LOCK_KEY = 0x50445359; // "PDSY"

export interface SyncContext {
  stageMap: Map<number, LeadStage>;
  ownerEmailMap: Map<number, string>;
  salesByEmail: Map<string, string>;
  defaultOwnerId: string | null;
}

export type ImportOutcome = "created" | "updated" | "skipped";

async function resolveClientId(
  tx: Prisma.TransactionClient,
  orgId: number | null,
  orgName: string | null,
): Promise<string | null> {
  if (!orgId) return null;
  const byPd = await tx.client.findUnique({ where: { pipedriveOrgId: orgId } });
  if (byPd) return byPd.id;
  if (orgName) {
    // Adopt an existing client with the same name to avoid duplicates.
    const byName = await tx.client.findFirst({
      where: { name: { equals: orgName, mode: "insensitive" } },
    });
    if (byName) {
      await tx.client.update({
        where: { id: byName.id },
        data: { pipedriveOrgId: orgId },
      });
      return byName.id;
    }
  }
  const created = await tx.client.create({
    data: { name: orgName ?? `Pipedrive Org ${orgId}`, pipedriveOrgId: orgId },
  });
  return created.id;
}

/**
 * Idempotently import a single Pipedrive deal into the Leads pipeline.
 *
 * Field-ownership policy (hardening from the architect review):
 *  - CREATE writes everything (owner, probability, source, clientId, ...).
 *  - UPDATE writes only Pipedrive-owned fields (title, value, dates, stage,
 *    won/lost, contact fields). It never touches ownerId, probability, notes,
 *    clientId or convertedProjectId so in-app edits are preserved.
 *  - A converted lead (convertedProjectId set) is terminal and is skipped.
 *  - A stale write (Pipedrive update_time <= stored) is skipped (handles
 *    webhook/poll re-ordering).
 */
export async function importDeal(deal: PdDeal, ctx: SyncContext): Promise<ImportOutcome> {
  const dealId = deal.id;
  return prisma.$transaction(async (tx) => {
    // Serialize concurrent imports of the same deal (webhook vs poll vs manual).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PD_LOCK_NS}::int4, ${dealId}::int4)`;

    const existing = await tx.lead.findUnique({ where: { pipedriveDealId: dealId } });
    const pdUpdated = pdDate(deal.update_time);

    if (existing) {
      if (existing.convertedProjectId) return "skipped"; // terminal
      if (
        pdUpdated &&
        existing.pipedriveUpdatedAt &&
        pdUpdated.getTime() <= existing.pipedriveUpdatedAt.getTime()
      ) {
        return "skipped"; // stale write
      }
    }

    const stage = deriveStage(deal, ctx.stageMap);
    const org = refParts(deal.org_id);
    const person = refParts(deal.person_id);
    const wonAt = stage === "WON" ? (pdDate(deal.won_time) ?? new Date()) : null;
    const lostAt = stage === "LOST" ? (pdDate(deal.lost_time) ?? new Date()) : null;

    // Pipedrive-owned fields (written on both create and update).
    const owned = {
      title: deal.title ?? `Pipedrive Deal ${dealId}`,
      estimatedValue: typeof deal.value === "number" ? deal.value : 0,
      expectedCloseDate: pdDate(deal.expected_close_date),
      stage: stage as Prisma.LeadCreateInput["stage"],
      wonAt,
      lostAt,
      lostReason: stage === "LOST" ? (deal.lost_reason ?? null) : null,
      contactName: person.name,
      contactEmail: person.email,
      contactPhone: person.phone,
      pipedrivePersonId: person.id,
      pipedriveUpdatedAt: pdUpdated,
    };

    if (existing) {
      await tx.lead.update({ where: { id: existing.id }, data: owned });
      return "updated";
    }

    // Only OPEN deals become new leads. A won/lost deal that was never tracked
    // stays in Pipedrive as history rather than flooding the Leads pipeline.
    // (Existing leads are still updated above when an open deal later closes.)
    if ((deal.status ?? "").toLowerCase() !== "open") return "skipped";

    // Create needs a non-null ownerId. Match the Pipedrive owner's email to an
    // active Sales user, else use the configured default owner, else error so
    // the deal is recorded in the sync result rather than silently misassigned.
    const ownerPdId = refParts(deal.user_id).id;
    const ownerEmail = ownerPdId != null ? ctx.ownerEmailMap.get(ownerPdId) : undefined;
    const ownerId =
      (ownerEmail ? ctx.salesByEmail.get(ownerEmail) : undefined) ?? ctx.defaultOwnerId;
    if (!ownerId) throw new OwnerUnresolvedError(dealId);

    const clientId = await resolveClientId(tx, org.id, org.name);

    await tx.lead.create({
      data: {
        ...owned,
        ownerId,
        clientId,
        probability:
          typeof deal.probability === "number"
            ? Math.round(deal.probability)
            : STAGE_DEFAULT_PROBABILITY[stage],
        source: "Pipedrive",
        pipedriveDealId: dealId,
      },
    });
    return "created";
  });
}

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { dealId: number; error: string }[];
}

async function buildContext(): Promise<SyncContext> {
  const [stageMap, ownerEmailMap, salesByEmail, settings] = await Promise.all([
    loadStageMap(),
    loadOwnerEmailMap(),
    loadSalesByEmail(),
    prisma.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } }),
  ]);
  return {
    stageMap,
    ownerEmailMap,
    salesByEmail,
    defaultOwnerId: settings?.pipedriveDefaultOwnerId ?? null,
  };
}

/** Re-fetch one deal by id and import it (used by the webhook ping handler). */
export async function syncSingleDeal(dealId: number): Promise<ImportOutcome> {
  const resp = await pdFetch<{ data?: PdDeal | null }>(`/deals/${dealId}`);
  if (!resp.data) return "skipped";
  const ctx = await buildContext();
  return importDeal(resp.data, ctx);
}

/**
 * Backfill / refresh: pull OPEN deals only and import them as leads. Closed
 * (won/lost) deals stay in Pipedrive as history and never flood the Leads
 * pipeline; an already-imported lead is still updated (e.g. open -> won/lost)
 * via the webhook path. Guarded by a single advisory lock so two syncs never
 * run at once.
 */
export async function runFullSync(): Promise<SyncResult> {
  const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${PD_SYNC_LOCK_KEY}::int4, 0::int4) AS locked`;
  if (!locked) throw new Error("A Pipedrive sync is already running");

  try {
    const result: SyncResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
    const ctx = await buildContext();
    const deals = await pdListAll<PdDeal>("/deals", { status: "open" });
    for (const deal of deals) {
      try {
        const outcome = await importDeal(deal, ctx);
        if (outcome === "created") result.imported++;
        else if (outcome === "updated") result.updated++;
        else result.skipped++;
      } catch (e) {
        result.errors.push({ dealId: deal.id, error: errorMessage(e) });
      }
    }
    await prisma.appSetting
      .upsert({
        where: { id: APP_SETTINGS_ID },
        create: { id: APP_SETTINGS_ID, pipedriveLastSyncAt: new Date() },
        update: { pipedriveLastSyncAt: new Date() },
      })
      .catch((e) => logger.warn({ err: e }, "pipedrive: failed to stamp lastSyncAt"));
    return result;
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${PD_SYNC_LOCK_KEY}::int4, 0::int4)`;
  }
}

/** Live Pipedrive stages (for building the stage->LeadStage mapping UI). */
export async function listPipedriveStages(): Promise<PdStage[]> {
  return pdListAll<PdStage>("/stages");
}

/** Connectivity probe used by the status endpoint. */
export async function getPipedriveUser(): Promise<{ name?: string } | null> {
  const resp = await pdFetch<{ data?: { name?: string } | null }>("/users/me");
  return resp.data ?? null;
}
