import { describe, it, expect, vi } from 'vitest'

// post-publisher.worker.ts instantiates a real BullMQ Worker (which opens a
// Redis connection and starts polling) as a module-level side effect. Stub
// both out so importing the module under test doesn't try to talk to a real
// Redis instance -- processPublishJob itself never touches either, all its
// I/O goes through the injected `deps`.
vi.mock('@/lib/redis', () => ({ redis: {} }))
vi.mock('bullmq', () => ({ Worker: vi.fn().mockImplementation(function MockWorker() { return { on: vi.fn() } }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: { post: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, workspace: { findUnique: vi.fn() } },
}))

import { processPublishJob } from './post-publisher.worker'

function makeDeps(overrides: {
  post?: Partial<Record<string, unknown>>
  workspace?: { crisisActive: boolean } | null
  claimCount?: number
  publish?: ReturnType<typeof vi.fn>
} = {}) {
  const post = {
    id: 'post-1',
    workspaceId: 'ws-1',
    status: 'SCHEDULED',
    content: 'hello world',
    mediaUrls: [] as string[],
    socialAccount: { id: 'acc-1', provider: 'NATIVE', zernioAccountId: null },
    ...overrides.post,
  }

  const publish = overrides.publish ?? vi.fn().mockResolvedValue({ platformPostId: 'plat-1', zernioPostId: undefined })

  const deps = {
    prisma: {
      post: {
        findUnique: vi.fn().mockResolvedValue(post),
        updateMany: vi.fn().mockResolvedValue({ count: overrides.claimCount ?? 1 }),
        update: vi.fn().mockResolvedValue(post),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue(
          overrides.workspace === undefined ? { crisisActive: false } : overrides.workspace
        ),
      },
    },
    getProvider: vi.fn().mockReturnValue({ publish }),
  }

  return { deps, publish }
}

describe('processPublishJob', () => {
  it('throws (does not resolve as completed) when the workspace has an active crisis', async () => {
    const { deps, publish } = makeDeps({ workspace: { crisisActive: true } })

    await expect(processPublishJob({ postId: 'post-1' }, deps)).rejects.toThrow(/crisis/i)

    // Must not have claimed the post or attempted to publish -- a crisis defers
    // the post entirely, it doesn't partially process it.
    expect(deps.prisma.post.updateMany).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })

  it('throws when the crisis check itself fails, instead of silently returning', async () => {
    const { deps, publish } = makeDeps()
    deps.prisma.workspace.findUnique.mockRejectedValue(new Error('db unreachable'))

    await expect(processPublishJob({ postId: 'post-1' }, deps)).rejects.toThrow('db unreachable')
    expect(publish).not.toHaveBeenCalled()
  })

  it('publishes and marks the post PUBLISHED on a normal successful run', async () => {
    const { deps, publish } = makeDeps()

    await processPublishJob({ postId: 'post-1' }, deps)

    expect(deps.prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post-1', status: 'SCHEDULED' },
      data:  { status: 'PUBLISHING' },
    })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(deps.prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: expect.objectContaining({ status: 'PUBLISHED', platformPostId: 'plat-1' }),
    })
  })

  it('does not call provider.publish when the atomic claim loses the race (count: 0)', async () => {
    const { deps, publish } = makeDeps({ claimCount: 0 })

    await processPublishJob({ postId: 'post-1' }, deps)

    expect(publish).not.toHaveBeenCalled()
    expect(deps.prisma.post.update).not.toHaveBeenCalled()
  })

  it('does nothing when the post no longer exists', async () => {
    const { deps, publish } = makeDeps()
    deps.prisma.post.findUnique.mockResolvedValue(null)

    await processPublishJob({ postId: 'post-1' }, deps)

    expect(publish).not.toHaveBeenCalled()
  })

  it('retries publish() for a job already claimed as PUBLISHING, without re-claiming', async () => {
    const { deps, publish } = makeDeps({ post: { status: 'PUBLISHING' } })

    await processPublishJob({ postId: 'post-1' }, deps)

    expect(deps.prisma.post.updateMany).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a post already resolved (e.g. FAILED) by an earlier attempt', async () => {
    const { deps, publish } = makeDeps({ post: { status: 'FAILED' } })

    await processPublishJob({ postId: 'post-1' }, deps)

    expect(publish).not.toHaveBeenCalled()
    expect(deps.prisma.post.update).not.toHaveBeenCalled()
  })
})
