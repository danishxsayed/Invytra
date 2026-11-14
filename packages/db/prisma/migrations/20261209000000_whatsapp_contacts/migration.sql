-- AlterEnum
ALTER TYPE "DncKind" ADD VALUE 'PHONE';

-- CreateTable
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "profile_name" TEXT,
    "email" TEXT,
    "company" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vars" JSONB NOT NULL DEFAULT '{}',
    "consent_source" TEXT,
    "consent_at" TIMESTAMP(3),
    "consent_by" TEXT,
    "opted_out_at" TIMESTAMP(3),
    "opt_out_reason" TEXT,
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_contacts_workspace_id_created_at_idx" ON "whatsapp_contacts"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_workspace_id_phone_key" ON "whatsapp_contacts"("workspace_id", "phone");

-- AddForeignKey
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

