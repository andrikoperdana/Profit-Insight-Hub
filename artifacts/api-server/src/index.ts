import app from "./app";
import { logger } from "./lib/logger";
import { runSeed } from "@workspace/db";

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
  logger.info(
    "Auto-seed skipped in production (set SEED_ON_BOOT=true to override)",
  );
}

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
