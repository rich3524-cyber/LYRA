import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
  return new Request('http://localhost/api/comments/c1/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id = 'c1') {
  return { params: Promise.resolve({ id }) }
}

function baseComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    workspaceId: 'ws-1',
    status: 'PENDING',
    platformCommentId: 'pc1',
    platformPostId: 'pp1',
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

describe('POST /api/comments/[id]/reply', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): drains any mockResolvedValueOnce
    // sequencing queued by an earlier test, matching the reasoning in
    // app/api/mcp/respond-to-item/route.test.ts.
    vi.resetAllMocks()
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  it('sends normally and claims RESPONDED via the guarded updateMany, never a plain update', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    const replyToComment = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ response: 'Thanks for the kind words!' }), ctx())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1' }),
      'pp1',
      'pc1',
      'Thanks for the kind words!'
    )
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: claimWhere('c1'),
      data: { status: 'RESPONDED', finalResponse: 'Thanks for the kind words!', respondedAt: expect.any(Date) },
    })
  })

  // Fix 2: a comment already RESPONDED must be rejected before any send
  // attempt is even considered -- the send function must never be called.
  it('rejects a comment already RESPONDED before any send attempt', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'RESPONDED' }) as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already responded.' })
    expect(getProvider).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
  })

  // Deliberately NOT the same as RESPONDED: unlike every other send path in
  // this codebase, ESCALATED comments must remain repliable through this
  // specific human-facing route (see the comment above the status check in
  // route.ts, and components/lyra/inbox/comment-card.tsx's `isEscalated`
  // handling) -- escalation only means the autonomous paths declined to
  // handle it, not that a human can't act on it. This guards against
  // silently reintroducing that previously-fixed bug.
  it('still allows a human to send a reply to an ESCALATED comment, claiming it via the same guarded write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'ESCALATED' }) as any)
    const replyToComment = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(replyToComment).toHaveBeenCalledTimes(1)
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: claimWhere('c1'),
      data: { status: 'RESPONDED', finalResponse: 'Thanks!', respondedAt: expect.any(Date) },
    })
  })

  // The core regression test for this fix: even though the cheap top-of-function
  // status check passed, a concurrent writer (the worker, or respond-to-item)
  // could have claimed the comment in between -- the atomic claim here must
  // catch that and the send function must never be called.
  it('refuses to send when the atomic claim loses the race to a concurrent writer (count: 0)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)
    const replyToComment = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already responded.' })
    expect(replyToComment).not.toHaveBeenCalled()
  })

  it('rolls the claim back to AI_DRAFTED and returns 502 when the provider send throws', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    const replyToComment = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Failed to send reply' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  // The rollback must be scoped to this request's own RESPONDED claim, not
  // unconditional -- a count: 0 result here (the comment's status moved on
  // again before the rollback ran) must be a safe no-op, not an overwrite.
  it('scopes the send-failure rollback to its own RESPONDED claim instead of overwriting unconditionally', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    const replyToComment = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)
    vi.mocked(prisma.comment.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any) // claim succeeds
      .mockResolvedValueOnce({ count: 0 } as any) // rollback no-ops

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(502)
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  it('returns 400 and rolls back when the provider throws ProviderUnsupported', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    const replyToComment = vi.fn().mockRejectedValue(new ProviderUnsupported('replyToComment', 'FACEBOOK'))
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  it('returns 400 when response text is missing or blank, before any DB lookup', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)

    const res = await POST(req({ response: '   ' }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.comment.findFirst).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks access, 404 when the comment truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ id: 'c1' } as any)

    const forbiddenRes = await POST(req({ response: 'Thanks!' }), ctx())
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.comment.findUnique).mockResolvedValue(null)
    const notFoundRes = await POST(req({ response: 'Thanks!' }), ctx('c2'))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ response: 'Thanks!' }), ctx())
    expect(res.status).toBe(401)
  })
})
