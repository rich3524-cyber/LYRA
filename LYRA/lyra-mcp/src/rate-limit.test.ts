import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit } from './rate-limit'

function mockRedis(evalReturn: number) {
  return { eval: vi.fn().mockResolvedValue(evalReturn) } as any
}

describe('checkRateLimit', () => {
  it('allows the request and reports remaining when under the limit', async () => {
    const redis = mockRedis(3)
    const result = await checkRateLimit('user:u1', 10, 60, redis)
    expect(result).toEqual({ allowed: true, remaining: 7 })
  })

  it('disallows the request once the count exceeds the limit', async () => {
    const redis = mockRedis(11)
    const result = await checkRateLimit('user:u1', 10, 60, redis)
    expect(result).toEqual({ allowed: false, remaining: 0 })
  })

  it('prefixes the Redis key so MCP rate-limit keys can never collide with an unrelated key', async () => {
    const redis = mockRedis(1)
    await checkRateLimit('user:u1', 10, 60, redis)
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'ratelimit:mcp:user:u1', 60)
  })
})
