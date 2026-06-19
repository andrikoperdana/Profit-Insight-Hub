# Production Release Checklist

How to publish a new version of SecureProfit Hub safely.

Production runs as a Replit Autoscale deployment at https://psa4pmo.xyz. The
autoscale deploy builds and ships the **code**, but it does **not** run database
migrations. If the new code expects a schema change that production hasn't
received, the live app can break. Follow this checklist whenever you publish.

## Before you publish

1. Confirm dev is green: `pnpm run typecheck`.
2. If this release includes a schema change (a new migration folder appeared
   under `lib/db/prisma/migrations/`), apply it to production. For **additive**
   changes (a new nullable column or a new table — invisible to the old running
   code) do this BEFORE publishing:

   ```bash
   bash scripts/release-prod-migrate.sh
   ```

   It prints any pending migrations against production, then runs
   `prisma migrate deploy`. It is a **no-op when nothing is pending**, so it is
   always safe to run.

   Equivalent manual command:
   `DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/db run migrate:deploy`

3. If a change is **not** additive (it drops or renames a column the running code
   still reads), apply it AFTER publishing the new code, in a quick window — or
   it will break the old running version mid-deploy.

## Publish

4. Click **Publish** / **Republish** in Replit (the autoscale deployment).

## After you publish

5. Smoke-test production: log in, open the dashboard and a project, confirm there
   are no errors.

## Notes

- Never run `prisma db push` against production. It is guarded behind
  `ALLOW_DB_PUSH=1` because it tries to sync the *entire* schema and can apply
  unrelated drift or data loss. Use migrations instead.
- The migration baseline is `0_init`; history lives under
  `lib/db/prisma/migrations/`. Dev is auto-migrated on merge via
  `scripts/post-merge.sh`; production is not.
