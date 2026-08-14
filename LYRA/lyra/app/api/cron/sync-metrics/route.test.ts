import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ checkCronAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/queues', () => ({
  metricsSyncQueue: { addBulk: vi.fn() },
}))

import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { metricsSyncQueue } from '@/lib/queues'
import { GET } from './route'

function req() {
  return new Request('http://localhost/api/cron/sync-metrics')
}

describe('GET /api/cron/sync-metrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 and never touches the database when checkCronAuth rejects the request', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(false)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.post.findMany).not.toHaveBeenCalled()
    expect(metricsSyncQueue.addBulk).not.toHaveBeenCalled()
  })

  it('bulk-enqueues a sync-post-metrics job per stale post, preferring the Zernio id with a platformPostId fallback', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([
      { id: 'p-1', platformPostId: 'plat-1', zernioPostId: 'zern-1' },
      { id: 'p-2', platformPostId: 'plat-2', zernioPostId: null },
    ] as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enqueued: 2 })
    expect(metricsSyncQueue.addBulk).toHaveBeenCalledWith([
      { name: 'sync-post-metrics', data: { postId: 'p-1', lookupId: 'zern-1' }, opts: { jobId: 'metrics-sync-p-1' } },
      { name: 'sync-post-metrics', data: { postId: 'p-2', lookupId: 'plat-2' }, opts: { jobId: 'metrics-sync-p-2' } },
    ])
  })

  it('only queries published, recently-published, Zernio-provider posts that need a sync, capped at 200 rows', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

    await GET(req())

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          platformPostId: { not: null },
          socialAccount: { provider: 'ZERNIO' },
          OR: [{ metrics: null }, { metrics: { lastSyncedAt: { lt: expect.any(Date) } } }],
        }),
        take: 200,
      })
    )
  })

  it('has no per-item error handling: a failed addBulk rejects the whole request instead of a clean 500', async () => {
    // Same gap as sync-comments: no try/catch around the query + fan-out, so a
    // rejected metricsSyncQueue.addBulk() propagates as an unhandled rejection
    // rather than the standard error-JSON shape other cron routes return.
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([{ id: 'p-1', platformPostId: 'plat-1', zernioPostId: null }] as never)
    vi.mocked(metricsSyncQueue.addBulk).mockRejectedValueOnce(new Error('redis down'))

    await expect(GET(req())).rejects.toThrow('redis down')
  })
})
