-- CreateEnum
CREATE TYPE "ProjectBaselineSource" AS ENUM ('ACTIVATION', 'CHANGE_REQUEST', 'MANUAL');

-- CreateTable
CREATE TABLE "ProjectBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "source" "ProjectBaselineSource" NOT NULL DEFAULT 'ACTIVATION',
    "changeRequestId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "plannedMandays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBaseline_projectId_isCurrent_idx" ON "ProjectBaseline"("projectId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBaseline_projectId_version_key" ON "ProjectBaseline"("projectId", "version");

-- AddForeignKey
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
