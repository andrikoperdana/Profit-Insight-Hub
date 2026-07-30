-- AlterTable: add projectId column and make code optional
ALTER TABLE "Project" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Project" ALTER COLUMN "code" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectId_key" ON "Project"("projectId");
