-- CreateTable
CREATE TABLE "video_recordings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "voice_id" TEXT,
    "file" TEXT NOT NULL,
    "poster" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "intro_ms" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "consent_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_recordings_workspace_id_idx" ON "video_recordings"("workspace_id");

-- AddForeignKey
ALTER TABLE "video_recordings" ADD CONSTRAINT "video_recordings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_recordings" ADD CONSTRAINT "video_recordings_voice_id_fkey" FOREIGN KEY ("voice_id") REFERENCES "voice_clones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

