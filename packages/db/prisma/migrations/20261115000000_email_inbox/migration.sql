-- AlterEnum
ALTER TYPE "EmailSendKind" ADD VALUE 'REPLY';

-- AlterTable
ALTER TABLE "email_leads" ADD COLUMN     "inbox_done_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN     "text" TEXT;

