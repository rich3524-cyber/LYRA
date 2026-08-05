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
      platform: 'INSTAGRAM', name: 'My IG Account',
      workspace: { name: 'Acme Co', aiResponseMode: 'DRAFT_APPROVE' },
    },
    platformCommentId: 'pc1', platformPostId: 'pp1',
    ...overrides,
  }
}

const fullSocialAccount = {
  workspaceId: 'ws-1',
  provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null,
  platform: 'INSTAGRAM', name: 'My IG Account',
  workspace: { name: 'Acme Co', aiResponseMode: 'FULL' },
}

// Echoed back on every response shape (parent spec 6.2) -- derived from the
// socialAccount fixtures above so a fixture change can't silently desync
// from what the assertions below expect.
const echo = { workspaceName: 'Acme Co', platform: 'INSTAGRAM', accountName: 'My IG Account' }

const draftClaimWhere = (id: string) => ({ id, status: { notIn: ['RESPONDED', 'ESCALATED'] } })

describe('POST /api/mcp/respond-to-item', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): clearAllMocks only wipes call
    // history and leaves any mockResolvedValueOnce queue from a previous
    // test's sequencing still primed, which the concurrency tests below
    // rely on being empty at the start of every test. resetAllMocks drains
    // that queue too, so ordering between tests can't leak. Every mock this
    // suite depends on having a default is re-primed immediately below.
    vi.resetAllMocks()
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
    expect(body).toEqual({ sent: false, draft: 'Thanks!', ...echo })
    expect(getProvider).not.toHaveBeenCalled()
    // The intermediate AI_DRAFTED write is now the guarded updateMany (Fix A),
    // not a plain unconditional update.
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!' },
    })
    // Guards against a wrong-argument regression (e.g. passing finalText
    // instead of the comment's own content) that unit tests mocking
    // checkAlwaysEscalate's return value alone wouldn't catch.
    expect(checkAlwaysEscalate).toHaveBeenCalledWith('nice post', [])
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
    expect(body).toEqual({ sent: true, response: 'Thanks!', ...echo })
    // Third arg is the comment's own platformCommentId (the fixture's default
    // 'pc1'), matching the (account, postExternalId, externalId, text)
    // signature used by the reference app/api/comments/[id]/reply/route.ts.
    expect(replyToComment).toHaveBeenCalledWith(expect.anything(), 'pp1', 'pc1', 'Thanks!')
    // Two guarded writes happen on this path: the draft claim, then the
    // final RESPONDED claim -- both via updateMany, never a plain update.
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!' },
    })
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
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
    expect(body).toEqual({ sent: false, refused: true, rule: 'NEVER_DISCUSS', value: 'pricing', ...echo })
    expect(getProvider).not.toHaveBeenCalled()
    // Draft-generation guardrail check is skipped entirely when responseText is supplied --
    // generateCommentResponse should never be called in this path.
    expect(generateCommentResponse).not.toHaveBeenCalled()
    // The draft claim still runs (finalText exists either way), but the
    // refusal happens before the final send-claim, so updateMany fires
    // exactly once here -- not twice.
    expect(prisma.comment.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: draftClaimWhere('c1'),
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'our pricing is $99' },
    })
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
    expect(body).toEqual({ sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"', ...echo })
    // Guarded (round 3): a concurrent request could have claimed RESPONDED
    // between the top-of-function guard and this write, so it's a
    // predicated updateMany, never a plain unconditional update.
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: { notIn: ['RESPONDED'] } },
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
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
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
    expect(prisma.comment.updateMany).not.toHaveBeenCalled()
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
    expect(body).toEqual({ sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"', ...echo })
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: { notIn: ['RESPONDED'] } },
      data: { status: 'ESCALATED', isEscalated: true, escalationReason: 'Contains escalation trigger: "refund"' },
    })
    expect(checkAlwaysEscalate).toHaveBeenCalledWith('I want a refund', [])
    expect(generateCommentResponse).not.toHaveBeenCalled()
    expect(getProvider).not.toHaveBeenCalled()
  })

  // Fix (round 3): the ESCALATED write must itself be guarded -- if a
  // concurrent request already claimed RESPONDED by the time this write
  // runs, it must no-op (not clobber RESPONDED back to ESCALATED) and the
  // caller gets the same "already responded" outcome as any other claim loss.
  it('refuses cleanly instead of overwriting when the ALWAYS_ESCALATE write loses to a concurrent RESPONDED claim', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ content: 'I want a refund' }) as any
    )
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(checkAlwaysEscalate).mockReturnValue({ trigger: 'refund' })
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Already responded.' })
    expect(prisma.comment.update).not.toHaveBeenCalled()
  })

  // Fix 2: an LLM-driven caller can retry, and two concurrent calls for the
  // same commentId are a real risk of double-posting to a real customer.
  // This targets the FINAL send-claim specifically losing the race (the
  // draft write succeeded, but a concurrent request beat this one to the
  // send-claim) -- distinct from the draft-write race covered below.
  it('refuses to send when the final send-claim loses the race after the draft write already succeeded', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: fullSocialAccount }) as any
    )
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])
    vi.mocked(generateCommentResponse).mockResolvedValue({ response: 'Thanks!', shouldEscalate: false })
    vi.mocked(checkGuardrailViolation).mockReturnValue(null)
    vi.mocked(prisma.comment.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any) // this request's own draft write succeeds
      .mockResolvedValueOnce({ count: 0 } as any) // a concurrent request already claimed RESPONDED

    const res = await POST(req({ commentId: 'c1' }))

    expect(res.status).toBe(400)
    expect(getProvider).not.toHaveBeenCalled()
  })

  // Fix A (round 2): the unconditional AI_DRAFTED write used to sit between
  // the RESPONDED/ESCALATED guard and the send-claim with no status
  // predicate at all, so a slower concurrent request's draft write could
  // silently clobber a faster request's already-RESPONDED status back to
  // AI_DRAFTED -- which then matched the slower request's own send-claim
  // predicate and let it send a SECOND real reply. This interleaving test
  // exercises exactly that: request A's draft write and send-claim both win
  // (count 1), simulating that it finished first end-to-end; request B's own
  // draft write (issued after A has already finished, from B's point of
  // view) is mocked to lose (count 0), simulating that A's RESPONDED status
  // no longer matches B's guarded predicate. B must be stopped there and
  // must never reach the send provider.
  it('stops a slower concurrent request at its own guarded draft write once a faster request has already claimed and sent', async () => {
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

    vi.mocked(prisma.comment.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any) // Request A: draft write succeeds
      .mockResolvedValueOnce({ count: 1 } as any) // Request A: send-claim succeeds -- A sends
      .mockResolvedValueOnce({ count: 0 } as any) // Request B: draft write finds status already RESPONDED

    const resA = await POST(req({ commentId: 'c1' }))
    expect(resA.status).toBe(200)
    expect(await resA.json()).toEqual({ sent: true, response: 'Thanks!', ...echo })
    expect(replyToComment).toHaveBeenCalledTimes(1)

    const resB = await POST(req({ commentId: 'c1' }))
    expect(resB.status).toBe(400)
    // The whole point of Fix A: B never reaches a second real send.
    expect(replyToComment).toHaveBeenCalledTimes(1)
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
    // Own-claim-scoped (round 3): the rollback is a predicated updateMany
    // (status: 'RESPONDED' -- the exact state this request's own claim just
    // set), never a plain unconditional update.
    expect(prisma.comment.update).not.toHaveBeenCalled()
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', finalResponse: null, respondedAt: null },
    })
  })

  // Fix (round 3): the send-failure rollback must be scoped to the exact
  // RESPONDED state this request's own claim set, not unconditional -- so it
  // can never silently overwrite a legitimate concurrent write (e.g. a
  // concurrent escalation, or any future writer) that changed the comment's
  // status in between the claim and the rollback attempt.
  it('scopes the send-failure rollback to its own RESPONDED claim instead of overwriting unconditionally', async () => {
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
    // Draft write and send-claim both succeed (this request legitimately
    // claimed RESPONDED); the rollback attempt then finds count 0,
    // simulating that the comment's status no longer matches the exact
    // RESPONDED state this request itself set.
    vi.mocked(prisma.comment.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any) // draft write
      .mockResolvedValueOnce({ count: 1 } as any) // send-claim
      .mockResolvedValueOnce({ count: 0 } as any) // rollback: no longer matches its own scoped predicate

    const res = await POST(req({ commentId: 'c1' }))

    // The send genuinely failed either way -- that's still reported.
    expect(res.status).toBe(502)
    // The rollback call itself must be scoped to status: 'RESPONDED', not
    // unconditional -- that's what makes count 0 a safe no-op instead of a
    // silent overwrite of whatever the comment's real current state now is.
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', finalResponse: null, respondedAt: null },
    })
    expect(prisma.comment.update).not.toHaveBeenCalled()
  })

  // M9: unbounded caller text must not reach a platform API or the DB.
  it('returns 400 when responseText exceeds the 2000 character cap', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await POST(req({ commentId: 'c1', responseText: 'a'.repeat(2001) }))
    expect(res.status).toBe(400)
    expect(prisma.comment.findFirst).not.toHaveBeenCalled()
  })
})
