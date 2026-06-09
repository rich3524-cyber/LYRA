import { Worker, Queue } from 'bullmq'
import { redis } from '@/lib/redis'
import { syncTrendsForWorkspace } from '@/services/trends/trend-syncer'

export const trendSyncQueue = new Queue('trend-syncing', {
  connection: redis,
  defaultJobOptions: {
    attempts:         2,
    backoff:          { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 10 },
    removeOnFail:     { count: 10 },
  },
})

const worker = new Worker(
  'trend-syncing',
  async (job) => {
    const { workspaceId } = job.data as { workspaceId: string }
    await syncTrendsForWorkspace(workspaceId)
  },
  { connection: redis, concurrency: 2 }
)

worker.on('failed', (_job, err) => {
  console.error('[trend-sync] worker job failed:', err)
})

export { worker as trendSyncWorker }
export default worker
