-- CreateEnum
CREATE TYPE "DncKind" AS ENUM ('LINKEDIN', 'EMAIL', 'DOMAIN', 'COMPANY');

-- CreateTable
CREATE TABLE "do_not_contact" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "DncKind" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "added_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "do_not_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "do_not_contact_workspace_id_created_at_idx" ON "do_not_contact"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "do_not_contact_workspace_id_kind_value_key" ON "do_not_contact"("workspace_id", "kind", "value");

-- AddForeignKey
ALTER TABLE "do_not_contact" ADD CONSTRAINT "do_not_contact_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

