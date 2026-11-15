-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "external_id" TEXT;

-- CreateIndex
CREATE INDEX "whatsapp_contacts_workspace_id_external_id_idx" ON "whatsapp_contacts"("workspace_id", "external_id");

