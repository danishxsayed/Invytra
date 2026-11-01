-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailCampaignStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "EmailCampaignStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN     "schedule_local" TEXT,
ADD COLUMN     "schedule_recipient_tz" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schedule_time_zone" TEXT,
ADD COLUMN     "scheduled_at" TIMESTAMP(3);

