-- AlterTable
ALTER TABLE "ProjectExpense" ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "settledAmount" DOUBLE PRECISION,
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settledById" TEXT,
ADD COLUMN     "settlementNotes" TEXT;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
