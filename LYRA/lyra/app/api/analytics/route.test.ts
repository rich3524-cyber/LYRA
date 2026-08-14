import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    post:            { findMany: vi.fn() },
    comment:         { count: vi.fn() },
  },
}))
// Fake in-memory Redis store (not a mocked lib/cache) so lib/cache.ts's
// get/set run for real against the exact cache key the route builds --
// this is what lets the cross-workspace-leak test below actually prove key
// isolation, rather than just asserting a mocked function was called.
// Same "mock the Redis boundary itself" pattern as
// app/api/mcp/audit/route.test.ts.
const fakeRedisStore = new Map<string, string>()
vi.mock('@/lib/redis', () => ({
  redis: {},
  redisClient: {
    get: vi.fn((key: string) => Promise.resolve(fakeRedisStore.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      fakeRedisStore.set(key, value)
      return Promise.resolve('OK')
    }),
    getBuffer: vi.fn(() => Promise.resolve(null)),
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from './route'

function req(query: string) {
  return new Request(`http://localhost/api/analytics?${query}`)
}

function fakePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    content: 'Hello world',
    publishedAt: new Date(),
    socialAccount: { platform: 'INSTAGRAM' },
    metrics: { likes: 10, comments: 2, shares: 1, reach: 90, views: 120 },
    ...overrides,
  }
}

describe('GET /api/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeRedisStore.clear()
  })

  it('returns aggregated analytics for a workspace member', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([fakePost()] as never)
    vi.mocked(prisma.comment.count).mockResolvedValue(0)

    const res = await GET(req('workspaceId=ws-1&period=30&tzOffset=0'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.summary.postsPublished).toBe(1)
    expect(body.summary.totalLikes).toBe(10)
  })

  it('returns 400 with no workspaceId', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    const res = await GET(req('period=30'))
    expect(res.status).toBe(400)
  })

  it('returns 403 when caller has no workspace access', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null)

    const res = await GET(req('workspaceId=ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.post.findMany).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(req('workspaceId=ws-1'))
    expect(res.status).toBe(401)
  })

  it('serves a cached response on the second call for the same workspace+period+tzOffset without re-querying Postgres for the aggregation', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([fakePost()] as never)
    vi.mocked(prisma.comment.count).mockResolvedValue(0)

    const res1 = await GET(req('workspaceId=ws-1&period=30&tzOffset=0'))
    expect(res1.status).toBe(200)
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1)

    const res2 = await GET(req('workspaceId=ws-1&period=30&tzOffset=0'))
    const body2 = await res2.json()

    // Access check always runs for real against Postgres (auth is never
    // served from cache) -- only the expensive post/comment aggregation is.
    expect(prisma.workspaceAccess.findFirst).toHaveBeenCalledTimes(2)
    expect(prisma.post.findMany).toHaveBeenCalledTimes(1)
    expect(body2.summary.postsPublished).toBe(1)
  })

  it('recomputes (does not reuse the cache) when tzOffset differs, since it changes the response body', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([fakePost()] as never)
    vi.mocked(prisma.comment.count).mockResolvedValue(0)

    await GET(req('workspaceId=ws-1&period=30&tzOffset=0'))
    await GET(req('workspaceId=ws-1&period=30&tzOffset=600'))

    expect(prisma.post.findMany).toHaveBeenCalledTimes(2)
  })

  it('never serves workspace A cached analytics to a request for workspace B (cross-workspace leak check)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as never)
    vi.mocked(prisma.comment.count).mockResolvedValue(0)

    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([
      fakePost({ id: 'post-a', metrics: { likes: 999, comments: 0, shares: 0, reach: 500, views: 900 } }),
    ] as never)

    const resA = await GET(req('workspaceId=ws-A&period=30&tzOffset=0'))
    const bodyA = await resA.json()
    expect(bodyA.summary.totalLikes).toBe(999)

    // Same period + tzOffset, different workspace -- must recompute rather
    // than serving workspace A's cached entry.
    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([])
    const resB = await GET(req('workspaceId=ws-B&period=30&tzOffset=0'))
    const bodyB = await resB.json()

    expect(bodyB.summary.totalLikes).toBe(0)
    expect(bodyB.summary.postsPublished).toBe(0)
    expect(prisma.post.findMany).toHaveBeenCalledTimes(2)

    // And workspace A's own second request still gets its cached data back.
    const resA2 = await GET(req('workspaceId=ws-A&period=30&tzOffset=0'))
    const bodyA2 = await resA2.json()
    expect(bodyA2.summary.totalLikes).toBe(999)
    expect(prisma.post.findMany).toHaveBeenCalledTimes(2)
  })
})
