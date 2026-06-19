-- Manual migration applied 2026-05-08.
-- Adds optional invoice/billing evidence columns to ProjectExpense.
-- Idempotent and additive; safe to re-run. Used in lieu of `prisma db push`
-- because the shared dev database hosts pentest tables outside this schema
-- that db push would otherwise drop.
ALTER TABLE "ProjectExpense"
  ADD COLUMN IF NOT EXISTS "evidenceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceFileName" TEXT;
