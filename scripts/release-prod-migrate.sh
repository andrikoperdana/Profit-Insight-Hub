#!/bin/bash
# Apply pending Prisma migrations to the PRODUCTION database.
# Safe to run anytime: a no-op when nothing is pending.
# See docs/RELEASE-CHECKLIST.md.
set -euo pipefail

if [ -z "${PROD_DATABASE_URL:-}" ]; then
  echo "ERROR: PROD_DATABASE_URL is not set; cannot reach production." >&2
  exit 1
fi

echo "==> Pending migrations on PRODUCTION:"
DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/db run migrate:status || true

echo ""
echo "==> Applying pending migrations to PRODUCTION (prisma migrate deploy)..."
DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/db run migrate:deploy

echo ""
echo "==> Production schema is up to date."
