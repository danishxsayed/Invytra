-- CreateTable
CREATE TABLE "voice_clones" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider_voice_id" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "consent_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_clones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_clones_workspace_id_idx" ON "voice_clones"("workspace_id");

-- AddForeignKey
ALTER TABLE "voice_clones" ADD CONSTRAINT "voice_clones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

