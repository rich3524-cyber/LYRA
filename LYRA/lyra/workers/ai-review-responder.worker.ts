import { prisma } from '@/lib/prisma'
import { generateReviewResponse } from '@/services/ai/response-generator'
import { getProvider } from '@/services/social/provider'
import { rollbackCommentClaim } from '@/lib/comment-rollback'

// Review-response counterpart to workers/ai-responder.worker.ts's
// processAiResponseJob. Deliberately a SEPARATE function in a separate file
// rather than a content-type branch threaded through processAiResponseJob --
// that function's atomic-claim/rollback logic is already dense and
// correctness-critical (it exists specifically to close a double-send bug),
// and Review's claim semantics, while structurally similar, are Review's own
// (its own model, own findUnique/updateMany delegate, own
// replyToReview(account, externalId, text) 3-arg provider call rather than
// replyToComment's 4-arg one). Mirroring the proven pattern in a parallel
// function keeps that pattern legible for both instead of adding a branch
// that has to reprove its correctness against every one of
// processAiResponseJob's existing race-condition comments.
//
// IMPORTANT: this file does NOT instantiate its own `new Worker(...)`. Both
// comment and review response jobs are enqueued onto the SAME BullMQ queue
// ('ai-responding', see lib/queues.ts's aiRespondQueue and
// workers/comment-monitor.worker.ts's enqueueReviewAiResponses, which already
// adds `{ reviewId, autoPost }` jobs there under the job name
// 'generate-review-response') -- comment-monitor.worker.ts's own comment on
// enqueueReviewAiResponses says a future worker would "consume this queue",
// singular, confirming that was always the intended design, not an oversight
// to fix by opening a second queue. BullMQ has no built-in per-job-name
// routing across multiple independent Worker instances listening to the same
// queue -- two generic Workers on one queue simply race for ALL jobs
// regardless of type, so a second `new Worker('ai-responding', ...)` here
// would risk a comment job being silently swallowed by a processor that only
// knows how to handle reviews (and vice versa). The single Worker that
// actually consumes 'ai-responding' lives in workers/ai-responder.worker.ts,
// and now dispatches by `job.name` to either processAiResponseJob (this
// file's sibling) or processAiReviewResponseJob (below) -- see the bottom of
// that file. This file exports only the pure, DI-testable processing
// function, exactly like processAiResponseJob itself.

export interface AiReviewResponseJobData {
  reviewId: string
  autoPost: boolean
}

interface AiReviewResponseJobDeps {
  prisma: {
    review: {
      findUnique: typeof prisma.review.findUnique
      updateMany: typeof prisma.review.updateMany
    }
    brandProfile: {
      findUnique: typeof prisma.brandProfile.findUnique
    }
    guardrail: {
      findMany: typeof prisma.guardrail.findMany
    }
    socialAccount: {
      findUnique: typeof prisma.socialAccount.findUnique
    }
  }
  generateReviewResponse: typeof generateReviewResponse
  getProvider: typeof getProvider
}

const defaultDeps: AiReviewResponseJobDeps = { prisma, generateReviewResponse, getProvider }

// Rolls a review this job's own claim above just set to RESPONDED back to
// AI_DRAFTED -- identical purpose and identical accepted risk as
// workers/ai-responder.worker.ts's own rollbackToDraft, just for Review.
// Delegates to the same shared, crash-safe rollbackCommentClaim
// implementation (lib/comment-rollback.ts) rather than a duplicated retry
// loop -- see that file's own comment for why it was generalized instead of
// copied.
async function rollbackToDraft(deps: AiReviewResponseJobDeps, reviewId: string, draftResponse: string): Promise<void> {
  await rollbackCommentClaim(deps.prisma.review, reviewId, draftResponse, 'AI_DRAFTED', 'Review')
}

