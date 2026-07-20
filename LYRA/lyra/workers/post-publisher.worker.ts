import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/services/social/provider'

const worker = new Worker(
  'post-publishing',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await prisma.post.findUnique({
      where:   { id: postId },
      include: { socialAccount: true },
    })
    if (!post) return

    if (post.status === 'SCHEDULED') {
      // Crisis check — skip publishing but keep post SCHEDULED so it retries once
      // crisis resolves. Only relevant on the first attempt (see below for why a
      // retry of this same job doesn't come back through here).
      try {
        const workspaceMeta = await prisma.workspace.findUnique({
          where:  { id: post.workspaceId },
          select: { crisisActive: true },
        })
        if (workspaceMeta?.crisisActive) {
          console.log(`Skipping post ${post.id} — crisis active for workspace ${post.workspaceId}`)
          return
        }
      } catch (err) {
        console.error(`Crisis check failed for post ${post.id}:`, err)
        return  // Let BullMQ retry this job
      }

      // Atomic compare-and-swap: only claim the post if it's still SCHEDULED. Closes
      // the race window between the findUnique check above and this write -- two
      // overlapping jobs for the same postId (e.g. a retry racing a duplicate
      // enqueue) can no longer both pass the check and both publish.
      const claimed = await prisma.post.updateMany({
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

    const { platformPostId, zernioPostId } = await getProvider(post.socialAccount).publish(post.socialAccount, {
      content: post.content,
      mediaUrls: post.mediaUrls,
    })
    await prisma.post.update({
      where: { id: postId },
      data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId, zernioPostId, failureReason: null },
    })
  },
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

export default worker
