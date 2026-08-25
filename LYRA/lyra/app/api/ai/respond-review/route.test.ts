import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
  },
}))
// Mock the Redis boundary itself, not lib/rate-limit -- same reasoning as
// app/api/ai/respond/route.test.ts.
vi.mock('@/lib/redis', () => ({ redis: {}, redisClient: { eval: vi.fn().mockResolvedValue(1) } }))
vi.mock('@/services/ai/response-generator', () => ({
  generateReviewResponse: vi.fn(),
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisClient } from '@/lib/redis'
import { generateReviewResponse } from '@/services/ai/response-generator'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/ai/respond-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function baseReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1', workspaceId: 'ws-1', status: 'PENDING', text: 'nice place',
    ...overrides,
  }
}

const draftClaimWhere = (id: string) => ({ id, status: { notIn: ['RESPONDED', 'ESCALATED'] } })

describe('POST /api/ai/respond-review', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(redisClient.eval).mockResolvedValue(1)
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  it('generates and persists a draft when no concurrent writer has touched the review', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({ sentiment: 'POSITIVE', response: 'Thanks!', shouldEscalate: false })

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ response: 'Thanks!', shouldEscalate: false })
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('r1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', sentiment: 'POSITIVE' },
    })
  })

  it('escalates and persists the escalation when no concurrent writer has touched the review', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({
      sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "lawsuit"',
    })

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ shouldEscalate: true, escalationReason: 'Contains escalation trigger: "lawsuit"' })
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('r1'),
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Contains escalation trigger: "lawsuit"', sentiment: null },
    })
  })

  it('persists the classified sentiment on the draft write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({ sentiment: 'NEGATIVE', response: 'Sorry to hear that!', shouldEscalate: false })

    await POST(req({ reviewId: 'r1' }))

    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('r1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Sorry to hear that!', sentiment: 'NEGATIVE' },
    })
  })

  it('persists the classified sentiment on the escalation write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({
      sentiment: 'URGENT', response: null, shouldEscalate: true, escalationReason: 'AI determined escalation required',
    })

    await POST(req({ reviewId: 'r1' }))

    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('r1'),
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'AI determined escalation required', sentiment: 'URGENT' },
    })
  })

  it('does not claim to have drafted when the guarded draft write loses the race, and reports the real current status', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({ sentiment: 'POSITIVE', response: 'Thanks!', shouldEscalate: false })
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ status: 'RESPONDED' } as any)

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledTimes(1)
  })

  it('reports ESCALATED as the real current status when that is what the concurrent writer set', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({ sentiment: 'POSITIVE', response: 'Thanks!', shouldEscalate: false })
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ status: 'ESCALATED' } as any)

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'ESCALATED' })
  })

  it('does not claim to have escalated when the guarded escalation write loses the race', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateReviewResponse).mockResolvedValue({
      sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "lawsuit"',
    })
    vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ status: 'RESPONDED' } as any)

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(prisma.review.update).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).toHaveBeenCalledTimes(1)
  })

  it('returns the already-resolved response immediately for an already-RESPONDED review, without calling generateReviewResponse', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(baseReview({ status: 'RESPONDED' }) as any)

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(generateReviewResponse).not.toHaveBeenCalled()
    expect(prisma.review.updateMany).not.toHaveBeenCalled()
    expect(prisma.review.findUnique).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks access, 404 when the review truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 'r1' } as any)

    const forbiddenRes = await POST(req({ reviewId: 'r1' }))
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.review.findUnique).mockResolvedValue(null)
    const notFoundRes = await POST(req({ reviewId: 'r2' }))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ reviewId: 'r1' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 and never looks up the review when the per-user rate limit is exceeded', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(redisClient.eval).mockResolvedValueOnce(21)

    const res = await POST(req({ reviewId: 'r1' }))

    expect(res.status).toBe(429)
    expect(prisma.review.findFirst).not.toHaveBeenCalled()
  })
})
