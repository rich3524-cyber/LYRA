import type { CommentStatus } from '@prisma/client'

// Structural shape shared by prisma.comment's and prisma.review's updateMany
// delegates -- both models expose a `status` field typed CommentStatus
// (Review deliberately reuses the Comment status enum rather than defining
// its own, see the model comment in prisma/schema.prisma) plus the identical
// aiDraftResponse/finalResponse/respondedAt trio. Deliberately scoped to only
// the args this function actually needs (not the full generated
// {Comment,Review}UpdateManyArgs shape) so both `prisma.comment` and
// `prisma.review` satisfy it structurally with no cast required at the call
// sites -- this is what lets one rollback implementation cover both models.
type RollbackDelegate = {
  updateMany(args: {
    where: { id: string; status: CommentStatus }
    data: {
      status: CommentStatus
      aiDraftResponse: string | null
      finalResponse: null
      respondedAt: null
    }
  }): Promise<{ count: number }>
}

/**
 * Rolls a comment or review this caller's own claim just set to RESPONDED
 * back to a state a human (or a retry) can act on again, for the case where
 * the claim won but the actual send didn't happen. Single shared
 * implementation for every call site that needs this exact write --
 * workers/ai-responder.worker.ts, workers/ai-review-responder.worker.ts,
 * app/api/comments/[id]/reply/route.ts, app/api/reviews/[id]/reply/route.ts,
 * and app/api/mcp/respond-to-item/route.ts -- after a prior gap where one
 * copy had no retry loop and didn't restore aiDraftResponse, risking a row
 * permanently stuck "answered" with nothing actually sent. Genuinely
 * content-type-agnostic: it only ever touches status/aiDraftResponse/
 * finalResponse/respondedAt, all of which Comment and Review share with
 * identical types, so generalizing this rather than duplicating it into a
 * parallel review-rollback.ts avoids two copies of safety-critical
 * retry/rollback logic drifting apart over time.
 *
 * Own-claim-scoped (status: 'RESPONDED'), not a broader predicate: only rolls
 * back if the row is still in the exact RESPONDED state the caller's own
 * claim just set. If a concurrent write changed it in between (e.g. a human
 * resolved it some other way while this was retrying), this correctly no-ops
 * instead of clobbering whatever that other state now is.
 *
 * Three attempts with brief backoff cover ordinary transient DB blips. If
 * every attempt still fails there is genuinely nothing more this function can
 * do beyond logging loudly for manual reconciliation -- an accepted residual
 * risk, not something this retry loop can fully close.
 *
 * `entityLabel` is purely cosmetic (which noun appears in the log lines) --
 * defaults to 'Comment' so every pre-existing call site's log output is
 * byte-for-byte unchanged.
 */
export async function rollbackCommentClaim(
  db: RollbackDelegate,
  id: string,
  draftResponse: string,
  restoredStatus: 'AI_DRAFTED' | 'ESCALATED' = 'AI_DRAFTED',
  entityLabel: string = 'Comment'
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.updateMany({
        where: { id, status: 'RESPONDED' },
        data: { status: restoredStatus, aiDraftResponse: draftResponse, finalResponse: null, respondedAt: null },
      })
      return
    } catch (rollbackErr) {
      console.error(`Rollback failed for ${entityLabel.toLowerCase()} ${id} (attempt ${attempt}/3):`, rollbackErr)
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
  console.error(
    `${entityLabel} ${id} may be permanently stuck marked RESPONDED with no reply actually sent -- ` +
    `all 3 rollback attempts failed. Needs manual investigation/reconciliation.`
  )
}
