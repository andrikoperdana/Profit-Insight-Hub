/**
 * Generate "SecureProfit Hub — Integrations Technical Guide (EN)".
 *
 * Deep technical documentation for the three external integrations:
 *   1. Xero Accounting (OAuth2, invoice push, payment sync)
 *   2. Pipedrive CRM (one-way lead import + webhook)
 *   3. AI Executive Copilot (deterministic facts + LLM narration)
 *
 * Run: `pnpm --filter @workspace/scripts run integrations-doc`
 * Output: <workspace>/exports/SecureProfit-Hub-Integrations-Technical-Guide-EN.docx
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageBreak,
} from "docx";

const FONT = "Calibri";
const MONO = "Consolas";
const ACCENT = "0F766E";       // teal-700
const STRIPE = "F1F5F9";       // slate-100
const BORDER = "CBD5E1";       // slate-300
const GREY = "64748B";         // slate-500
const CODEBG = "F8FAFC";       // slate-50

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = resolve(HERE, "../../exports");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 36, font: FONT })],
  });
}
function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 28, font: FONT })],
  });
}
function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT })],
  });
}
type Chunk = string | { text: string; bold?: boolean; code?: boolean };
function runsOf(parts: Chunk[] | string): TextRun[] {
  const arr = typeof parts === "string" ? [parts] : parts;
  return arr.map((c) => {
    if (typeof c === "string") return new TextRun({ text: c, font: FONT, size: 22 });
    return new TextRun({
      text: c.text,
      font: c.code ? MONO : FONT,
      size: c.code ? 20 : 22,
      bold: c.bold,
      shading: c.code ? { type: ShadingType.CLEAR, color: "auto", fill: CODEBG } : undefined,
    });
  });
}
function p(parts: Chunk[] | string): Paragraph {
  return new Paragraph({ spacing: { after: 100 }, children: runsOf(parts) });
}
function bullet(parts: Chunk[] | string, level = 0): Paragraph {
  return new Paragraph({ bullet: { level }, spacing: { after: 60 }, children: runsOf(parts) });
}
function numbered(parts: Chunk[] | string, ref: string, level = 0): Paragraph {
  return new Paragraph({
    numbering: { reference: ref, level },
    spacing: { after: 60 },
    children: runsOf(parts),
  });
}
function code(text: string): Paragraph[] {
  return text.split("\n").map((line, i, all) =>
    new Paragraph({
      spacing: { after: i === all.length - 1 ? 120 : 0 },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: CODEBG },
      indent: { left: 300 },
      children: [new TextRun({ text: line === "" ? " " : line, font: MONO, size: 18 })],
    }),
  );
}
function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}
function cell(text: string, opts: { bold?: boolean; shade?: string; widthPct?: number; mono?: boolean } = {}): TableCell {
  return new TableCell({
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shade } : undefined,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({
      children: [new TextRun({
        text,
        font: opts.mono ? MONO : FONT,
        size: opts.mono ? 18 : 20,
        bold: opts.bold,
        color: opts.bold && opts.shade === ACCENT ? "FFFFFF" : undefined,
      })],
    })],
  });
}
function table(headers: string[], rows: string[][], widths: number[], monoCols: number[] = []): Table {
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { bold: true, shade: ACCENT, widthPct: widths[i] })),
  });
  const body = rows.map((r, idx) => new TableRow({
    children: r.map((c, i) => cell(c, {
      shade: idx % 2 === 0 ? "FFFFFF" : STRIPE,
      widthPct: widths[i],
      mono: monoCols.includes(i),
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    },
    rows: [head, ...body],
  });
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

type Block = Paragraph | Table;
const doc: Block[] = [];

// ------------------------------ Cover --------------------------------------
doc.push(
  new Paragraph({ spacing: { before: 2400 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "SecureProfit Hub", bold: true, size: 56, color: ACCENT, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "Integrations Technical Guide", bold: true, size: 40, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Xero Accounting  •  Pipedrive CRM  •  AI Executive Copilot", italics: true, size: 24, color: GREY, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
    children: [new TextRun({ text: "How each integration is built, which files implement it, and how to set it up", size: 22, color: GREY, font: FONT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300 },
    children: [new TextRun({ text: `Version 1.0 — ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, size: 22, font: FONT })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ------------------------------ 1. Introduction ----------------------------
doc.push(h1("1. Introduction"));
doc.push(p("This guide documents the three external integrations of SecureProfit Hub at implementation level: what each one does, exactly which source files implement it, the environment variables it needs, its API endpoints, database models, runtime flows, error handling, and the setup steps required to make it work in a new environment."));
doc.push(p([{ text: "Audience: ", bold: true }, "developers and technical administrators. Reader is assumed to know the monorepo layout: ", { text: "artifacts/api-server", code: true }, " (Express backend), ", { text: "artifacts/web", code: true }, " (React frontend), ", { text: "lib/db", code: true }, " (Prisma schema & client), ", { text: "lib/api-spec", code: true }, " (OpenAPI contract that generates the React Query hooks and zod schemas)."]));
doc.push(h3("Integration summary"));
doc.push(table(
  ["Integration", "Direction", "Purpose", "Auth model"],
  [
    ["Xero Accounting", "Two-way (push invoices/contacts, pull payment status)", "Issue AR invoices from billing milestones; mark them PAID from Xero", "OAuth2 authorization-code with rotating refresh tokens"],
    ["Pipedrive CRM", "One-way (Pipedrive → app) + inbound webhook", "Import open sales deals as Leads in the Sales Pipeline", "Personal API token"],
    ["AI Executive Copilot", "Outbound only (facts → LLM)", "AI-narrated executive briefing for Management", "Replit AI gateway (OpenAI-compatible)"],
  ],
  [20, 27, 33, 20],
));
doc.push(spacer());
doc.push(p([{ text: "General rule: ", bold: true }, "every integration keeps its core logic in ", { text: "artifacts/api-server/src/lib/", code: true }, " and its HTTP endpoints in ", { text: "artifacts/api-server/src/routes/", code: true }, ". Routers are mounted in ", { text: "artifacts/api-server/src/routes/index.ts", code: true }, ". Secrets are read from environment variables only — never hardcoded and never logged."]));

doc.push(new Paragraph({ children: [new PageBreak()] }));

// ------------------------------ 2. Xero ------------------------------------
doc.push(h1("2. Xero Accounting Integration"));

doc.push(h2("2.1 What it does"));
doc.push(bullet("Pushes clients to Xero as Contacts and billing milestones as ACCREC (accounts receivable) invoices."));
doc.push(bullet("Reserves the sequential local invoice number (INV/YYYY/MM/NNNN) in the database BEFORE calling Xero, so numbering stays gap-safe even when the Xero call fails."));
doc.push(bullet("Pulls payment status back: when Xero reports an invoice with Status = PAID, the milestone flips to PAID automatically."));

doc.push(h2("2.2 File map"));
doc.push(table(
  ["File", "Responsibility"],
  [
    ["artifacts/api-server/src/lib/xero.ts", "Core logic: OAuth token exchange/refresh, signed state, Xero API wrapper, contact & invoice creation, payment sync, account/tax discovery"],
    ["artifacts/api-server/src/routes/xero.ts", "HTTP endpoints: status, connect-url, callback, disconnect, client sync, invoice push, manual payment sync"],
    ["artifacts/api-server/src/index.ts", "Background poller: runs payment sync every 30 minutes when auto-sync is enabled"],
    ["lib/db/prisma/schema.prisma", "Models: XeroConnection (singleton token row), Client.xeroContactId, BillingMilestone.xeroInvoiceId + xeroAmount* fields, AppSetting.xeroAutoSyncEnabled"],
    ["artifacts/web/src/pages/settings/index.tsx", "XeroIntegrationCard — Connect / Disconnect buttons and connection status"],
    ["artifacts/web/src/pages/projects/BillingTab.tsx", "\"Send to Xero\" per milestone and \"Sync from Xero\" manual pull"],
    ["artifacts/web/src/pages/clients/index.tsx", "\"Sync to Xero\" action per client row"],
    ["lib/api-spec (OpenAPI) → lib/api-zod, lib/api-client-react", "Generated request/response schemas and React Query hooks (e.g. xeroStatus)"],
  ],
  [42, 58],
  [0],
));

doc.push(h2("2.3 Setup: registering the app in Xero"));
doc.push(numbered(["Go to ", { text: "developer.xero.com", code: true }, " → My Apps → New app. Choose \"Web app\"."], "xero-setup"));
doc.push(numbered(["Set the OAuth 2.0 redirect URI to ", { text: "https://<your-domain>/api/xero/callback", code: true }, ". The server derives this automatically from the request host; override with ", { text: "XERO_REDIRECT_URI", code: true }, " only if the public URL differs."], "xero-setup"));
doc.push(numbered(["Copy the Client ID and Client Secret into the environment secrets ", { text: "XERO_CLIENT_ID", code: true }, " and ", { text: "XERO_CLIENT_SECRET", code: true }, "."], "xero-setup"));
doc.push(numbered(["Restart the API server, open Settings as Management/Super Admin, and press \"Connect to Xero\". Approve the requested scopes; you land back in the app with the tenant name shown."], "xero-setup"));
doc.push(p([{ text: "Requested scopes: ", bold: true }, { text: "accounting.invoices, accounting.contacts, accounting.settings.read, offline_access", code: true }, " (offline_access is what yields the refresh token)."]));

doc.push(h2("2.4 Environment variables"));
doc.push(table(
  ["Variable", "Required", "Purpose"],
  [
    ["XERO_CLIENT_ID", "Yes", "OAuth2 client id from the Xero developer portal"],
    ["XERO_CLIENT_SECRET", "Yes", "OAuth2 client secret"],
    ["SESSION_SECRET", "Yes", "HMAC-SHA256 key that signs the OAuth state parameter (fails closed if absent)"],
    ["XERO_REDIRECT_URI", "No", "Explicit callback URL; default is derived from the request host + /api/xero/callback"],
    ["XERO_SALES_ACCOUNT_CODE", "No", "Revenue account override; otherwise the code prefers Xero account code 200"],
    ["XERO_SALES_TAX_TYPE", "No", "Tax type override; otherwise discovered by matching the project's VAT percentage"],
  ],
  [30, 12, 58],
  [0],
));

doc.push(h2("2.5 OAuth2 connect flow"));
doc.push(numbered([{ text: "POST /api/xero/connect-url", code: true }, " (Management/Super Admin) — the server signs a time-limited state value containing the user id (HMAC-SHA256 with SESSION_SECRET) and returns the Xero authorize URL."], "xero-oauth"));
doc.push(numbered(["The browser visits the authorize URL and the user approves the scopes in Xero."], "xero-oauth"));
doc.push(numbered([{ text: "GET /api/xero/callback", code: true }, " — verifies the state signature, exchanges the code for tokens, resolves the tenant, and upserts everything into the ", { text: "XeroConnection", code: true }, " table (a singleton row with id \"default\": accessToken, refreshToken, expiresAt, tenantId, tenantName)."], "xero-oauth"));
doc.push(numbered(["If reconnecting to a DIFFERENT tenant, one atomic transaction clears every Client.xeroContactId and BillingMilestone.xeroInvoiceId so no stale cross-tenant references survive."], "xero-oauth"));
doc.push(p([{ text: "Token refresh: ", bold: true }, { text: "getValidAccessToken()", code: true }, " refreshes when the token is within 60 seconds of expiry. Because Xero rotates the refresh token on every use, refreshes are serialized across server instances with a Postgres advisory lock (", { text: "pg_advisory_xact_lock(0x58524f, 1)", code: true }, ") — two concurrent refreshes would otherwise invalidate each other's tokens."]));

doc.push(h2("2.6 Invoice push flow"));
doc.push(numbered(["User presses \"Send to Xero\" on a billing milestone (Billing tab). The frontend calls ", { text: "POST /api/billing-milestones/:milestoneId/xero-invoice", code: true }, "."], "xero-push"));
doc.push(numbered(["The route takes a per-milestone advisory lock (", { text: "pg_try_advisory_lock", code: true }, " on the milestone id) so double-clicks or two tabs cannot push the same milestone twice."], "xero-push"));
doc.push(numbered([{ text: "reserveInvoiceNumber()", code: true }, " allocates the next INV/YYYY/MM/NNNN and writes it onto the milestone first. The column is DB-unique; on a P2002 unique-violation it retries with the next number. The number is therefore reserved before Xero is ever called."], "xero-push"));
doc.push(numbered(["The client is ensured as a Xero Contact (created on demand, id cached in ", { text: "Client.xeroContactId", code: true }, ")."], "xero-push"));
doc.push(numbered([{ text: "createInvoice()", code: true }, " sends an ACCREC invoice with tax-inclusive line amounts (the gross milestone value). The revenue account comes from ", { text: "pickSalesAccountCode()", code: true }, " and the tax type from ", { text: "pickSalesTaxType()", code: true }, " (matched against the project's VAT percentage). Every call carries the ", { text: "Xero-tenant-id", code: true }, " header."], "xero-push"));
doc.push(numbered(["On success the milestone stores xeroInvoiceId and becomes INVOICED. On failure the reserved invoice number stays on the milestone, so the retry reuses it — no numbering gaps."], "xero-push"));

doc.push(h2("2.7 Payment sync"));
doc.push(bullet([{ text: "runPaymentSync()", code: true }, " fetches the pushed invoices from Xero in chunks and updates xeroAmountDue / xeroAmountPaid / xeroAmountCredited on each milestone."]));
doc.push(bullet(["A milestone flips to PAID (and ", { text: "paidAt", code: true }, " is stamped) only when Xero reports ", { text: "Status === \"PAID\"", code: true }, " — deliberately NOT on AmountDue = 0, because AmountDue can also be 0 for VOIDED, DELETED, or fully credited invoices."]));
doc.push(bullet(["Automatic: a 30-minute interval in ", { text: "artifacts/api-server/src/index.ts", code: true }, " runs the sync while ", { text: "AppSetting.xeroAutoSyncEnabled", code: true }, " is true. Manual: ", { text: "POST /api/xero/sync-payments", code: true }, " or the \"Sync from Xero\" button in the Billing tab."]));

doc.push(h2("2.8 Endpoints"));
doc.push(table(
  ["Method & path", "Access", "Purpose"],
  [
    ["GET /api/xero/status", "MGMT / Finance / Super Admin", "Connection status (tenant name, connected flag)"],
    ["POST /api/xero/connect-url", "MGMT / Finance / Super Admin", "Returns the Xero authorize URL with signed state"],
    ["GET /api/xero/callback", "Public (state-verified)", "OAuth redirect target; exchanges code, stores tokens"],
    ["POST /api/xero/disconnect", "MGMT / Finance / Super Admin", "Deletes the stored connection"],
    ["POST /api/clients/:id/xero-sync", "MGMT / Finance / Super Admin", "Creates/updates the client as a Xero Contact"],
    ["POST /api/billing-milestones/:milestoneId/xero-invoice", "MGMT / Finance / Super Admin / assigned PM", "Reserves the invoice number and pushes the invoice"],
    ["POST /api/xero/sync-payments", "MGMT / Finance / Super Admin", "Manual payment-status pull"],
  ],
  [42, 22, 36],
  [0],
));

doc.push(h2("2.9 Error handling & edge cases"));
doc.push(bullet("Xero validation errors (bad tax rate, archived account, …) are parsed out of the structured ValidationErrors response and surfaced as readable messages instead of a generic 502."));
doc.push(bullet("The OAuth token fetch is bounded with a 12-second AbortController timeout so a hung token endpoint cannot hold the refresh advisory lock indefinitely."));
doc.push(bullet("The OAuth state check fails closed: without a valid SESSION_SECRET signature the callback is rejected."));
doc.push(bullet("Reconnect to a new tenant wipes cached Xero ids atomically (see 2.5)."));

doc.push(new Paragraph({ children: [new PageBreak()] }));

// ------------------------------ 3. Pipedrive --------------------------------
doc.push(h1("3. Pipedrive CRM Integration"));

doc.push(h2("3.1 What it does"));
doc.push(bullet("One-way import: OPEN deals in Pipedrive become Leads in the Sales Pipeline kanban. The app never writes back to Pipedrive."));
doc.push(bullet(["Three triggers: a manual full sync (button in Settings), an optional 15-minute auto-sync poller in ", { text: "artifacts/api-server/src/index.ts", code: true }, " (gated by ", { text: "AppSetting.pipedriveAutoSyncEnabled", code: true }, ", default OFF, shares the same single-run claim guard), and an optional Pipedrive webhook that mirrors single-deal changes in near-real-time."]));
doc.push(bullet("Won leads are converted into DRAFT projects via the standard lead-convert endpoint; converted leads are never overwritten by later syncs."));

doc.push(h2("3.2 File map"));
doc.push(table(
  ["File", "Responsibility"],
  [
    ["artifacts/api-server/src/lib/pipedrive.ts", "REST client (x-api-token header), field mapping deal→Lead, currency conversion, full-sync orchestration, per-deal advisory lock, sync claim/stale logic"],
    ["artifacts/api-server/src/routes/pipedrive.ts", "Endpoints: status, sync (202 + fire-and-forget), settings, stage mappings, webhook"],
    ["artifacts/api-server/src/routes/leads.ts", "POST /api/leads/:id/convert — turns a WON lead into a DRAFT project"],
    ["artifacts/api-server/src/app.ts", "Exempts the webhook path from the production site gate so Pipedrive can reach it"],
    ["lib/db/prisma/schema.prisma", "Models: Lead (pipedriveDealId unique, pipedriveUpdatedAt), Client.pipedriveOrgId, PipedriveStageMapping, AppSetting keys (pipedriveSyncStartedAt/FinishedAt/Result, pipedriveDefaultOwnerId)"],
    ["artifacts/web/src/pages/settings/PipedriveIntegrationCard.tsx", "Status card, \"Sync now\" button, 3-second status polling, default-owner and stage-mapping editors"],
    ["artifacts/web/src/pages/leads/index.tsx", "Sales Pipeline kanban (NEW → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST) and the convert dialog"],
  ],
  [42, 58],
  [0],
));

doc.push(h2("3.3 Setup"));
doc.push(numbered(["In Pipedrive: Settings → Personal preferences → API → copy the personal API token."], "pd-setup"));
doc.push(numbered(["Set secrets ", { text: "PIPEDRIVE_API_TOKEN", code: true }, " and ", { text: "PIPEDRIVE_API_DOMAIN", code: true }, " (e.g. ", { text: "yourcompany.pipedrive.com", code: true }, ")."], "pd-setup"));
doc.push(numbered(["In the app: Settings → Pipedrive CRM (Management/Super Admin only) → set a Default Owner (fallback Sales user) and map Pipedrive stage IDs to app stages."], "pd-setup"));
doc.push(numbered(["Optional webhook: in Pipedrive create a webhook for deal events pointing to ", { text: "https://<your-domain>/api/pipedrive/webhook", code: true }, ". The shared secret is NOT an environment variable — it is stored in the database (", { text: "AppSetting.pipedriveWebhookSecret", code: true }, ") and configured via the Settings card (", { text: "PUT /api/pipedrive/settings", code: true }, "). Pipedrive must send it as the HTTP Basic password or a ", { text: "?token=", code: true }, " query parameter. Warning: while no secret is configured, the endpoint accepts unauthenticated pings (pre-setup phase) — set the secret before enabling the webhook in production."], "pd-setup"));

doc.push(h2("3.4 Environment variables"));
doc.push(table(
  ["Variable", "Required", "Purpose"],
  [
    ["PIPEDRIVE_API_TOKEN", "Yes", "Personal API token; sent as the x-api-token header"],
    ["PIPEDRIVE_API_DOMAIN", "Yes", "Company Pipedrive domain the /api/v1 calls are made against"],
    ["PIPEDRIVE_REGION_FIELD_KEY", "No", "Custom-field key that maps a Pipedrive field to Lead.region"],
  ],
  [34, 14, 52],
  [0],
));

doc.push(h2("3.5 Full sync flow (202 + polling)"));
doc.push(p("A full import can take several minutes against a remote database — longer than the deployment's hard request timeout. The sync is therefore asynchronous:"));
doc.push(numbered([{ text: "POST /api/pipedrive/sync", code: true }, " only CLAIMS the run: an advisory lock plus the AppSetting pair pipedriveSyncStartedAt / pipedriveSyncFinishedAt guarantee a single global run. A run stuck for more than 20 minutes is treated as stale and can be re-claimed (crash recovery)."], "pd-sync"));
doc.push(numbered(["The route returns 202 Accepted immediately and fires ", { text: "runPipedriveSyncJob()", code: true }, " without awaiting it."], "pd-sync"));
doc.push(numbered(["The job fetches ", { text: "/deals?status=open", code: true }, " (paginated) and imports each deal individually; one bad deal is recorded in the result but does not abort the batch."], "pd-sync"));
doc.push(numbered(["The frontend polls ", { text: "GET /api/pipedrive/status", code: true }, " every 3 seconds until running=false, then shows the per-deal result summary (imported / updated / skipped / failed)."], "pd-sync"));

doc.push(h2("3.6 Field mapping (deal → Lead)"));
doc.push(table(
  ["Pipedrive field", "Lead field", "Notes"],
  [
    ["title", "title", "Fallback \"Pipedrive Deal <id>\" when empty"],
    ["value + currency", "estimatedValue", "Converted to IDR via the static CURRENCY_TO_IDR rate table; unknown currencies import the raw value with a warning"],
    ["user_id (owner)", "ownerId", "Matched by lowercase email against active SALES users; falls back to the configured default owner; otherwise the deal fails with OwnerUnresolvedError"],
    ["org_id", "clientId", "Matched via Client.pipedriveOrgId; a new Client is created when no match exists"],
    ["person_id", "contactName / contactEmail / contactPhone", "Primary email and phone are taken"],
    ["stage_id", "stage", "Looked up in the PipedriveStageMapping table (editable in Settings)"],
    ["custom region field", "region", "Only when PIPEDRIVE_REGION_FIELD_KEY is configured"],
  ],
  [24, 24, 52],
  [0, 1],
));
doc.push(spacer());
doc.push(p([{ text: "Idempotency: ", bold: true }, { text: "Lead.pipedriveDealId", code: true }, " is DB-unique; each import takes a per-deal advisory lock (webhook and full sync cannot race); a stale-write guard skips the update when the deal's update_time in Pipedrive is not newer than the stored ", { text: "pipedriveUpdatedAt", code: true }, "; converted leads are terminal and always skipped."]));

doc.push(h2("3.7 Webhook flow"));
doc.push(bullet([{ text: "POST /api/pipedrive/webhook", code: true }, " is public but secret-guarded: the secret stored in ", { text: "AppSetting.pipedriveWebhookSecret", code: true }, " must match via HTTP Basic password or token query parameter, compared with ", { text: "timingSafeEqual", code: true }, ". While no secret is configured the endpoint accepts pings unauthenticated (pre-setup phase). It is also exempted from the production site gate in app.ts."]));
doc.push(bullet("On a valid ping the server re-fetches that single deal from the Pipedrive API (the ping body is never trusted as data) and runs the same importDeal() path as the full sync."));

doc.push(h2("3.8 Lead lifecycle after import"));
doc.push(bullet("Kanban stages: NEW → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST (Sales Pipeline page, Sales role)."));
doc.push(bullet([{ text: "POST /api/leads/:id/convert", code: true }, " (the only way Sales can create a project) is restricted to the Sales user who owns the lead (Super Admin bypasses). It validates the lead is not yet converted, then creates a DRAFT project carrying clientId and salesId; pmId stays empty until Management assigns one."]));

doc.push(h2("3.9 Endpoints"));
doc.push(table(
  ["Method & path", "Access", "Purpose"],
  [
    ["GET /api/pipedrive/status", "MGMT / Super Admin", "Config + connection + sync progress/result"],
    ["POST /api/pipedrive/sync", "MGMT / Super Admin", "Claim & start a full import (202)"],
    ["PUT /api/pipedrive/settings", "MGMT / Super Admin", "Default owner and other sync settings"],
    ["GET/PUT /api/pipedrive/stage-mappings", "MGMT / Super Admin", "Read/update Pipedrive-stage → app-stage map"],
    ["POST /api/pipedrive/webhook", "Public + shared secret", "Single-deal near-real-time mirror"],
    ["POST /api/leads/:id/convert", "Sales owner only (Super Admin bypass)", "Convert a WON lead into a DRAFT project"],
  ],
  [40, 24, 36],
  [0],
));

doc.push(new Paragraph({ children: [new PageBreak()] }));

// ------------------------------ 4. AI Executive Copilot ---------------------
doc.push(h1("4. AI Executive Copilot"));

doc.push(h2("4.1 What it does"));
doc.push(p("A Management-only briefing page (not a chatbot). The server computes every number deterministically from the database, sends only that pre-aggregated fact sheet to the LLM, and the model writes the narrative prose plus a Top-5 recommended-actions list. The AI can phrase, but never invent, a number."));

doc.push(h2("4.2 File map"));
doc.push(table(
  ["File", "Responsibility"],
  [
    ["artifacts/api-server/src/lib/executive-copilot.ts", "buildExecutiveCopilotFacts() — all deterministic aggregation (portfolio, health, utilization, cash flow, risk lists)"],
    ["artifacts/api-server/src/routes/executive-copilot.ts", "Endpoints, system prompt, LLM call, zod validation, deterministic overwrite, cache & single-flight"],
    ["artifacts/api-server/src/lib/executive-copilot-pdf.ts", "PDF export of the current briefing (PDFKit)"],
    ["artifacts/web/src/pages/executive-copilot/index.tsx", "Briefing page: Generate/Refresh button, health hero, metric sections, Top 5 actions, PDF download"],
    ["lib/api-spec (OpenAPI) → lib/api-zod", "GenerateExecutiveBriefingResponse schema used to validate the LLM output"],
  ],
  [44, 56],
  [0],
));

doc.push(h2("4.3 Deterministic facts (buildExecutiveCopilotFacts)"));
doc.push(bullet("Portfolio: project counts (total/active/client), total contract value, recognized revenue (percentage-of-completion), actual cost, profit."));
doc.push(bullet(["Portfolio health: weighted average of the per-project ", { text: "computeHealthScore()", code: true }, " from serializers.ts — the same score shown on the dashboards, so the briefing can never disagree with the rest of the app."]));
doc.push(bullet("Utilization: headcount, billable-active, idle, and overloaded staff from a 7-day rolling window of approved timesheets."));
doc.push(bullet("Cash flow: planned inflows for the next 30/90 days, outstanding invoices, payments received in the last 90 days."));
doc.push(bullet("Risk lists: top 10 delayed projects (past their end date) and top 10 high-risk projects (open Critical/High RAID items)."));

doc.push(h2("4.4 LLM call"));
doc.push(bullet(["Provider: the Replit AI integration via ", { text: "@workspace/integrations-openai-ai-server", code: true }, " (OpenAI-compatible client, credentials injected by the platform — no API key to manage). Model: ", { text: "gpt-5.4", code: true }, "."]));
doc.push(bullet("A fixed system prompt defines the persona and hard rules: use only the provided facts, IDR currency formatting, no markdown, no emojis, and a strict JSON output shape."));
doc.push(bullet(["The response is parsed and validated against the generated zod schema (", { text: "GenerateExecutiveBriefingResponse", code: true }, "); recommendedActions is defensively sliced to 5 items."]));
doc.push(bullet(["Deterministic overwrite: after validation the server replaces the model's ", { text: "portfolioHealthScore", code: true }, " and ", { text: "healthLabel", code: true }, " with the computed values — whatever the model echoed is discarded."]));

doc.push(h2("4.5 Endpoints, caching, and cost control"));
doc.push(table(
  ["Method & path", "Purpose"],
  [
    ["POST /api/executive-copilot/briefing/generate", "Button-driven fresh generation (the only call that costs AI tokens). Single-flight: concurrent requests share one pending LLM call."],
    ["GET /api/executive-copilot/briefing", "Returns the cached briefing only; never triggers the LLM."],
    ["GET /api/executive-copilot/briefing/export.pdf", "Streams the current briefing as a PDF."],
  ],
  [46, 54],
  [0],
));
doc.push(spacer());
doc.push(bullet("The last result is cached at module level (one briefing portfolio-wide, not per user)."));
doc.push(bullet("A briefing older than 10 minutes is still served but flagged stale so the UI can suggest a refresh."));
doc.push(bullet("There is no scheduler — generation happens only when a user presses the button, which keeps AI cost explicit and bounded."));

doc.push(h2("4.6 Privacy & security guardrails"));
doc.push(bullet("Only the pre-aggregated fact sheet goes to the LLM — never documents, daily rates, or raw timesheet rows."));
doc.push(bullet("The provider response body is never logged (it may echo commercial figures); only its length is recorded."));
doc.push(bullet(["Role gate: every endpoint checks ", { text: "isExecutive()", code: true }, " — MANAGEMENT or SUPER_ADMIN only; everyone else gets 403."]));

doc.push(h2("4.7 UI behavior"));
doc.push(bullet("Header button reads \"Generate Briefing\" when no cache exists and \"Refresh Briefing\" afterwards, with a loading spinner during generation."));
doc.push(bullet("Sections: health hero card, then Revenue, Margin, Utilization, Cash Flow, and Invoices — each pairing deterministic metric tiles with the AI narrative paragraph."));
doc.push(bullet("The Top 5 Actions card lists the model's recommendations with HIGH / MEDIUM / LOW priority badges."));

doc.push(new Paragraph({ children: [new PageBreak()] }));

// ------------------------------ 5. Cross-cutting patterns -------------------
doc.push(h1("5. Cross-Cutting Patterns"));
doc.push(p("Conventions shared by all three integrations — follow them when adding a new one:"));
doc.push(bullet([{ text: "Secrets via environment variables only. ", bold: true }, "Read with process.env at the point of use; a missing secret disables the feature gracefully (status endpoints report \"not configured\") instead of crashing the server."]));
doc.push(bullet([{ text: "Postgres advisory locks for cross-instance concurrency. ", bold: true }, "Token refresh (Xero), per-milestone invoice push (Xero), per-deal import and the global sync claim (Pipedrive) all serialize through pg advisory locks, because an autoscale deployment can run several server instances at once."]));
doc.push(bullet([{ text: "Reserve-then-call for external writes. ", bold: true }, "Anything that must stay consistent locally (e.g. invoice numbers) is committed to the database before the external API call, so failures are retryable without gaps or duplicates."]));
doc.push(bullet([{ text: "Long jobs are claimed, not awaited. ", bold: true }, "Work that can exceed the request timeout returns 202 with a status endpoint to poll."]));
doc.push(bullet([{ text: "Careful logging. ", bold: true }, "Provider response bodies are never logged (they may echo tokens or commercial figures); critical call paths such as the Xero token fetch are additionally bounded with explicit timeouts."]));
doc.push(bullet([{ text: "Contract-first API. ", bold: true }, "New endpoints are declared in lib/api-spec (OpenAPI) and clients regenerate hooks/schemas with: pnpm --filter @workspace/api-spec run codegen."]));

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const numbering = {
  config: ["xero-setup", "xero-oauth", "xero-push", "pd-setup", "pd-sync"].map((ref) => ({
    reference: ref,
    levels: [{
      level: 0,
      format: "decimal" as const,
      text: "%1.",
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 360, hanging: 260 } } },
    }],
  })),
};

async function main(): Promise<void> {
  const document = new Document({
    creator: "SecureProfit Hub",
    title: "SecureProfit Hub — Integrations Technical Guide",
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering,
    sections: [{ children: doc }],
  });
  const buf = await Packer.toBuffer(document);
  const out = resolve(EXPORTS_DIR, "SecureProfit-Hub-Integrations-Technical-Guide-EN.docx");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`Wrote ${out} (${buf.length.toLocaleString()} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
