import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { getProvider } from '@/services/social/provider'

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
  // between this read and any later write (two concurrent invocations of
  // this same job -- BullMQ retries, overlapping enqueues -- or a concurrent
  // call to POST /api/mcp/respond-to-item acting on the same comment).
  const comment = await deps.prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.status === 'ESCALATED' || comment.status === 'RESPONDED') return

  const [brandProfile, guardrails] = await Promise.all([
    deps.prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
    deps.prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
  ])

  const result = await deps.generateCommentResponse(comment, brandProfile, guardrails)

  if (result.shouldEscalate) {
    // Guarded the same way as every other status write below: a concurrent
    // process (this job's own retry, or respond_to_item) could have already
    // claimed RESPONDED/ESCALATED between the findUnique above and this
    // write. Without this predicate, this write would silently clobber that
    // status back to ESCALATED. No rollback needed here -- losing the race
    // just means "don't overwrite an already-resolved comment," nothing
    // external has happened yet.
    const escalated = await deps.prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status:           'ESCALATED',
        isEscalated:      true,
        escalationReason: result.escalationReason,
      },
    })
    if (escalated.count === 0) {
      console.log(`Comment ${commentId} already resolved by a concurrent process -- skipping escalation write`)
    }
    return
  }

  if (autoPost && result.response) {
    // Atomic claim, taken BEFORE calling the provider -- this is the actual
    // fix for the double-send bug. Two concurrent invocations of this same
    // job (BullMQ retries, overlapping enqueues) or a concurrent call to
    // POST /api/mcp/respond-to-item acting on the same comment could
    // otherwise both pass the findUnique check above and both send a real
    // reply. Claiming straight to RESPONDED here, keyed on the comment still
    // NOT being RESPONDED/ESCALATED, means only one concurrent caller can
    // win this write -- only the winner proceeds to the account lookup and
    // the actual send. This exactly matches the claim in
    // app/api/mcp/respond-to-item/route.ts.
    const claimed = await deps.prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data:  { status: 'RESPONDED', finalResponse: result.response, respondedAt: new Date() },
    })
    if (claimed.count === 0) {
      // Someone else -- this job's own duplicate, or respond_to_item --
      // already claimed this comment. The provider must never be called in
      // this branch; that's the whole point of claiming first.
      console.log(`Comment ${commentId} lost the send race to a concurrent process -- skipping auto-reply`)
      return
    }

    try {
      const account = await deps.prisma.socialAccount.findUnique({
        where: { id: comment.socialAccountId },
      })
      if (!account) {
        // The claim above already flipped this comment to RESPONDED before we
        // knew an account even existed to send through. Roll it back to
        // AI_DRAFTED (preserving the draft) so the comment doesn't get stuck
        // falsely marked RESPONDED with nothing ever actually sent.
        //
        // Own-claim-scoped (status: 'RESPONDED'), not the broader `notIn`
        // predicate: only roll back if the comment is still in the exact
        // RESPONDED state this job's own claim just set. If a concurrent
        // write changed it in between, this correctly no-ops instead of
        // clobbering whatever that other state now is.
        await deps.prisma.comment.updateMany({
          where: { id: commentId, status: 'RESPONDED' },
          data: { status: 'AI_DRAFTED', aiDraftResponse: result.response, finalResponse: null, respondedAt: null },
        })
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
      // Same rollback as the no-account case above, and for the same reason:
      // the claim already set RESPONDED, but the send itself never actually
      // succeeded (or we can't be sure it did), so this must not be left
      // looking like a completed reply. Scoped to status: 'RESPONDED' so it
      // can't clobber some other concurrent state change.
      await deps.prisma.comment.updateMany({
        where: { id: commentId, status: 'RESPONDED' },
        data: { status: 'AI_DRAFTED', aiDraftResponse: result.response, finalResponse: null, respondedAt: null },
      })
    }
  } else {
    // Draft-only path (autoPost false, or the model produced no response).
    // Guarded with the same notIn predicate as the escalation write above --
    // nothing external happens here either, but a concurrent process could
    // have changed the comment's status between the findUnique at the top of
    // this function and this write, and this must not silently overwrite it.
    const drafted = await deps.prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: result.response },
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
