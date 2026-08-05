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
// app/api/mcp/audit/route.test.ts: letting checkRateLimit/rateLimitResponse
// run for real (against a fake redisClient.eval) keeps their actual logic
// under test, without ever constructing a real ioredis client.
vi.mock('@/lib/redis', () => ({ redis: {}, redisClient: { eval: vi.fn().mockResolvedValue(1) } }))
vi.mock('@/services/ai/response-generator', () => ({
  generateCommentResponse: vi.fn(),
  checkGuardrailViolation: vi.fn(),
  checkAlwaysEscalate: vi.fn(),
}))
vi.mock('@/services/social/provider', () => ({
  getProvider: vi.fn(),
  ProviderUnsupported: class ProviderUnsupported extends Error {},
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisClient } from '@/lib/redis'
import { generateCommentResponse, checkGuardrailViolation, checkAlwaysEscalate } from '@/services/ai/response-generator'
import { getProvider } from '@/services/social/provider'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/mcp/respond-to-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function baseComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', workspaceId: 'ws-1', status: 'PENDING', content: 'nice post',
    socialAccount: {
      workspaceId: 'ws-1',
      provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null,
      workspace: { aiResponseMode: 'DRAFT_APPROVE' },
    },
    platformCommentId: 'pc1', platformPostId: 'pp1',
    ...overrides,
  }
}

const fullSocialAccount = {
  workspaceId: 'ws-1',
  provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null,
  workspace: { aiResponseMode: 'FULL' },
}

describe('POST /api/mcp/respond-to-item', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(redisClient.eval).mockResolvedValue(1)
    vi.mocked(checkAlwaysEscalate).mockReturnValue(null)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 1 } as any)
  })

  it('generates a draft and stops there under DRAFT_APPROVE, never calling the send provider', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: false, draft: 'Thanks!' })
    expect(getProvider).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!' },
    })
  })

  it('drafts and actually sends under FULL autonomy when no guardrail fires', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: fullSocialAccount }) as any
    )
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })
    vi.mocked(checkGuardrailViolation).mockReturnValue(null)
    const replyToComment = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: true, response: 'Thanks!' })
    // Third arg is the comment's own platformCommentId (the fixture's default
    // 'pc1'), matching the (account, postExternalId, externalId, text)
    // signature used by the reference app/api/comments/[id]/reply/route.ts.
    expect(replyToComment).toHaveBeenCalledWith(expect.anything(), 'pp1', 'pc1', 'Thanks!')
    // The RESPONDED write is now the atomic claim (updateMany), not a plain update.
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Thanks!', respondedAt: expect.any(Date) },
    })
  })

  it('re-checks guardrails on caller-supplied text before sending under FULL autonomy, and refuses if one fires', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: fullSocialAccount }) as any
    )
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(checkGuardrailViolation).mockReturnValue({ rule: 'NEVER_DISCUSS', value: 'pricing' })

    const res = await POST(req({ commentId: 'c1', responseText: 'our pricing is $99' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: false, refused: true, rule: 'NEVER_DISCUSS', value: 'pricing' })
    expect(getProvider).not.toHaveBeenCalled()
    // Draft-generation guardrail check is skipped entirely when responseText is supplied --
    // generateCommentResponse should never be called in this path.
    expect(generateCommentResponse).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
  })

  it('marks the comment ESCALATED and returns shouldEscalate when AI generation escalates', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({
      response: null, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"',
    })

    const res = await POST(req({ commentId: 'c1' }))

    const body = await res.json()
    expect(body).toEqual({ sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"' })
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Contains escalation trigger: "refund"' },
    })
  })

  it('returns 400 when the comment has already been responded to', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'RESPONDED' }) as any)

    const res = await POST(req({ commentId: 'c1' }))
    expect(res.status).toBe(400)
  })

  // Fix 1: ESCALATED means a human must handle this -- it must be refused
  // exactly like RESPONDED, the same as workers/ai-responder.worker.ts's own
  // guard (`comment.status === 'ESCALATED' || comment.status === 'RESPONDED'`).
  it('returns 400 when the comment is already ESCALATED, and never attempts to draft or send', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment({ status: 'ESCALATED' }) as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    expect(prisma.guardrail.findMany).not.toHaveBeenCalled()
    expect(generateCommentResponse).not.toHaveBeenCalled()
    expect(getProvider).not.toHaveBeenCalled()
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

  // Fix 3: this route makes the same generateCommentResponse/Claude call as
  // the already-rate-limited /api/ai/respond, but is also directly reachable
  // over a browser session -- it needs its own limit.
  it('returns 429 and never looks up the comment when the per-user rate limit is exceeded', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    // Route calls checkRateLimit(key, 20, 60) -- a count above 20 in the window means "over limit."
    vi.mocked(redisClient.eval).mockResolvedValueOnce(21)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(429)
    expect(prisma.comment.findFirst).not.toHaveBeenCalled()
  })

  // Fix 4: extractClaudeText can return '' when the model's reply isn't a
  // text block -- generateCommentResponse doesn't treat that as an
  // escalation itself, so this route must refuse to draft/send it rather
  // than silently posting an empty reply.
  it('refuses an empty AI-generated response instead of drafting or sending it', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(baseComment() as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: '', shouldEscalate: false })

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Generated response was empty.' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
  })

  // Fix 5: the caller-supplied responseText path bypasses generateCommentResponse
  // entirely, which is where the ALWAYS_ESCALATE pre-call scan used to live --
  // this route must run that check itself before either path can produce a send.
  it('escalates on the caller-supplied responseText path when an ALWAYS_ESCALATE trigger matches the comment', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: fullSocialAccount, content: 'I want a refund' }) as any
    )
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(checkAlwaysEscalate).mockReturnValue({ trigger: 'refund' })

    const res = await POST(req({ commentId: 'c1', responseText: 'Sure, here you go' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"' })
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Contains escalation trigger: "refund"' },
    })
    expect(generateCommentResponse).not.toHaveBeenCalled()
    expect(getProvider).not.toHaveBeenCalled()
  })

  // Fix 2: an LLM-driven caller can retry, and two concurrent calls for the
  // same commentId are a real risk of double-posting to a real customer.
  // The atomic claim (updateMany keyed on status not already
  // RESPONDED/ESCALATED) must be what gates the actual send.
  it('refuses to send when the atomic claim loses the race (comment already claimed by a concurrent request)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: fullSocialAccount }) as any
    )
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })
    vi.mocked(checkGuardrailViolation).mockReturnValue(null)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    expect(getProvider).not.toHaveBeenCalled()
  })

  // M7: a failed send must roll the optimistic claim back so a legitimate
  // retry isn't permanently blocked, and must surface as 502 (not 500) so an
  // MCP client can tell "the send itself failed" apart from other failures.
  it('rolls the claim back to AI_DRAFTED and returns 502 when the provider send throws', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: fullSocialAccount }) as any
    )
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })
    vi.mocked(checkGuardrailViolation).mockReturnValue(null)
    const replyToComment = vi.fn().mockRejectedValue(new Error('platform timeout'))
    vi.mocked(getProvider).mockReturnValue({ replyToComment } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ error: 'Failed to send reply' })
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'AI_DRAFTED', finalResponse: null, respondedAt: null },
    })
  })

  // M9: unbounded caller text must not reach a platform API or the DB.
  it('returns 400 when responseText exceeds the 2000 character cap', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await POST(req({ commentId: 'c1', responseText: 'a'.repeat(2001) }))
    expect(res.status).toBe(400)
    expect(prisma.comment.findFirst).not.toHaveBeenCalled()
  })
})
