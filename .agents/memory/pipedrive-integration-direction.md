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

## Access / gating
- Backend admin endpoints (`status/sync/settings/stage-mappings`) gated to `ADMIN_ROLES=["MANAGEMENT"]`; `requireRole` auto-bypasses SUPER_ADMIN. FE settings card gate is `MANAGEMENT || SUPER_ADMIN` to match.
- Leads carry `pipedriveDealId`; the Leads page shows a "From Pipedrive" badge keyed on `pipedriveDealId != null`.
