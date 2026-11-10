-- CreateTable
CREATE TABLE "archived_invoices" (
    "invoice_number" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "workspace_name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "method" TEXT,
    "payment_ref" TEXT,
    "razorpay_order_id" TEXT,
    "invoice" JSONB,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_invoices_pkey" PRIMARY KEY ("invoice_number")
);

