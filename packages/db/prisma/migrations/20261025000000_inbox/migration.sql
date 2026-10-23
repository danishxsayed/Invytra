-- AlterTable
ALTER TABLE "inbox_messages" ADD COLUMN     "answered_at" TIMESTAMP(3),
ADD COLUMN     "campaign_lead_id" TEXT,
ADD COLUMN     "done_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "inbox_messages_account_id_fetched_at_idx" ON "inbox_messages"("account_id", "fetched_at");

-- CreateIndex
CREATE INDEX "inbox_messages_campaign_lead_id_idx" ON "inbox_messages"("campaign_lead_id");

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_campaign_lead_id_fkey" FOREIGN KEY ("campaign_lead_id") REFERENCES "campaign_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

