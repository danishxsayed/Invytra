-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('LINKEDIN_SEARCH', 'SALES_NAV_SEARCH', 'SALES_NAV_LIST');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'SEARCH_PAGE';
ALTER TYPE "ActionType" ADD VALUE 'LIKE_POST';
ALTER TYPE "ActionType" ADD VALUE 'WITHDRAW_INVITE';

-- CreateTable
CREATE TABLE "lead_imports" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "url" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "max_leads" INTEGER NOT NULL DEFAULT 500,
    "next_page" INTEGER NOT NULL DEFAULT 1,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "action_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "lead_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_imports_workspace_id_created_at_idx" ON "lead_imports"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_imports_status_idx" ON "lead_imports"("status");

-- AddForeignKey
ALTER TABLE "lead_imports" ADD CONSTRAINT "lead_imports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_imports" ADD CONSTRAINT "lead_imports_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lead_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_imports" ADD CONSTRAINT "lead_imports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

