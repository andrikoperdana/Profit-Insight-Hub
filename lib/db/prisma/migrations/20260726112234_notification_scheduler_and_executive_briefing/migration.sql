-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "notificationChecksLastRunAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExecutiveBriefing" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "model" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveBriefing_pkey" PRIMARY KEY ("id")
);
