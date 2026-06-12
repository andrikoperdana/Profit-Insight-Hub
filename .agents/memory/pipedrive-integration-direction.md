---
name: Pipedrive integration direction
description: Shipped design + non-obvious constraints for the one-way Pipedrive→Leads import.
---

# Pipedrive integration (Phase 1 — shipped)

Direction: **one-way Import (Pipedrive → app Leads pipeline)** only. The app never writes back to Pipedrive. Deal → Lead; pipeline stage → `LeadStage` via a configurable mapping; deal owner → Sales user (email match, else a configured default owner); Organization/Person → Client + contact. Link columns: `Lead.pipedriveDealId`, `Client.pipedriveOrgId`.

**Why one-way:** sales lives in Pipedrive day-to-day; the app just mirrors deals to avoid double entry. Two-way sync judged overkill/high-risk (conflict handling, webhook loops).

## Non-obvious constraints (won't be obvious from code alone)

- **Auth seam is a manual API token, NOT a Replit OAuth connector.** Pipedrive OAuth is dead at this org, so auth uses env secret `PIPEDRIVE_API_TOKEN` + `PIPEDRIVE_API_DOMAIN` (x-api-token header). Do **not** reach for `proposeIntegration`/`connector_catalog:pipedrive` — that earlier plan was abandoned.
- **Import scope = OPEN/active deals only.** The org has ~6k deals (most won/lost = noise). Full sync fetches `{status:"open"}` and the CREATE path skips non-open deals; existing leads still UPDATE on open→won/lost transitions. Don't "fix" this into importing everything.
- **Stage-mapping PUT is replace-semantics.** `PUT /pipedrive/stage-mappings` upserts submitted rows AND deletes any omitted stage mapping in the same transaction. The settings UI omits a stage to unmap it; an unmapped Pipedrive stage falls back to importing as NEW. An empty `mappings` array therefore clears all mappings — intended.
- **Default lead owner must be an active SALES user** (server-validated in `PUT /pipedrive/settings`); the settings picker filters `/users/active-all` to role SALES.
- **Webhook is unauthenticated by a shared secret** (`AppSetting.pipedriveWebhookSecret`); when no secret is configured it accepts (pre-setup) and only ever triggers a server-side re-fetch by deal id (never trusts the payload body).

## Running a bulk import (operational, learned the hard way)

- **`POST /api/pipedrive/sync` runs the whole sync server-side and KEEPS RUNNING after the HTTP client disconnects.** Importing the org's ~500 open deals takes minutes (container → server → Neon-Singapore round-trips per upsert), far longer than any single request will survive — a `timeout`-wrapped curl gets killed (exit 124) but the server finishes on its own.
- **Pattern: fire once, then poll the DB.** Trigger the sync once, then poll a read replica (`executeSql` is read-only) for progress (`count(*) FROM "Lead" WHERE pipedriveDealId IS NOT NULL`) and completion (`AppSetting.pipedriveLastSyncAt` flips from null to a timestamp at the end). Do NOT retry the POST on client timeout — you'll stack concurrent syncs.
- **Owner matching is by email and usually misses.** Pipedrive deal-owner emails rarely match app SALES users, so in practice nearly all imported leads fall to the configured default owner. Expect a single-owner pipeline after import and offer reassignment.
- **Demo/seed leads can't be removed via the API** (`DELETE /leads/:id` is SALES-own only; MGMT can't). Clean them with a direct soft-delete (`deletedAt`) against `PROD_DATABASE_URL`, AFTER the import — post-import the only `pipedriveDealId IS NULL` active leads are the demo rows. Guard any direct prod write with a prod-only discriminator (e.g. a known prod-only user email) so you can't accidentally hit dev.

## Access / gating
- Backend admin endpoints (`status/sync/settings/stage-mappings`) gated to `ADMIN_ROLES=["MANAGEMENT"]`; `requireRole` auto-bypasses SUPER_ADMIN. FE settings card gate is `MANAGEMENT || SUPER_ADMIN` to match.
- Leads carry `pipedriveDealId`; the Leads page shows a "From Pipedrive" badge keyed on `pipedriveDealId != null`.

## Mixed-currency deals MUST be converted to IDR at import
- The Pipedrive account holds **mixed-currency** deals (live distribution: IDR/SGD/USD/AUD; deal value is denominated in `deal.currency`). The app is **IDR-only** (`formatIDR` everywhere, `Lead.estimatedValue` Float). Storing `deal.value` raw made foreign deals show absurdly small "Rp" amounts (S$16,000 → "Rp 16.000"). Fix: `dealValueToIdr(deal.value, deal.currency)` in `importDeal`'s shared `owned{}` (covers CREATE+UPDATE, so all 3 sync triggers). Rates are a hardcoded `CURRENCY_TO_IDR` constant (estimates, not accounting); unknown currency imports as-is + warns rather than zeroing.
- **Rate-table changes never repair existing rows by themselves.** `importDeal` skips stale writes (Pipedrive `update_time` <= stored `pipedriveUpdatedAt`) AND the DB does not store currency, so a re-sync won't recompute unchanged deals. Repairing existing leads requires a **one-time backfill** that re-fetches deals from Pipedrive → converts → updates `estimatedValue` (paginate `/deals?status=open`; per-id `/deals/:id` for any tracked won/lost lead not in the open set). Same trap applies whenever you add a new currency rate later.

## Fail-soft enum option maps MUST skip the write when empty (region + any /dealFields-resolved field)
- Deal enum fields (e.g. **Region**) are resolved option-id → label via a map loaded once per sync from `/dealFields`, **fail-soft to an EMPTY map** on fetch error. The resolved value lives in the shared `owned{}` written on both CREATE and UPDATE.
- **Trap:** with an empty map every resolve returns null, so any deal whose `update_time` advanced during that sync gets its stored label overwritten with null — and because the same write advances `pipedriveUpdatedAt`, the stale-write skip then **blocks self-healing** (stays null until the deal is next edited in Pipedrive). Prod runs an auto-sync poll, so a transient Pipedrive hiccup makes this a when-not-if, not a maybe.
- **Rule:** when the option map is empty, **OMIT the field from `owned{}` entirely** (`...(map.size > 0 ? { field } : {})`) — never write null. Applies to any future /dealFields-sourced enum.
- **Region field key is env-overridable.** The Region custom-field key is read from env `PIPEDRIVE_REGION_FIELD_KEY` (trimmed) and falls back to the known production key when unset/blank. If the Pipedrive Region field is ever deleted and re-created (new key), set that env var instead of editing code.
- **Adding a new synced field still needs a one-time backfill** (same stale-write-skip reason as the currency section): paginate all deals, resolve, `updateMany` keyed on `pipedriveDealId` grouped by value. The exact same script runs dev vs prod purely via `DATABASE_URL` (use `$PROD_DATABASE_URL`); delete it after — it's a one-off.
