import type { ConnectionOptions } from 'bullmq'
import Redis from 'ioredis'

export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL
  if (!url) {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`REDIS_URL is not a valid URL: "${url}". Expected format: redis://[:password@]host:port`)
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: url.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
  }
}

// BullMQ connection options (used by worker queues)
export const redis = getRedisConnection()

// ioredis client for direct key/value operations (e.g. Page-picker pending state)
function createRedisClient(): Redis {
  const url = process.env.REDIS_URL
  if (!url) {
    return new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null })
  }
  return new Redis(url, {
    tls: url.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
  })
}

const globalForRedis = globalThis as unknown as { redisClient?: Redis }
export const redisClient: Redis = globalForRedis.redisClient ?? createRedisClient()
if (process.env.NODE_ENV !== 'production') globalForRedis.redisClient = redisClient
