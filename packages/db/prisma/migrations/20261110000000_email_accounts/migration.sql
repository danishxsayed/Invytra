-- CreateEnum
CREATE TYPE "MailboxProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'ZOHO', 'HOSTINGER', 'GODADDY', 'OTHER');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('ACTIVE', 'ERROR', 'PAUSED');

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "channels" SET DEFAULT ARRAY['linkedin', 'email']::TEXT[];

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "provider" "MailboxProvider" NOT NULL,
    "smtp_host" TEXT NOT NULL,
    "smtp_port" INTEGER NOT NULL,
    "smtp_secure" BOOLEAN NOT NULL,
    "imap_host" TEXT NOT NULL,
    "imap_port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "status" "MailboxStatus" NOT NULL DEFAULT 'ACTIVE',
    "status_reason" TEXT,
    "daily_limit" INTEGER NOT NULL DEFAULT 30,
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_email_key" ON "email_accounts"("email");

-- CreateIndex
CREATE INDEX "email_accounts_workspace_id_idx" ON "email_accounts"("workspace_id");

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing workspaces get Email Outreach too.
UPDATE "workspaces" SET "channels" = array_append("channels", 'email') WHERE NOT ('email' = ANY("channels"));
