import { PrismaClient } from "./generated/client/index.js";
import {
  isBenignIdlePoolClose,
  isRetriableOperation,
  withConnectionRetry,
} from "./connection-retry.js";
type PrismaClientType = InstanceType<typeof PrismaClient>;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Captured after the guard above so the value is `string` (not `string |
// undefined`) inside the client factory closure below.
const DATABASE_URL: string = process.env.DATABASE_URL;

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
//   - DB_SOCKET_TIMEOUT   : seconds a query may sit on a socket before the
//                           engine declares the connection dead
//
// Pool sizing note (learned in production): with sparse traffic, a LARGE pool
// is harmful on serverless/autoscale. Idle pooled TCP connections keep getting
// reaped by the serverless pooler (visible as continuous `kind: Closed`
// prisma:error noise), and idle NAT mappings can drop without a reset reaching
// the client, leaving "zombie" connections whose next checkout hangs in TCP
// retransmit before the engine replaces it. A small pool keeps the working set
// hot and cycles connections often; `socket_timeout` bounds any residual
// zombie wait, and the resulting P1008 is retried on a fresh connection by
// withConnectionRetry below.
//
// Opt-in PgBouncer routing (DB_USE_PGBOUNCER=1): the most effective cure for
// the idle-reaping E57P01 churn is to talk to Neon's connection pooler instead
// of the direct endpoint. Neon's pooler host is the direct host with `-pooler`
// inserted into the endpoint id (e.g. `ep-foo.…neon.tech` → `ep-foo-pooler.…
// neon.tech`); pairing it with `pgbouncer=true` keeps server connections warm
// and survives idle reaping far better. This rewrite is RUNTIME-ONLY (Prisma
// Migrate reads DATABASE_URL directly and never calls this), strictly scoped to
// recognized Neon `ep-*.…neon.tech` hosts, and a hard no-op for anything else
// (Replit Helium alias, localhost, already-pooled hosts) — so the flag can be
// enabled without risk of breaking a non-Neon deployment, and removed to revert
// without a code change.
function applyNeonPgBouncer(url: URL): void {
  const flag = (process.env.DB_USE_PGBOUNCER ?? "").trim().toLowerCase();
  if (flag !== "1" && flag !== "true" && flag !== "yes") return;
  const host = url.hostname;
  const isNeon = host.startsWith("ep-") && host.endsWith(".neon.tech");
  if (!isNeon) return; // unknown host: never guess a pooler that may not exist
  const dot = host.indexOf(".");
  const firstLabel = dot > 0 ? host.slice(0, dot) : host;
  // Detect "already pooled" via the endpoint-id label suffix, not a broad
  // substring, so a direct host whose generated id merely contains "-pooler"
  // somewhere isn't mistaken for the pooler endpoint.
  if (dot > 0 && !firstLabel.endsWith("-pooler")) {
    url.hostname = `${firstLabel}-pooler${host.slice(dot)}`;
  }
  // Force pgbouncer=true on every pooled connection: PgBouncer transaction mode
  // requires Prisma to skip prepared statements, so override any stray/false
  // value rather than preserving it.
  url.searchParams.set("pgbouncer", "true");
}

function buildDatasourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    applyNeonPgBouncer(url);
    const ensure = (key: string, value: string) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    };
    // Small by default — see the pool sizing note above. Raise via env only
    // for sustained-concurrency workloads, never "just in case".
    ensure("connection_limit", String(intFromEnv("DB_CONNECTION_LIMIT", 6)));
    ensure("pool_timeout", String(intFromEnv("DB_POOL_TIMEOUT", 20)));
    ensure("connect_timeout", String(intFromEnv("DB_CONNECT_TIMEOUT", 10)));
    // Bounds how long a query can hang on a silently-dead socket before the
    // engine gives up (P1008) and withConnectionRetry re-runs it on a fresh
    // connection. Keep well above the slowest legitimate query (~1-2s).
    ensure("socket_timeout", String(intFromEnv("DB_SOCKET_TIMEOUT", 10)));
    return url.toString();
  } catch {
    // Non-standard URL (e.g. socket path) — leave it untouched.
    return raw;
  }
}

// Serverless Postgres can reap an idle pooled connection between requests. The
// shared retry policy keeps idempotent operations from surfacing a random 5xx,
// but remains capped so a real outage fails promptly.
const DB_MAX_ATTEMPTS = intFromEnv("DB_MAX_ATTEMPTS", 3);

function createPrismaClient(): PrismaClientType {
  const base = new PrismaClient({
    // Route engine errors through a narrow filter below. Prisma reports an idle
    // pool connection being reaped as an error even when no operation failed.
    // Every other engine error is retained with its original diagnostic text.
    log: [{ emit: "event", level: "error" }, "warn"],
    datasources: { db: { url: buildDatasourceUrl(DATABASE_URL) } },
  });
  base.$on("error", (event) => {
    if (isBenignIdlePoolClose(event.message)) return;
    console.error(
      `[db] Prisma engine error (${event.target}): ${event.message}`,
    );
  });
  // `$allOperations` wraps each individual model/raw operation — including those
  // run inside an interactive `$transaction(async (tx) => …)`, where `query` is
  // bound to that (already-doomed) transaction connection, so a retry just fails
  // out and multi-statement / advisory-lock flows are never silently re-run; the
  // outer `$transaction` call itself is not intercepted. Auto-retry is further
  // gated by `isRetriableOperation`, so only reads recover on a fresh
  // connection. Even apparently simple Prisma updates can contain nested
  // relation writes, so every write surfaces its first error rather than risk
  // replaying a commit whose acknowledgement was lost.
  const extended = base.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        const retriable = isRetriableOperation(operation, args);
        const label = model ? `${model}.${operation}` : operation;
        return withConnectionRetry(() => query(args), label, retriable, {
          maxAttempts: DB_MAX_ATTEMPTS,
        });
      },
    },
  });
  // The extended client retains every model delegate plus `$transaction`,
  // `$queryRaw`, `$executeRaw(Unsafe)`, `$connect`, `$disconnect` used across the
  // app; only `$use`/`$on` are dropped (neither is used). Cast keeps the public
  // `prisma` type — and all existing call sites — unchanged.
  return extended as unknown as PrismaClientType;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

export const prisma: PrismaClientType =
  globalForPrisma.prisma ?? createPrismaClient();

// Cache the client on the global in every environment. In development this
// prevents hot-reload from spawning a new pool on each reload; in production it
// guarantees a single shared pool for the process.
globalForPrisma.prisma = prisma;

export { runSeed, ensureCoreAccountsAndTaxonomy } from "./seed.js";
export { ensureSampleReportData } from "./sample-report-data.js";
export { ensureSampleTaskTemplates } from "./sample-task-templates.js";
export { ensureSampleProjectTemplates } from "./sample-project-templates.js";
export { ensureSampleWorkstreamProjects } from "./sample-workstream-projects.js";

export { Prisma } from "./generated/client/index.js";
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
  AccessRequest,
  AccessRequestStatus,
} from "./generated/client/index.js";
