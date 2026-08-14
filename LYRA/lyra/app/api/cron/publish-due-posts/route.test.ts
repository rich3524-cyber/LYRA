import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ checkCronAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: vi.fn() },
  },
}))
vi.mock('@/services/scheduler/post-queue', () => ({
  postQueue: { getJob: vi.fn(), add: vi.fn() },
}))

import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postQueue } from '@/services/scheduler/post-queue'
import { GET } from './route'

function req() {
  return new Request('http://localhost/api/cron/publish-due-posts')
}

describe('GET /api/cron/publish-due-posts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 and never touches the database when checkCronAuth rejects the request', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(false)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.post.findMany).not.toHaveBeenCalled()
    expect(postQueue.add).not.toHaveBeenCalled()
  })

  it('queues a fresh publish job for each due post that has no in-flight job', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }] as never)
    vi.mocked(postQueue.getJob).mockResolvedValue(undefined as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 2 })
    expect(postQueue.add).toHaveBeenCalledWith('publish-post', { postId: 'p-1' }, { jobId: 'post-p-1' })
    expect(postQueue.add).toHaveBeenCalledWith('publish-post', { postId: 'p-2' }, { jobId: 'post-p-2' })
  })

  it('queries only SCHEDULED posts due now or earlier, capped at 500 rows', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

    await GET(req())

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'SCHEDULED', scheduledAt: { not: null, lte: expect.any(Date) } },
        take: 500,
      })
    )
  })

  it('does not double-enqueue a post whose job is still waiting/active', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([{ id: 'p-active' }] as never)
    vi.mocked(postQueue.getJob).mockResolvedValue({ getState: vi.fn().mockResolvedValue('active') } as never)

    await GET(req())

    expect(postQueue.add).not.toHaveBeenCalled()
  })

  it('clears a stale completed job and re-enqueues, so a post that missed its window gets a fresh attempt', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([{ id: 'p-completed' }] as never)
    const remove = vi.fn().mockResolvedValue(undefined)
    vi.mocked(postQueue.getJob).mockResolvedValue({ getState: vi.fn().mockResolvedValue('completed'), remove } as never)

    await GET(req())

    expect(remove).toHaveBeenCalledTimes(1)
    expect(postQueue.add).toHaveBeenCalledWith('publish-post', { postId: 'p-completed' }, { jobId: 'post-p-completed' })
  })

  it('clears a stale failed job and re-enqueues', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([{ id: 'p-failed' }] as never)
    const remove = vi.fn().mockResolvedValue(undefined)
    vi.mocked(postQueue.getJob).mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed'), remove } as never)

    await GET(req())

    expect(remove).toHaveBeenCalledTimes(1)
    expect(postQueue.add).toHaveBeenCalledWith('publish-post', { postId: 'p-failed' }, { jobId: 'post-p-failed' })
  })
})
