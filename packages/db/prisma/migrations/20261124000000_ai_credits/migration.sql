-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('VERIFY', 'AI');

-- AlterTable
ALTER TABLE "verify_credit_purchases" ADD COLUMN     "kind" "CreditKind" NOT NULL DEFAULT 'VERIFY';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "ai_extra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_period" TIMESTAMP(3),
ADD COLUMN     "ai_used" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ai_credit_uses" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_credit_uses_workspace_id_created_at_idx" ON "ai_credit_uses"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_credit_uses" ADD CONSTRAINT "ai_credit_uses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

