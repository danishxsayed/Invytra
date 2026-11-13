-- AlterEnum
ALTER TYPE "CreditKind" ADD VALUE 'PLAN';

-- AlterTable
ALTER TABLE "verify_credit_purchases" ADD COLUMN     "description" TEXT,
ADD COLUMN     "razorpay_payment_id" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "ai_monthly" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "verify_monthly" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "subscriptions" (
    "workspace_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "status" TEXT NOT NULL DEFAULT 'TRIALING',
    "billing_cycle" TEXT,
    "channels" TEXT[],
    "extra_senders" JSONB NOT NULL DEFAULT '{}',
    "custom_senders" JSONB,
    "monthly_credits" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "payment_status" TEXT,
    "razorpay_subscription_id" TEXT,
    "pending_change" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_checkouts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "choice" JSONB NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "razorpay_subscription_id" TEXT,
    "razorpay_order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "plan_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_plans" (
    "key" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_plans_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_razorpay_subscription_id_key" ON "subscriptions"("razorpay_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_trial_ends_at_idx" ON "subscriptions"("status", "trial_ends_at");

-- CreateIndex
CREATE INDEX "subscription_events_workspace_id_created_at_idx" ON "subscription_events"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plan_checkouts_razorpay_subscription_id_key" ON "plan_checkouts"("razorpay_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_checkouts_razorpay_order_id_key" ON "plan_checkouts"("razorpay_order_id");

-- CreateIndex
CREATE INDEX "plan_checkouts_workspace_id_created_at_idx" ON "plan_checkouts"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "verify_credit_purchases_razorpay_payment_id_key" ON "verify_credit_purchases"("razorpay_payment_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_checkouts" ADD CONSTRAINT "plan_checkouts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing workspaces: keep what they have today. Trials keep their 50 monthly credits and
-- their channels until the trial ends (7 days after sign-up); anything else (set by the team)
-- becomes a VIP plan with the old paid allowances.
UPDATE "workspaces" SET "ai_monthly" = CASE WHEN "plan" IN ('trial', 'free') THEN 50 ELSE 500 END,
  "verify_monthly" = CASE WHEN "plan" IN ('trial', 'free') THEN 100 ELSE 1000 END;
UPDATE "workspaces" SET "plan" = 'trial' WHERE "plan" = 'free';
UPDATE "workspaces" SET "plan" = 'vip' WHERE "plan" NOT IN ('trial');
INSERT INTO "subscriptions" ("workspace_id", "plan", "status", "channels", "monthly_credits", "trial_started_at", "trial_ends_at", "started_at", "updated_at")
SELECT "id", "plan", CASE WHEN "plan" = 'trial' THEN 'TRIALING' ELSE 'ACTIVE' END, "channels", "ai_monthly",
  CASE WHEN "plan" = 'trial' THEN "created_at" END, CASE WHEN "plan" = 'trial' THEN "created_at" + INTERVAL '7 days' END,
  CASE WHEN "plan" = 'trial' THEN NULL ELSE "created_at" END, CURRENT_TIMESTAMP
FROM "workspaces";
