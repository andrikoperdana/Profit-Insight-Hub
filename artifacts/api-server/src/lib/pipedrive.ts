import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@workspace/db";
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

type PdWebhook = {
  id: number;
  subscription_url?: string;
};

export async function replaceManagedPipedriveWebhook(input: {
  subscriptionUrl: string;
  secret: string;
  previousId?: string | null;
}): Promise<{ id: string; url: string; staleWebhookId: string | null; cleanupError: string | null }> {
  const created = await pdFetch<{ data?: PdWebhook }>("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      subscription_url: input.subscriptionUrl,
      event_action: "*",
      event_object: "deal",
      http_auth_user: "secureprofit",
      http_auth_password: input.secret,
      version: "2.0",
    }),
  });
  const id = created.data?.id;
  if (!id) throw new Error("Pipedrive did not return a webhook id");

  // Creation comes first: a provider/API failure must never remove the
  // previously working webhook.
  let staleWebhookId: string | null = null;
  let cleanupError: string | null = null;
  if (input.previousId && input.previousId !== String(id)) {
    try {
      await pdFetch(`/webhooks/${encodeURIComponent(input.previousId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      // The replacement is already active. A stale old webhook is safer than
      // deleting the new one or reporting the repair as failed.
      staleWebhookId = input.previousId;
      cleanupError = errorMessage(error);
      logger.warn(
        { err: error, staleWebhookId },
        "pipedrive: replacement active but old webhook cleanup failed",
      );
    }
  }
  return { id: String(id), url: input.subscriptionUrl, staleWebhookId, cleanupError };
}

export async function deleteStalePipedriveWebhook(input: {
  staleId: string;
  managedId: string | null | undefined;
}): Promise<void> {
  if (input.managedId && input.staleId === input.managedId) {
    throw new Error("Refusing to delete the currently managed Pipedrive webhook");
  }
  await pdFetch(`/webhooks/${encodeURIComponent(input.staleId)}`, {
    method: "DELETE",
  });
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

// Pipedrive deals come in mixed currencies (the account has IDR/SGD/USD/AUD/...
// deals). The rest of the app — projects, billing, financials — is IDR-only and
// every amount is rendered with formatIDR, so a foreign deal.value stored as-is
// shows up as a nonsensical "Rp 16.000" for what is really S$16,000. Convert to
// IDR at import using approximate rates. These are pipeline ESTIMATES, not
// accounting figures, so static rates are acceptable; adjust as the market moves.
const CURRENCY_TO_IDR: Record<string, number> = {
  IDR: 1,
  USD: 16000,
  SGD: 12000,
  AUD: 10500,
  EUR: 17500,
  GBP: 20500,
  MYR: 3500,
  JPY: 105,
  CNY: 2250,
  HKD: 2050,
  PHP: 285,
  THB: 460,
};

/**
 * Convert a Pipedrive deal value (denominated in `currency`) to IDR. Missing or
 * IDR currency passes through unchanged; an unknown currency is imported as-is
 * (logged) rather than dropped, so no estimate is silently lost.
 */
function dealValueToIdr(value: number | undefined, currency: string | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const code = (currency ?? "").trim().toUpperCase();
  if (!code || code === "IDR") return Math.round(value);
  const rate = CURRENCY_TO_IDR[code];
  if (rate === undefined) {
    logger.warn(
      { currency: code },
      "pipedrive: unknown deal currency; importing value without IDR conversion",
    );
    return Math.round(value);
  }
  return Math.round(value * rate);
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

// Pipedrive deal custom-field key for "Region" (enum). Stable per account, but
// overridable via env so a re-created field (which gets a new key) needs no code
// change — falls back to the known production key when the env var is unset.
const REGION_FIELD_KEY =
  process.env["PIPEDRIVE_REGION_FIELD_KEY"]?.trim() ||
  "e6d24cd8f0723cbf5bd39d42b5e0eb7fea929102";

type PdFieldOption = { id?: number; label?: string };
type PdDealField = { key?: string; options?: PdFieldOption[] };

/**
 * Pipedrive Region enum: option-id -> label (e.g. 47 -> "Indonesia"), read from
 * the deal-field definition so a new region added in Pipedrive flows through
 * automatically. Fail-soft: any error or a missing field yields an empty map,
 * so a sync never breaks over region metadata. Callers must treat an empty map
 * as "region unknown" and skip writing region (see importDeal) rather than
 * overwriting stored values with null.
 */
async function loadRegionMap(): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  try {
    const fields = await pdListAll<PdDealField>("/dealFields");
    const field = fields.find((f) => f.key === REGION_FIELD_KEY);
    for (const o of field?.options ?? []) {
      if (typeof o.id === "number" && o.label) m.set(o.id, o.label);
    }
  } catch (e) {
    logger.warn(
      { err: e },
      "pipedrive: failed to load Region field options; leads will sync without region",
    );
  }
  return m;
}

/**
 * Map a deal's Region custom-field value to its label. Pipedrive returns enum
 * values inconsistently as a number or a numeric string; null/unset/unmapped
 * all resolve to null.
 */
function resolveRegion(deal: PdDeal, regionMap: Map<number, string>): string | null {
  const raw = (deal as Record<string, unknown>)[REGION_FIELD_KEY];
  if (raw === null || raw === undefined || raw === "") return null;
  const id = Number(String(raw));
  if (!Number.isFinite(id)) return null;
  return regionMap.get(id) ?? null;
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
  regionMap: Map<number, string>;
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
    // Only write `region` when the field-options map actually loaded. An empty
    // map means the /dealFields fetch failed; writing region:null then would
    // overwrite existing regions on update, and because the same write advances
    // pipedriveUpdatedAt the stale-write skip would prevent self-healing. So we
    // omit the key entirely and leave the stored region untouched.
    const owned = {
      title: deal.title ?? `Pipedrive Deal ${dealId}`,
      estimatedValue: dealValueToIdr(deal.value, deal.currency),
      ...(ctx.regionMap.size > 0 ? { region: resolveRegion(deal, ctx.regionMap) } : {}),
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
  const [stageMap, ownerEmailMap, salesByEmail, regionMap, settings] = await Promise.all([
    loadStageMap(),
    loadOwnerEmailMap(),
    loadSalesByEmail(),
    loadRegionMap(),
    prisma.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } }),
  ]);
  return {
    stageMap,
    ownerEmailMap,
    salesByEmail,
    regionMap,
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
 * via the webhook path.
 *
 * This is the pure import work and can run for several minutes. Concurrency is
 * guarded by the DB-backed run claim (`claimPipedriveSync`); completion
 * bookkeeping (lastSyncAt, result/error) is owned by `runPipedriveSyncJob`. Do
 * NOT call this from the request path — use claim + job so the HTTP request
 * returns immediately and the client polls for progress.
 */
export async function runFullSync(): Promise<SyncResult> {
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
  return result;
}

// ---------------------------------------------------------------------------
// Background sync orchestration
//
// A full sync can exceed the deployment's hard request timeout (~5 min), so the
// HTTP route only CLAIMS a run and fires the job without awaiting; the client
// polls GET /pipedrive/status. Run state lives on the AppSetting singleton so it
// is visible across autoscale instances.
// ---------------------------------------------------------------------------

// A claimed run with no finishedAt is treated as stale (its instance was killed
// or scaled down mid-sync) after this window, so a new sync can be claimed. The
// import is idempotent, so re-running after a stale run is safe.
export const SYNC_STALE_MS = 20 * 60 * 1000;

// Compact, bounded result persisted to AppSetting.pipedriveSyncResult. The full
// per-deal error list is intentionally NOT stored (size + PII) — only its count.
export interface SyncResultSummary {
  imported: number;
  updated: number;
  skipped: number;
  errorCount: number;
}

function summarizeResult(r: SyncResult): SyncResultSummary {
  return {
    imported: r.imported,
    updated: r.updated,
    skipped: r.skipped,
    errorCount: r.errors.length,
  };
}

function syncIsRunning(
  startedAt: Date | null | undefined,
  finishedAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  return !!startedAt && !finishedAt && now - startedAt.getTime() < SYNC_STALE_MS;
}

/**
 * Atomically claim a full sync. Serialized across instances with a
 * transaction-scoped advisory lock (auto-released at commit — no
 * connection-affinity leak like a session-level lock). Returns a fresh runId
 * when the claim succeeds, or `{ started: false }` when a non-stale run is
 * already in flight.
 */
export async function claimPipedriveSync(): Promise<{
  started: boolean;
  runId: string | null;
}> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PD_SYNC_LOCK_KEY}::int4, 0::int4)`;
    const s = await tx.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } });
    if (syncIsRunning(s?.pipedriveSyncStartedAt, s?.pipedriveSyncFinishedAt)) {
      return { started: false, runId: null };
    }
    const runId = randomUUID();
    const now = new Date();
    await tx.appSetting.upsert({
      where: { id: APP_SETTINGS_ID },
      create: {
        id: APP_SETTINGS_ID,
        pipedriveSyncRunId: runId,
        pipedriveSyncStartedAt: now,
        pipedriveSyncFinishedAt: null,
        pipedriveSyncError: null,
        pipedriveSyncResult: Prisma.DbNull,
      },
      update: {
        pipedriveSyncRunId: runId,
        pipedriveSyncStartedAt: now,
        pipedriveSyncFinishedAt: null,
        pipedriveSyncError: null,
        pipedriveSyncResult: Prisma.DbNull,
      },
    });
    return { started: true, runId };
  });
}

