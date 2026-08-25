import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('@/services/social/provider', () => ({
  getProvider: vi.fn(),
  ProviderUnsupported: class ProviderUnsupported extends Error {},
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/reviews/rv1/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id = 'rv1') {
  return { params: Promise.resolve({ id }) }
}

function baseReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rv1',
    workspaceId: 'ws-1',
    status: 'PENDING',
    zernioReviewId: 'zr1',
    socialAccount: {
      id: 'acc-1',
      provider: 'ZERNIO',
      zernioAccountId: 'z1',
      accessToken: null,
    },
    ...overrides,
  }
}

const claimWhere = (id: string) => ({ id, status: { not: 'RESPONDED' } })

describe('POST /api/reviews/[id]/reply', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  it('sends normally and claims RESPONDED via the guarded updateMany, never a plain update, using replyToReview\'s 3-arg signature', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    const replyToReview = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)

    const res = await POST(req({ response: 'Thanks for the kind words!' }), ctx())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    // 3 args: account, externalId (zernioReviewId), text -- NOT the 4-arg
    // shape replyToComment takes (reviews have no platformPostId concept).
    expect(replyToReview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1' }),
      'zr1',
      'Thanks for the kind words!'
    )
    expect(replyToReview.mock.calls[0]).toHaveLength(3)
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: claimWhere('rv1'),
      data: { status: 'RESPONDED', finalResponse: 'Thanks for the kind words!', respondedAt: expect.any(Date) },
    })
  })

  it('rejects a review already RESPONDED before any send attempt', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview({ status: 'RESPONDED' }) as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(getProvider).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).not.toHaveBeenCalled()
  })

  // Deliberately NOT the same as RESPONDED: mirrors
  // app/api/comments/[id]/reply/route.ts -- ESCALATED reviews must remain
  // repliable through this human-facing route, since escalation only means
  // the autonomous path (workers/ai-review-responder.worker.ts) declined to
  // handle it, not that a human can't act on it.
  it('still allows a human to send a reply to an ESCALATED review, claiming it via the same guarded write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview({ status: 'ESCALATED' }) as any)
    const replyToReview = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(replyToReview).toHaveBeenCalledTimes(1)
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: claimWhere('rv1'),
      data: { status: 'RESPONDED', finalResponse: 'Thanks!', respondedAt: expect.any(Date) },
    })
  })

  it('refuses to send when the atomic claim loses the race to a concurrent writer (count: 0)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 0 } as any)
    const replyToReview = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(replyToReview).not.toHaveBeenCalled()
  })

  it('rolls the claim back to AI_DRAFTED and returns 502 when the provider send throws', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    const replyToReview = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Failed to send reply' })
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rv1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  it('scopes the send-failure rollback to its own RESPONDED claim instead of overwriting unconditionally', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    const replyToReview = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)
    vi.mocked(prisma.review.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any) // claim succeeds
      .mockResolvedValueOnce({ count: 0 } as any) // rollback no-ops

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(502)
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rv1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  it('restores ESCALATED (not AI_DRAFTED) when a reply to an already-ESCALATED review fails to send', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview({ status: 'ESCALATED' }) as any)
    const replyToReview = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(502)
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rv1', status: 'RESPONDED' },
      data: { status: 'ESCALATED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  it('retries the rollback write and recovers after a transient failure on the first attempt', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
      vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
      const replyToReview = vi.fn().mockRejectedValue(new Error('platform timeout'))
      vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)
      vi.mocked(prisma.review.updateMany)
        .mockResolvedValueOnce({ count: 1 } as any)                    // the RESPONDED claim
        .mockRejectedValueOnce(new Error('transient db blip'))         // rollback attempt 1 fails
        .mockResolvedValueOnce({ count: 1 } as any)                    // rollback attempt 2 succeeds

      const resPromise = POST(req({ response: 'Thanks!' }), ctx())
      await vi.advanceTimersByTimeAsync(1000)
      const res = await resPromise

      expect(res.status).toBe(502)
      expect(prisma.review.updateMany).toHaveBeenCalledTimes(3)
      expect(prisma.review.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'rv1', status: 'RESPONDED' },
        data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns 400 and rolls back when the provider throws ProviderUnsupported', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    const replyToReview = vi.fn().mockRejectedValue(new ProviderUnsupported('replyToReview', 'GOOGLE_BUSINESS'))
    vi.mocked(getProvider).mockReturnValue({ replyToReview } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rv1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  it('returns 400 when response text is missing or blank, before any DB lookup', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)

    const res = await POST(req({ response: '   ' }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.review.findFirst).not.toHaveBeenCalled()
  })

  it('returns 400 when response text exceeds the 2000 character cap, before any DB lookup', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)

    const res = await POST(req({ response: 'a'.repeat(2001) }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.review.findFirst).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks access, 404 when the review truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 'rv1' } as any)

    const forbiddenRes = await POST(req({ response: 'Thanks!' }), ctx())
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.review.findUnique).mockResolvedValue(null)
    const notFoundRes = await POST(req({ response: 'Thanks!' }), ctx('rv2'))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ response: 'Thanks!' }), ctx())
    expect(res.status).toBe(401)
  })
})
