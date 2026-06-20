-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('SCOPE', 'SCHEDULE', 'COST');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "impactSummary" TEXT,
    "proposedStartDate" TIMESTAMP(3),
    "proposedEndDate" TIMESTAMP(3),
    "proposedPlannedMandays" DOUBLE PRECISION,
    "proposedEstimatedCost" DOUBLE PRECISION,
    "proposedContractValue" DOUBLE PRECISION,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_status_idx" ON "ChangeRequest"("projectId", "status");

-- AddForeignKey
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
