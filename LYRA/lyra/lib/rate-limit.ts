import { NextResponse } from 'next/server'
import { redisClient } from '@/lib/redis'

// Fixed-window counter. Good enough for abuse/cost protection on expensive
// routes (LLM calls, headless-Chromium PDF rendering, S3 uploads) -- doesn't
// need the precision of a sliding-window or token-bucket algorithm.
//
// INCR and EXPIRE run as a single Lua script (one atomic round-trip), not two
// separate commands -- a process crash or connection drop between two
// separate INCR/EXPIRE calls would leave the key with no TTL, permanently
// exhausting that bucket (every future request keeps incrementing a counter
// that never resets, once the current process count is above the limit).
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
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const fullKey = `ratelimit:${key}`
  const count = await redisClient.eval(RATE_LIMIT_SCRIPT, 1, fullKey, windowSeconds) as number
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json({ error: 'Too many requests, please try again shortly.' }, { status: 429 })
}

// Best-effort client IP for unauthenticated routes. Netlify/most proxies set
// x-forwarded-for; this is not spoof-proof but is only used to rate-limit an
// unauthenticated route, not for any security-sensitive access decision.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
