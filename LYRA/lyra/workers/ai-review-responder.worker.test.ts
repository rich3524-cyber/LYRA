import { describe, it, expect, vi, beforeEach } from 'vitest'

// This file, unlike ai-responder.worker.test.ts, does NOT need to mock
// 'bullmq' or '@/lib/redis' -- ai-review-responder.worker.ts deliberately
// does not instantiate its own `new Worker(...)` (see that file's top-level
// comment for why: both comment and review jobs share one BullMQ queue, and
// the single Worker that actually consumes it lives in
// workers/ai-responder.worker.ts). processAiReviewResponseJob itself never
// touches Redis/BullMQ either way -- all its I/O goes through the injected
// `deps`.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findUnique: vi.fn(), updateMany: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
    socialAccount: { findUnique: vi.fn() },
  },
}))

import { processAiReviewResponseJob } from './ai-review-responder.worker'

function makeDeps(overrides: {
  review?: Partial<Record<string, unknown>>
  account?: Partial<Record<string, unknown>> | null
  claimCount?: number
  generateResult?: { sentiment: string | null; response: string | null; shouldEscalate: boolean; escalationReason?: string }
  replyToReview?: ReturnType<typeof vi.fn>
} = {}) {
  const review = {
    id: 'review-1',
    workspaceId: 'ws-1',
    socialAccountId: 'acc-1',
    zernioReviewId: 'zernio-review-1',
    rating: 5,
    authorName: 'Jane Doe',
    text: 'Great service!',
    sentiment: 'POSITIVE',
    isEscalated: false,
    escalationReason: null,
    status: 'PENDING',
    aiDraftResponse: null,
    finalResponse: null,
    respondedAt: null,
    platformCreatedAt: new Date(),
    createdAt: new Date(),
    ...overrides.review,
  }

  const account = overrides.account === undefined
    ? { id: 'acc-1', provider: 'NATIVE', zernioAccountId: null, platform: 'GOOGLE_BUSINESS', workspace: { name: 'Acme Co' } }
    : overrides.account

  const replyToReview = overrides.replyToReview ?? vi.fn().mockResolvedValue(undefined)

  const generateResult = overrides.generateResult ?? { sentiment: 'POSITIVE', response: 'Thanks so much for the kind words!', shouldEscalate: false }

  const deps = {
    prisma: {
      review: {
        findUnique: vi.fn().mockResolvedValue(review),
        updateMany: vi.fn().mockResolvedValue({ count: overrides.claimCount ?? 1 }),
      },
      brandProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: 'bp-1', workspaceId: 'ws-1', voiceSummary: 'Friendly', toneAttributes: [] }),
      },
      guardrail: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      socialAccount: {
        findUnique: vi.fn().mockResolvedValue(account),
      },
    },
    generateReviewResponse: vi.fn().mockResolvedValue(generateResult),
    getProvider: vi.fn().mockReturnValue({ replyToReview }),
  }

  return { deps, replyToReview }
}

