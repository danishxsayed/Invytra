-- AlterTable
ALTER TABLE "email_contacts" ADD COLUMN     "person_id" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "person_id" TEXT;

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "location" TEXT,
    "linkedin_slug" TEXT,
    "linkedin_url" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "photo_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_workspace_id_updated_at_idx" ON "people"("workspace_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "people_workspace_id_linkedin_slug_key" ON "people"("workspace_id", "linkedin_slug");

-- CreateIndex
CREATE UNIQUE INDEX "people_workspace_id_email_key" ON "people"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "email_contacts_person_id_idx" ON "email_contacts"("person_id");

-- CreateIndex
CREATE INDEX "leads_person_id_idx" ON "leads"("person_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_contacts" ADD CONSTRAINT "email_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

