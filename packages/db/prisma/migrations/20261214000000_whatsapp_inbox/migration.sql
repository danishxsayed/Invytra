-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "assigned_to" TEXT,
ADD COLUMN     "chat_at" TIMESTAMP(3),
ADD COLUMN     "chat_done_at" TIMESTAMP(3),
ADD COLUMN     "chat_from" TEXT,
ADD COLUMN     "chat_preview" TEXT,
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unread" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "by_name" TEXT,
ADD COLUMN     "by_user_id" TEXT,
ADD COLUMN     "extra" JSONB,
ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "media_id" TEXT,
ADD COLUMN     "media_type" TEXT,
ADD COLUMN     "reply_to" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_notes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_saved_replies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_saved_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_notes_contact_id_created_at_idx" ON "whatsapp_notes"("contact_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_saved_replies_workspace_id_shortcut_key" ON "whatsapp_saved_replies"("workspace_id", "shortcut");

-- CreateIndex
CREATE INDEX "whatsapp_messages_contact_id_created_at_idx" ON "whatsapp_messages"("contact_id", "created_at");

-- AddForeignKey
ALTER TABLE "whatsapp_notes" ADD CONSTRAINT "whatsapp_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_notes" ADD CONSTRAINT "whatsapp_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_saved_replies" ADD CONSTRAINT "whatsapp_saved_replies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- People who already wrote to the number start in the inbox.
UPDATE "whatsapp_contacts" SET "chat_at" = "last_inbound_at", "chat_from" = 'IN' WHERE "last_inbound_at" IS NOT NULL AND "chat_at" IS NULL;
