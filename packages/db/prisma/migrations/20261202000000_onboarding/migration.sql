-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboarded_at" TIMESTAMP(3),
ADD COLUMN     "onboarding" JSONB;

