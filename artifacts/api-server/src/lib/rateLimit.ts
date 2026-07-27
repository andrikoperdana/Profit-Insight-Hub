import type { Request } from "express";
import { prisma } from "@workspace/db";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Shared fixed-window rate limiter for PUBLIC (unauthenticated) endpoints.
//
// Counters live in Postgres (RateLimitCounter) so they:
//   - survive process restarts / deploys (an in-memory Map resets to zero on
//     every restart, letting an attacker re-fill the window after each one)
//   - are shared across horizontally-scaled instances (per-process maps give
//     an attacker max * N requests across N workers)
//
// The increment is a single atomic INSERT ... ON CONFLICT upsert, so
// concurrent requests across instances cannot race past the limit.
//
// If the DB write fails we fall back to a best-effort in-process counter
// rather than failing open entirely — these limiters are defence-in-depth
// (the unguessable token is the primary gate), so availability of the
// endpoint must not depend on the limiter.
// ---------------------------------------------------------------------------

const memHits = new Map<string, { count: number; resetAt: number }>();

function memoryAllow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memHits.get(key);
  if (!entry || entry.resetAt < now) {
    memHits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  // Opportunistic cleanup so the map can't grow unbounded.
  if (memHits.size > 5000) {
    for (const [k, v] of memHits) if (v.resetAt < now) memHits.delete(k);
  }
  return entry.count <= max;
}

/**
 * Returns true when the request identified by `key` is within `max` hits per
 * `windowMs`. Keys must be namespaced by the caller (e.g. "portal:ip:1.2.3.4").
 */
export async function rateLimitAllow(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitCounter" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimitCounter"."resetAt" < ${now} THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitCounter"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimitCounter"."resetAt" END
      RETURNING "count"`;
    // Opportunistic cleanup of long-expired windows (~1% of calls).
    if (Math.random() < 0.01) {
      const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
      prisma.rateLimitCounter
        .deleteMany({ where: { resetAt: { lt: cutoff } } })
        .catch(() => {});
    }
    return (rows[0]?.count ?? 1) <= max;
  } catch (err) {
    logger.warn({ err }, "rate-limit DB counter failed; using in-process fallback");
    return memoryAllow(key, max, windowMs);
  }
}

/**
 * Best-effort client IP for rate-limit keying. Requires `trust proxy` to be
 * set on the app (it is, in app.ts) so req.ip reflects X-Forwarded-For behind
 * the platform proxy rather than the proxy's own address. Note that a
 * forwarded-for header is ultimately attacker-influencable, which is why
 * write endpoints also apply a token-keyed limit that cannot be spoofed.
 */
export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}
