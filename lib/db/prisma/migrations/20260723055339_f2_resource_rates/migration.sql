-- CreateTable
CREATE TABLE "ProjectResourceRate" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "costRate" DOUBLE PRECISION NOT NULL,
    "sellingRate" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectResourceRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectResourceRate_resourceId_effectiveFrom_idx" ON "ProjectResourceRate"("resourceId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectResourceRate_resourceId_effectiveFrom_key" ON "ProjectResourceRate"("resourceId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "ProjectResourceRate" ADD CONSTRAINT "ProjectResourceRate_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ProjectResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectResourceRate" ADD CONSTRAINT "ProjectResourceRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
