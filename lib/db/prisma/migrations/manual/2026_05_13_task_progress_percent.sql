-- Adds progressPercent (0-100) to Task. Applied manually because
-- prisma db push would propose dropping pentest_users / pentest_engagements
-- (managed outside the Prisma schema by artifacts/pentest).
--
-- Idempotent: safe to re-run.
ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "progressPercent" INTEGER NOT NULL DEFAULT 0;

-- Backfill: any existing DONE tasks should reflect 100% progress.
UPDATE "Task" SET "progressPercent" = 100 WHERE "status" = 'DONE' AND "progressPercent" = 0;
