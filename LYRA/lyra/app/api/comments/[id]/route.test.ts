import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/comments/c1', {
    method: 'PATCH',
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
    authorName: 'Jane',
    content: 'nice post',
    aiDraftResponse: null,
    finalResponse: null,
    respondedAt: null,
    isEscalated: false,
    escalationReason: null,
    ...overrides,
  }
}

const claimWhere = (id: string) => ({ id, status: { not: 'RESPONDED' } })

describe('PATCH /api/comments/[id]', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): drains any mockResolvedValueOnce
    // sequencing left over from an earlier test, matching the reasoning in
    // app/api/comments/[id]/reply/route.test.ts and
    // app/api/ai/respond/route.test.ts.
    vi.resetAllMocks()
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  // The legitimate Escalate-button path: the exact { status: 'ESCALATED',
  // isEscalated: true } body components/lyra/inbox/comment-card.tsx's
  // handleEscalate sends, on a comment that hasn't been RESPONDED. This must
  // keep working -- the guard added by this fix excludes only RESPONDED, not
  // ESCALATED, specifically so this transition survives.
  it('still allows escalating a non-RESPONDED comment via the guarded write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)

    const res = await PATCH(req({ status: 'ESCALATED', isEscalated: true }), ctx())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ...baseComment(), status: 'ESCALATED', isEscalated: true })
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: claimWhere('c1'),
      data: { status: 'ESCALATED', isEscalated: true },
    })
  })

  // A normal, non-status PATCH (e.g. Ignore) still works and returns the
  // updated comment, reconstructed from the already-fetched row plus the
  // written data rather than a second DB read.
  it('applies a normal PATCH and returns the updated comment', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)

    const res = await PATCH(req({ status: 'IGNORED' }), ctx())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ...baseComment(), status: 'IGNORED' })
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: claimWhere('c1'),
      data: { status: 'IGNORED' },
    })
  })

  // The core regression test for this fix: this route used to do an
  // unguarded prisma.comment.update, which would silently clobber a
  // concurrently-set RESPONDED status (e.g. from
  // workers/ai-responder.worker.ts under FULL autonomy) back to whatever the
  // operator's stale browser state sent -- reopening the exact double-send
  // race app/api/comments/[id]/reply/route.ts's guarded claim exists to
  // prevent. The write here must lose cleanly instead.
  it('rejects the write with alreadyResolved when the comment is already RESPONDED, and never attempts the update', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'RESPONDED' }) as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)

    const res = await PATCH(req({ status: 'ESCALATED', isEscalated: true }), ctx())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
  })

  // Fix 1's whitelist check: any string that isn't a real CommentStatus enum
  // value must be rejected before the write is even attempted -- not just
  // malformed input, but specifically a value like 'PENDING' that could
  // re-arm workers/ai-responder.worker.ts's or
  // app/api/mcp/respond-to-item/route.ts's own status checks on a comment
  // that was legitimately RESPONDED.
  it('rejects an invalid status value before any write is attempted', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)

    const res = await PATCH(req({ status: 'NOT_A_REAL_STATUS' }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks access, 404 when the comment truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ id: 'c1' } as any)

    const forbiddenRes = await PATCH(req({ status: 'IGNORED' }), ctx())
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.comment.findUnique).mockResolvedValue(null)
    const notFoundRes = await PATCH(req({ status: 'IGNORED' }), ctx('c2'))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await PATCH(req({ status: 'IGNORED' }), ctx())
    expect(res.status).toBe(401)
  })
})
