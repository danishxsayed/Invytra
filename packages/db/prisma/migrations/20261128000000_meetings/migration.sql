-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "meeting_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_leads" ADD COLUMN     "meeting_at" TIMESTAMP(3);


-- Conversations already tagged "Meeting booked" count from their last change.
UPDATE "conversations" SET "meeting_at" = "updated_at" WHERE 'Meeting booked' = ANY("tags");
