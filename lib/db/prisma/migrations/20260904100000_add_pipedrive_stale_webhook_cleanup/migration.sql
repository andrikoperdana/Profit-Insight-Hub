ALTER TABLE "AppSetting"
ADD COLUMN "pipedriveStaleWebhookIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "pipedriveWebhookCleanupError" TEXT,
ADD COLUMN "pipedriveWebhookCleanupFailedAt" TIMESTAMP(3);