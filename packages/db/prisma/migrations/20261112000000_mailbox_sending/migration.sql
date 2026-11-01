-- CreateEnum
CREATE TYPE "EmailSendKind" AS ENUM ('TEST', 'CAMPAIGN', 'WARMUP');

-- CreateEnum
CREATE TYPE "EmailSendStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "email_accounts" ADD COLUMN     "end_hour" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "gap_minutes" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "last_sent_at" TIMESTAMP(3),
ADD COLUMN     "send_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "signature" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "start_hour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email_account_id" TEXT NOT NULL,
    "kind" "EmailSendKind" NOT NULL,
    "status" "EmailSendStatus" NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_sends_email_account_id_created_at_idx" ON "email_sends"("email_account_id", "created_at");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_created_at_idx" ON "email_sends"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing mailboxes: send in the time zone of the workspace's LinkedIn accounts, if it has any.
UPDATE "email_accounts" e SET "time_zone" = (
  SELECT a."timezone" FROM "linkedin_accounts" a WHERE a."workspace_id" = e."workspace_id" ORDER BY a."created_at" DESC LIMIT 1
) WHERE EXISTS (SELECT 1 FROM "linkedin_accounts" a WHERE a."workspace_id" = e."workspace_id");
