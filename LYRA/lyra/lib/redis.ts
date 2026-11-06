import type { ConnectionOptions } from 'bullmq'
import Redis from 'ioredis'

/**
 * How long each reconnect attempt waits, ramping to a ceiling rather than
 * retrying as fast as the socket will refuse the connection.
 *
 * ioredis defaults to `min(times * 50, 2000)` -- a 2 second ceiling. During
 * the 5 Nov 2026 outage that meant the shared connections below reconnecting
 * every two seconds, continuously, for days, with all 7 BullMQ workers
 * logging a full stack trace per failure. Railway capped the replica at 500
 * logs/sec and dropped 19,833 messages in a single burst, which buried the
 * one line that actually named the fault. Worse, the storm kept hammering
 * Upstash while it was already rate-limiting the account, so the retries
 * helped hold the throttle open.
 *
 * A 10 second ceiling cuts the attempt rate 5x. Deliberately still bounded
 * and fairly short: a queue consumer should pick Redis back up within
 * seconds of it returning, not minutes.
 */
function retryStrategy(times: number): number {
  return Math.min(times * 200, 10_000)
}

/**
 * Whether a missing REDIS_URL should stop the process rather than degrade.
 *
 * `next build` runs with NODE_ENV=production but never needs a live Redis
 * connection, so throwing during the build would break the Netlify deploy
 * over a variable the build itself does not use. That phase is exempt; real
 * production runtime is not.
 */
function missingUrlIsFatal(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build'
}

function buildRedisOptions() {
  const url = process.env.REDIS_URL
  if (!url) {
    // Until 6 Nov 2026 this fell through to localhost silently. On Railway,
    // where no local Redis exists, that turned "REDIS_URL was never set on
    // this service" into an endless ECONNREFUSED 127.0.0.1:6379 loop with
    // nothing anywhere naming the real problem. In the 5 Nov 2026 worker
    // outage that fallback and a genuine upstream Upstash outage were
    // interleaved in the same log stream and indistinguishable from each
    // other. Production now refuses to start; local dev keeps the
    // convenience of not needing the variable at all.
    if (missingUrlIsFatal()) {
      throw new Error(
        'REDIS_URL is not set. Set it on this service (Railway: service > Variables, ' +
          'Netlify: Site configuration > Environment variables). Refusing to fall back ' +
          'to localhost:6379, which has no Redis in production and would retry forever ' +
          'without ever reporting the actual fault.'
      )
    }
    console.warn('[redis] REDIS_URL is not set — falling back to localhost:6379 (development only)')
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null as null, retryStrategy }
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
    retryStrategy,
  }
}

/**
 * ioredis emits 'error' on every failed reconnect, and prints its own
 * "[ioredis] Unhandled error event" line when nothing is listening -- so
 * staying silent is not an option, but neither is one line per attempt per
 * connection (see retryStrategy above for what that cost).
 *
 * Logs the first error immediately, then at most one line per minute,
 * carrying a count of what it swallowed so a flood still reads as a flood.
 * Message only, no stack: for a connection refusal the stack is always the
 * same node:net frames and says nothing, while for an upstream ReplyError
 * ("your database has been temporarily rate-limited") the message is the
 * entire diagnosis.
 */
function attachThrottledErrorLog(client: Redis, label: string): Redis {
  let lastLoggedAt = 0
  let suppressed = 0
  client.on('error', (err: Error) => {
    const now = Date.now()
    if (now - lastLoggedAt < 60_000) {
      suppressed += 1
      return
    }
    const tail = suppressed > 0 ? ` (+${suppressed} suppressed in the last minute)` : ''
    console.error(`[redis:${label}] ${err.message}${tail}`)
    lastLoggedAt = now
    suppressed = 0
  })
  return client
}

const globalForRedis = globalThis as unknown as { bullRedis?: Redis; redisClient?: Redis }

// Single shared ioredis instance for every BullMQ Queue/Worker in the app and
// worker process. Passing a real ioredis instance (not just a plain options
// object) is what makes this shared -- confirmed via code review 18 Jul 2026
// that the previous export here was a plain ConnectionOptions object, which
// fails BullMQ's own isRedisInstance() check, so every `new Queue(...)` /
// `new Worker(...)` call site (8+ across the codebase) was silently opening
// its own independent Redis connection instead of reusing one.
export const redis: ConnectionOptions =
  globalForRedis.bullRedis ?? attachThrottledErrorLog(new Redis(buildRedisOptions()), 'bullmq')
if (process.env.NODE_ENV !== 'production') globalForRedis.bullRedis = redis as Redis

// Separate shared ioredis client for direct key/value operations (e.g. Page-picker
// pending state) -- kept distinct from the BullMQ connection above rather than
// reusing the same instance for both, since BullMQ Workers issue blocking commands
// that are best kept on their own dedicated connection.
export const redisClient: Redis =
  globalForRedis.redisClient ?? attachThrottledErrorLog(new Redis(buildRedisOptions()), 'client')
if (process.env.NODE_ENV !== 'production') globalForRedis.redisClient = redisClient
