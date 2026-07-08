-- Zernio bridge Phase 4 — add Comment.platformPostId, needed so Zernio-routed
-- replyToComment (scoped to a post, not just a comment) has a post id to target.
-- Additive, idempotent.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "platformPostId" TEXT;
