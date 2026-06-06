import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Client Progress Portal
//
// A read-only, no-login shareable link that lets a client view a single
// project's high-level progress. Security model mirrors the public survey:
//   - access is via an unguessable random token (no enumeration)
//   - the public endpoint returns ONLY whitelisted fields — never cost,
//     margin, consultant rates, expenses, RAID, or timesheets
//   - the public endpoint and page are mounted before the blanket-auth routers
//     and are exempt from the front-door site gate (see app.ts /public bypass)
//   - the link can be disabled / regenerated and can carry an expiry date
// ---------------------------------------------------------------------------

// Map internal lifecycle status to a client-friendly label. DRAFT projects are
// never exposed at all (handled below).
function friendlyStatus(status: ProjectStatus): string {
  switch (status) {
    case "OBSERVATION":
      return "Planning";
    case "ACTIVE":
      return "In Progress";
    case "PAUSE":
      return "On Hold";
    case "COMPLETE":
      return "Completed";
    case "CLOSED":
      return "Closed";
    case "NO_NEED_CONSULTANT":
      return "In Progress";
    default:
      return "In Progress";
  }
}

function friendlyTaskStatus(status: string): string {
  switch (status) {
    case "TODO":
      return "Not Started";
    case "IN_PROGRESS":
      return "In Progress";
    case "BLOCKED":
      return "On Hold";
    case "DONE":
      return "Completed";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Lightweight in-memory rate limit for the public endpoint. Keyed by IP, this
// is only a basic abuse deterrent (the token itself is the real gate). It is a
// best-effort, per-instance limiter — fine for a low-traffic share link.
// ---------------------------------------------------------------------------
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60;
const rlHits = new Map<string, { count: number; resetAt: number }>();

// Returns true when the request is allowed; on rejection it writes a 429 and
// returns false. Called inline (not as Express middleware) so the route stays a
// single-handler — a second handler argument degrades req typing and Prisma
// relation-select inference for the whole handler.
function rateLimitPublic(req: Request, res: Response): boolean {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const entry = rlHits.get(ip);
  if (!entry || entry.resetAt < now) {
    rlHits.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
  } else {
    entry.count += 1;
    if (entry.count > RL_MAX) {
      res.status(429).json({ error: "Too many requests" });
      return false;
    }
  }
  // Opportunistic cleanup so the map can't grow unbounded.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) if (v.resetAt < now) rlHits.delete(k);
  }
  return true;
}

// ---------------------------------------------------------------------------
// PUBLIC — no auth. Returns a strictly whitelisted view of one project.
// ---------------------------------------------------------------------------
router.get("/public/client-portal/:token", async (req, res) => {
  if (!rateLimitPublic(req, res)) return;

  // Never let this page be indexed or cached by intermediaries.
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");

  // No length/format pre-check: every failure mode (unknown, malformed,
  // disabled, expired, DRAFT, deleted) must funnel through one path and return
  // an identical 404 so the response never reveals whether a token exists.
  const token = String(req.params.token);

  const project = await prisma.project.findUnique({
    where: { clientShareToken: token },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      deletedAt: true,
      clientShareEnabled: true,
      clientShareExpiresAt: true,
      client: { select: { name: true } },
      tasks: {
        where: { parentTaskId: null },
        select: {
          id: true,
          title: true,
          status: true,
          progressPercent: true,
          startDate: true,
          endDate: true,
        },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  // Fail closed: unknown token, disabled link, soft-deleted project, expired
  // link, or a DRAFT (intake-only) project all return the same 404 — we never
  // reveal whether a token exists.
  if (
    !project ||
    project.deletedAt ||
    !project.clientShareEnabled ||
    project.status === "DRAFT" ||
    (project.clientShareExpiresAt && project.clientShareExpiresAt.getTime() < Date.now())
  ) {
    res.status(404).json({ error: "Portal not available" });
    return;
  }

  // Progress = average of top-level task progress. Fall back to the lifecycle
  // status when there are no tasks yet.
  let progressPct: number;
  if (project.tasks.length > 0) {
    const sum = project.tasks.reduce((s, t) => s + (t.progressPercent ?? 0), 0);
    progressPct = Math.round(sum / project.tasks.length);
  } else {
    progressPct = project.status === "COMPLETE" || project.status === "CLOSED" ? 100 : 0;
  }

  res.json({
    project: {
      name: project.name,
      clientName: project.client.name,
      status: friendlyStatus(project.status),
      progressPct,
      startDate: project.startDate,
      endDate: project.endDate,
    },
    milestones: project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: friendlyTaskStatus(t.status),
      progressPct: t.progressPercent ?? 0,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
  });
});

// ---------------------------------------------------------------------------
// MANAGEMENT — auth required. Only MGMT or the project's assigned PM may view
// or change the share settings.
// ---------------------------------------------------------------------------
async function loadProjectForShare(
  req: Request,
  res: Response,
): Promise<{ id: string; pmId: string | null; clientShareToken: string | null; clientShareEnabled: boolean; clientShareExpiresAt: Date | null } | null> {
  const project = await prisma.project.findUnique({
    where: { id: String(req.params.id) },
    select: {
      id: true,
      pmId: true,
      deletedAt: true,
      clientShareToken: true,
      clientShareEnabled: true,
      clientShareExpiresAt: true,
    },
  });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  const role = req.user!.role;
  const isOwnerPm = role === "PROJECT_MANAGER" && project.pmId === req.user!.sub;
  if (role !== "MANAGEMENT" && !isOwnerPm) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return project;
}

function shareState(project: {
  clientShareToken: string | null;
  clientShareEnabled: boolean;
  clientShareExpiresAt: Date | null;
}) {
  return {
    enabled: project.clientShareEnabled,
    token: project.clientShareEnabled ? project.clientShareToken : null,
    expiresAt: project.clientShareExpiresAt,
  };
}

router.get("/projects/:id/client-share", requireAuth, async (req, res) => {
  const project = await loadProjectForShare(req, res);
  if (!project) return;
  res.json(shareState(project));
});

router.put("/projects/:id/client-share", requireAuth, async (req, res) => {
  const project = await loadProjectForShare(req, res);
  if (!project) return;

  const body = req.body ?? {};
  const data: {
    clientShareEnabled?: boolean;
    clientShareToken?: string;
    clientShareExpiresAt?: Date | null;
  } = {};

  // Enable / disable
  if (typeof body.enabled === "boolean") {
    data.clientShareEnabled = body.enabled;
    // Issue a token the first time the link is enabled.
    if (body.enabled && !project.clientShareToken) {
      data.clientShareToken = randomBytes(24).toString("base64url");
    }
  }

  // Regenerate — mint a fresh token, invalidating the old link immediately.
  if (body.regenerate === true) {
    data.clientShareToken = randomBytes(24).toString("base64url");
  }

  // Expiry — accept an ISO date string or null to clear.
  if (body.expiresAt === null) {
    data.clientShareExpiresAt = null;
  } else if (typeof body.expiresAt === "string" && body.expiresAt.trim()) {
    const d = new Date(body.expiresAt);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid expiresAt date" });
      return;
    }
    data.clientShareExpiresAt = d;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data,
    select: {
      clientShareToken: true,
      clientShareEnabled: true,
      clientShareExpiresAt: true,
    },
  });

  await recordAudit(req, {
    action: "project.updated",
    entityType: "Project",
    entityId: project.id,
    description: "Updated client portal share settings",
    before: {
      clientShareEnabled: project.clientShareEnabled,
      clientShareExpiresAt: project.clientShareExpiresAt,
    },
    after: {
      clientShareEnabled: updated.clientShareEnabled,
      clientShareExpiresAt: updated.clientShareExpiresAt,
      regenerated: body.regenerate === true,
    },
  });

  res.json(shareState(updated));
});

export default router;
