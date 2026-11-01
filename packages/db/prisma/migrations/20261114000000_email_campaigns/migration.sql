-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EmailLeadStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'REPLIED', 'BOUNCED', 'SKIPPED');

-- AlterTable
ALTER TABLE "email_accounts" ADD COLUMN     "last_reply_check_at" TIMESTAMP(3),
ADD COLUMN     "next_send_at" TIMESTAMP(3),
ADD COLUMN     "reply_uid_next" INTEGER,
ADD COLUMN     "reply_uid_validity" BIGINT;

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN     "email_lead_id" TEXT,
ADD COLUMN     "step_index" INTEGER;

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "launched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_mailboxes" (
    "campaign_id" TEXT NOT NULL,
    "email_account_id" TEXT NOT NULL,

    CONSTRAINT "email_campaign_mailboxes_pkey" PRIMARY KEY ("campaign_id","email_account_id")
);

-- CreateTable
CREATE TABLE "email_leads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "vars" JSONB NOT NULL DEFAULT '{}',
    "status" "EmailLeadStatus" NOT NULL DEFAULT 'ACTIVE',
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "next_at" TIMESTAMP(3),
    "email_account_id" TEXT,
    "thread_message_id" TEXT,
    "thread_subject" TEXT,
    "reason" TEXT,
    "last_sent_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_replies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email_account_id" TEXT NOT NULL,
    "email_lead_id" TEXT,
    "kind" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "message_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_campaigns_workspace_id_idx" ON "email_campaigns"("workspace_id");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_leads_campaign_id_status_next_at_idx" ON "email_leads"("campaign_id", "status", "next_at");

-- CreateIndex
CREATE INDEX "email_leads_workspace_id_email_idx" ON "email_leads"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "email_leads_campaign_id_email_key" ON "email_leads"("campaign_id", "email");

-- CreateIndex
CREATE INDEX "email_replies_workspace_id_received_at_idx" ON "email_replies"("workspace_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_replies_email_account_id_message_id_key" ON "email_replies"("email_account_id", "message_id");

-- CreateIndex
CREATE INDEX "email_sends_email_lead_id_idx" ON "email_sends"("email_lead_id");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_email_lead_id_fkey" FOREIGN KEY ("email_lead_id") REFERENCES "email_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_mailboxes" ADD CONSTRAINT "email_campaign_mailboxes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_mailboxes" ADD CONSTRAINT "email_campaign_mailboxes_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_leads" ADD CONSTRAINT "email_leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_leads" ADD CONSTRAINT "email_leads_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_email_lead_id_fkey" FOREIGN KEY ("email_lead_id") REFERENCES "email_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

