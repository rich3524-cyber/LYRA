-- Zernio bridge foundation — apply in Supabase SQL Editor (do NOT use prisma db push)
DO $$ BEGIN
  CREATE TYPE "SocialProviderType" AS ENUM ('NATIVE', 'ZERNIO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "provider" "SocialProviderType" NOT NULL DEFAULT 'ZERNIO';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "zernioAccountId" TEXT;
ALTER TABLE "SocialAccount" ALTER COLUMN "accessToken" DROP NOT NULL;

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "zernioProfileId" TEXT;

CREATE TABLE IF NOT EXISTS "Review" (
  "id"              TEXT PRIMARY KEY,
  "workspaceId"     TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "socialAccountId" TEXT NOT NULL REFERENCES "SocialAccount"("id") ON DELETE CASCADE,
  "zernioReviewId"  TEXT NOT NULL,
  "rating"          INTEGER,
  "text"            TEXT,
  "authorName"      TEXT,
  "status"          TEXT NOT NULL DEFAULT 'NEW',
  "replyText"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"      TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Review_socialAccountId_zernioReviewId_key" ON "Review"("socialAccountId","zernioReviewId");
CREATE INDEX IF NOT EXISTS "Review_workspaceId_status_idx" ON "Review"("workspaceId","status");
