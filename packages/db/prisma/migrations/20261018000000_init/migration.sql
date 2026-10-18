-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'NEEDS_ATTENTION', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('PROFILE_VISIT', 'CONNECTION_REQUEST', 'CHECK_CONNECTION', 'MESSAGE', 'INBOX_SYNC');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "linkedin_accounts" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT,
    "proxy_url" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "encrypted_session" BYTEA,
    "session_updated_at" TIMESTAMP(3),
    "working_hours" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "status_reason" TEXT,
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linkedin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "target_url" TEXT,
    "payload" JSONB,
    "status" "ActionStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "screenshot_path" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "linkedin_message_id" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "from_profile_url" TEXT,
    "text" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "linkedin_accounts_label_key" ON "linkedin_accounts"("label");

-- CreateIndex
CREATE INDEX "actions_account_id_type_status_executed_at_idx" ON "actions"("account_id", "type", "status", "executed_at");

-- CreateIndex
CREATE INDEX "actions_status_scheduled_at_idx" ON "actions"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "inbox_messages_account_id_sent_at_idx" ON "inbox_messages"("account_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_messages_account_id_linkedin_message_id_key" ON "inbox_messages"("account_id", "linkedin_message_id");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