/**
 * Record the outcome of a finished run. Guarded by runId + finishedAt:null so a
 * stale worker whose run was superseded by a newer claim can never overwrite the
 * current run's state.
 */
async function finishPipedriveSync(
  runId: string,
  outcome: { result: SyncResult } | { error: string },
): Promise<void> {
  const data: Prisma.AppSettingUpdateManyMutationInput =
    "result" in outcome
      ? {
          pipedriveSyncFinishedAt: new Date(),
          pipedriveSyncError: null,
          pipedriveSyncResult: summarizeResult(
            outcome.result,
          ) as unknown as Prisma.InputJsonValue,
          pipedriveLastSyncAt: new Date(),
        }
      : {
          pipedriveSyncFinishedAt: new Date(),
          pipedriveSyncError: outcome.error.slice(0, 1000),
          pipedriveSyncResult: Prisma.DbNull,
        };
  await prisma.appSetting.updateMany({
    where: {
      id: APP_SETTINGS_ID,
      pipedriveSyncRunId: runId,
      pipedriveSyncFinishedAt: null,
    },
    data,
  });
}

/**
 * Background worker: run the full sync to completion and persist its outcome.
 * Never throws — failures are recorded on the AppSetting row for the UI to
 * surface. Fire-and-forget from the request path with `void`.
 */
export async function runPipedriveSyncJob(runId: string): Promise<void> {
  try {
    const result = await runFullSync();
    await finishPipedriveSync(runId, { result });
  } catch (e) {
    await finishPipedriveSync(runId, { error: errorMessage(e) }).catch((err) =>
      logger.error({ err }, "pipedrive: failed to persist sync failure"),
    );
    logger.error({ err: e }, "pipedrive: background sync failed");
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
