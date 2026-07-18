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
