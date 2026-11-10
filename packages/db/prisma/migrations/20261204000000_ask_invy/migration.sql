-- CreateEnum
CREATE TYPE "InvySearchStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "invy_searches" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "InvySearchStatus" NOT NULL DEFAULT 'QUEUED',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "criteria" JSONB,
    "cursor" JSONB,
    "progress" TEXT,
    "summary" TEXT,
    "error" TEXT,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invy_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invy_businesses" (
    "id" TEXT NOT NULL,
    "search_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "maps_url" TEXT,
    "rating" DOUBLE PRECISION,
    "reviews" INTEGER,
    "business_status" TEXT,
    "check" JSONB,
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "match" BOOLEAN NOT NULL DEFAULT false,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "why" TEXT,
    "opportunity" TEXT,
    "position" INTEGER,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invy_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invy_prospects" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "maps_url" TEXT,
    "email" TEXT,
    "why" TEXT,
    "opportunity" TEXT,
    "search_id" TEXT,
    "emailed_at" TIMESTAMP(3),
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invy_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invy_searches_workspace_id_updated_at_idx" ON "invy_searches"("workspace_id", "updated_at");

-- CreateIndex
CREATE INDEX "invy_searches_status_idx" ON "invy_searches"("status");

-- CreateIndex
CREATE INDEX "invy_businesses_workspace_id_place_id_idx" ON "invy_businesses"("workspace_id", "place_id");

-- CreateIndex
CREATE UNIQUE INDEX "invy_businesses_search_id_place_id_key" ON "invy_businesses"("search_id", "place_id");

-- CreateIndex
CREATE UNIQUE INDEX "invy_prospects_workspace_id_place_id_key" ON "invy_prospects"("workspace_id", "place_id");

-- AddForeignKey
ALTER TABLE "invy_searches" ADD CONSTRAINT "invy_searches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invy_businesses" ADD CONSTRAINT "invy_businesses_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "invy_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invy_prospects" ADD CONSTRAINT "invy_prospects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

