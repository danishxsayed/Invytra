-- CreateTable
CREATE TABLE "whatsapp_numbers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone" TEXT NOT NULL DEFAULT '',
    "verified_name" TEXT NOT NULL DEFAULT '',
    "name_status" TEXT,
    "quality" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "messaging_tier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "last_error" TEXT,
    "access_token" TEXT NOT NULL,
    "pin" TEXT NOT NULL DEFAULT '',
    "credit_shared" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "meta_id" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rejected_reason" TEXT,
    "quality" TEXT,
    "components" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_numbers_phone_number_id_key" ON "whatsapp_numbers"("phone_number_id");

-- CreateIndex
CREATE INDEX "whatsapp_numbers_workspace_id_idx" ON "whatsapp_numbers"("workspace_id");

-- CreateIndex
CREATE INDEX "whatsapp_templates_workspace_id_idx" ON "whatsapp_templates"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_waba_id_name_language_key" ON "whatsapp_templates"("waba_id", "name", "language");

-- AddForeignKey
ALTER TABLE "whatsapp_numbers" ADD CONSTRAINT "whatsapp_numbers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

