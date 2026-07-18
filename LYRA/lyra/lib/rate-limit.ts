import { NextResponse } from 'next/server'
import { redisClient } from '@/lib/redis'

// Fixed-window counter via a single atomic INCR. Good enough for abuse/cost
// protection on expensive routes (LLM calls, headless-Chromium PDF rendering,
// S3 uploads) -- doesn't need the precision of a sliding-window or token-bucket
// algorithm, and INCR + EXPIRE is two cheap Redis round-trips per request.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const fullKey = `ratelimit:${key}`
  const count = await redisClient.incr(fullKey)
  if (count === 1) {
    await redisClient.expire(fullKey, windowSeconds)
  }
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
