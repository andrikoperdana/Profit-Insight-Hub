import { PrismaClient } from "./generated/client/index.js";
type PrismaClientType = InstanceType<typeof PrismaClient>;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Build a datasource URL with sensible connection-pool defaults. Serverless
// Postgres (Neon/Replit) aggressively terminates idle connections, which
// surfaces as `E57P01 terminating connection due to administrator command`.
// A small pool plus bounded timeouts keeps fewer stale connections around and
// lets Prisma fail fast and reconnect instead of hanging.
function buildDatasourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const ensure = (key: string, value: string) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    };
    ensure("connection_limit", "5");
    ensure("pool_timeout", "20");
    ensure("connect_timeout", "10");
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
