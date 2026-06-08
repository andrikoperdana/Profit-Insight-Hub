import app from "./app";
import { logger } from "./lib/logger";
import {
  prisma,
  runSeed,
  ensureCoreAccountsAndTaxonomy,
  ensureSampleTaskTemplates,
  ensureSampleProjectTemplates,
  ensureSampleWorkstreamProjects,
} from "@workspace/db";
import { runPaymentSync } from "./routes/xero.js";
import { xeroConfigured } from "./lib/xero.js";
import { getAppSettings } from "./lib/app-settings.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Auto-seed on boot. runSeed() is idempotent: when User table is non-empty
// it only patches Principal hierarchy + BU/Skills; when empty it populates
// the full sample dataset (users, clients, projects, resources, timesheets,
// documents, activity).
//
// Production safety: never auto-seed in production unless the operator
// explicitly opts in via SEED_ON_BOOT=true. This prevents shipping demo
// accounts (default password "password123") and `[sample]` data to a
// hosted environment by accident.
const isProd = process.env["NODE_ENV"] === "production";
const seedOptIn = process.env["SEED_ON_BOOT"] === "true";
if (!isProd || seedOptIn) {
  runSeed()
    .then(() => logger.info("Auto-seed complete"))
    .catch((err) => logger.error({ err }, "Auto-seed failed (continuing)"));
} else {
  // Production: skip demo dataset, but always ensure core accounts
  // (Principals, Site Admin, Finance, HR) + BU/Skills + reference blueprints
  // (task templates, project templates) exist. All idempotent upserts of a
  // small known list — safe to re-run.
  (async () => {
    await ensureCoreAccountsAndTaxonomy();
    await ensureSampleTaskTemplates();
    await ensureSampleProjectTemplates();
    await ensureSampleWorkstreamProjects();
  })()
    .then(() => logger.info("Core accounts + taxonomy + templates ensured (production)"))
    .catch((err) => logger.error({ err }, "Production ensure failed (continuing)"));
}

const server = app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Keep the database connection warm. Serverless Postgres (Neon) autosuspends
// its compute after a short idle window; the first request after a suspend then
// pays a multi-second cold-start. A lightweight periodic ping keeps the compute
// awake so user-facing requests stay fast. Interval is overridable via
// DB_KEEPALIVE_MS (set to 0 to disable). Default 4 min stays under the typical
// 5 min autosuspend window.
const rawKeepalive = process.env["DB_KEEPALIVE_MS"];
const keepaliveMs = rawKeepalive !== undefined ? Number(rawKeepalive) : 4 * 60_000;
if (Number.isFinite(keepaliveMs) && keepaliveMs > 0) {
  const keepalive = setInterval(() => {
    prisma
      .$queryRaw`SELECT 1`
      .catch((err) => logger.warn({ err }, "DB keepalive ping failed (continuing)"));
  }, keepaliveMs);
  keepalive.unref();
}

// Poll Xero for invoice payment status and mark fully-paid milestones PAID.
// Manual sync is still available from the UI regardless of this setting; this
// just keeps things fresh without webhooks. Gated behind the AppSetting
// `xeroAutoSyncEnabled` (default OFF) so the background poll never runs unless
// an operator explicitly turns it on. No-op until Xero is configured +
// connected (runPaymentSync short-circuits when there are no pushed invoices,
// and getValidAccessToken throws harmlessly if disconnected).
const XERO_POLL_MS = 30 * 60_000;
if (xeroConfigured()) {
  const poll = setInterval(() => {
    getAppSettings()
      .then((settings) => {
        if (!settings.xeroAutoSyncEnabled) return;
        return runPaymentSync().then((r) => {
          if (r.updated > 0) logger.info(r, "Xero payment poll updated milestones");
        });
      })
      .catch((err) => logger.warn({ err }, "Xero payment poll failed (continuing)"));
  }, XERO_POLL_MS);
  poll.unref();
}

// Graceful shutdown: on deploy rollover / container stop, stop accepting new
// connections, let in-flight requests finish, close the DB pool cleanly, then
// exit. A hard timeout guarantees we still exit even if something hangs (the
// platform would otherwise SIGKILL us). Prisma auto-reconnects on the next
// query if a connection is reaped mid-flight, so this only covers orderly stop.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down gracefully");

  const force = setTimeout(() => {
    logger.warn("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      logger.warn({ err }, "Error disconnecting Prisma during shutdown");
    }
    clearTimeout(force);
    logger.info("Shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
