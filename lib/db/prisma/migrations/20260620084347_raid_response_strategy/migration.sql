-- CreateEnum
CREATE TYPE "RaidResponseStrategy" AS ENUM ('AVOID', 'MITIGATE', 'TRANSFER', 'ACCEPT');

-- AlterTable
ALTER TABLE "ProjectRaidItem" ADD COLUMN     "responseStrategy" "RaidResponseStrategy";
