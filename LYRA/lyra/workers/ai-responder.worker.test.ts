import { describe, it, expect, vi, beforeEach } from 'vitest'

// ai-responder.worker.ts instantiates a real BullMQ Worker (which opens a
// Redis connection and starts polling) as a module-level side effect. Stub
// both out so importing the module under test doesn't try to talk to a real
// Redis instance -- processAiResponseJob itself never touches either, all its
// I/O goes through the injected `deps`. Mirrors post-publisher.worker.test.ts.
vi.mock('@/lib/redis', () => ({ redis: {} }))
vi.mock('bullmq', () => ({ Worker: vi.fn().mockImplementation(function MockWorker() { return { on: vi.fn() } }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { findUnique: vi.fn(), updateMany: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
    socialAccount: { findUnique: vi.fn() },
  },
}))
// The escalation branch notifies the workspace's Slack channel. notifyChannel
// is fail-open so it would only log against the mocked prisma above, but
// stubbing it keeps these cases about escalation-claim resolution.
vi.mock('@/services/notifications/channel-notifier', () => ({ notifyChannel: vi.fn() }))
// The review-job counterpart to processAiResponseJob, imported (not defined)
// by ai-responder.worker.ts. Mocking it wholesale is what makes it possible
// to prove, from outside, which of the two processors the dispatch closure
// actually routed a given job to -- see the "ai-responding queue wiring"
// describe block below.
vi.mock('./ai-review-responder.worker', () => ({ processAiReviewResponseJob: vi.fn() }))

import { Worker } from 'bullmq'
import { processAiResponseJob } from './ai-responder.worker'
import { processAiReviewResponseJob } from './ai-review-responder.worker'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { prisma } from '@/lib/prisma'

// Capture the actual arguments ai-responder.worker.ts passed to `new
// Worker(...)`, and the 'failed' handler it registered on the returned
// instance, at import time -- before any test's beforeEach can
// vi.clearAllMocks() away the Worker mock's recorded call/result history.
// These are plain references to the real closures the module under test
// built, so later mock-history clearing doesn't affect them; only clears
// the call counts of whatever mocks *those closures* go on to invoke
// (processAiReviewResponseJob, the mocked prisma, etc), which is exactly
// what each test below wants isolated per-run.
type JobLike = { name?: string; data: unknown }
const [, dispatch] = vi.mocked(Worker).mock.calls[0] as unknown as [
  string,
  (job: JobLike) => Promise<void>,
  unknown,
]
const workerInstance = vi.mocked(Worker).mock.results[0].value as { on: ReturnType<typeof vi.fn> }
const failedHandlerCall = (workerInstance.on.mock.calls as unknown as [string, unknown][]).find(
  ([event]) => event === 'failed'
)
const failedHandler = failedHandlerCall?.[1] as (job: JobLike | undefined, err: Error) => void

function makeDeps(overrides: {
  comment?: Partial<Record<string, unknown>>
  account?: Partial<Record<string, unknown>> | null
  claimCount?: number
  generateResult?: { sentiment: string | null; response: string | null; shouldEscalate: boolean; escalationReason?: string }
  replyToComment?: ReturnType<typeof vi.fn>
} = {}) {
  const comment = {
    id: 'comment-1',
    workspaceId: 'ws-1',
    socialAccountId: 'acc-1',
    postId: 'post-1',
    platformCommentId: 'plat-comment-1',
    platformPostId: 'plat-post-1',
    authorName: 'Jane Doe',
    authorHandle: '@janedoe',
    content: 'Great product!',
    sentiment: 'POSITIVE',
    requiresResponse: true,
    isEscalated: false,
    escalationReason: null,
    status: 'PENDING',
    aiDraftResponse: null,
    finalResponse: null,
    respondedAt: null,
    platformCreatedAt: new Date(),
    createdAt: new Date(),
    ...overrides.comment,
  }

  const account = overrides.account === undefined
    ? { id: 'acc-1', provider: 'NATIVE', zernioAccountId: null, platform: 'FACEBOOK', workspace: { name: 'Acme Co' } }
    : overrides.account

  const replyToComment = overrides.replyToComment ?? vi.fn().mockResolvedValue(undefined)

  const generateResult = overrides.generateResult ?? { sentiment: 'POSITIVE', response: 'Thanks so much!', shouldEscalate: false }

  const deps = {
    prisma: {
      comment: {
        findUnique: vi.fn().mockResolvedValue(comment),
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
    generateCommentResponse: vi.fn().mockResolvedValue(generateResult),
    getProvider: vi.fn().mockReturnValue({ replyToComment }),
  }

  return { deps, replyToComment }
}

describe('processAiResponseJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns immediately, with no further DB calls or AI generation, when the comment is already RESPONDED', async () => {
    const { deps } = makeDeps({ comment: { status: 'RESPONDED' } })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.generateCommentResponse).not.toHaveBeenCalled()
    expect(deps.prisma.brandProfile.findUnique).not.toHaveBeenCalled()
    expect(deps.prisma.guardrail.findMany).not.toHaveBeenCalled()
    expect(deps.prisma.comment.updateMany).not.toHaveBeenCalled()
  })

  it('returns immediately, with no further DB calls or AI generation, when the comment is already ESCALATED', async () => {
    const { deps } = makeDeps({ comment: { status: 'ESCALATED' } })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.generateCommentResponse).not.toHaveBeenCalled()
    expect(deps.prisma.comment.updateMany).not.toHaveBeenCalled()
  })

  it('claims ESCALATED with the guarded predicate when the AI decides to escalate', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status: 'ESCALATED',
        isEscalated: true,
        escalationReason: 'Contains a legal threat',
        sentiment: null,
      },
    })
    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(1)
    expect(deps.getProvider).not.toHaveBeenCalled()

    // Alerts the workspace's Slack channel with the escalation context --
    // one alert per comment reaching ESCALATED, dedupe-keyed on the comment.
    expect(notifyChannel).toHaveBeenCalledWith(
      'ws-1',
      {
        event:            'COMMENT_ESCALATED',
        workspaceName:    'Acme Co',
        platform:         'Facebook',
        excerpt:          'Great product!',
        authorName:       'Jane Doe',
        escalationReason: 'Contains a legal threat',
      },
      { dedupeKey: 'escalated-comment-1' }
    )
  })

  it('persists the classified sentiment alongside the ESCALATED claim when the AI decides to escalate', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: 'URGENT', response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: {
        status:           'ESCALATED',
        isEscalated:      true,
        escalationReason: 'Contains a legal threat',
        sentiment:        'URGENT',
      },
    })
  })

  it('does not notify when the account lookup for the escalation alert comes back empty', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
      account: null,
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(notifyChannel).not.toHaveBeenCalled()
  })

  it('does not perform any additional writes or sends when the escalation claim loses the race (count: 0)', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: null, response: null, shouldEscalate: true, escalationReason: 'Contains a legal threat' },
      claimCount: 0,
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(1)
    expect(deps.prisma.socialAccount.findUnique).not.toHaveBeenCalled()
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  it('claims RESPONDED BEFORE calling the provider on a normal successful auto-post run, with no second write after', async () => {
    const { deps, replyToComment } = makeDeps()
    const callOrder: string[] = []
    deps.prisma.comment.updateMany.mockImplementation(async () => {
      callOrder.push('claim')
      return { count: 1 }
    })
    replyToComment.mockImplementation(async () => {
      callOrder.push('send')
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(callOrder).toEqual(['claim', 'send'])
    expect(deps.prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Thanks so much!', respondedAt: expect.any(Date), sentiment: 'POSITIVE' },
    })
    expect(replyToComment).toHaveBeenCalledWith(
      { id: 'acc-1', provider: 'NATIVE', zernioAccountId: null, platform: 'FACEBOOK', workspace: { name: 'Acme Co' } },
      'plat-post-1',
      'plat-comment-1',
      'Thanks so much!'
    )
    // The claim already set RESPONDED/finalResponse/respondedAt -- no second write.
    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(1)
  })

  it('persists the classified sentiment alongside the RESPONDED claim on a normal successful auto-post run', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: 'NEGATIVE', response: 'Sorry to hear that', shouldEscalate: false },
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Sorry to hear that', respondedAt: expect.any(Date), sentiment: 'NEGATIVE' },
    })
  })

  it('never calls the provider when the auto-post claim loses the race (count: 0) -- the core regression test for the double-send bug', async () => {
    const { deps, replyToComment } = makeDeps({ claimCount: 0 })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.getProvider).not.toHaveBeenCalled()
    expect(replyToComment).not.toHaveBeenCalled()
    expect(deps.prisma.socialAccount.findUnique).not.toHaveBeenCalled()
    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(1)
  })

  it('rolls back the claim to AI_DRAFTED when the claim succeeds but no socialAccount is found', async () => {
    const { deps, replyToComment } = makeDeps({ account: null })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(replyToComment).not.toHaveBeenCalled()
    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(2)
    expect(deps.prisma.comment.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'RESPONDED', finalResponse: 'Thanks so much!', respondedAt: expect.any(Date), sentiment: 'POSITIVE' },
    })
    expect(deps.prisma.comment.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'comment-1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much!', finalResponse: null, respondedAt: null },
    })
  })

  it('rolls back the claim to AI_DRAFTED and logs the error when replyToComment throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const replyToComment = vi.fn().mockRejectedValue(new Error('platform rejected the request'))
    const { deps } = makeDeps({ replyToComment })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(2)
    expect(deps.prisma.comment.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'comment-1', status: 'RESPONDED' },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much!', finalResponse: null, respondedAt: null },
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('comment-1'),
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })

  it('claims AI_DRAFTED with the guarded notIn predicate on the draft-only path (autoPost: false)', async () => {
    const { deps } = makeDeps()

    await processAiResponseJob({ commentId: 'comment-1', autoPost: false }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much!', sentiment: 'POSITIVE' },
    })
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  it('persists the classified sentiment alongside the AI_DRAFTED status on the draft-only path', async () => {
    const { deps } = makeDeps({
      generateResult: { sentiment: 'POSITIVE', response: 'Thanks so much!', shouldEscalate: false },
    })

    await processAiResponseJob({ commentId: 'comment-1', autoPost: false }, deps)

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 'comment-1', status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much!', sentiment: 'POSITIVE' },
    })
  })

  it('is a clean no-op with no further writes when the draft-only claim loses the race (count: 0)', async () => {
    const { deps } = makeDeps({ claimCount: 0 })

    await expect(
      processAiResponseJob({ commentId: 'comment-1', autoPost: false }, deps)
    ).resolves.not.toThrow()

    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(1)
    expect(deps.getProvider).not.toHaveBeenCalled()
  })

  // --- Fix 1: crash-safe rollback -----------------------------------------
  // These cover the regression this fix closes: a transient DB failure on
  // the rollback write itself must not be allowed to propagate uncaught out
  // of processAiResponseJob (which would let BullMQ retry the whole job --
  // and the retry's own top-of-function status check would see this comment
  // as already RESPONDED and return immediately, permanently stranding it).

  it('retries the rollback write and recovers after a transient failure on the first attempt', async () => {
    vi.useFakeTimers()
    try {
      const { deps, replyToComment } = makeDeps()
      replyToComment.mockRejectedValue(new Error('platform timeout'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      deps.prisma.comment.updateMany
        .mockReset()
        .mockResolvedValueOnce({ count: 1 })                       // the RESPONDED claim
        .mockRejectedValueOnce(new Error('transient db blip'))     // rollback attempt 1 fails
        .mockResolvedValueOnce({ count: 1 })                       // rollback attempt 2 succeeds

      const jobPromise = processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)
      // Flush the 1s backoff between rollback attempt 1 and attempt 2.
      await vi.advanceTimersByTimeAsync(1000)
      await jobPromise

      // Claim + 2 rollback attempts = 3 total writes, and the comment ends
      // up back at AI_DRAFTED rather than stuck at RESPONDED.
      expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(3)
      expect(deps.prisma.comment.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'comment-1', status: 'RESPONDED' },
        data: { status: 'AI_DRAFTED', aiDraftResponse: 'Thanks so much!', finalResponse: null, respondedAt: null },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs a clear, loud error and does not throw when every rollback retry attempt fails', async () => {
    vi.useFakeTimers()
    try {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { deps, replyToComment } = makeDeps()
      replyToComment.mockRejectedValue(new Error('platform timeout'))

      deps.prisma.comment.updateMany
        .mockReset()
        .mockResolvedValueOnce({ count: 1 })          // the RESPONDED claim
        .mockRejectedValue(new Error('db is down'))   // every rollback attempt fails

      const jobPromise = processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)
      // Flush both backoffs (1s then 2s) between the 3 rollback attempts.
      await vi.advanceTimersByTimeAsync(5000)
      await expect(jobPromise).resolves.toBeUndefined()

      // Claim + 3 rollback attempts, all failed -- must not throw out of
      // processAiResponseJob (that would trigger the exact BullMQ-retry
      // stranding scenario this fix exists to prevent).
      expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(4)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('may be permanently stuck'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry the rollback when it resolves cleanly as a no-op (comment already moved on concurrently)', async () => {
    const { deps, replyToComment } = makeDeps({ account: null })
    // The rollback's own updateMany resolves with count: 0 -- some other
    // concurrent process already changed the comment's status away from
    // RESPONDED by the time this rollback ran. That's a successful
    // (non-throwing) no-op, not a failure, so it must not be retried and
    // must not be treated as an error.
    deps.prisma.comment.updateMany
      .mockReset()
      .mockResolvedValueOnce({ count: 1 })   // the RESPONDED claim
      .mockResolvedValueOnce({ count: 0 })   // rollback no-ops

    await processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)

    expect(replyToComment).not.toHaveBeenCalled()
    // Exactly one rollback attempt -- a clean (non-throwing) count: 0 result
    // is not retried.
    expect(deps.prisma.comment.updateMany).toHaveBeenCalledTimes(2)
  })

  it('makes no writes at all when generateCommentResponse itself throws, so BullMQ can safely retry the job from scratch', async () => {
    const { deps } = makeDeps()
    deps.generateCommentResponse.mockRejectedValue(new Error('AI provider unavailable'))

    await expect(
      processAiResponseJob({ commentId: 'comment-1', autoPost: true }, deps)
    ).rejects.toThrow('AI provider unavailable')

    expect(deps.prisma.comment.updateMany).not.toHaveBeenCalled()
    expect(deps.prisma.socialAccount.findUnique).not.toHaveBeenCalled()
    expect(deps.getProvider).not.toHaveBeenCalled()
  })
})

