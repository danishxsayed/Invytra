-- Follow-profile step, and whether each connected LinkedIn account has Premium (invite notes need it).
-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'FOLLOW_PROFILE';

-- AlterTable
ALTER TABLE "linkedin_accounts" ADD COLUMN     "premium" BOOLEAN,
ADD COLUMN     "premium_checked_at" TIMESTAMP(3),
ADD COLUMN     "premium_override" BOOLEAN;

