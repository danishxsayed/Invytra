-- M2: account details read from LinkedIn, and warm-up for new accounts
ALTER TABLE "linkedin_accounts" ADD COLUMN "profile_name" TEXT;
ALTER TABLE "linkedin_accounts" ADD COLUMN "profile_url" TEXT;
ALTER TABLE "linkedin_accounts" ADD COLUMN "connected_at" TIMESTAMP(3);
ALTER TABLE "linkedin_accounts" ADD COLUMN "warmup_until" TIMESTAMP(3);

-- Accounts that already have a session count as connected (no warm-up: they are already in use)
UPDATE "linkedin_accounts" SET "connected_at" = "session_updated_at" WHERE "encrypted_session" IS NOT NULL;
