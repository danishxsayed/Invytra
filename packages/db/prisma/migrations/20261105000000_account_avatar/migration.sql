-- The connected LinkedIn account's own profile photo.
-- AlterTable
ALTER TABLE "linkedin_accounts" ADD COLUMN     "avatar" BYTEA,
ADD COLUMN     "avatar_type" TEXT,
ADD COLUMN     "avatar_updated_at" TIMESTAMP(3);
