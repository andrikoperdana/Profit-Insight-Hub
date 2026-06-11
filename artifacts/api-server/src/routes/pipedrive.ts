import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import {
  UpdatePipedriveSettingsBody,
  UpdatePipedriveStageMappingsBody,
} from "@workspace/api-zod";
import { recordAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { APP_SETTINGS_ID } from "../lib/app-settings.js";
import {
  pipedriveConfigured,
  runFullSync,
  syncSingleDeal,
  listPipedriveStages,
  PipedriveNotConnectedError,
  type LeadStage,
} from "../lib/pipedrive.js";

const router: IRouter = Router();

// Pipedrive is an admin-managed integration. requireAuth is applied per-route
// (not via router.use) because POST /pipedrive/webhook is unauthenticated — it
// authenticates via a shared secret instead of a Bearer token.
const ADMIN_ROLES = ["MANAGEMENT"] as const;

type AuthedRequest = Request & { user: NonNullable<Request["user"]> };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface StageMappingRow {
  id: string;
  pipedrivePipelineId: number;
  pipedriveStageId: number;
  leadStage: string;
  label: string | null;
  updatedAt: Date;
}

function serializeMapping(m: StageMappingRow) {
  return {
    id: m.id,
    pipedrivePipelineId: m.pipedrivePipelineId,
    pipedriveStageId: m.pipedriveStageId,
    leadStage: m.leadStage,
    label: m.label,
    updatedAt: m.updatedAt.toISOString(),
  };
}

async function buildStatus() {
  const [connected, settings, importedLeadCount, linkedClientCount, stageMappingCount] =
    await Promise.all([
      pipedriveConfigured(),
      prisma.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } }),
      prisma.lead.count({ where: { pipedriveDealId: { not: null } } }),
      prisma.client.count({ where: { pipedriveOrgId: { not: null } } }),
      prisma.pipedriveStageMapping.count(),
    ]);
  return {
    connected,
    autoSyncEnabled: settings?.pipedriveAutoSyncEnabled ?? false,
    lastSyncAt: settings?.pipedriveLastSyncAt?.toISOString() ?? null,
    defaultOwnerId: settings?.pipedriveDefaultOwnerId ?? null,
    importedLeadCount,
    linkedClientCount,
    stageMappingCount,
  };
}

router.get(
  "/pipedrive/status",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (_req, res: Response) => {
    res.json(await buildStatus());
  },
);

router.post(
  "/pipedrive/sync",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    try {
      const result = await runFullSync();
      await recordAudit(req, {
        action: "pipedrive.synced",
        entityType: "System",
        entityId: "pipedrive",
        description: `Ran a Pipedrive import (created ${result.imported}, updated ${result.updated}, skipped ${result.skipped}, errors ${result.errors.length})`,
        after: {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          errorCount: result.errors.length,
        },
      });
      res.json(result);
    } catch (e) {
      if (e instanceof PipedriveNotConnectedError) {
        res.status(409).json({ error: "Pipedrive is not connected" });
        return;
      }
      req.log.error({ err: e }, "Pipedrive sync failed");
      res.status(500).json({ error: errorMessage(e) });
    }
  },
);

