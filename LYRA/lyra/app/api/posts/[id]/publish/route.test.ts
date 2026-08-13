import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('@/services/social/provider', () => ({
  getProvider: vi.fn(),
  ProviderUnsupported: class ProviderUnsupported extends Error {},
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/services/social/provider'
import { POST } from './route'

function ctx(id = 'post-1') {
  return { params: Promise.resolve({ id }) }
}

const SCHEDULED_POST = {
  id:            'post-1',
  status:        'SCHEDULED',
  content:       'hello',
  mediaUrls:     [],
  socialAccount: { provider: 'ZERNIO', zernioAccountId: 'za-1', accessToken: null },
}

describe('POST /api/posts/[id]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
  })

  it('atomically claims the post before publishing, not a plain read-check', async () => {
    vi.mocked(prisma.post.findFirst).mockResolvedValue(SCHEDULED_POST as never)
    vi.mocked(prisma.post.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(getProvider).mockReturnValue({
      publish: vi.fn().mockResolvedValue({ platformPostId: 'p1' }),
    } as never)

    const res = await POST(new Request('http://localhost'), ctx())

    expect(res.status).toBe(200)
    // First updateMany call is the claim: excludes PUBLISHED and PUBLISHING.
    expect(prisma.post.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'post-1', status: { notIn: ['PUBLISHED', 'PUBLISHING'] } },
      data:  { status: 'PUBLISHING' },
    })
  })

  it('returns 400 without calling the provider when the claim loses the race (already published/publishing)', async () => {
    vi.mocked(prisma.post.findFirst).mockResolvedValue(SCHEDULED_POST as never)
    vi.mocked(prisma.post.updateMany).mockResolvedValue({ count: 0 } as never)
    const publish = vi.fn()
    vi.mocked(getProvider).mockReturnValue({ publish } as never)

    const res = await POST(new Request('http://localhost'), ctx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/already published or currently publishing/i)
    expect(publish).not.toHaveBeenCalled()
  })

  it('reverts the claim back to the pre-publish status, not leaving the post stranded in PUBLISHING, when the provider send fails', async () => {
    vi.mocked(prisma.post.findFirst).mockResolvedValue(SCHEDULED_POST as never)
    vi.mocked(prisma.post.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(getProvider).mockReturnValue({
      publish: vi.fn().mockRejectedValue(new Error('platform timeout')),
    } as never)

    const res = await POST(new Request('http://localhost'), ctx())

    expect(res.status).toBe(502)
    expect(prisma.post.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'post-1', status: 'PUBLISHING' },
      data:  { status: 'SCHEDULED' }, // reverted to the original pre-claim status
    })
  })

  it('finalizes with a claim-scoped updateMany, not an unconditional update', async () => {
    vi.mocked(prisma.post.findFirst).mockResolvedValue(SCHEDULED_POST as never)
    vi.mocked(prisma.post.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(getProvider).mockReturnValue({
      publish: vi.fn().mockResolvedValue({ platformPostId: 'p1' }),
    } as never)

    await POST(new Request('http://localhost'), ctx())

    expect(prisma.post.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'post-1', status: 'PUBLISHING' },
      data:  { status: 'PUBLISHED', publishedAt: expect.any(Date), platformPostId: 'p1', zernioPostId: undefined },
    })
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(new Request('http://localhost'), ctx())
    expect(res.status).toBe(401)
  })
})
