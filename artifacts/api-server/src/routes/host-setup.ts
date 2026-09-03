import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import https from "node:https";
import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { APP_SETTINGS_ID } from "../lib/app-settings.js";
import {
  deleteStalePipedriveWebhook,
  pipedriveConfigured,
  replaceManagedPipedriveWebhook,
} from "../lib/pipedrive.js";
import { xeroConfigured } from "../lib/xero.js";

const router: IRouter = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

export function normalizePublicOrigin(value: unknown): string {
  if (typeof value !== "string") throw new Error("Public host is required");
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Public host must use HTTPS");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Public host cannot contain credentials, query, or fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Enter only the server origin, without a path");
  }
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    isIP(url.hostname)
  ) {
    throw new Error("Public host must use a public DNS hostname");
  }
  return url.origin;
}

function endpoints(baseUrl: string | null | undefined) {
  if (!baseUrl) return null;
  return {
    xeroCallback: `${baseUrl}/api/xero/callback`,
    xeroWebhook: `${baseUrl}/api/xero/webhook`,
    pipedriveWebhook: `${baseUrl}/api/pipedrive/webhook`,
  };
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  ) {
    return true;
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) ||
    (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
    (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    parts[0] >= 224
  );
}

export async function probeHealth(origin: string, address: string, family: number): Promise<number> {
  const url = new URL(origin);
  return await new Promise<number>((resolve, reject) => {
    const request = https.request(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: url.port || 443,
        path: "/api/healthz",
        method: "GET",
        servername: url.hostname,
        headers: {
          Host: url.host,
          "X-SecureProfit-Client": "host-setup",
        },
        // Pin this TLS connection to the already-vetted DNS result. This
        // prevents a second resolver lookup from being DNS-rebound to an
        // internal address after validation.
        lookup: (_hostname, _options, callback) => {
          callback(null, address, family);
        },
        timeout: 8_000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.once("timeout", () => request.destroy(new Error("Health check timed out")));
    request.once("error", reject);
    request.end();
  });
}

async function settings() {
  return prisma.appSetting.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID },
    update: {},
  });
}

router.get("/host-setup", async (_req, res) => {
  const row = await settings();
  res.json({
    activeHost: row.integrationPublicBaseUrl,
    draftHost: row.integrationDraftBaseUrl,
    previousHost: row.integrationPreviousBaseUrl,
    draftValidatedAt: row.integrationDraftValidatedAt,
    endpoints: endpoints(row.integrationDraftBaseUrl ?? row.integrationPublicBaseUrl),
    xero: {
      configured: xeroConfigured(),
      redirectUriEnvironmentConfigured: Boolean(
        process.env["XERO_REDIRECT_URI"]?.trim() ||
          process.env["APP_BASE_URL"]?.trim(),
      ),
      webhookKeyConfigured: Boolean(process.env["XERO_WEBHOOK_KEY"]?.trim()),
    },
    pipedrive: {
      configured: await pipedriveConfigured(),
      managedWebhookId: row.pipedriveManagedWebhookId,
      managedWebhookUrl: row.pipedriveManagedWebhookUrl,
      webhookSecretConfigured: Boolean(row.pipedriveWebhookSecret),
      staleWebhookIds: row.pipedriveStaleWebhookIds,
      cleanupError: row.pipedriveWebhookCleanupError,
      cleanupFailedAt: row.pipedriveWebhookCleanupFailedAt,
    },
  });
});