describe('processAiReviewResponseJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns immediately, with no further DB calls or AI generation, when the review is already RESPONDED', async () => {
    const { deps } = makeDeps({ review: { status: 'RESPONDED' } })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.generateReviewResponse).not.toHaveBeenCalled()
    expect(deps.prisma.brandProfile.findUnique).not.toHaveBeenCalled()
    expect(deps.prisma.guardrail.findMany).not.toHaveBeenCalled()
    expect(deps.prisma.review.updateMany).not.toHaveBeenCalled()
  })

  it('returns immediately, with no further DB calls or AI generation, when the review is already ESCALATED', async () => {
    const { deps } = makeDeps({ review: { status: 'ESCALATED' } })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.generateReviewResponse).not.toHaveBeenCalled()
    expect(deps.prisma.review.updateMany).not.toHaveBeenCalled()
  })

  it('claims ESCALATED with the guarded predicate when the AI decides to escalate', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
    })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status: 'ESCALATED',
        isEscalated: true,
        escalationReason: 'Contains a legal threat',
        sentiment: null,
      },
    })
    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(1)
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  it('persists the classified sentiment alongside the ESCALATED claim when the AI decides to escalate', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: 'URGENT', response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
    })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status:           'ESCALATED',
        isEscalated:      true,
        escalationReason: 'Contains a legal threat',
        sentiment:        'URGENT',
      },
    })
  })

  it('does not perform any additional writes or sends when the escalation claim loses the race (count: 0)', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
      claimCount: 0,
    })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(1)
    expect(deps.prisma.socialAccount.findUnique).not.toHaveBeenCalled()
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  it('claims RESPONDED BEFORE calling the provider on a normal successful auto-post run, with no second write after, using replyToReview\'s 3-arg signature', async () => {
    const { deps, replyToReview } = makeDeps()
    const callOrder: string[] = []
    deps.prisma.review.updateMany.mockImplementation(async () => {
      callOrder.push('claim')
      return { count: 1 }
    })
    replyToReview.mockImplementation(async () => {
      callOrder.push('send')
    })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(callOrder).toEqual(['claim', 'send'])
    expect(deps.prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Thanks so much for the kind words!', respondedAt: expect.any(Date), sentiment: 'POSITIVE' },
    })
    // Exactly 3 args -- account, externalId (zernioReviewId), text. NOT the
    // 4-arg (account, postExternalId, externalId, text) shape replyToComment
    // takes -- reviews have no platformPostId concept.
    expect(replyToReview).toHaveBeenCalledWith(
      { id: 'acc-1', provider: 'NATIVE', zernioAccountId: null, platform: 'GOOGLE_BUSINESS', workspace: { name: 'Acme Co' } },
      'zernio-review-1',
      'Thanks so much for the kind words!'
    )
    expect(replyToReview).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything())
    expect(replyToReview.mock.calls[0]).toHaveLength(3)
    // The claim already set RESPONDED/finalResponse/respondedAt -- no second write.
    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(1)
  })

  it('persists the classified sentiment alongside the RESPONDED claim on a normal successful auto-post run', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: 'NEGATIVE', response: 'Sorry to hear that', shouldEscalate: false },
    })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Sorry to hear that', respondedAt: expect.any(Date), sentiment: 'NEGATIVE' },
    })
  })

  it('never calls the provider when the auto-post claim loses the race (count: 0) -- the core regression test for the double-send bug', async () => {
    const { deps, replyToReview } = makeDeps({ claimCount: 0 })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.getProvider).not.toHaveBeenCalled()
    expect(replyToReview).not.toHaveBeenCalled()
    expect(deps.prisma.socialAccount.findUnique).not.toHaveBeenCalled()
    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(1)
  })

  it('rolls back the claim to AI_DRAFTED when the claim succeeds but no socialAccount is found', async () => {
    const { deps, replyToReview } = makeDeps({ account: null })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(replyToReview).not.toHaveBeenCalled()
    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(2)
    expect(deps.prisma.review.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Thanks so much for the kind words!', respondedAt: expect.any(Date), sentiment: 'POSITIVE' },
    })
    expect(deps.prisma.review.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'review-1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much for the kind words!', finalResponse: null, respondedAt: null },
    })
  })

  it('rolls back the claim to AI_DRAFTED and logs the error when replyToReview throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const replyToReview = vi.fn().mockRejectedValue(new Error('platform rejected the request'))
    const { deps } = makeDeps({ replyToReview })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(2)
    expect(deps.prisma.review.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'review-1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much for the kind words!', finalResponse: null, respondedAt: null },
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('review-1'),
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })

  it('claims AI_DRAFTED with the guarded notIn predicate on the draft-only path (autoPost: false)', async () => {
    const { deps } = makeDeps()

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: false }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much for the kind words!', sentiment: 'POSITIVE' },
    })
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  it('persists the classified sentiment alongside the AI_DRAFTED status on the draft-only path', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: 'POSITIVE', response: 'Thanks so much for the kind words!', shouldEscalate: false },
    })

    await processAiReviewResponseJob({ reviewId: 'review-1', autoPost: false }, deps)

    expect(deps.prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'review-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much for the kind words!', sentiment: 'POSITIVE' },
    })
  })

  it('is a clean no-op with no further writes when the draft-only claim loses the race (count: 0)', async () => {
    const { deps } = makeDeps({ claimCount: 0 })

    await expect(
      processAiReviewResponseJob({ reviewId: 'review-1', autoPost: false }, deps)
    ).resolves.not.toThrow()

    expect(deps.prisma.review.updateMany).toHaveBeenCalledTimes(1)
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  it('makes no writes at all when generateReviewResponse itself throws, so BullMQ can safely retry the job from scratch', async () => {
    const { deps } = makeDeps()
    deps.generateReviewResponse.mockRejectedValue(new Error('AI provider unavailable'))

    await expect(
      processAiReviewResponseJob({ reviewId: 'review-1', autoPost: true }, deps)
    ).rejects.toThrow('AI provider unavailable')

    expect(deps.prisma.review.updateMany).not.toHaveBeenCalled()
    expect(deps.prisma.socialAccount.findUnique).not.toHaveBeenCalled()
    expect(deps.getProvider).not.toHaveBeenCalled()
  })
})
