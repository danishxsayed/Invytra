-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "channels" TEXT[] DEFAULT ARRAY['linkedin']::TEXT[];
