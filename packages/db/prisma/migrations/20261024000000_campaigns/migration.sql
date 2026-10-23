-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "CampaignLeadState" AS ENUM ('QUEUED', 'IN_PROGRESS', 'WAITING_ACCEPT', 'DONE', 'REPLIED', 'NOT_ACCEPTED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "campaign_lead_id" TEXT;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_id" TEXT,
    "list_id" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "steps" JSONB NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3),
    "leads_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_leads" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "profile_url" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "linkedin_name" TEXT,
    "state" "CampaignLeadState" NOT NULL DEFAULT 'QUEUED',
    "step" INTEGER NOT NULL DEFAULT 0,
    "next_at" TIMESTAMP(3),
    "action_id" TEXT,
    "reason" TEXT,
    "invited_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3),
    "messaged_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "last_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_idx" ON "campaigns"("workspace_id");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaign_leads_campaign_id_state_next_at_idx" ON "campaign_leads"("campaign_id", "state", "next_at");

-- CreateIndex
CREATE INDEX "campaign_leads_workspace_id_profile_url_idx" ON "campaign_leads"("workspace_id", "profile_url");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_leads_campaign_id_profile_url_key" ON "campaign_leads"("campaign_id", "profile_url");

-- CreateIndex
CREATE INDEX "actions_campaign_lead_id_idx" ON "actions"("campaign_lead_id");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_campaign_lead_id_fkey" FOREIGN KEY ("campaign_lead_id") REFERENCES "campaign_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lead_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

