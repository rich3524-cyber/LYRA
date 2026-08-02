import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/redis', () => ({ redis: {} }))
vi.mock('bullmq', () => ({
  Worker: class {
    on() {}
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    postMetrics: { upsert: vi.fn() },
  },
}))
vi.mock('@/services/social/zernio-client', () => ({
  zernioClient: { getPostAnalytics: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { zernioClient } from '@/services/social/zernio-client'
import { processMetricsSyncJob } from './metrics-sync.worker'

describe('processMetricsSyncJob', () => {
  beforeEach(() => vi.clearAllMocks())

  it('touches lastSyncedAt without writing metrics when Zernio reports the sync is not finished', async () => {
    vi.mocked(zernioClient.getPostAnalytics).mockResolvedValue({ syncStatus: 'pending' } as never)
    const result = await processMetricsSyncJob({ postId: 'p1', lookupId: 'z1' })
    expect(result).toEqual({ status: 'pending' })
    expect(prisma.postMetrics.upsert).toHaveBeenCalledWith({
      where:  { postId: 'p1' },
      create: expect.objectContaining({ postId: 'p1' }),
      update: expect.objectContaining({ lastSyncedAt: expect.any(Date) }),
    })
  })

  it('writes real metrics when the sync is finished', async () => {
    vi.mocked(zernioClient.getPostAnalytics).mockResolvedValue({
      syncStatus: 'synced',
      analytics:  { likes: 5, comments: 2, shares: 1, reach: 100, impressions: 200, views: 50, clicks: 3, saves: 1 },
    } as never)
    const result = await processMetricsSyncJob({ postId: 'p1', lookupId: 'z1' })
    expect(result).toEqual({ status: 'synced' })
    expect(prisma.postMetrics.upsert).toHaveBeenCalledWith({
      where:  { postId: 'p1' },
      create: expect.objectContaining({ likes: 5, views: 50 }),
      update: expect.objectContaining({ likes: 5, views: 50 }),
    })
  })

  it('defaults missing analytics fields to 0 rather than undefined', async () => {
    vi.mocked(zernioClient.getPostAnalytics).mockResolvedValue({
      syncStatus: 'synced',
      analytics:  {},
    } as never)
    await processMetricsSyncJob({ postId: 'p1', lookupId: 'z1' })
    expect(prisma.postMetrics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, views: 0, clicks: 0, saves: 0 }),
      })
    )
  })
})
