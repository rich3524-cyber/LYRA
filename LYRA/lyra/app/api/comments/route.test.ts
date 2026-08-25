import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    comment: { findMany: vi.fn() },
    review: { findMany: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from './route'

function req(workspaceId = 'ws-1') {
  return new Request(`http://localhost/api/comments?workspaceId=${workspaceId}`)
}

function baseComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    workspaceId: 'ws-1',
    content: 'nice post',
    authorName: 'Jane',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    socialAccount: { platform: 'FACEBOOK', name: 'Acme FB' },
    ...overrides,
  }
}

function baseReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    workspaceId: 'ws-1',
    text: 'Great service',
    rating: 5,
    authorName: 'John',
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    socialAccount: { platform: 'GOOGLE_BUSINESS', name: 'Acme GBP' },
    ...overrides,
  }
}

describe('GET /api/comments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
  })

  it('merges comments and reviews, each tagged with a type discriminant, sorted by createdAt desc', async () => {
    const comment = baseComment({ createdAt: new Date('2026-08-20T00:00:00.000Z') })
    const review = baseReview({ createdAt: new Date('2026-08-21T00:00:00.000Z') })
    vi.mocked(prisma.comment.findMany).mockResolvedValue([comment] as any)
    vi.mocked(prisma.review.findMany).mockResolvedValue([review] as any)

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    // review is newer, so it comes first
    expect(body[0]).toEqual({ ...review, createdAt: review.createdAt.toISOString(), type: 'review' })
    expect(body[1]).toEqual({ ...comment, createdAt: comment.createdAt.toISOString(), type: 'comment' })
  })

  it('caps the combined merged result at 100 rows', async () => {
    const comments = Array.from({ length: 60 }, (_, i) =>
      baseComment({ id: `c${i}`, createdAt: new Date(2026, 7, 1, 0, i) })
    )
    const reviews = Array.from({ length: 60 }, (_, i) =>
      baseReview({ id: `r${i}`, createdAt: new Date(2026, 7, 2, 0, i) })
    )
    vi.mocked(prisma.comment.findMany).mockResolvedValue(comments as any)
    vi.mocked(prisma.review.findMany).mockResolvedValue(reviews as any)

    const res = await GET(req())
    const body = await res.json()

    expect(body).toHaveLength(100)

    // All 60 reviews are dated Aug 2 (newer than every comment, which is
    // dated Aug 1), so the 100-cap should keep every review plus only the
    // 40 newest comments (c20..c59), dropping the 20 oldest comments
    // (c0..c19). This distinguishes "correctly kept the newest 100" from
    // "kept some arbitrary 100" -- e.g. it would fail if `.sort()` were
    // deleted, since concatenation-then-slice with no sort would instead
    // keep all 60 comments and only the first 40 reviews.
    const ids = body.map((row: { id: string }) => row.id)
    const reviewIds = Array.from({ length: 60 }, (_, i) => `r${i}`)
    const survivingCommentIds = Array.from({ length: 40 }, (_, i) => `c${i + 20}`)
    const droppedCommentIds = Array.from({ length: 20 }, (_, i) => `c${i}`)

    expect(new Set(ids)).toEqual(new Set([...reviewIds, ...survivingCommentIds]))
    for (const id of droppedCommentIds) {
      expect(ids).not.toContain(id)
    }
  })

  // Regression coverage: every workspace today has zero reviews (nothing
  // ingests them into the DB yet), so this endpoint's existing real callers
  // must keep working unchanged when prisma.review.findMany resolves empty.
  it('still returns comments correctly for a workspace with zero reviews', async () => {
    const comment = baseComment()
    vi.mocked(prisma.comment.findMany).mockResolvedValue([comment] as any)
    vi.mocked(prisma.review.findMany).mockResolvedValue([] as any)

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([{ ...comment, createdAt: comment.createdAt.toISOString(), type: 'comment' }])
  })

  it('degrades gracefully (200 with comments only) when prisma.review.findMany rejects, e.g. because the Review table is not migrated yet', async () => {
    const comment = baseComment()
    vi.mocked(prisma.comment.findMany).mockResolvedValue([comment] as any)
    vi.mocked(prisma.review.findMany).mockRejectedValue(new Error('relation "Review" does not exist'))

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([{ ...comment, createdAt: comment.createdAt.toISOString(), type: 'comment' }])
  })

  it('returns 400 when workspaceId is missing', async () => {
    const res = await GET(new Request('http://localhost/api/comments'))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the user lacks workspace access', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
})
