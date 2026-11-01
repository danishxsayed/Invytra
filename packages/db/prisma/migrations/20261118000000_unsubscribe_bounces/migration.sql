-- AlterEnum
ALTER TYPE "EmailLeadStatus" ADD VALUE 'UNSUBSCRIBED';

-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN     "soft_bounce_retries" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "soft_retry_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "unsubscribe_link" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubscribe_text" TEXT NOT NULL DEFAULT 'Don''t want to receive these emails anymore? [Unsubscribe here]';

-- AlterTable
ALTER TABLE "email_leads" ADD COLUMN     "bounce_type" TEXT,
ADD COLUMN     "soft_bounces" INTEGER NOT NULL DEFAULT 0;

