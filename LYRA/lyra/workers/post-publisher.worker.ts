import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/services/social/provider'

interface PublishJobData {
  postId: string
}

interface PublishJobDeps {
  prisma: {
    post: {
      findUnique: typeof prisma.post.findUnique
      updateMany: typeof prisma.post.updateMany
      update: typeof prisma.post.update
    }
    workspace: {
      findUnique: typeof prisma.workspace.findUnique
    }
  }
  getProvider: typeof getProvider
}

const defaultDeps: PublishJobDeps = { prisma, getProvider }

// Exported (rather than left as an anonymous closure passed to `new Worker(...)`)
// so it's directly unit-testable with mocked deps -- see
// post-publisher.worker.test.ts.
export async function processPublishJob(jobData: PublishJobData, deps: PublishJobDeps = defaultDeps): Promise<void> {
  const { postId } = jobData

  const post = await deps.prisma.post.findUnique({
    where:   { id: postId },
    include: { socialAccount: true },
  })
  if (!post) return

  if (post.status === 'SCHEDULED') {
    // Crisis check -- if the workspace has an active crisis, or the check
    // itself fails, this must NOT resolve the job as completed. Returning here
    // (the old behaviour) makes BullMQ mark the job "completed"; combined with
    // this queue's stable `post-${postId}` jobId and removeOnComplete, a later
    // re-add of the same postId (see the cron in publish-due-posts/route.ts)
    // silently no-ops -- BullMQ won't create a second job under an id that
    // still exists in its completed set. The post would then never publish
    // once the crisis clears, until enough unrelated jobs evict the stale
    // completed entry. Throwing instead makes BullMQ treat this as a real
    // failed attempt and retry with the queue's configured backoff -- the post
    // stays SCHEDULED throughout (see the `failed` handler below), so once
    // retries are exhausted the cron's stale-job cleanup can pick it back up
    // and give it a fresh attempt after the crisis resolves.
    let workspaceMeta: { crisisActive: boolean } | null
    try {
      workspaceMeta = await deps.prisma.workspace.findUnique({
        where:  { id: post.workspaceId },
        select: { crisisActive: true },
      })
    } catch (err) {
      console.error(`Crisis check failed for post ${post.id}:`, err)
      throw err
    }
    if (workspaceMeta?.crisisActive) {
      console.log(`Deferring post ${post.id} — crisis active for workspace ${post.workspaceId}`)
      throw new Error(`Workspace ${post.workspaceId} has an active crisis — deferring publish`)
    }

    // Atomic compare-and-swap: only claim the post if it's still SCHEDULED. Closes
    // the race window between the findUnique check above and this write -- two
    // overlapping jobs for the same postId (e.g. a retry racing a duplicate
    // enqueue) can no longer both pass the check and both publish.
    const claimed = await deps.prisma.post.updateMany({
      where: { id: postId, status: 'SCHEDULED' },
      data:  { status: 'PUBLISHING' },
    })
    if (claimed.count === 0) return
  } else if (post.status !== 'PUBLISHING') {
    // Already resolved (published/failed/cancelled) by an earlier attempt of
    // this same job or a different path -- nothing left to do. This is also
    // the fix for a real bug: the old version set status to FAILED inside the
    // catch block below on the *first* failed attempt, then re-threw for
    // BullMQ to retry -- but the retry's next invocation hit this exact check,
    // saw FAILED (not SCHEDULED), and silently returned. So the configured
    // 5-attempt exponential-backoff retry never actually got a second real
    // attempt; it only ever looked like it did. Post status is no longer
    // touched on failure until BullMQ has genuinely exhausted every attempt
    // (see the `failed` handler below), so a retry of this same job now
    // legitimately falls through to PUBLISHING and tries publish() again.
    return
  }
  // else: status is already PUBLISHING -- a retry of this same job (jobId is
  // stable per postId, so BullMQ never runs two overlapping attempts for the
  // same post), so just retry publish() below without re-claiming.

  const { platformPostId, zernioPostId } = await deps.getProvider(post.socialAccount).publish(post.socialAccount, {
    postId: post.id,
    content: post.content,
    mediaUrls: post.mediaUrls,
  })

  // The platform publish already happened and cannot be undone -- from here
  // on, nothing is allowed to throw, because an uncaught error would make
  // BullMQ retry this job, and a retry falls straight through to calling
  // publish() again above (status is still PUBLISHING, not SCHEDULED). That
  // is a real incident that happened in production: an MP4 published to
  // Instagram successfully, a transient DB error on this exact update threw,
  // BullMQ retried, and the retry hit Instagram again -- Zernio correctly
  // rejected the duplicate with a 409, which then surfaced as a confusing
  // "Failed" post in the Calendar for content that had actually gone out
  // fine. A few inline attempts (not BullMQ-level retries, so publish() is
  // never called again) cover ordinary transient DB blips; if all of them
  // fail the post is left at PUBLISHING rather than the correct PUBLISHED --
  // stale-but-safe is the only acceptable failure mode here.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await deps.prisma.post.update({
        where: { id: postId },
        data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId, zernioPostId, failureReason: null },
      })
      break
    } catch (err) {
      console.error(`Post ${postId} published to the platform but recording PUBLISHED failed (attempt ${attempt}/3):`, err)
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}

const worker = new Worker(
  'post-publishing',
  (job) => processPublishJob(job.data as PublishJobData),
  { connection: redis, concurrency: 5 }
)

worker.on('failed', async (job, err) => {
  console.error(`Post ${job?.data.postId} failed:`, err)
  if (!job) return

  // Only mark the post permanently FAILED once BullMQ has genuinely exhausted
  // every configured retry attempt -- if more retries remain, leave it at
  // PUBLISHING so the next attempt (see above) picks it back up.
  const maxAttempts = job.opts.attempts ?? 1
  if (job.attemptsMade < maxAttempts) return

  const { postId } = job.data as { postId: string }
  await prisma.post.updateMany({
    where: { id: postId, status: 'PUBLISHING' },
    data:  {
      status: 'FAILED',
      failureReason: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    },
  })
})

worker.on('error', (err) => {
  console.error('post-publisher worker error:', err)
})

export default worker
