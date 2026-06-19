-- Migration: enhancement bundle (templates, closing checklist, doc versioning,
-- skill development, multi-currency). Idempotent.

-- ---------------------------------------------------------------------------
-- #11 Project Template + Estimator
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProjectTemplate" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'CLIENT',
  "defaultDurationDays" INTEGER NOT NULL DEFAULT 30,
  "estimatedContractValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "plannedMandays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 11,
  "contractValueIncludesVat" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProjectTemplate_isActive_idx" ON "ProjectTemplate"("isActive");

CREATE TABLE IF NOT EXISTS "ProjectTemplateResource" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "headcount" INTEGER NOT NULL DEFAULT 1,
  "mandaysPerPerson" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "ProjectTemplateResource_templateId_idx" ON "ProjectTemplateResource"("templateId");

CREATE TABLE IF NOT EXISTS "ProjectTemplateMilestone" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "offsetDays" INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "ProjectTemplateMilestone_templateId_idx" ON "ProjectTemplateMilestone"("templateId");

CREATE TABLE IF NOT EXISTS "ProjectTemplateRaidItem" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "impact" TEXT NOT NULL DEFAULT 'MEDIUM',
  "likelihood" TEXT NOT NULL DEFAULT 'MEDIUM',
  "mitigation" TEXT
);
CREATE INDEX IF NOT EXISTS "ProjectTemplateRaidItem_templateId_idx" ON "ProjectTemplateRaidItem"("templateId");

-- ---------------------------------------------------------------------------
-- #7 Closing checklist + document versioning
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProjectClosingChecklistItem" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT REFERENCES "User"("id"),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProjectClosingChecklistItem_projectId_idx" ON "ProjectClosingChecklistItem"("projectId");

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "parentDocumentId" TEXT REFERENCES "Document"("id");
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "isLatest" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "Document_parentDocumentId_idx" ON "Document"("parentDocumentId");

-- ---------------------------------------------------------------------------
-- #9 Skill Development Tracker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SkillDevelopmentGoal" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "skillId" TEXT NOT NULL REFERENCES "Skill"("id") ON DELETE CASCADE,
  "currentLevel" INTEGER NOT NULL DEFAULT 1,
  "targetLevel" INTEGER NOT NULL DEFAULT 3,
  "targetDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdById" TEXT REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SkillDevelopmentGoal_userId_skillId_key" ON "SkillDevelopmentGoal"("userId","skillId");
CREATE INDEX IF NOT EXISTS "SkillDevelopmentGoal_userId_idx" ON "SkillDevelopmentGoal"("userId");
CREATE INDEX IF NOT EXISTS "SkillDevelopmentGoal_status_idx" ON "SkillDevelopmentGoal"("status");

CREATE TABLE IF NOT EXISTS "SkillProgressionLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "skillId" TEXT NOT NULL REFERENCES "Skill"("id") ON DELETE CASCADE,
  "fromLevel" INTEGER,
  "toLevel" INTEGER NOT NULL,
  "changedById" TEXT REFERENCES "User"("id"),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SkillProgressionLog_userId_idx" ON "SkillProgressionLog"("userId");
CREATE INDEX IF NOT EXISTS "SkillProgressionLog_skillId_idx" ON "SkillProgressionLog"("skillId");

-- ---------------------------------------------------------------------------
-- #20 Multi-currency (new projects)
-- ---------------------------------------------------------------------------
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'IDR';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1;
