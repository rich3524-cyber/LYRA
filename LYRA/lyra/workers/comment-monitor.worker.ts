import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { checkAndTriggerCrisis } from '@/services/ai/crisis-detector'
import * as linkedin from '@/services/social/linkedin'
import { aiRespondQueue } from '@/lib/queues'
import { getProvider } from '@/services/social/provider'
import type { NormalizedReview } from '@/services/social/provider/types'
import { ZernioApiError } from '@/services/social/zernio-client'

interface NormalizedRow {
  platformCommentId: string
  platformPostId?: string
  authorName: string
  content: string
  platformCreatedAt: Date
}

interface CommentMonitorJobData {
  socialAccountId: string
}

interface CommentMonitorJobDeps {
  prisma: {
    socialAccount: {
      findUnique: typeof prisma.socialAccount.findUnique
    }
    comment: {
      createManyAndReturn: typeof prisma.comment.createManyAndReturn
    }
    review: {
      createManyAndReturn: typeof prisma.review.createManyAndReturn
    }
  }
  getProvider: typeof getProvider
}

const defaultDeps: CommentMonitorJobDeps = { prisma, getProvider }

/**
 * Enqueues an AI-response job for each newly-created comment. The comments are
 * already persisted by the time this runs, so a mid-batch rejection must not
 * orphan the remaining ones -- Promise.allSettled (not Promise.all) attempts
 * every comment regardless of another's failure, and logs each failure since
 * a comment enqueue failure here has no other retry path.
 */
export async function enqueueAiResponses(
  comments: Array<{ id: string }>,
  autoPost: boolean
): Promise<void> {
  const results = await Promise.allSettled(
    comments.map((comment) =>
      aiRespondQueue.add(
        'generate-response',
        { commentId: comment.id, autoPost },
        { jobId: `respond-${comment.id}` }
      )
    )
  )

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failures.length > 0) {
    console.error(
      `Comment monitor: failed to enqueue AI response for ${failures.length}/${comments.length} comment(s):`,
      failures.map((f) => f.reason)
    )
  }
}

/**
 * Review-response counterpart to enqueueAiResponses above -- same
 * Promise.allSettled fan-out so one failed enqueue can't orphan the rest of
 * an already-persisted batch of reviews. Uses a distinguishable job name
 * ('generate-review-response') and payload shape (reviewId, not commentId)
 * since no review-response worker consumes this queue yet (that's a later
 * phase) -- this only needs to enqueue correctly, not process the job.
 */
export async function enqueueReviewAiResponses(
  reviews: Array<{ id: string }>,
  autoPost: boolean
): Promise<void> {
  const results = await Promise.allSettled(
    reviews.map((review) =>
      aiRespondQueue.add(
        'generate-review-response',
        { reviewId: review.id, autoPost },
        { jobId: `respond-review-${review.id}` }
      )
    )
  )

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failures.length > 0) {
    console.error(
      `Comment monitor: failed to enqueue AI response for ${failures.length}/${reviews.length} review(s):`,
      failures.map((f) => f.reason)
    )
  }
}