router.put("/host-setup/draft", async (req, res) => {
  let host: string;
  try {
    host = normalizePublicOrigin(req.body?.host);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  const before = await settings();
  const saved = await prisma.appSetting.update({
    where: { id: APP_SETTINGS_ID },
    data: {
      integrationDraftBaseUrl: host,
      integrationDraftValidatedAt: null,
      updatedById: req.user!.sub,
    },
  });
  await recordAudit(req, {
    action: "host_setup.draft_saved",
    entityType: "AppSetting",
    entityId: APP_SETTINGS_ID,
    description: `Saved deployment host draft ${host}`,
    before: { draftHost: before.integrationDraftBaseUrl },
    after: { draftHost: host },
  });
  res.json({ draftHost: host, endpoints: endpoints(host) });
});

router.post("/host-setup/validate", async (req, res) => {
  const row = await settings();
  if (!row.integrationDraftBaseUrl) {
    res.status(409).json({ error: "Save a draft host first" });
    return;
  }
  const url = new URL(row.integrationDraftBaseUrl);
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0) {
    res.status(422).json({ error: "Host DNS did not resolve" });
    return;
  }
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    res.status(422).json({ error: "Host resolves to a private or loopback address" });
    return;
  }
  try {
    const target = addresses[0]!;
    const status = await probeHealth(url.origin, target.address, target.family);
    if (status < 200 || status >= 300) {
      res.status(422).json({ error: `Health check returned HTTP ${status}` });
      return;
    }
  } catch (error) {
    res.status(422).json({
      error: `Health check failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    return;
  }
  const validatedAt = new Date();
  await prisma.appSetting.update({
    where: { id: APP_SETTINGS_ID },
    data: { integrationDraftValidatedAt: validatedAt, updatedById: req.user!.sub },
  });
  await recordAudit(req, {
    action: "host_setup.validated",
    entityType: "AppSetting",
    entityId: APP_SETTINGS_ID,
    description: `Validated deployment host ${url.origin}`,
    after: { host: url.origin, validatedAt },
  });
  res.json({ valid: true, host: url.origin, validatedAt, endpoints: endpoints(url.origin) });
});

router.post("/host-setup/pipedrive/repair", async (req, res) => {
  const row = await settings();
  if (!row.integrationDraftBaseUrl || !row.integrationDraftValidatedAt) {
    res.status(409).json({ error: "Validate the draft host first" });
    return;
  }
  if (!(await pipedriveConfigured())) {
    res.status(409).json({ error: "Pipedrive is not configured on the server" });
    return;
  }
  const secret = row.pipedriveWebhookSecret ?? randomBytes(32).toString("hex");
  const url = `${row.integrationDraftBaseUrl}/api/pipedrive/webhook`;
  const webhook = await replaceManagedPipedriveWebhook({
    subscriptionUrl: url,
    secret,
    previousId: row.pipedriveManagedWebhookId,
  });
  const staleWebhookIds = Array.from(
    new Set(
      [
        ...row.pipedriveStaleWebhookIds,
        ...(webhook.staleWebhookId ? [webhook.staleWebhookId] : []),
      ].filter((id) => id !== webhook.id),
    ),
  );
  await prisma.appSetting.update({
    where: { id: APP_SETTINGS_ID },
    data: {
      pipedriveWebhookSecret: secret,
      pipedriveManagedWebhookId: webhook.id,
      pipedriveManagedWebhookUrl: webhook.url,
      pipedriveStaleWebhookIds: staleWebhookIds,
      pipedriveWebhookCleanupError: webhook.cleanupError,
      pipedriveWebhookCleanupFailedAt: webhook.cleanupError ? new Date() : null,
      updatedById: req.user!.sub,
    },
  });
  await recordAudit(req, {
    action: "host_setup.pipedrive_webhook_repaired",
    entityType: "AppSetting",
    entityId: APP_SETTINGS_ID,
    description: `Registered managed Pipedrive webhook for ${row.integrationDraftBaseUrl}`,
    after: webhook,
  });
  res.json(webhook);
});

router.post("/host-setup/pipedrive/cleanup", async (req, res) => {
  const row = await settings();
  if (!(await pipedriveConfigured())) {
    res.status(409).json({ error: "Pipedrive is not configured on the server" });
    return;
  }
  const staleIds = row.pipedriveStaleWebhookIds.filter(
    (id) => id !== row.pipedriveManagedWebhookId,
  );

  const failed: string[] = [];
  let lastError: string | null = null;
  for (const staleId of staleIds) {
    try {
      await deleteStalePipedriveWebhook({
        staleId,
        managedId: row.pipedriveManagedWebhookId,
      });
    } catch (error) {
      failed.push(staleId);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  await prisma.appSetting.update({
    where: { id: APP_SETTINGS_ID },
    data: {
      pipedriveStaleWebhookIds: failed,
      pipedriveWebhookCleanupError: lastError?.slice(0, 1000) ?? null,
      pipedriveWebhookCleanupFailedAt: lastError ? new Date() : null,
      updatedById: req.user!.sub,
    },
  });
  await recordAudit(req, {
    action: "host_setup.pipedrive_webhook_cleanup_retried",
    entityType: "AppSetting",
    entityId: APP_SETTINGS_ID,
    description: failed.length
      ? `Pipedrive stale webhook cleanup retried with ${failed.length} failure(s)`
      : "Pipedrive stale webhook cleanup completed",
    before: { staleWebhookIds: row.pipedriveStaleWebhookIds },
    after: { staleWebhookIds: failed },
  });
  res.json({ cleaned: staleIds.length - failed.length, remaining: failed.length });
});

router.post("/host-setup/activate", async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } });
    if (!before?.integrationDraftBaseUrl || !before.integrationDraftValidatedAt) return null;
    const saved = await tx.appSetting.update({
      where: { id: APP_SETTINGS_ID },
      data: {
        integrationPreviousBaseUrl: before.integrationPublicBaseUrl,
        integrationPublicBaseUrl: before.integrationDraftBaseUrl,
        integrationDraftBaseUrl: null,
        integrationDraftValidatedAt: null,
        updatedById: req.user!.sub,
      },
    });
    return { before, saved };
  });
  if (!result) {
    res.status(409).json({ error: "Validate the draft host before activation" });
    return;
  }
  const { before, saved } = result;
  await recordAudit(req, {
    action: "host_setup.activated",
    entityType: "AppSetting",
    entityId: APP_SETTINGS_ID,
    description: `Activated integration public host ${saved.integrationPublicBaseUrl}`,
    before: { activeHost: before.integrationPublicBaseUrl },
    after: { activeHost: saved.integrationPublicBaseUrl },
  });
  res.json({ activeHost: saved.integrationPublicBaseUrl, previousHost: saved.integrationPreviousBaseUrl });
});

router.post("/host-setup/restore", async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } });
    if (!before?.integrationPreviousBaseUrl) return null;
    const saved = await tx.appSetting.update({
      where: { id: APP_SETTINGS_ID },
      data: {
        integrationPublicBaseUrl: before.integrationPreviousBaseUrl,
        integrationPreviousBaseUrl: before.integrationPublicBaseUrl,
        integrationDraftBaseUrl: null,
        integrationDraftValidatedAt: null,
        updatedById: req.user!.sub,
      },
    });
    return { before, saved };
  });
  if (!result) {
    res.status(409).json({ error: "No previous host is available" });
    return;
  }
  const { before, saved } = result;
  await recordAudit(req, {
    action: "host_setup.restored",
    entityType: "AppSetting",
    entityId: APP_SETTINGS_ID,
    description: `Restored integration public host ${saved.integrationPublicBaseUrl}`,
    before: { activeHost: before.integrationPublicBaseUrl },
    after: { activeHost: saved.integrationPublicBaseUrl },
  });
  res.json({ activeHost: saved.integrationPublicBaseUrl, previousHost: saved.integrationPreviousBaseUrl });
});

export default router;