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
    if (!post || post.status !== 'SCHEDULED') return

    // Crisis check — skip publishing but keep post SCHEDULED so it retries once crisis resolves
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

    try {
      const { platformPostId, zernioPostId } = await getProvider(post.socialAccount).publish(post.socialAccount, {
        content: post.content,
        mediaUrls: post.mediaUrls,
      })
      await prisma.post.update({
        where: { id: postId },
        data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId, zernioPostId },
      })
    } catch (err) {
      await prisma.post.update({ where: { id: postId }, data: { status: 'FAILED' } })
      throw err
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`Post ${job?.data.postId} failed:`, err)
})

export default worker
