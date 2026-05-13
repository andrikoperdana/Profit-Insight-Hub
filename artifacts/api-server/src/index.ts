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
// documents, activity). This is what makes a fresh production deploy come
// up with usable demo data instead of empty tables.
runSeed()
  .then(() => logger.info("Auto-seed complete"))
  .catch((err) => logger.error({ err }, "Auto-seed failed (continuing)"));

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
