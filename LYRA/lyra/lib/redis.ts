import type { ConnectionOptions } from 'bullmq'
import Redis from 'ioredis'

function buildRedisOptions() {
  const url = process.env.REDIS_URL
  if (!url) {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null as null }
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
    tls: url.startsWith('rediss://') ? ({} as Record<string, never>) : undefined,
    maxRetriesPerRequest: null as null,
  }
}

const globalForRedis = globalThis as unknown as { bullRedis?: Redis; redisClient?: Redis }

// Single shared ioredis instance for every BullMQ Queue/Worker in the app and
// worker process. Passing a real ioredis instance (not just a plain options
// object) is what makes this shared -- confirmed via code review 18 Jul 2026
// that the previous export here was a plain ConnectionOptions object, which
// fails BullMQ's own isRedisInstance() check, so every `new Queue(...)` /
// `new Worker(...)` call site (8+ across the codebase) was silently opening
// its own independent Redis connection instead of reusing one.
export const redis: ConnectionOptions = globalForRedis.bullRedis ?? new Redis(buildRedisOptions())
if (process.env.NODE_ENV !== 'production') globalForRedis.bullRedis = redis as Redis

// Separate shared ioredis client for direct key/value operations (e.g. Page-picker
// pending state) -- kept distinct from the BullMQ connection above rather than
// reusing the same instance for both, since BullMQ Workers issue blocking commands
// that are best kept on their own dedicated connection.
export const redisClient: Redis = globalForRedis.redisClient ?? new Redis(buildRedisOptions())
if (process.env.NODE_ENV !== 'production') globalForRedis.redisClient = redisClient
