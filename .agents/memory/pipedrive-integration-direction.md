---
name: Pipedrive integration direction
description: Chosen direction and rationale for a (deferred) Pipedrive CRM integration.
---

# Pipedrive integration direction

Decision: if/when a Pipedrive integration is built, do **one-way Import (Pipedrive → app)** — not export, not two-way sync.

**Why:** The firm's sales team works day-to-day inside Pipedrive (paid, familiar). The app already has its own internal Leads pipeline, so the goal is to mirror Pipedrive deals into the app without double entry. Two-way sync was judged overkill/high-risk (conflict handling, webhook loops, stage/user mapping) unless two teams work in parallel. Export-only is usually not worth a paid Pipedrive seat just to store data.

**How to apply (Phase 1 plan — agreed but deferred, NOT yet built):**
- Connect via the Replit OAuth connector `connector_catalog:pipedrive` (status `requires_setup`; call `proposeIntegration` when building). No manual API keys (unlike Xero, which uses `XERO_CLIENT_ID/SECRET` env secrets).
- Map: Pipedrive Deal → Lead; pipeline stages → `LeadStage` (NEW/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST) via a **configurable** mapping (companies customize their stages); deal owner → Sales user matched by email; Organization/Person → Client + contact.
- Add link columns analogous to `Client.xeroContactId` (e.g. `Lead.pipedriveDealId` unique, `Client.pipedriveOrgId`).
- Sync via Pipedrive webhooks (real-time) + polling fallback; one-time backfill of open/won deals. Webhook reliability pattern can mirror the existing Xero integration.
- A WON deal lands as a Lead in WON stage, then flows through the existing convert-to-Project flow — fits the Sales "create project only from a won lead" lock.
- UI: connection status, "Sync now" button, "From Pipedrive" badge; synced fields read-only.

Status: user approved the Import direction but chose NOT to start building yet (keep the plan for later).
