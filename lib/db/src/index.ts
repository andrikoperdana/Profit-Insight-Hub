import { PrismaClient } from "./generated/client/index.js";
type PrismaClientType = InstanceType<typeof PrismaClient>;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Read a positive integer from an env var, falling back to `fallback` when the
// var is unset or not a valid positive number.
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Build a datasource URL with tunable connection-pool defaults. Serverless
// Postgres (Neon/Replit) aggressively terminates idle connections, which
// surfaces as `E57P01 terminating connection due to administrator command`.
// A bounded pool plus bounded timeouts keeps fewer stale connections around
// and lets Prisma fail fast and reconnect instead of hanging.
//
// All three knobs are overridable via env so the pool can be tuned per
// environment WITHOUT a code change or redeploy. Key sizing rule for scale:
//   (number of app instances) × DB_CONNECTION_LIMIT  must stay under the
//   database's max_connections (use PgBouncer in front for large fleets).
//   - DB_CONNECTION_LIMIT : max connections this process keeps in its pool
//   - DB_POOL_TIMEOUT     : seconds a query waits for a free pooled connection
//   - DB_CONNECT_TIMEOUT  : seconds to wait when opening a new connection
function buildDatasourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const ensure = (key: string, value: string) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    };
    ensure("connection_limit", String(intFromEnv("DB_CONNECTION_LIMIT", 12)));
    ensure("pool_timeout", String(intFromEnv("DB_POOL_TIMEOUT", 20)));
    ensure("connect_timeout", String(intFromEnv("DB_CONNECT_TIMEOUT", 10)));
    return url.toString();
  } catch {
    // Non-standard URL (e.g. socket path) — leave it untouched.
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

export const prisma: PrismaClientType =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    datasources: { db: { url: buildDatasourceUrl(process.env.DATABASE_URL) } },
  });

// Cache the client on the global in every environment. In development this
// prevents hot-reload from spawning a new pool on each reload; in production it
// guarantees a single shared pool for the process.
globalForPrisma.prisma = prisma;

export { runSeed, ensureCoreAccountsAndTaxonomy } from "./seed.js";
export { ensureSampleReportData } from "./sample-report-data.js";
export { ensureSampleTaskTemplates } from "./sample-task-templates.js";
export { ensureSampleProjectTemplates } from "./sample-project-templates.js";
export { ensureSampleWorkstreamProjects } from "./sample-workstream-projects.js";

export type {
  User,
  Client,
  Project,
  ProjectResource,
  Timesheet,
  Document,
  Activity,
  AuditLog,
  UserRole,
  ProjectStatus,
  TimesheetStatus,
  DocumentType,
  ProjectReportType,
  Prisma,
} from "./generated/client/index.js";