// Exported (rather than left as an anonymous closure) so it's directly
// unit-testable with mocked deps -- see ai-review-responder.worker.test.ts.
// Mirrors processAiResponseJob's structure and race-condition guards
// exactly; see that function's own comments in
// workers/ai-responder.worker.ts for the full reasoning behind each guard,
// which applies identically here.
export async function processAiReviewResponseJob(
  jobData: AiReviewResponseJobData,
  deps: AiReviewResponseJobDeps = defaultDeps
): Promise<void> {
  const { reviewId, autoPost } = jobData

  // Cheap, non-atomic early exit -- see processAiResponseJob's identical
  // check for why this is a cost optimization, not the correctness
  // guarantee (that comes from the atomic `updateMany` claims below).
  const review = await deps.prisma.review.findUnique({ where: { id: reviewId } })
  if (!review || review.status === 'ESCALATED' || review.status === 'RESPONDED') return

  const [brandProfile, guardrails] = await Promise.all([
    deps.prisma.brandProfile.findUnique({ where: { workspaceId: review.workspaceId } }),
    deps.prisma.guardrail.findMany({ where: { workspaceId: review.workspaceId } }),
  ])

  const result = await deps.generateReviewResponse(review, brandProfile, guardrails)

  if (result.shouldEscalate) {
    // Guarded the same way as processAiResponseJob's escalation write: a
    // concurrent process (a stalled/re-delivered attempt of this same job, or
    // a manual reply through app/api/reviews/[id]/reply) could have already
    // claimed RESPONDED/ESCALATED between the findUnique above and this
    // write.
    const escalated = await deps.prisma.review.updateMany({
      where: { id: reviewId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status:           'ESCALATED',
        isEscalated:      true,
        escalationReason: result.escalationReason,
        sentiment:        result.sentiment,
      },
    })
    if (escalated.count === 0) {
      console.log(`Review ${reviewId} already resolved by a concurrent process -- skipping escalation write`)
    }
    // Deliberately no channel notification here, unlike
    // processAiResponseJob's COMMENT_ESCALATED alert -- there is no
    // REVIEW_ESCALATED entry in services/notifications/events.ts's canonical
    // event catalogue yet, and reusing COMMENT_ESCALATED's message text
    // (which says "comment" explicitly, see services/notifications/message.ts)
    // would mislabel a review alert. Adding a genuine REVIEW_ESCALATED event
    // is a larger, separate change (events.ts, message.ts, the Settings
    // toggle list, slack-formatter) out of scope for this task -- noted as a
    // known gap, not silently reused incorrectly.
    return
  }

  if (autoPost && result.response) {
    // Atomic claim, taken BEFORE calling the provider -- see
    // processAiResponseJob's own comment on its equivalent claim for the
    // full double-send-bug reasoning, which applies identically here.
    const claimed = await deps.prisma.review.updateMany({
      where: { id: reviewId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data:  { status: 'RESPONDED', finalResponse: result.response, respondedAt: new Date(), sentiment: result.sentiment },
    })
    if (claimed.count === 0) {
      console.log(`Review ${reviewId} lost the send race to a concurrent process -- skipping auto-reply`)
      return
    }

    try {
      const account = await deps.prisma.socialAccount.findUnique({
        where: { id: review.socialAccountId },
      })
      if (!account) {
        // The claim above already flipped this review to RESPONDED before we
        // knew an account even existed to send through -- roll it back to
        // AI_DRAFTED (preserving the draft), same reasoning as
        // processAiResponseJob's identical branch.
        await rollbackToDraft(deps, reviewId, result.response)
        return
      }

      // 3-arg replyToReview(account, externalId, text) -- reviews have no
      // platformPostId concept (there's no parent post a review is attached
      // to the way a comment is), unlike replyToComment's 4-arg
      // (account, postExternalId, externalId, text) signature. See
      // services/social/provider/types.ts. review.zernioReviewId is the
      // provider's review id -- NormalizedReview.externalId is persisted
      // there (see that same file's comment on NormalizedReview.externalId).
      await deps.getProvider(account).replyToReview(account, review.zernioReviewId, result.response)
      // No further write needed -- the claim above already set
      // RESPONDED/finalResponse/respondedAt.
    } catch (err) {
      console.error(`Auto-reply failed for review ${reviewId}:`, err)
      // Same accepted risk as processAiResponseJob's identical catch: a
      // thrown error occasionally means the platform actually received the
      // reply and only the confirmation was lost, in which case this
      // rollback is wrong and a later resend could double-post -- judged the
      // lesser risk versus a review permanently stuck "RESPONDED" with
      // nothing ever actually sent.
      await rollbackToDraft(deps, reviewId, result.response)
    }
  } else {
    // Draft-only path (autoPost false, or the model produced no response).
    // Guarded with the same notIn predicate as the escalation write above.
    const drafted = await deps.prisma.review.updateMany({
      where: { id: reviewId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: result.response, sentiment: result.sentiment },
    })
    if (drafted.count === 0) {
      console.log(`Review ${reviewId} already resolved by a concurrent process -- skipping draft write`)
    }
  }
}
