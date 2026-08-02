import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { zernioClient } from '@/services/social/zernio-client'

interface MetricsSyncJobData {
  postId: string
  lookupId: string
}

// Touches lastSyncedAt without overwriting existing metric values -- used both
// when Zernio reports the platform-side sync isn't finished yet (syncStatus
// other than "synced") and when the analytics call itself fails, so either
// case gets picked up again next run instead of retrying forever on the same
// stale timestamp or locking in incomplete zeros.
function touchOnly(postId: string) {
  return prisma.postMetrics.upsert({
    where:  { postId },
    create: { postId, lastSyncedAt: new Date() },
    update: { lastSyncedAt: new Date() },
  })
}

export async function processMetricsSyncJob(jobData: MetricsSyncJobData) {
  const { postId, lookupId } = jobData
  const res = await zernioClient.getPostAnalytics(lookupId)

  if (res.syncStatus !== 'synced' || !res.analytics) {
    await touchOnly(postId)
    return { status: 'pending' as const }
  }

  const a = res.analytics
  await prisma.postMetrics.upsert({
    where:  { postId },
    create: {
      postId,
      likes:        a.likes ?? 0,
      comments:     a.comments ?? 0,
      shares:       a.shares ?? 0,
      reach:        a.reach ?? 0,
      impressions:  a.impressions ?? 0,
      views:        a.views ?? 0,
      clicks:       a.clicks ?? 0,
      saves:        a.saves ?? 0,
      lastSyncedAt: new Date(),
    },
    update: {
      likes:        a.likes ?? 0,
      comments:     a.comments ?? 0,
      shares:       a.shares ?? 0,
      reach:        a.reach ?? 0,
      impressions:  a.impressions ?? 0,
      views:        a.views ?? 0,
      clicks:       a.clicks ?? 0,
      saves:        a.saves ?? 0,
      lastSyncedAt: new Date(),
    },
  })
  return { status: 'synced' as const }
}

const worker = new Worker(
  'metrics-sync',
  async (job) => {
    try {
      return await processMetricsSyncJob(job.data as MetricsSyncJobData)
    } catch (err) {
      // A single post's analytics failing (e.g. 424 -- platform-side sync
      // failed) shouldn't block the rest of the batch or exhaust retries
      // forever -- touch the timestamp so it's picked up again next cron run.
      console.error(`metrics-sync: failed to fetch analytics for post ${(job.data as MetricsSyncJobData).postId}:`, err)
      await touchOnly((job.data as MetricsSyncJobData).postId)
      return { status: 'failed' as const }
    }
  },
  { connection: redis, concurrency: 10 }
)

worker.on('failed', (job, err) => {
  console.error(`metrics-sync failed for post ${job?.data.postId}:`, err)
})

worker.on('error', (err) => {
  console.error('metrics-sync worker error:', err)
})

export default worker
