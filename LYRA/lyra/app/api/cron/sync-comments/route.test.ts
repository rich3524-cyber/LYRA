import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ checkCronAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    socialAccount: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/queues', () => ({
  commentMonitorQueue: { add: vi.fn() },
}))

import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { commentMonitorQueue } from '@/lib/queues'
import { GET } from './route'

function req() {
  return new Request('http://localhost/api/cron/sync-comments')
}

describe('GET /api/cron/sync-comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 and never touches the database when checkCronAuth rejects the request', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(false)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.socialAccount.findMany).not.toHaveBeenCalled()
    expect(commentMonitorQueue.add).not.toHaveBeenCalled()
  })

  it('queues a monitor-account job per eligible social account', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1' }, { id: 'sa-2' }] as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 2 })
    expect(commentMonitorQueue.add).toHaveBeenCalledWith(
      'monitor-account',
      { socialAccountId: 'sa-1' },
      { jobId: 'monitor-sa-1', removeOnComplete: true }
    )
    expect(commentMonitorQueue.add).toHaveBeenCalledWith(
      'monitor-account',
      { socialAccountId: 'sa-2' },
      { jobId: 'monitor-sa-2', removeOnComplete: true }
    )
  })

  it('only queries active accounts on a workspace with AI responses enabled, capped at 500 rows', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([] as never)

    await GET(req())

    expect(prisma.socialAccount.findMany).toHaveBeenCalledWith({
      where: { isActive: true, workspace: { aiResponseMode: { not: 'OFF' } } },
      select: { id: true },
      take: 500,
    })
  })

  it('has no per-item error handling: a single failed enqueue rejects the whole request instead of a clean 500', async () => {
    // Unlike brand-refresh/publish-due-posts/sync-metrics, this route has no
    // try/catch around its query + fan-out at all. A rejected queue.add()
    // propagates out of GET as an unhandled rejection rather than the standard
    // { error: 'Internal server error' } JSON shape every sibling cron returns
    // on failure. Documented here as a real gap, not fixed (test-only task).
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1' }] as never)
    vi.mocked(commentMonitorQueue.add).mockRejectedValueOnce(new Error('redis down'))

    await expect(GET(req())).rejects.toThrow('redis down')
  })
})
