-- AlterTable
ALTER TABLE "campaign_leads" ADD COLUMN "ai_line" TEXT,
ADD COLUMN "ai_line_at" TIMESTAMP(3),
ADD COLUMN "ai_signal" TEXT;