router.put(
  "/pipedrive/settings",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  validateBody(UpdatePipedriveSettingsBody),
  async (req: AuthedRequest, res: Response) => {
    const body = req.body as { autoSyncEnabled?: boolean; defaultOwnerId?: string | null };
    const updates: {
      pipedriveAutoSyncEnabled?: boolean;
      pipedriveDefaultOwnerId?: string | null;
    } = {};

    if (typeof body.autoSyncEnabled === "boolean") {
      updates.pipedriveAutoSyncEnabled = body.autoSyncEnabled;
    }
    if (body.defaultOwnerId !== undefined) {
      if (body.defaultOwnerId) {
        const owner = await prisma.user.findFirst({
          where: { id: body.defaultOwnerId, role: "SALES", isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!owner) {
          res.status(400).json({ error: "Default owner must be an active Sales user" });
          return;
        }
      }
      updates.pipedriveDefaultOwnerId = body.defaultOwnerId;
    }

    await prisma.appSetting.upsert({
      where: { id: APP_SETTINGS_ID },
      create: { id: APP_SETTINGS_ID, ...updates },
      update: updates,
    });
    await recordAudit(req, {
      action: "pipedrive.settings_updated",
      entityType: "AppSetting",
      entityId: APP_SETTINGS_ID,
      description: "Updated Pipedrive integration settings",
      after: updates,
    });
    res.json(await buildStatus());
  },
);

async function stageMappingsResponse(req: Request) {
  const rows = await prisma.pipedriveStageMapping.findMany({
    orderBy: [{ pipedrivePipelineId: "asc" }, { pipedriveStageId: "asc" }],
  });
  let stages:
    | { id: number; name: string | null; pipelineId: number | null; orderNr: number | null }[]
    | null = null;
  try {
    const live = await listPipedriveStages();
    stages = live.map((s) => ({
      id: s.id,
      name: s.name ?? null,
      pipelineId: s.pipeline_id ?? null,
      orderNr: s.order_nr ?? null,
    }));
  } catch (e) {
    if (!(e instanceof PipedriveNotConnectedError)) {
      req.log.warn({ err: e }, "Failed to list Pipedrive stages");
    }
  }
  return { mappings: rows.map(serializeMapping), stages };
}

router.get(
  "/pipedrive/stage-mappings",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response) => {
    res.json(await stageMappingsResponse(req));
  },
);

router.put(
  "/pipedrive/stage-mappings",
  requireAuth,
  requireRole(...ADMIN_ROLES),
  validateBody(UpdatePipedriveStageMappingsBody),
  async (req: AuthedRequest, res: Response) => {
    const body = req.body as {
      mappings: {
        pipedrivePipelineId: number;
        pipedriveStageId: number;
        leadStage: LeadStage;
        label?: string | null;
      }[];
    };

    await prisma.$transaction(
      body.mappings.map((m) =>
        prisma.pipedriveStageMapping.upsert({
          where: { pipedriveStageId: m.pipedriveStageId },
          create: {
            pipedrivePipelineId: m.pipedrivePipelineId,
            pipedriveStageId: m.pipedriveStageId,
            leadStage: m.leadStage as Prisma.PipedriveStageMappingCreateInput["leadStage"],
            label: m.label ?? null,
          },
          update: {
            pipedrivePipelineId: m.pipedrivePipelineId,
            leadStage: m.leadStage as Prisma.PipedriveStageMappingCreateInput["leadStage"],
            label: m.label ?? null,
          },
        }),
      ),
    );
    await recordAudit(req, {
      action: "pipedrive.stage_mappings_updated",
      entityType: "PipedriveStageMapping",
      description: `Updated ${body.mappings.length} Pipedrive stage mapping(s)`,
    });
    res.json(await stageMappingsResponse(req));
  },
);

// ---------------------------------------------------------------------------
// Inbound webhook (UNAUTHENTICATED). Pipedrive sends a ping on deal changes;
// we treat it as a hint and re-fetch the deal by id (never trust the payload
// body as the source of truth). Auth is a shared secret compared in constant
// time; when no secret is configured the endpoint accepts (pre-setup phase).
// ---------------------------------------------------------------------------

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function webhookSecretMatches(req: Request, configured: string): boolean {
  // Pipedrive HTTP Basic auth: Authorization: Basic base64(user:password).
  const header = req.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (constantTimeEqual(password, configured)) return true;
    } catch {
      // fall through to query token
    }
  }
  const token = req.query["token"];
  if (typeof token === "string" && constantTimeEqual(token, configured)) return true;
  return false;
}

function extractDealId(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;
  const meta = b["meta"] as Record<string, any> | undefined;
  // v1: meta.object === "deal", meta.id ; v2: meta.entity === "deal", meta.entity_id
  const objectKind = (meta?.["object"] ?? meta?.["entity"]) as string | undefined;
  if (objectKind && objectKind !== "deal") return null;
  const candidates = [
    meta?.["id"],
    meta?.["entity_id"],
    b["current"]?.["id"],
    b["data"]?.["id"],
  ];
  for (const c of candidates) {
    const n = typeof c === "string" ? Number(c) : c;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
}

router.post("/pipedrive/webhook", async (req: Request, res: Response) => {
  const settings = await prisma.appSetting.findUnique({ where: { id: APP_SETTINGS_ID } });
  const secret = settings?.pipedriveWebhookSecret ?? null;
  if (secret && !webhookSecretMatches(req, secret)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const dealId = extractDealId(req.body);
  // Always 200 so Pipedrive doesn't retry; processing happens out-of-band.
  res.json({ received: true });
  if (dealId == null) return;
  void syncSingleDeal(dealId).catch((e) => {
    if (e instanceof PipedriveNotConnectedError) return;
    logger.warn({ err: e, dealId }, "Pipedrive webhook import failed");
  });
});

export default router;