// Exported (rather than left as an anonymous closure passed to `new Worker(...)`)
// so it's directly unit-testable with mocked deps -- mirrors
// post-publisher.worker.ts's processPublishJob / ai-responder.worker.ts's
// processAiResponseJob. See comment-monitor.worker.test.ts.
export async function processCommentMonitorJob(
  jobData: CommentMonitorJobData,
  deps: CommentMonitorJobDeps = defaultDeps
): Promise<void> {
  const { socialAccountId } = jobData

  const account = await deps.prisma.socialAccount.findUnique({
    where:   { id: socialAccountId },
    include: { workspace: true },
  })
  if (!account || !account.isActive) return

  let normalizedRows: NormalizedRow[] = []
  let normalizedReviews: NormalizedReview[] = []

  // Zernio-connected accounts (the default connection method going forward)
  // never have a local accessToken -- Zernio holds the platform credentials
  // on their own side. This fell through to the accessToken check below and
  // was silently skipped on every run, meaning this cron never ingested a
  // single comment for any Zernio account -- confirmed live 21 Jul 2026 via
  // production logs showing the identical skip firing on the manual sync
  // route. Route these through the same provider abstraction
  // publish()/replyToComment() already use instead.
  if (account.provider === 'ZERNIO' && account.zernioAccountId != null) {
    try {
      const normalized = await deps.getProvider(account).fetchRecentComments(account)
      // Mirror the manual sync route's self-comment filter (and the webhook's
      // isOwner/id-based one) -- this branch had NO self-comment filtering at
      // all, unlike the other two ingestion paths. Confirmed live 2026-07-22:
      // an AI-drafted reply the account itself posted got picked back up by
      // this cron as a "new" incoming comment, and the AI drafted a reply to
      // its own reply. This cron runs automatically and far more often than
      // someone clicking the manual Sync button, so it's the likeliest path
      // for a self-comment to slip through uncaught.
      const selfName   = account.name?.toLowerCase()
      const selfHandle = account.handle?.toLowerCase()
      const incoming   = normalized.filter((c) => {
        if (selfName   && c.authorName?.toLowerCase()   === selfName)   return false
        if (selfHandle && c.authorHandle?.toLowerCase() === selfHandle) return false
        return true
      })
      normalizedRows = incoming.map((c) => ({
        platformCommentId: c.externalId,
        platformPostId:    c.postExternalId,
        authorName:        c.authorName || 'Unknown',
        content:           c.text,
        platformCreatedAt: c.createdAt,
      }))
    } catch (err) {
      // Some platforms (e.g. TikTok) don't support comments at all via Zernio --
      // a permanent, expected condition for that account, not a transient
      // failure worth alerting on. Confirmed live 2026-07-21: this was logging
      // as an error on every single run for every TikTok account.
      if (err instanceof ZernioApiError && (err.body as { code?: string } | undefined)?.code === 'PLATFORM_NOT_SUPPORTED') {
        return
      }
      console.error(`Comment monitor: Zernio fetch failed for account ${socialAccountId}:`, err)
      return
    }

    // Independent try/catch from the comment-fetching one above -- a
    // review-fetch failure must not prevent the comments already fetched
    // above from being persisted below. (The reverse -- a comment-fetch
    // failure blocking reviews -- can't happen here since a comment-fetch
    // failure already returns out of the job above, before this point is
    // reached; the next cron tick retries both together.) Gated on
    // GOOGLE_BUSINESS specifically -- fetchReviews is only meaningful for
    // that platform.
    if (account.platform === 'GOOGLE_BUSINESS') {
      try {
        normalizedReviews = await deps.getProvider(account).fetchReviews(account)
      } catch (err) {
        // Mirrors the PLATFORM_NOT_SUPPORTED handling for comments above --
        // a permanent, expected condition for accounts Zernio doesn't
        // support review sync for, not a transient failure worth alerting on.
        if (err instanceof ZernioApiError && (err.body as { code?: string } | undefined)?.code === 'PLATFORM_NOT_SUPPORTED') {
          // fall through -- comments fetched above still get persisted below
        } else {
          console.error(`Comment monitor: Zernio review fetch failed for account ${socialAccountId}:`, err)
        }
      }
    }
  } else {
    if (!account.accessToken) {
      console.error(`Comment monitor: account ${socialAccountId} has no access token — skipping`)
      return
    }

    const token    = decrypt(account.accessToken)
    const platform = account.platform

    let rawComments: Array<{ id: string; message: string; from?: { name?: string; id?: string }; created_time: string }> = []

    try {
      if (platform === 'FACEBOOK') {
        const res  = await fetch(
          `https://graph.facebook.com/v19.0/${account.platformId}/feed?fields=comments{message,from,created_time}&access_token=${token}`
        )
        const data = await res.json() as { data?: Array<{ comments?: { data?: typeof rawComments } }> }
        for (const post of data.data ?? []) {
          rawComments = rawComments.concat(post.comments?.data ?? [])
        }
      } else if (platform === 'INSTAGRAM') {
        const res  = await fetch(
          `https://graph.facebook.com/v19.0/${account.platformId}/media?fields=comments{text,username,timestamp}&access_token=${token}`
        )
        const data = await res.json() as { data?: Array<{ comments?: { data?: Array<{ id: string; text: string; username?: string; timestamp: string }> } }> }
        for (const media of data.data ?? []) {
          for (const c of media.comments?.data ?? []) {
            rawComments.push({ id: c.id, message: c.text, from: { name: c.username }, created_time: c.timestamp })
          }
        }
      } else if (platform === 'LINKEDIN') {
        // Fetch recent org posts then gather comments.
        // platformCommentId = full comment URN encodes post context for later replies.
        const posts = await linkedin.getOrgPosts(token, account.platformId)
        for (const post of posts.slice(0, 10)) {
          const comments = await linkedin.getPostComments(token, post.urn)
          for (const c of comments) {
            rawComments.push({
              id:           c.commentUrn,
              message:      c.text,
              from:         { name: 'LinkedIn Member' },
              created_time: new Date(c.createdAt).toISOString(),
            })
          }
        }
      }
      // Other platforms: add polling logic here as APIs are onboarded
    } catch (err) {
      console.error(`Failed to fetch comments for account ${socialAccountId}:`, err)
      return
    }

    normalizedRows = rawComments.map((comment) => ({
      platformCommentId: comment.id,
      authorName:        comment.from?.name ?? 'Unknown',
      content:           comment.message,
      platformCreatedAt: new Date(comment.created_time),
    }))
  }

  // createManyAndReturn + skipDuplicates replaces a per-comment findFirst-then-create
  // pair (an N+1 that ran 2 queries per fetched comment). skipDuplicates relies on the
  // @@unique([socialAccountId, platformCommentId]) constraint and also closes the race
  // between two overlapping monitor runs for the same account: only rows this call
  // actually inserted come back, so a comment concurrently inserted by another run is
  // silently excluded here rather than double-queued for an AI response below.
  const createdComments = normalizedRows.length === 0 ? [] : await deps.prisma.comment.createManyAndReturn({
    data: normalizedRows.map((row) => ({
      workspaceId:       account.workspaceId,
      socialAccountId:   account.id,
      platformCommentId: row.platformCommentId,
      platformPostId:    row.platformPostId,
      authorName:        row.authorName,
      content:           row.content,
      platformCreatedAt: row.platformCreatedAt,
      status:            'PENDING' as const,
    })),
    skipDuplicates: true,
  })

  const savedComments = createdComments.map((c) => ({ id: c.id, content: c.content }))

  // Same createManyAndReturn + skipDuplicates pattern as comments above, keyed
  // on the Review model's own @@unique([socialAccountId, zernioReviewId]).
  //
  // Wrapped in its own try/catch -- independent from the comment-persistence
  // call above, which is intentionally left unguarded since a comment write
  // failure should still abort the job (there's nothing meaningful left to
  // do without persisted comments). Reviews are different: by this point
  // `createdComments`/`savedComments` are already durably persisted, and
  // enqueueAiResponses/checkAndTriggerCrisis below depend on them, not on
  // reviews. If this insert throws (DB blip, connection reset -- anything
  // not already covered by skipDuplicates) and is left to propagate, the
  // exception would abort the job before those calls run. BullMQ retries
  // the job (attempts: 3), but on retry skipDuplicates would silently
  // exclude the already-inserted comments from createdComments, permanently
  // excluding them from AI-response enqueueing and crisis detection for a
  // failure that had nothing to do with comments. Degrading to
  // createdReviews = [] here isolates that failure to "no reviews persisted
  // from this batch" instead, mirroring the review-FETCH try/catch's
  // philosophy one step further downstream.
  let createdReviews: Awaited<ReturnType<typeof deps.prisma.review.createManyAndReturn>> = []
  if (normalizedReviews.length > 0) {
    try {
      createdReviews = await deps.prisma.review.createManyAndReturn({
        data: normalizedReviews.map((r) => ({
          workspaceId:       account.workspaceId,
          socialAccountId:   account.id,
          zernioReviewId:    r.externalId,
          rating:            r.rating,
          authorName:        r.authorName,
          text:              r.text,
          platformCreatedAt: r.createdAt,
          status:            'PENDING' as const,
        })),
        skipDuplicates: true,
      })
    } catch (err) {
      console.error(`Comment monitor: failed to persist reviews for account ${socialAccountId}:`, err)
    }
  }

  const mode = account.workspace.aiResponseMode
  if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
    await enqueueAiResponses(createdComments, mode === 'FULL')
    await enqueueReviewAiResponses(createdReviews, mode === 'FULL')
  }

  if (savedComments.length > 0) {
    await checkAndTriggerCrisis(account.workspaceId, savedComments)
  }
}

const worker = new Worker(
  'comment-monitoring',
  async (job) => {
    await processCommentMonitorJob(job.data as CommentMonitorJobData)
  },
  { connection: redis, concurrency: 10 }
)

worker.on('failed', (job, err) => {
  console.error(`Comment monitor failed for account ${job?.data.socialAccountId}:`, err)
})

worker.on('error', (err) => {
  console.error('Comment monitor worker error:', err)
})

export default worker
