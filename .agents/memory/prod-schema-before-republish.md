---
name: Prod schema via migrations (and before republish)
description: How prod schema changes are applied now that Prisma Migrate exists, and why prod must be migrated before/after a republish.
---

# Apply schema changes to prod via migrations BEFORE/AFTER republish

The repo now uses **Prisma Migrate** (baseline `0_init`; history under
`lib/db/prisma/migrations/`). `migrate dev` / merges only touch the **dev**
database. Prod is a separate remote Neon DB and is **NOT auto-migrated by the
autoscale deploy** — applying to prod is a deliberate, separate step.

**The trap (still true):** Prisma's `findUnique`/`findMany` select *all* scalar
columns of a model by default. If new server code references a freshly added
column and runs against a prod DB that lacks it, Prisma throws and the call site
breaks — for shared hot paths (app-settings, serializers) this can take down
broad swaths of the live app on republish.

**How to apply to prod (preferred):**

```
DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/db run migrate:deploy
```

It applies only pending migrations and is a no-op when nothing is pending. Run
it before the republish for additive columns (invisible to old code), or right
after for changes the new code needs immediately. `psql` reads
`$PROD_DATABASE_URL` from bash; the code_execution sandbox cannot (see
sandbox-vs-shell-env).

**Fallback (only if migrate can't run):** a targeted idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` via `psql "$PROD_DATABASE_URL"` —
never `prisma db push` (it syncs the *entire* schema and can apply unrelated
drift). `db push` is now guarded behind `ALLOW_DB_PUSH=1` for this reason.

**Adopting migrations on a live DB (how the baseline was created):** generate a
full `0_init` from the existing schema, confirm `migrate diff` is empty on dev
AND prod, then `prisma migrate resolve --applied 0_init` on **both** so neither
tries to re-create existing tables. Keep hand-written SQL out of the
`migrations/` scan path (archived in `lib/db/prisma/manual-sql/`).

**Why:** decouples the risky prod-schema step from deploy and prevents a broken
republish.

**How to apply:** any task that adds a Prisma column/table the server selects —
migrate prod (additively) as part of the change; don't wait for republish.
