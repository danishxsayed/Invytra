-- CreateEnum
CREATE TYPE "EmailBounceStatus" AS ENUM ('NONE', 'SOFT', 'HARD');

-- CreateEnum
CREATE TYPE "EmailVerification" AS ENUM ('NOT_CHECKED', 'PENDING', 'VALID', 'INVALID', 'RISKY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL');

-- AlterTable
ALTER TABLE "email_leads" ADD COLUMN     "contact_id" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "email_contacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "website" TEXT,
    "vars" JSONB NOT NULL DEFAULT '{}',
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribed_at" TIMESTAMP(3),
    "bounce_status" "EmailBounceStatus" NOT NULL DEFAULT 'NONE',
    "soft_bounces" INTEGER NOT NULL DEFAULT 0,
    "last_bounce_at" TIMESTAMP(3),
    "bounce_reason" TEXT,
    "verification" "EmailVerification" NOT NULL DEFAULT 'NOT_CHECKED',
    "verified_at" TIMESTAMP(3),
    "verify_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_lists" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_list_members" (
    "list_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_list_members_pkey" PRIMARY KEY ("list_id","contact_id")
);

-- CreateTable
CREATE TABLE "email_variables" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fallback" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppressions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_contacts_workspace_id_verification_idx" ON "email_contacts"("workspace_id", "verification");

-- CreateIndex
CREATE UNIQUE INDEX "email_contacts_workspace_id_email_key" ON "email_contacts"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "email_lists_workspace_id_name_key" ON "email_lists"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "email_list_members_contact_id_idx" ON "email_list_members"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_variables_workspace_id_key_key" ON "email_variables"("workspace_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "email_suppressions_workspace_id_email_key" ON "email_suppressions"("workspace_id", "email");

-- AddForeignKey
ALTER TABLE "email_leads" ADD CONSTRAINT "email_leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "email_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_contacts" ADD CONSTRAINT "email_contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "email_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "email_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_variables" ADD CONSTRAINT "email_variables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing campaign leads become workspace contacts (one per address), linked back.
INSERT INTO "email_contacts" ("id", "workspace_id", "email", "first_name", "last_name", "company", "title", "vars", "bounce_status", "bounce_reason", "updated_at")
SELECT DISTINCT ON (l."workspace_id", l."email")
  'c' || md5(random()::text || l."id"), l."workspace_id", l."email", l."first_name", l."last_name", l."company", l."title", l."vars",
  CASE WHEN l."status" = 'BOUNCED' THEN 'HARD'::"EmailBounceStatus" ELSE 'NONE'::"EmailBounceStatus" END,
  CASE WHEN l."status" = 'BOUNCED' THEN l."reason" END,
  CURRENT_TIMESTAMP
FROM "email_leads" l
ORDER BY l."workspace_id", l."email", l."created_at" DESC
ON CONFLICT DO NOTHING;

UPDATE "email_leads" l SET "contact_id" = c."id" FROM "email_contacts" c WHERE c."workspace_id" = l."workspace_id" AND c."email" = l."email";

-- Bounced addresses go on the suppression list.
INSERT INTO "email_suppressions" ("id", "workspace_id", "email", "reason", "detail")
SELECT 's' || md5(random()::text || c."id"), c."workspace_id", c."email", 'HARD_BOUNCE', c."bounce_reason" FROM "email_contacts" c WHERE c."bounce_status" = 'HARD'
ON CONFLICT DO NOTHING;

-- Campaign CSV columns become workspace variables.
INSERT INTO "email_variables" ("id", "workspace_id", "key", "label")
SELECT DISTINCT ON (ec."workspace_id", lower(col)) 'v' || md5(random()::text || col), ec."workspace_id",
  lower(regexp_replace(regexp_replace(col, '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^A-Za-z0-9]+', '_', 'g')), col
FROM "email_campaigns" ec, unnest(ec."columns") AS col
ON CONFLICT DO NOTHING;
