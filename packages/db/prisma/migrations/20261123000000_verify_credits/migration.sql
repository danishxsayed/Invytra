-- CreateEnum
CREATE TYPE "VerifyPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "verify_extra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verify_period" TIMESTAMP(3),
ADD COLUMN     "verify_used" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "verify_credit_purchases" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "VerifyPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT,
    "payment_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "verify_credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verify_credit_purchases_workspace_id_created_at_idx" ON "verify_credit_purchases"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "verify_credit_purchases" ADD CONSTRAINT "verify_credit_purchases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

