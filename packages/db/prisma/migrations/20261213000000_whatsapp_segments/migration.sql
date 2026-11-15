-- AlterTable
ALTER TABLE "whatsapp_campaigns" ADD COLUMN     "segment_id" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "location" TEXT,
ADD COLUMN     "wa_status" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_segments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'green',
    "match" TEXT NOT NULL DEFAULT 'all',
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_segments_workspace_id_idx" ON "whatsapp_segments"("workspace_id");

-- AddForeignKey
ALTER TABLE "whatsapp_segments" ADD CONSTRAINT "whatsapp_segments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Locations imported before this went to vars.location: copy them to the new column.
UPDATE "whatsapp_contacts" SET "location" = "vars"->>'location' WHERE "location" IS NULL AND "vars" ? 'location';
-- People who wrote to the number are on WhatsApp.
UPDATE "whatsapp_contacts" SET "wa_status" = 'ON' WHERE "last_inbound_at" IS NOT NULL;
