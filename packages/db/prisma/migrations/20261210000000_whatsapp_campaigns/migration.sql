-- CreateTable
CREATE TABLE "whatsapp_campaigns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" TEXT,
    "template_name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "var_map" JSONB NOT NULL,
    "media_url" TEXT,
    "status" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "contact_id" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUT',
    "kind" TEXT NOT NULL DEFAULT 'TEMPLATE',
    "body" TEXT NOT NULL DEFAULT '',
    "wamid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_campaigns_status_scheduled_at_idx" ON "whatsapp_campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "whatsapp_campaigns_workspace_id_created_at_idx" ON "whatsapp_campaigns"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wamid_key" ON "whatsapp_messages"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_campaign_id_status_idx" ON "whatsapp_messages"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "whatsapp_messages_workspace_id_phone_created_at_idx" ON "whatsapp_messages"("workspace_id", "phone", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_campaign_id_phone_key" ON "whatsapp_messages"("campaign_id", "phone");

-- AddForeignKey
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "whatsapp_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

