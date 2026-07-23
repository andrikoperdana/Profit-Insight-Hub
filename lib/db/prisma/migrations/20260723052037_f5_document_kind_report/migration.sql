-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('FILE', 'LINK');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'REPORT';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "kind" "DocumentKind" NOT NULL DEFAULT 'FILE';
