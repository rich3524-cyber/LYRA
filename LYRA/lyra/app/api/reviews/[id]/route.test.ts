import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/reviews/rv1', {
    method: 'PATCH',
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
    authorName: 'Jane',
    text: 'nice place',
    aiDraftResponse: null,
    finalResponse: null,
    respondedAt: null,
    isEscalated: false,
    escalationReason: null,
    ...overrides,
  }
}

const claimWhere = (id: string) => ({ id, status: { not: 'RESPONDED' } })

describe('PATCH /api/reviews/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  // The legitimate Escalate-button path: a review that hasn't been RESPONDED
  // can still be escalated via the guarded write.
  it('still allows escalating a non-RESPONDED review via the guarded write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)

    const res = await PATCH(req({ status: 'ESCALATED', isEscalated: true }), ctx())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ...baseReview(), status: 'ESCALATED', isEscalated: true })
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: claimWhere('rv1'),
      data: { status: 'ESCALATED', isEscalated: true },
    })
  })

  // A normal, non-status PATCH (e.g. Ignore) still works and returns the
  // updated review, reconstructed from the already-fetched row plus the
  // written data rather than a second DB read.
  it('applies a normal PATCH and returns the updated review', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)

    const res = await PATCH(req({ status: 'IGNORED' }), ctx())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ...baseReview(), status: 'IGNORED' })
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: claimWhere('rv1'),
      data: { status: 'IGNORED' },
    })
  })

  // Mirrors app/api/comments/[id]/route.ts's core regression test: an
  // unguarded write would silently clobber a concurrently-set RESPONDED
  // status (e.g. from workers/ai-review-responder.worker.ts) back to
  // whatever the operator's stale browser state sent. The write here must
  // lose cleanly instead.
  it('rejects the write with alreadyResolved when the review is already RESPONDED, and never attempts the update', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview({ status: 'RESPONDED' }) as any)
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 0 } as any)

    const res = await PATCH(req({ status: 'ESCALATED', isEscalated: true }), ctx())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(prisma.review.update).not.toHaveBeenCalled()
  })

  // Any string that isn't a real CommentStatus enum value (Review reuses
  // that enum, see prisma/schema.prisma) must be rejected before the write
  // is even attempted.
  it('rejects an invalid status value before any write is attempted', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)

    const res = await PATCH(req({ status: 'NOT_A_REAL_STATUS' }), ctx())

    expect(res.status).toBe(400)
    expect(prisma.review.updateMany).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks access, 404 when the review truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 'rv1' } as any)

    const forbiddenRes = await PATCH(req({ status: 'IGNORED' }), ctx())
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.review.findUnique).mockResolvedValue(null)
    const notFoundRes = await PATCH(req({ status: 'IGNORED' }), ctx('rv2'))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await PATCH(req({ status: 'IGNORED' }), ctx())
    expect(res.status).toBe(401)
  })
})
