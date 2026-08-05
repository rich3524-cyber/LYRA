import { describe, it, expect, vi } from 'vitest'
import type Redis from 'ioredis'
import { checkRateLimit } from './rate-limit'

function mockRedis(evalReturn: number) {
  return { eval: vi.fn().mockResolvedValue(evalReturn) } as unknown as Redis
}

describe('checkRateLimit', () => {
  it('allows the request and reports remaining when under the limit', async () => {
    const redis = mockRedis(3)
    const result = await checkRateLimit('user:u1', 10, 60, redis)
    expect(result).toEqual({ allowed: true, remaining: 7 })
  })

  it('allows the request at exactly the limit, with zero remaining', async () => {
    const redis = mockRedis(10)
    const result = await checkRateLimit('user:u1', 10, 60, redis)
    expect(result).toEqual({ allowed: true, remaining: 0 })
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

  it('propagates a Redis eval failure as a rejected promise, rather than swallowing it', async () => {
    const redis = { eval: vi.fn().mockRejectedValue(new Error('connection lost')) } as unknown as Redis
    await expect(checkRateLimit('user:u1', 10, 60, redis)).rejects.toThrow('connection lost')
  })
})
