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