// --- ai-responding queue wiring: job-name dispatch + failed-handler branching
//
// The single Worker wired up at the bottom of ai-responder.worker.ts routes
// every job on the shared 'ai-responding' queue by `job.name`: jobs named
// 'generate-review-response' go to processAiReviewResponseJob, everything
// else goes to processAiResponseJob. Nothing above exercises that routing
// closure itself -- every test in the previous describe block calls
// processAiResponseJob directly. A typo in the `job.name ===
// 'generate-review-response'` string comparison would silently misroute
// every review job to the comment processor (or vice versa) with none of
// those tests ever noticing. Same gap for the `.on('failed')` handler's own
// job.name branch, which picks whether to log `reviewId` or `commentId`.
describe('ai-responding queue wiring (job-name dispatch closure and failed handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes a generate-review-response job to processAiReviewResponseJob, not processAiResponseJob', async () => {
    const jobData = { reviewId: 'review-1', autoPost: true }

    await dispatch({ name: 'generate-review-response', data: jobData })

    expect(processAiReviewResponseJob).toHaveBeenCalledTimes(1)
    expect(processAiReviewResponseJob).toHaveBeenCalledWith(jobData)
    // If this had instead fallen through to processAiResponseJob (e.g. a
    // typo'd job-name comparison), that function would have called
    // prisma.comment.findUnique via its own default deps -- so its absence
    // here is direct evidence the comment processor was never reached.
    expect(prisma.comment.findUnique).not.toHaveBeenCalled()
  })

  it('routes a generate-response job (the comment job name) to processAiResponseJob, not processAiReviewResponseJob', async () => {
    const jobData = { commentId: 'comment-1', autoPost: false }

    await dispatch({ name: 'generate-response', data: jobData })

    expect(processAiReviewResponseJob).not.toHaveBeenCalled()
    // processAiResponseJob is defined and called from inside the module
    // under test, so it can't be spied on directly -- its default deps
    // (real, mocked `prisma`) reaching prisma.comment.findUnique with this
    // job's commentId is the observable proof the dispatch closure actually
    // invoked it.
    expect(prisma.comment.findUnique).toHaveBeenCalledWith({ where: { id: 'comment-1' } })
  })

  it('falls through to processAiResponseJob for any other/undefined job name, not just the literal comment job name', async () => {
    const jobData = { commentId: 'comment-2', autoPost: false }

    await dispatch({ name: undefined, data: jobData })

    expect(processAiReviewResponseJob).not.toHaveBeenCalled()
    expect(prisma.comment.findUnique).toHaveBeenCalledWith({ where: { id: 'comment-2' } })
  })

  it("logs the review's reviewId, not commentId, when a failed job is a generate-review-response job", () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('review auto-reply blew up')

    failedHandler({ name: 'generate-review-response', data: { reviewId: 'review-42', autoPost: true } }, err)

    expect(consoleErrorSpy).toHaveBeenCalledWith('AI responder failed for review review-42:', err)
    consoleErrorSpy.mockRestore()
  })

  it("logs the comment's commentId, not reviewId, when a failed job is a generate-response job", () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('comment auto-reply blew up')

    failedHandler({ name: 'generate-response', data: { commentId: 'comment-42', autoPost: true } }, err)

    expect(consoleErrorSpy).toHaveBeenCalledWith('AI responder failed for comment comment-42:', err)
    consoleErrorSpy.mockRestore()
  })
})
