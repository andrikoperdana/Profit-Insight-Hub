---
name: Prod schema before republish
description: Why new Prisma columns must be applied to the prod DB before republishing, and how to do it safely.
---

# Apply additive schema changes to prod BEFORE republishing

`prisma db push` in dev only touches the **dev** database. Prod is a separate
remote Neon DB; schema changes are **manual** (replit.md "Common tasks").

**The trap:** Prisma's `findUnique`/`findMany` select *all* scalar columns of a
model by default. The moment new server code that references a freshly added
column (e.g. `getAppSettings()` reading `AppSetting.emailNotificationsEnabled`)
runs against a prod DB that lacks the column, Prisma throws and the call site
breaks. For shared hot paths (app-settings, serializers) this can take down
broad swaths of the live app on republish.

**How to apply safely (additive columns):** run a targeted, idempotent ALTER
against `$PROD_DATABASE_URL` with `psql` — NOT `prisma db push` (which would try
to sync the *entire* schema and could apply unrelated drift):

```
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;'
```

Table/column names are the Prisma model/field names verbatim (camelCase, quoted)
unless the schema uses `@@map`/`@map`. `psql` is available and can read
`$PROD_DATABASE_URL` from bash (the code_execution sandbox cannot — see
sandbox-vs-shell-env). An additive column with a default is invisible to the
currently-running old code, so it's safe to apply ahead of the republish.

**Why:** decouples the risky prod-schema step from the deploy and prevents a
broken republish; surgical ALTER avoids `db push` syncing unrelated schema drift.

**How to apply:** any task that adds a Prisma column/table the server selects —
apply it to prod (additively) as part of the change, don't wait for republish.
