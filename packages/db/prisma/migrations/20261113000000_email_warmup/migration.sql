-- CreateEnum
CREATE TYPE "WarmupLanding" AS ENUM ('INBOX', 'SPAM', 'MISSING');

-- AlterTable
ALTER TABLE "email_accounts" ADD COLUMN     "last_warmup_at" TIMESTAMP(3),
ADD COLUMN     "warmup_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warmup_max_daily" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "warmup_reply_rate" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "warmup_started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN     "checked_at" TIMESTAMP(3),
ADD COLUMN     "is_reply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landed_in" "WarmupLanding",
ADD COLUMN     "to_account_id" TEXT,
ADD COLUMN     "warmup_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "email_sends_warmup_code_key" ON "email_sends"("warmup_code");

-- CreateIndex
CREATE INDEX "email_sends_kind_landed_in_created_at_idx" ON "email_sends"("kind", "landed_in", "created_at");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

