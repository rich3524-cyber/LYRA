import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ checkCronAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findMany: vi.fn() },
    brandProfile: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/queues', () => ({
  brandSyncQueue: { add: vi.fn() },
}))

import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { brandSyncQueue } from '@/lib/queues'
import { GET } from './route'

function req() {
  return new Request('http://localhost/api/cron/brand-refresh')
}

describe('GET /api/cron/brand-refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 and never touches the database when checkCronAuth rejects the request', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(false)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.workspace.findMany).not.toHaveBeenCalled()
    expect(prisma.brandProfile.findMany).not.toHaveBeenCalled()
    expect(brandSyncQueue.add).not.toHaveBeenCalled()
  })

  it('queues a sync-brand job per stale workspace and an analyze-engagement job per brand profile', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([{ id: 'ws-1' }, { id: 'ws-2' }] as never)
    vi.mocked(prisma.brandProfile.findMany).mockResolvedValue([{ workspaceId: 'ws-3' }] as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 2, engagementQueued: 1 })

    expect(brandSyncQueue.add).toHaveBeenCalledWith(
      'sync-brand',
      { workspaceId: 'ws-1' },
      { jobId: 'brand-sync-ws-1', removeOnComplete: true }
    )
    expect(brandSyncQueue.add).toHaveBeenCalledWith(
      'sync-brand',
      { workspaceId: 'ws-2' },
      { jobId: 'brand-sync-ws-2', removeOnComplete: true }
    )
    expect(brandSyncQueue.add).toHaveBeenCalledWith(
      'analyze-engagement',
      { workspaceId: 'ws-3' },
      { jobId: 'engagement-ws-3', removeOnComplete: true }
    )
  })

  it('caps both the stale-workspace and brand-profile queries at 50 rows', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.brandProfile.findMany).mockResolvedValue([] as never)

    await GET(req())

    expect(prisma.workspace.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
    expect(prisma.brandProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
  })

  it('returns a 500 instead of a partial success when one of the queue enqueues fails', async () => {
    // The route has no per-item try/catch around its Promise.all fan-out, so a
    // single rejected brandSyncQueue.add() fails the whole run and is reported
    // as a clean 500 -- rather than partially succeeding and reporting how many
    // workspaces were actually queued. See report for whether this is desired.
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([{ id: 'ws-1' }] as never)
    vi.mocked(prisma.brandProfile.findMany).mockResolvedValue([] as never)
    vi.mocked(brandSyncQueue.add).mockRejectedValueOnce(new Error('redis down'))

    const res = await GET(req())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
