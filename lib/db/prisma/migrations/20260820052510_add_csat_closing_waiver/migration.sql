-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "csatWaivedAt" TIMESTAMP(3),
ADD COLUMN     "csatWaivedById" TEXT,
ADD COLUMN     "csatWaiverReason" TEXT;

-- CreateIndex
CREATE INDEX "Project_csatWaivedById_idx" ON "Project"("csatWaivedById");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_csatWaivedById_fkey" FOREIGN KEY ("csatWaivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
