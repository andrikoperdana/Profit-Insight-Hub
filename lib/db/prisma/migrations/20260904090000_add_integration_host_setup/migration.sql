ALTER TABLE "AppSetting"
  ADD COLUMN "integrationPublicBaseUrl" TEXT,
  ADD COLUMN "integrationDraftBaseUrl" TEXT,
  ADD COLUMN "integrationPreviousBaseUrl" TEXT,
  ADD COLUMN "integrationDraftValidatedAt" TIMESTAMP(3),
  ADD COLUMN "pipedriveManagedWebhookId" TEXT,
  ADD COLUMN "pipedriveManagedWebhookUrl" TEXT;