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
    // alreadyResolved/status match the shape app/api/ai/respond/route.ts and
    // app/api/comments/[id]/route.ts's guarded PATCH already return, so the
    // frontend's handleSend can treat all three identically.
    expect(await res.json()).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
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
    expect(await res.json()).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
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

  // Fix 1 (round 2): the earlier ESCALATED deviation correctly lets a human
  // claim and send from an ESCALATED comment, but a failed send must restore
  // ESCALATED, not silently downgrade to AI_DRAFTED -- downgrading would
  // re-arm the autonomous paths (workers/ai-responder.worker.ts,
  // respond-to-item) on a comment that was deliberately withheld from them.
  it('restores ESCALATED (not AI_DRAFTED) when a reply to an already-ESCALATED comment fails to send', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'ESCALATED' }) as any)
    const replyToComment = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ response: 'Thanks!' }), ctx())

    expect(res.status).toBe(502)
    // The rollback write's data object restores status to ESCALATED and,
    // critically, does NOT include isEscalated/escalationReason -- those
    // fields are never touched by this write, so whatever they already were
    // on the row (set when the comment was first escalated) stays intact and
    // back in sync with the restored ESCALATED status.
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'RESPONDED' },
      data: { status: 'ESCALATED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
    })
  })

  // Fix 2 (round 2): the rollback write itself must be crash-safe, the same
  // class of bug Fix 1 in workers/ai-responder.worker.ts (commit a6f22fa)
  // closed there -- a transient failure on this exact write must not escape
  // uncaught (which would 502 out to the outer catch and leave the comment
  // permanently RESPONDED with nothing sent, since this route's own guard
  // then answers every further attempt with "Already responded.").
  it('retries the rollback write and recovers after a transient failure on the first attempt', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
      vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
      const replyToComment = vi.fn().mockRejectedValue(new Error('platform timeout'))
      vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)
      vi.mocked(prisma.comment.updateMany)
        .mockResolvedValueOnce({ count: 1 } as any)                    // the RESPONDED claim
        .mockRejectedValueOnce(new Error('transient db blip'))         // rollback attempt 1 fails
        .mockResolvedValueOnce({ count: 1 } as any)                    // rollback attempt 2 succeeds

      const resPromise = POST(req({ response: 'Thanks!' }), ctx())
      // Flush the 1s backoff between rollback attempt 1 and attempt 2.
      await vi.advanceTimersByTimeAsync(1000)
      const res = await resPromise

      expect(res.status).toBe(502)
      // Claim + 2 rollback attempts = 3 total writes, and the comment ends
      // up back at AI_DRAFTED (its prior status was PENDING) rather than
      // stuck permanently at RESPONDED.
      expect(prisma.comment.updateMany).toHaveBeenCalledTimes(3)
      expect(prisma.comment.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'c1', status: 'RESPONDED' },
        data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', finalResponse: null, respondedAt: null },
      })
    } finally {
      vi.useRealTimers()
    }
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

  it('returns 400 when response text exceeds the 2000 character cap, before any DB lookup', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)

    const res = await POST(req({ response: 'a'.repeat(2001) }), ctx())

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
