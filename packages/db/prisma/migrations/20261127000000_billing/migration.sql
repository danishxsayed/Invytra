-- AlterTable
ALTER TABLE "verify_credit_purchases" ADD COLUMN     "invoice" JSONB,
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "razorpay_order_id" TEXT;

-- CreateTable
CREATE TABLE "billing_profiles" (
    "workspace_id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL,
    "gstin" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "invoice_counter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "invoice_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verify_credit_purchases_razorpay_order_id_key" ON "verify_credit_purchases"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "verify_credit_purchases_invoice_number_key" ON "verify_credit_purchases"("invoice_number");

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

