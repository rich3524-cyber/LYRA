import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
  },
}))
vi.mock('@/services/ai/response-generator', () => ({
  generateCommentResponse: vi.fn(),
  checkGuardrailViolation: vi.fn(),
}))
vi.mock('@/services/social/provider', () => ({
  getProvider: vi.fn(),
  ProviderUnsupported: class ProviderUnsupported extends Error {},
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse, checkGuardrailViolation } from '@/services/ai/response-generator'
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
      provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null,
      workspace: { aiResponseMode: 'DRAFT_APPROVE' },
    },
    platformCommentId: 'pc1', platformPostId: 'pp1',
    ...overrides,
  }
}

describe('POST /api/mcp/respond-to-item', () => {
  beforeEach(() => vi.clearAllMocks())

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
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks!' },
    })
  })

  it('drafts and actually sends under FULL autonomy when no guardrail fires', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: { provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null, workspace: { aiResponseMode: 'FULL' } } }) as any
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
    // Third arg is the comment's own platformCommentId (the fixture's default 'pc1'),
    // matching the same (account, postExternalId, externalId, text) signature and
    // argument source used by the reference app/api/comments/[id]/reply/route.ts.
    expect(replyToComment).toHaveBeenCalledWith(expect.anything(), 'pp1', 'pc1', 'Thanks!')
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'RESPONDED', finalResponse: 'Thanks!' }),
    })
  })

  it('re-checks guardrails on caller-supplied text before sending under FULL autonomy, and refuses if one fires', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(
      baseComment({ socialAccount: { provider: 'ZERNIO', zernioAccountId: 'z1', accessToken: null, workspace: { aiResponseMode: 'FULL' } } }) as any
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
})
