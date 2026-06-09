import IORedis from 'ioredis'

export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  connectTimeout:       10_000,
  retryStrategy: (times) => {
    if (times > 5) return null  // Stop retrying after 5 attempts — let BullMQ handle job-level retries
    return Math.min(times * 200, 2000)
  },
})
