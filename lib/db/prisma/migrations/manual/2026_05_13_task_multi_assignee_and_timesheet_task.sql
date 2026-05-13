-- Multi-assignee tasks + Timesheet→Task linkage.
-- Applied manually to avoid prisma db push touching the externally managed
-- pentest_users / pentest_engagements tables.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "TaskAssignee" (
  "id"        TEXT PRIMARY KEY,
  "taskId"    TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_taskId_userId_key"
  ON "TaskAssignee" ("taskId", "userId");
CREATE INDEX IF NOT EXISTS "TaskAssignee_userId_idx"
  ON "TaskAssignee" ("userId");

-- Backfill: copy existing single assignee into the join table so historical
-- tasks keep their assignee.
INSERT INTO "TaskAssignee" ("id", "taskId", "userId", "createdAt")
SELECT 'bf_' || "id", "id", "assigneeId", COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM "Task"
WHERE "assigneeId" IS NOT NULL
ON CONFLICT ("taskId", "userId") DO NOTHING;

ALTER TABLE "Timesheet"
  ADD COLUMN IF NOT EXISTS "taskId" TEXT REFERENCES "Task"("id");

CREATE INDEX IF NOT EXISTS "Timesheet_taskId_idx"
  ON "Timesheet" ("taskId");
