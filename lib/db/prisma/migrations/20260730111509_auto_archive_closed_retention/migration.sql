-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "autoArchiveClosedMonths" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- Backfill: projects already CLOSED get their last update time as closedAt
UPDATE "Project" SET "closedAt" = "updatedAt" WHERE "status" = 'CLOSED' AND "closedAt" IS NULL;
