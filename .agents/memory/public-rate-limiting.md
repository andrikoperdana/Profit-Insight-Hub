---
name: Public endpoint rate limiting
description: How unauthenticated /public endpoints must be rate limited (DB-backed shared counters, token-keyed caps on writes, trust proxy).
---

Rule: any public (unauthenticated) API route gets a rate limit via the shared DB-backed fixed-window limiter (`rateLimitAllow` in api-server lib), never a module-level in-memory Map.

**Why:** per-process Maps reset on every restart/deploy and multiply by N under horizontal scaling, so the limit is largely fictional in production. DB counters (atomic INSERT..ON CONFLICT upsert) survive restarts and are shared across instances; on DB error the limiter falls back to a best-effort in-process counter (defence-in-depth — token remains the primary gate, endpoint availability must not depend on the limiter).

**How to apply:**
- Namespace keys per route+dimension (e.g. `survey:post:ip:<ip>`).
- Write/submission endpoints need a token-keyed cap in addition to per-IP, because `trust proxy` is enabled and forwarded-for is ultimately attacker-influencable (IP rotation/header spoofing bypasses per-IP alone).
- `app.set("trust proxy", true)` is required or req.ip is the platform proxy's address and all clients share one counter.
- Prod DB must have the RateLimitCounter migration applied (prod is not auto-migrated).
