import Redis from 'ioredis'

// Lazy so a missing REDIS_URL at import time doesn't crash module load --
// mirrors the same pattern already used for the default JWKS client in
// jwt-verify.ts.
let _redisClient: Redis | null = null
function getDefaultRedisClient(): Redis {
  if (!_redisClient) {
    _redisClient = new Redis(process.env.REDIS_URL!)
  }
  return _redisClient
}

// Same fixed-window counter as the main LYRA app's lib/rate-limit.ts --
// INCR and EXPIRE as a single atomic Lua script (one round-trip), not two
// separate commands, for the same reason documented there: a crash between
// two separate calls would leave the key with no TTL, permanently
// exhausting that bucket. Good enough for abuse/cost protection on tool-call
// rate limiting -- doesn't need the precision of a sliding-window or
// token-bucket algorithm.
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  redis?: Redis
): Promise<{ allowed: boolean; remaining: number }> {
  // redis is `redis?: Redis` resolved in-body for consistency with the same
  // pattern in jwt-verify.ts, not because a throw here needs special
  // handling -- getDefaultRedisClient() doesn't actually throw (the ioredis
  // constructor doesn't validate its URL eagerly), and this function has no
  // try/catch to protect anyway.
  const resolvedRedis = redis ?? getDefaultRedisClient()
  const fullKey = `ratelimit:mcp:${key}`
  const count = await resolvedRedis.eval(RATE_LIMIT_SCRIPT, 1, fullKey, windowSeconds) as number
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}
