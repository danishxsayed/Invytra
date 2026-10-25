-- One campaign can now send from several LinkedIn accounts.
-- Existing campaigns keep their single sender, and their leads stay with it.

-- 1. Senders table
CREATE TABLE "campaign_senders" (
    "campaign_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_senders_pkey" PRIMARY KEY ("campaign_id","account_id")
);
CREATE INDEX "campaign_senders_account_id_idx" ON "campaign_senders"("account_id");
ALTER TABLE "campaign_senders" ADD CONSTRAINT "campaign_senders_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_senders" ADD CONSTRAINT "campaign_senders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "campaign_senders" ("campaign_id", "account_id")
SELECT "id", "account_id" FROM "campaigns" WHERE "account_id" IS NOT NULL;

-- 2. Each lead remembers its sender (leads already started belong to the campaign's old sender)
ALTER TABLE "campaign_leads" ADD COLUMN "account_id" TEXT;
UPDATE "campaign_leads" cl SET "account_id" = c."account_id"
FROM "campaigns" c
WHERE cl."campaign_id" = c."id" AND c."account_id" IS NOT NULL AND cl."state" <> 'QUEUED';
CREATE INDEX "campaign_leads_account_id_state_idx" ON "campaign_leads"("account_id", "state");
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. The old single-sender column
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_account_id_fkey";
ALTER TABLE "campaigns" DROP COLUMN "account_id";
