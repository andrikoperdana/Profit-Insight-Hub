-- Migration for: #6 Billable toggle, #3 Expense approval, #7 Resource DB (level+skills),
--                 #1 Business Unit + Resource Planning matrix.
-- Idempotent — safe to re-run.

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE "Seniority" AS ENUM ('JUNIOR','MID','SENIOR','PRINCIPAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BusinessUnit
-- ============================================================
CREATE TABLE IF NOT EXISTS "BusinessUnit" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Skill + UserSkill
-- ============================================================
CREATE TABLE IF NOT EXISTS "Skill" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL UNIQUE,
  "category"  TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "UserSkill" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "skillId"     TEXT NOT NULL,
  "proficiency" INT NOT NULL DEFAULT 3,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSkill_user_fk"  FOREIGN KEY ("userId")  REFERENCES "User"("id")  ON DELETE CASCADE,
  CONSTRAINT "UserSkill_skill_fk" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserSkill_userId_skillId_key" ON "UserSkill"("userId","skillId");
CREATE INDEX IF NOT EXISTS "UserSkill_userId_idx"  ON "UserSkill"("userId");
CREATE INDEX IF NOT EXISTS "UserSkill_skillId_idx" ON "UserSkill"("skillId");

-- ============================================================
-- User: add seniority + businessUnitId
-- ============================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "seniority"      "Seniority";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_businessUnitId_fkey"
    FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Task: add billable
-- ============================================================
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "billable" BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- ProjectExpense: status + approver + rejection
-- ============================================================
ALTER TABLE "ProjectExpense" ADD COLUMN IF NOT EXISTS "status"          "ExpenseStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ProjectExpense" ADD COLUMN IF NOT EXISTS "approvedById"    TEXT;
ALTER TABLE "ProjectExpense" ADD COLUMN IF NOT EXISTS "approvedAt"      TIMESTAMP(3);
ALTER TABLE "ProjectExpense" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

DO $$ BEGIN
  ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ProjectExpense_status_idx" ON "ProjectExpense"("status");

-- Backfill: existing expenses are auto-APPROVED (they were already counting as cost).
UPDATE "ProjectExpense"
   SET "status" = 'APPROVED',
       "approvedAt" = COALESCE("approvedAt", "createdAt")
 WHERE "status" = 'PENDING' AND "createdAt" < CURRENT_TIMESTAMP;
