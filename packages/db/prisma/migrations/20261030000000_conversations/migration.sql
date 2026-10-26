-- AlterEnum
ALTER TYPE "CampaignLeadState" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "conversation_id" TEXT;

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "participant_name" TEXT NOT NULL,
    "campaign_lead_id" TEXT,
    "last_snippet_key" TEXT,
    "last_message_text" TEXT NOT NULL DEFAULT '',
    "last_from_me" BOOLEAN NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "from_me" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "time_label" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_account_id_last_message_at_idx" ON "conversations"("account_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_campaign_lead_id_idx" ON "conversations"("campaign_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_account_id_participant_name_key" ON "conversations"("account_id", "participant_name");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_sent_at_idx" ON "conversation_messages"("conversation_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversation_id_key_key" ON "conversation_messages"("conversation_id", "key");

-- CreateIndex
CREATE INDEX "actions_conversation_id_idx" ON "actions"("conversation_id");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "linkedin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_campaign_lead_id_fkey" FOREIGN KEY ("campaign_lead_id") REFERENCES "campaign_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Carry the existing inbox over: one conversation per account + person, their messages,
-- and replies sent from Invytra. Message keys match the worker's: md5("<0|1>|<text>|<n>").
INSERT INTO "conversations" ("id", "account_id", "participant_name", "campaign_lead_id", "last_message_text", "last_from_me", "last_message_at", "done_at", "updated_at")
SELECT 'cv' || md5(account_id || '|' || from_name), account_id, from_name,
       (array_agg(campaign_lead_id ORDER BY fetched_at DESC) FILTER (WHERE campaign_lead_id IS NOT NULL))[1],
       (array_agg(text ORDER BY fetched_at DESC))[1],
       (array_agg(answered_at IS NOT NULL ORDER BY fetched_at DESC))[1],
       max(fetched_at),
       (array_agg(done_at ORDER BY fetched_at DESC))[1],
       now()
FROM "inbox_messages"
GROUP BY account_id, from_name;

WITH m AS (
  SELECT id, 'cv' || md5(account_id || '|' || from_name) AS cid, fetched_at,
         btrim(regexp_replace(
           CASE WHEN lower(split_part(text, ': ', 1)) IN (lower(split_part(from_name, ' ', 1)), lower(from_name))
                THEN substr(text, length(split_part(text, ': ', 1)) + 3) ELSE text END, '\s+', ' ', 'g')) AS body
  FROM "inbox_messages"
)
INSERT INTO "conversation_messages" ("id", "conversation_id", "from_me", "text", "sent_at", "key")
SELECT 'cm' || md5(id), cid, false, body, fetched_at,
       md5('0|' || body || '|' || row_number() OVER (PARTITION BY cid, body ORDER BY fetched_at))
FROM m
ON CONFLICT DO NOTHING;

UPDATE "actions" a SET "conversation_id" = 'cv' || md5(im.account_id || '|' || im.from_name)
FROM "inbox_messages" im WHERE a.inbox_message_id = im.id;

WITH r AS (
  SELECT a.id, a.conversation_id AS cid, coalesce(a.executed_at, a.created_at) AS at,
         btrim(regexp_replace(coalesce(a.payload->>'text', ''), '\s+', ' ', 'g')) AS body
  FROM "actions" a WHERE a.type = 'REPLY' AND a.status = 'SUCCEEDED' AND a.conversation_id IS NOT NULL
)
INSERT INTO "conversation_messages" ("id", "conversation_id", "from_me", "text", "sent_at", "key")
SELECT 'cm' || md5(id), cid, true, body, at, md5('1|' || body || '|' || row_number() OVER (PARTITION BY cid, body ORDER BY at))
FROM r WHERE body <> ''
ON CONFLICT DO NOTHING;
