-- Missing indexes on FK/filtered columns — apply in Supabase SQL Editor (do NOT use prisma db push).
-- Flagged by the 2 Aug 2026 comprehensive review (Phase 1 Code Quality, Phase 2 Performance F2/F5).

-- SocialAccount.zernioAccountId is the sole predicate of the Zernio webhook's
-- updateMany lookup (every incoming comment, every account-disconnect event) —
-- currently a full table scan across all customers' connected accounts, not
-- just the relevant one. Highest-value index in this file.
CREATE INDEX IF NOT EXISTS "SocialAccount_zernioAccountId_idx" ON "SocialAccount"("zernioAccountId");

-- Post.publishedAt has no supporting index despite being filtered/sorted on by
-- sync-metrics, analytics, reports, and engagement-analyzer; the existing
-- [status, scheduledAt] index doesn't match this query shape.
CREATE INDEX IF NOT EXISTS "Post_publishedAt_idx" ON "Post"("publishedAt");

-- Post.socialAccountId is a required FK with no index — Prisma does not
-- auto-index relation scalar fields.
CREATE INDEX IF NOT EXISTS "Post_socialAccountId_idx" ON "Post"("socialAccountId");

-- CrisisEvent.workspaceId is a required FK with no index at all — every
-- crisis-status/history lookup for a workspace is a full table scan.
CREATE INDEX IF NOT EXISTS "CrisisEvent_workspaceId_idx" ON "CrisisEvent"("workspaceId");

-- Note: Comment.workspaceId is already covered by the existing
-- [workspaceId, createdAt] and [workspaceId, status] compound indexes
-- (leading column serves plain workspaceId lookups too) — no change needed.
