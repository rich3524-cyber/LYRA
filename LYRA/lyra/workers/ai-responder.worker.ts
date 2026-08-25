import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { getProvider } from '@/services/social/provider'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { getPlatformLabel } from '@/lib/platform-labels'
import { rollbackCommentClaim } from '@/lib/comment-rollback'

interface AiResponseJobData {
  commentId: string
  autoPost: boolean
}

interface AiResponseJobDeps {
  prisma: {
    comment: {
      findUnique: typeof prisma.comment.findUnique
      updateMany: typeof prisma.comment.updateMany
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
  generateCommentResponse: typeof generateCommentResponse
  getProvider: typeof getProvider
}

const defaultDeps: AiResponseJobDeps = { prisma, generateCommentResponse, getProvider }

// Rolls a comment this job's own claim above just set to RESPONDED back to
// AI_DRAFTED, for the two cases where the claim won but the send itself
// either definitely didn't happen (no socialAccount found) or can't be
// confirmed to have happened (replyToComment threw -- see the accepted risk
// noted at that call site below).
//
// Wrapped in the same inline-retry pattern post-publisher.worker.ts already
// uses for its post-publish PUBLISHED write (post-publisher.worker.ts:113-124),
// and for the identical reason: once the claim above has flipped the comment
// to RESPONDED, this write is not allowed to just throw and propagate
// uncaught out of processAiResponseJob. A transient DB blip on this exact
// write would otherwise make BullMQ retry the whole job -- and the retry's
// very first check (comment.status === 'RESPONDED', at the top of this
// function) would see this comment as already answered and return
// immediately. Net effect: the comment stays permanently marked RESPONDED
// with finalResponse set, no reply was ever actually sent, and no human ever
// follows up -- it wouldn't even appear in the Pending tab. Three attempts
// with brief backoff cover ordinary transient blips without a BullMQ-level
// retry ever being needed.
//
// Unlike post-publisher's PUBLISHING fallback, exhausting all retries here
// is NOT a safe "stale" state to be left in -- post-publisher's worst case
// is "we don't know if it published," which is at least an honest reflection
// of reality; this worker's worst case is "wrongly marked as answered,"
// which actively hides that the customer never heard back. If every attempt
// below still fails there is genuinely nothing more this function can do
// beyond logging loudly (see the final console.error). That residual risk is
// accepted for now rather than resolved here -- it needs a deliberate design
// decision (e.g. a periodic reconciliation job that flags RESPONDED comments
// with no matching outbound send record) that's out of scope for this fix.
async function rollbackToDraft(deps: AiResponseJobDeps, commentId: string, draftResponse: string): Promise<void> {
  await rollbackCommentClaim(deps.prisma.comment, commentId, draftResponse)
}

// Exported (rather than left as an anonymous closure passed to `new Worker(...)`)
// so it's directly unit-testable with mocked deps -- see
// ai-responder.worker.test.ts. Mirrors the DI shape of
// post-publisher.worker.ts's processPublishJob.
export async function processAiResponseJob(jobData: AiResponseJobData, deps: AiResponseJobDeps = defaultDeps): Promise<void> {
  const { commentId, autoPost } = jobData

  // Cheap, non-atomic early exit. This is a cost optimization, not a
  // correctness guard -- it just avoids wasting an AI generation call on a
  // comment that's already resolved. The real correctness guarantees come
  // from the atomic `updateMany` claims below, which close the race window
  // between this read and any later write. This queue's jobId is stable per
  // comment (`respond-${comment.id}`, see comment-monitor.worker.ts and
  // app/api/zernio/webhook/route.ts), so BullMQ itself already prevents two
  // truly concurrent attempts of the identical queued job -- the race this
  // guards against is a stalled or re-delivered attempt of this job
  // overlapping a fresh one, or a concurrent call to
  // POST /api/mcp/respond-to-item or the manual "Reply" button's
  // POST /api/comments/[id]/reply acting on the same comment.
  const comment = await deps.prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.status === 'ESCALATED' || comment.status === 'RESPONDED') return

  const [brandProfile, guardrails] = await Promise.all([
    deps.prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
    deps.prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
  ])

  const result = await deps.generateCommentResponse(comment, brandProfile, guardrails)

  if (result.shouldEscalate) {
    // Guarded the same way as every other status write below: a concurrent
    // process (a stalled/re-delivered attempt of this same job, or
    // respond_to_item) could have already claimed RESPONDED/ESCALATED
    // between the findUnique above and this write. Without this predicate,
    // this write would silently clobber that status back to ESCALATED. No
    // rollback needed here -- losing the race just means "don't overwrite an
    // already-resolved comment," nothing external has happened yet.
    const escalated = await deps.prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status:           'ESCALATED',
        isEscalated:      true,
        escalationReason: result.escalationReason,
        sentiment:        result.sentiment,
      },
    })
    if (escalated.count === 0) {
      console.log(`Comment ${commentId} already resolved by a concurrent process -- skipping escalation write`)
      return
    }

    // Best-effort context lookup for the alert -- kept outside the write
    // above and swallowed on failure so a lookup problem can never undo an
    // escalation that has already happened. notifyChannel is itself
    // fail-open (see channel-notifier.ts), so this is belt and braces.
    try {
      const account = await deps.prisma.socialAccount.findUnique({
        where:  { id: comment.socialAccountId },
        select: { platform: true, workspace: { select: { name: true } } },
      })
      if (account) {
        await notifyChannel(
          comment.workspaceId,
          {
            event:            'COMMENT_ESCALATED',
            workspaceName:    account.workspace.name,
            platform:         getPlatformLabel(account.platform),
            excerpt:          comment.content,
            authorName:       comment.authorName,
            escalationReason: result.escalationReason ?? null,
          },
          // One alert per comment reaching ESCALATED, not per attempt -- a
          // concurrent manual Escalate click racing this worker (or a
          // stalled/re-delivered job) would otherwise double up.
          { dedupeKey: `escalated-${commentId}` }
        )
      }
    } catch (err) {
      console.error(`Failed to notify channel for escalated comment ${commentId}:`, err)
    }
    return
  }

  if (autoPost && result.response) {
    // Atomic claim, taken BEFORE calling the provider -- this is the actual
    // fix for the double-send bug. As noted above, this queue's stable jobId
    // means BullMQ itself already rules out two truly concurrent attempts of
    // the identical job, so the race this claim closes is: (a) a stalled or
    // re-delivered attempt of this job overlapping a fresh one for the same
    // comment, and (b) a concurrent call to POST /api/mcp/respond-to-item, or
    // the manual "Reply" button's POST /api/comments/[id]/reply, acting on
    // the same comment while this job is mid-flight. Claiming straight to
    // RESPONDED here, keyed on the comment still NOT being
    // RESPONDED/ESCALATED, means only one of those concurrent writers can
    // win this write -- only the winner proceeds to the account lookup and
    // the actual send. This exactly matches the claim in
    // app/api/mcp/respond-to-item/route.ts. POST /api/comments/[id]/reply
    // has the equivalent fix but a deliberately different predicate (`status
    // !== 'RESPONDED'`, not excluding ESCALATED) -- that route is the
    // human-facing manual "Reply" button, and ESCALATED comments must remain
    // repliable through it even though every autonomous path (this worker,
    // respond-to-item) refuses them; see that route's own comments.
    const claimed = await deps.prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data:  { status: 'RESPONDED', finalResponse: result.response, respondedAt: new Date(), sentiment: result.sentiment },
    })
    if (claimed.count === 0) {
      // Someone else -- a stalled/re-delivered attempt of this job, or a
      // concurrent respond_to_item / manual-reply call -- already claimed
      // this comment. The provider must never be called in this branch;
      // that's the whole point of claiming first.
      console.log(`Comment ${commentId} lost the send race to a concurrent process -- skipping auto-reply`)
      return
    }

    try {
      const account = await deps.prisma.socialAccount.findUnique({
        where: { id: comment.socialAccountId },
      })
      if (!account) {
        // The claim above already flipped this comment to RESPONDED before we
        // knew an account even existed to send through -- roll it back to
        // AI_DRAFTED (preserving the draft) so the comment doesn't get stuck
        // falsely marked RESPONDED with nothing ever actually sent. See
        // rollbackToDraft for why this must not simply throw on failure.
        await rollbackToDraft(deps, commentId, result.response)
        return
      }

      await deps.getProvider(account).replyToComment(
        account,
        comment.platformPostId ?? '',
        comment.platformCommentId,
        result.response
      )
      // No further write needed -- the claim above already set
      // RESPONDED/finalResponse/respondedAt.
    } catch (err) {
      console.error(`Auto-reply failed for comment ${commentId}:`, err)
      // Roll back so this comment lands back in the human-facing Pending/
      // AI_DRAFTED queue instead of being silently lost as a falsely
      // "answered" comment. This accepts the same narrow risk documented at
      // the equivalent rollback in app/api/mcp/respond-to-item/route.ts
      // (search "accepts a narrow risk" there): a thrown error occasionally
      // means the platform actually received the reply and only the
      // confirmation was lost (e.g. a timeout after successful delivery), in
      // which case this rollback is wrong and a later resend -- whether a
      // fresh auto-post attempt or a human clicking Reply in the dashboard --
      // could double-post. That risk arguably matters MORE here than in the
      // MCP route: this rollback's whole purpose is to land the comment in a
      // queue a human is expected to act on, i.e. it's specifically inviting
      // the manual resend that could double-post. It's accepted anyway for
      // the same reason as that route: a comment permanently stuck as
      // "RESPONDED" with no real reply ever sent and no way to retry is
      // judged the worse failure mode of the two.
      await rollbackToDraft(deps, commentId, result.response)
    }
  } else {
    // Draft-only path (autoPost false, or the model produced no response).
    // Guarded with the same notIn predicate as the escalation write above --
    // nothing external happens here either, but a concurrent process could
    // have changed the comment's status between the findUnique at the top of
    // this function and this write, and this must not silently overwrite it.
    const drafted = await deps.prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: result.response, sentiment: result.sentiment },
    })
    if (drafted.count === 0) {
      console.log(`Comment ${commentId} already resolved by a concurrent process -- skipping draft write`)
    }
  }
}

const worker = new Worker(
  'ai-responding',
  (job) => processAiResponseJob(job.data as AiResponseJobData),
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`AI responder failed for comment ${job?.data.commentId}:`, err)
})

// Without this, an error the Worker can't attribute to a specific job (a lost
// Redis connection, a malformed job payload) is an unhandled 'error' event on
// an EventEmitter, which crashes the whole worker process.
worker.on('error', (err) => {
  console.error('AI responder worker error:', err)
})

export default worker
