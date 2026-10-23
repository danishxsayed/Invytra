-- CreateTable
CREATE TABLE "lead_lists" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "profile_url" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "title" TEXT,
    "location" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_lists_workspace_id_idx" ON "lead_lists"("workspace_id");

-- CreateIndex
CREATE INDEX "leads_workspace_id_profile_url_idx" ON "leads"("workspace_id", "profile_url");

-- CreateIndex
CREATE INDEX "leads_list_id_created_at_idx" ON "leads"("list_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_list_id_profile_url_key" ON "leads"("list_id", "profile_url");

-- CreateIndex
CREATE INDEX "actions_target_url_idx" ON "actions"("target_url");

-- AddForeignKey
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lead_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

