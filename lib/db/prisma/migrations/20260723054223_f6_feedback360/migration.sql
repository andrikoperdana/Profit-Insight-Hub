-- CreateEnum
CREATE TYPE "Feedback360Status" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateTable
CREATE TABLE "ProjectFeedback360" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "status" "Feedback360Status" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFeedback360_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFeedback360_reviewerId_status_idx" ON "ProjectFeedback360"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "ProjectFeedback360_projectId_idx" ON "ProjectFeedback360"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFeedback360_projectId_reviewerId_subjectId_key" ON "ProjectFeedback360"("projectId", "reviewerId", "subjectId");

-- AddForeignKey
ALTER TABLE "ProjectFeedback360" ADD CONSTRAINT "ProjectFeedback360_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeedback360" ADD CONSTRAINT "ProjectFeedback360_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeedback360" ADD CONSTRAINT "ProjectFeedback360_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
