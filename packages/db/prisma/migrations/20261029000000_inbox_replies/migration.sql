-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'REPLY';

-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "inbox_message_id" TEXT;

-- CreateIndex
CREATE INDEX "actions_inbox_message_id_idx" ON "actions"("inbox_message_id");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_inbox_message_id_fkey" FOREIGN KEY ("inbox_message_id") REFERENCES "inbox_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

