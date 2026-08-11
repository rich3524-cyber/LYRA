import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { deliverNotification, type DeliveryJob } from '@/services/notifications/delivery'

// Thin BullMQ wrapper. The send itself lives in services/notifications/delivery.ts
// so the "Send test message" route can call it synchronously without importing
// this file (which would start a second consumer inside a Netlify function).

const worker = new Worker(
  'notification-delivery',
  async (job) => deliverNotification(job.data as DeliveryJob),
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`notification delivery failed for channel ${job?.data?.channelId}:`, err)
})

worker.on('error', (err) => {
  console.error('notification worker error:', err)
})

export default worker
