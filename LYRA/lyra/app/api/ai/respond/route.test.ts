import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
  },
}))
// Mock the Redis boundary itself, not lib/rate-limit -- same reasoning as
// app/api/mcp/audit/route.test.ts and app/api/mcp/respond-to-item/route.test.ts:
// letting checkRateLimit/rateLimitResponse run for real (against a fake
// redisClient.eval) keeps their actual logic under test, without ever
// constructing a real ioredis client.
vi.mock('@/lib/redis', () => ({ redis: {}, redisClient: { eval: vi.fn().mockResolvedValue(1) } }))
vi.mock('@/services/ai/response-generator', () => ({
  generateCommentResponse: vi.fn(),
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisClient } from '@/lib/redis'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/ai/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function baseComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', workspaceId: 'ws-1', status: 'PENDING', content: 'nice post',
    ...overrides,
  }
}

const draftClaimWhere = (id: string) => ({ id, status: { notIn: ['RESPONDED', 'ESCALATED'] } })

describe('POST /api/ai/respond', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): drains any mockResolvedValueOnce
    // queue left over from a previous test, matching
    // app/api/mcp/respond-to-item/route.test.ts's reasoning -- the
    // count:0/count:1 sequencing tests below depend on starting clean.
    vi.resetAllMocks()
    vi.mocked(redisClient.eval).mockResolvedValue(1)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  it('generates and persists a draft when no concurrent writer has touched the comment', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ sentiment: 'POSITIVE', response: 'Thanks!', shouldEscalate: false } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ response: 'Thanks!', shouldEscalate: false })
    // The write is a guarded updateMany, never a plain unconditional update.
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!', sentiment: 'POSITIVE' },
    })
  })

  it('escalates and persists the escalation when no concurrent writer has touched the comment', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({
      sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"',
    } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Contains escalation trigger: "refund"', sentiment: null },
    })
  })

  // generateCommentResponse now classifies sentiment alongside the draft/
  // escalation decision (see services/ai/response-generator.ts) -- these two
  // tests confirm that classified value is actually threaded through to the
  // Prisma write rather than silently dropped, independent of the two happy
  // -path tests above (which already cover the full data shape but could
  // pass even if sentiment were hardcoded rather than read from `result`).
  it('persists the classified sentiment on the draft write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ sentiment: 'NEGATIVE', response: 'Sorry to hear that!', shouldEscalate: false } as any)

    await POST(req({ commentId: 'c1' }))

    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Sorry to hear that!', sentiment: 'NEGATIVE' },
    })
  })

  it('persists the classified sentiment on the escalation write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({
      sentiment: 'URGENT', response: null, shouldEscalate: true, escalationReason: 'Sentiment classified as URGENT',
    } as any)

    await POST(req({ commentId: 'c1' }))

    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Sentiment classified as URGENT', sentiment: 'URGENT' },
    })
  })

  // The core race this fix closes: while generateCommentResponse (a
  // multi-second Claude call) is in flight, a concurrent writer --
  // workers/ai-responder.worker.ts, POST /api/mcp/respond-to-item under FULL
  // autonomy, or a human's manual Reply -- can claim and actually reply to
  // this same comment. The draft write must lose cleanly (not clobber
  // RESPONDED back to AI_DRAFTED), and the caller must be told honestly that
  // nothing was persisted -- not receive a response that looks like success.
  it('does not claim to have drafted when the guarded draft write loses the race, and reports the real current status', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ sentiment: 'POSITIVE', response: 'Thanks!', shouldEscalate: false } as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ status: 'RESPONDED' } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    // Must not echo the generated draft text or shouldEscalate:false as if
    // this were a successful draft -- that would silently imply the draft is
    // sitting there ready to send when it was never persisted.
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
    // Guards against a dropped `return` in the escalation branch above this
    // one silently falling through to also execute the draft-branch write --
    // that bug would produce this exact same final response shape, so
    // asserting the response alone wouldn't catch it.
    expect(prisma.comment.updateMany).toHaveBeenCalledTimes(1)
  })

  // Same race, but the concurrent writer landed on ESCALATED rather than
  // RESPONDED (e.g. a stalled ai-responder.worker.ts retry escalating this
  // comment while this route's own AI call was still running) -- the
  // reported status must reflect whichever one actually won, not always
  // assume RESPONDED.
  it('reports ESCALATED as the real current status when that is what the concurrent writer set', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ sentiment: 'POSITIVE', response: 'Thanks!', shouldEscalate: false } as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ status: 'ESCALATED' } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'ESCALATED' })
  })

  // The equivalent lost race on the escalation path: this route's own
  // ALWAYS_ESCALATE-driven write must not clobber a status a concurrent
  // writer already set (e.g. RESPONDED from a real send that completed while
  // this AI call was in flight).
  it('does not claim to have escalated when the guarded escalation write loses the race', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({
      sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"',
    } as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ status: 'RESPONDED' } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
    // Same regression guard as the lost-race draft test above: a dropped
    // `return` here would let this branch fall through to also execute the
    // draft-branch write, invisibly to a response-shape-only assertion.
    expect(prisma.comment.updateMany).toHaveBeenCalledTimes(1)
  })

  // Fix 2: this route used to be the only one of the four fixed today that
  // went straight from fetching the comment into a multi-second
  // generateCommentResponse call without ever checking status first --
  // burning a full AI generation call on a comment that's already terminal.
  // The real value of this test is the "never called" assertion below, not
  // the response shape (already covered by the lost-race tests above).
  it('returns the already-resolved response immediately for an already-RESPONDED comment, without calling generateCommentResponse', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'RESPONDED' }) as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' })
    expect(generateCommentResponse).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
    // No re-read needed to build this response -- comment.status was already
    // in hand from the findFirst above, so this early exit costs no extra
    // query beyond what the route already had to do.
    expect(prisma.comment.findUnique).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks access, 404 when the comment truly does not exist', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue({ id: 'c1' } as any)

    const forbiddenRes = await POST(req({ commentId: 'c1' }))
    expect(forbiddenRes.status).toBe(403)

    vi.mocked(prisma.comment.findUnique).mockResolvedValue(null)
    const notFoundRes = await POST(req({ commentId: 'c2' }))
    expect(notFoundRes.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ commentId: 'c1' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 and never looks up the comment when the per-user rate limit is exceeded', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    // Route calls checkRateLimit(key, 20, 60) -- a count above 20 in the window means "over limit."
    vi.mocked(redisClient.eval).mockResolvedValueOnce(21)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(429)
    expect(prisma.comment.findFirst).not.toHaveBeenCalled()
  })
})
