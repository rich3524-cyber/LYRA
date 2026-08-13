import { prisma } from './prisma'

type CommentUpdateMany = { updateMany: typeof prisma.comment.updateMany }

/**
 * Rolls a comment this caller's own claim just set to RESPONDED back to a
 * state a human (or a retry) can act on again, for the case where the claim
 * won but the actual send didn't happen. Single shared implementation for
 * the three call sites that each need this exact write --
 * workers/ai-responder.worker.ts, app/api/comments/[id]/reply/route.ts, and
 * app/api/mcp/respond-to-item/route.ts -- after a prior gap where the third
 * copy had no retry loop and didn't restore aiDraftResponse, risking a
 * comment permanently stuck "answered" with nothing actually sent.
 *
 * Own-claim-scoped (status: 'RESPONDED'), not a broader predicate: only rolls
 * back if the comment is still in the exact RESPONDED state the caller's own
 * claim just set. If a concurrent write changed it in between (e.g. a human
 * resolved it some other way while this was retrying), this correctly no-ops
 * instead of clobbering whatever that other state now is.
 *
 * Three attempts with brief backoff cover ordinary transient DB blips. If
 * every attempt still fails there is genuinely nothing more this function can
 * do beyond logging loudly for manual reconciliation -- an accepted residual
 * risk, not something this retry loop can fully close.
 */
export async function rollbackCommentClaim(
  db: CommentUpdateMany,
  commentId: string,
  draftResponse: string,
  restoredStatus: 'AI_DRAFTED' | 'ESCALATED' = 'AI_DRAFTED'
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.updateMany({
        where: { id: commentId, status: 'RESPONDED' },
        data: { status: restoredStatus, aiDraftResponse: draftResponse, finalResponse: null, respondedAt: null },
      })
      return
    } catch (rollbackErr) {
      console.error(`Rollback failed for comment ${commentId} (attempt ${attempt}/3):`, rollbackErr)
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
  console.error(
    `Comment ${commentId} may be permanently stuck marked RESPONDED with no reply actually sent -- ` +
    `all 3 rollback attempts failed. Needs manual investigation/reconciliation.`
  )
}
