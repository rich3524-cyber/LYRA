import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'

export const postQueue = new Queue('post-publishing', {
  connection: redis,
  defaultJobOptions: {
    attempts:         5,
    backoff:          { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50 },
  },
})

export async function schedulePost(postId: string, scheduledAt: Date) {
  const delay = scheduledAt.getTime() - Date.now()
  await postQueue.add(
    'publish-post',
    { postId },
    { delay: Math.max(0, delay), jobId: `post-${postId}` }
  )
}

export async function cancelPost(postId: string) {
  const job = await postQueue.getJob(postId)
  if (job) await job.remove()
}
