-- Accounts connected through Unipile (its login page and IPs) instead of Invytra's own browser.
-- CreateEnum
CREATE TYPE "ConnectionEngine" AS ENUM ('BROWSER', 'UNIPILE');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "external_id" TEXT;

-- AlterTable
ALTER TABLE "linkedin_accounts" ADD COLUMN     "engine" "ConnectionEngine" NOT NULL DEFAULT 'BROWSER',
ADD COLUMN     "unipile_account_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_accounts_unipile_account_id_key" ON "linkedin_accounts"("unipile_account_id");
