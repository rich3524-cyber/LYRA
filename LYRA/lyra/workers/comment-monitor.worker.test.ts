import { describe, it, expect, vi, beforeEach } from 'vitest'

// comment-monitor.worker.ts runs `new Worker(...)` (a real BullMQ consumer)
// as a module-level side effect, and pulls in prisma/redis/AI clients along
// the way. None of that is needed to test the enqueue fan-out in isolation,
// so every import the file makes is stubbed out here -- mirroring the
// extraction pattern used for post-publisher.worker.ts -- leaving just the
// exported enqueueAiResponses function under test.
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function MockWorker() {
    return { on: vi.fn() }
  }),
}))
vi.mock('@/lib/redis', () => ({ redis: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/encrypt', () => ({ decrypt: vi.fn() }))
vi.mock('@/services/ai/crisis-detector', () => ({ checkAndTriggerCrisis: vi.fn() }))
vi.mock('@/services/social/linkedin', () => ({ getOrgPosts: vi.fn(), getPostComments: vi.fn() }))
vi.mock('@/lib/queues', () => ({ aiRespondQueue: { add: vi.fn() } }))
vi.mock('@/services/social/provider', () => ({ getProvider: vi.fn() }))
vi.mock('@/services/social/zernio-client', () => ({
  // Mirrors the real class's (status, message, body) constructor rather than
  // being a bare Error subclass: the worker branches on `err.body.code` to
  // tell a permanent "this platform has no comment API" apart from a
  // transient failure, so a mock that drops body cannot exercise that split.
  ZernioApiError: class ZernioApiError extends Error {
    status: number
    body: unknown
    constructor(status: number, message: string, body?: unknown) {
      super(message)
      this.name = 'ZernioApiError'
      this.status = status
      this.body = body
    }
  },
}))

import { enqueueAiResponses, enqueueReviewAiResponses, processCommentMonitorJob } from './comment-monitor.worker'
import { aiRespondQueue } from '@/lib/queues'
import { ZernioApiError } from '@/services/social/zernio-client'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enqueueAiResponses', () => {
  it('still attempts every comment even when one enqueue rejects mid-batch', async () => {
    vi.mocked(aiRespondQueue.add).mockImplementation((_name, data) => {
      const commentId = (data as { commentId: string }).commentId
      if (commentId === 'c_2') return Promise.reject(new Error('redis unavailable'))
      return Promise.resolve({} as never)
    })

    await enqueueAiResponses([{ id: 'c_1' }, { id: 'c_2' }, { id: 'c_3' }], false)

    expect(aiRespondQueue.add).toHaveBeenCalledTimes(3)
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-response',
      { commentId: 'c_1', autoPost: false },
      { jobId: 'respond-c_1' }
    )
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-response',
      { commentId: 'c_2', autoPost: false },
      { jobId: 'respond-c_2' }
    )
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-response',
      { commentId: 'c_3', autoPost: false },
      { jobId: 'respond-c_3' }
    )
  })

  it('never throws even when an enqueue rejects (comments stay saved, failure just logged)', async () => {
    vi.mocked(aiRespondQueue.add).mockRejectedValue(new Error('redis unavailable'))

    await expect(enqueueAiResponses([{ id: 'c_1' }], true)).resolves.toBeUndefined()
  })

  it('passes autoPost through for FULL-mode workspaces', async () => {
    vi.mocked(aiRespondQueue.add).mockResolvedValue({} as never)

    await enqueueAiResponses([{ id: 'c_1' }], true)

    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-response',
      { commentId: 'c_1', autoPost: true },
      { jobId: 'respond-c_1' }
    )
  })
})

describe('enqueueReviewAiResponses', () => {
  it('still attempts every review even when one enqueue rejects mid-batch', async () => {
    vi.mocked(aiRespondQueue.add).mockImplementation((_name, data) => {
      const reviewId = (data as { reviewId: string }).reviewId
      if (reviewId === 'r_2') return Promise.reject(new Error('redis unavailable'))
      return Promise.resolve({} as never)
    })

    await enqueueReviewAiResponses([{ id: 'r_1' }, { id: 'r_2' }, { id: 'r_3' }], false)

    expect(aiRespondQueue.add).toHaveBeenCalledTimes(3)
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-review-response',
      { reviewId: 'r_1', autoPost: false },
      { jobId: 'respond-review-r_1' }
    )
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-review-response',
      { reviewId: 'r_2', autoPost: false },
      { jobId: 'respond-review-r_2' }
    )
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-review-response',
      { reviewId: 'r_3', autoPost: false },
      { jobId: 'respond-review-r_3' }
    )
  })

  it('never throws even when an enqueue rejects (reviews stay saved, failure just logged)', async () => {
    vi.mocked(aiRespondQueue.add).mockRejectedValue(new Error('redis unavailable'))

    await expect(enqueueReviewAiResponses([{ id: 'r_1' }], true)).resolves.toBeUndefined()
  })

  it('passes autoPost through for FULL-mode workspaces', async () => {
    vi.mocked(aiRespondQueue.add).mockResolvedValue({} as never)

    await enqueueReviewAiResponses([{ id: 'r_1' }], true)

    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-review-response',
      { reviewId: 'r_1', autoPost: true },
      { jobId: 'respond-review-r_1' }
    )
  })
})

describe('processCommentMonitorJob', () => {
  function makeAccount(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id:              'acc-1',
      workspaceId:     'ws-1',
      platform:        'GOOGLE_BUSINESS',
      platformId:      'plat-acc-1',
      handle:          'acmeco',
      name:            'Acme Co',
      provider:        'ZERNIO',
      zernioAccountId: 'zernio-acc-1',
      accessToken:     null,
      isActive:        true,
      workspace:       { aiResponseMode: 'DRAFT_APPROVE' },
      ...overrides,
    }
  }

  function makeDeps(overrides: {
    account?: ReturnType<typeof makeAccount> | null
    fetchRecentComments?: ReturnType<typeof vi.fn>
    fetchReviews?: ReturnType<typeof vi.fn>
    createdComments?: Array<Record<string, unknown>>
    createdReviews?: Array<Record<string, unknown>>
    workspaceAccounts?: Array<Record<string, unknown>>
  } = {}) {
    const account = overrides.account === undefined ? makeAccount() : overrides.account
    const fetchRecentComments = overrides.fetchRecentComments ?? vi.fn().mockResolvedValue([])
    const fetchReviews = overrides.fetchReviews ?? vi.fn().mockResolvedValue([])

    const deps = {
      prisma: {
        socialAccount: {
          findUnique: vi.fn().mockResolvedValue(account),
          // The workspace's own connected accounts, used to drop comments
          // posted by any of them. Defaults to just this account so existing
          // cases keep their original single-account behaviour.
          findMany:   vi.fn().mockResolvedValue(overrides.workspaceAccounts ?? [account]),
          update:     vi.fn().mockResolvedValue({}),
        },
        comment: {
          createManyAndReturn: vi.fn().mockResolvedValue(overrides.createdComments ?? []),
        },
        review: {
          createManyAndReturn: vi.fn().mockResolvedValue(overrides.createdReviews ?? []),
        },
      },
      getProvider: vi.fn().mockReturnValue({ fetchRecentComments, fetchReviews }),
    }

    return { deps, fetchRecentComments, fetchReviews }
  }

  it('fetches and persists Google Business reviews for a GOOGLE_BUSINESS Zernio account, with correct field mapping', async () => {
    const createdAt = new Date('2026-08-20T00:00:00.000Z')
    const fetchReviews = vi.fn().mockResolvedValue([
      { externalId: 'rev-ext-1', rating: 4, text: 'Great service', authorName: 'Jane Doe', createdAt },
    ])
    const { deps } = makeDeps({
      fetchReviews,
      createdReviews: [{ id: 'review-1' }],
    })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)

    expect(fetchReviews).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }))
    expect(deps.prisma.review.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          workspaceId:       'ws-1',
          socialAccountId:   'acc-1',
          zernioReviewId:    'rev-ext-1',
          rating:            4,
          authorName:        'Jane Doe',
          text:              'Great service',
          platformCreatedAt: createdAt,
          status:            'PENDING',
        },
      ],
      skipDuplicates: true,
    })
  })

  it('does not call fetchReviews for a non-GOOGLE_BUSINESS Zernio account', async () => {
    const fetchReviews = vi.fn().mockResolvedValue([])
    const { deps } = makeDeps({
      account: makeAccount({ platform: 'FACEBOOK' }),
      fetchReviews,
    })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)

    expect(fetchReviews).not.toHaveBeenCalled()
    expect(deps.prisma.review.createManyAndReturn).not.toHaveBeenCalled()
  })

  it('enqueues an AI response job for each newly-created review when aiResponseMode is DRAFT_APPROVE', async () => {
    vi.mocked(aiRespondQueue.add).mockResolvedValue({} as never)
    const fetchReviews = vi.fn().mockResolvedValue([
      { externalId: 'rev-ext-1', rating: 5, text: 'Love it', authorName: 'Jo', createdAt: new Date() },
    ])
    const { deps } = makeDeps({
      account: makeAccount({ workspace: { aiResponseMode: 'DRAFT_APPROVE' } }),
      fetchReviews,
      createdReviews: [{ id: 'review-1' }],
    })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)

    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-review-response',
      { reviewId: 'review-1', autoPost: false },
      { jobId: 'respond-review-review-1' }
    )
  })

  it('enqueues with autoPost: true for each newly-created review when aiResponseMode is FULL', async () => {
    vi.mocked(aiRespondQueue.add).mockResolvedValue({} as never)
    const fetchReviews = vi.fn().mockResolvedValue([
      { externalId: 'rev-ext-1', rating: 5, text: 'Love it', authorName: 'Jo', createdAt: new Date() },
    ])
    const { deps } = makeDeps({
      account: makeAccount({ workspace: { aiResponseMode: 'FULL' } }),
      fetchReviews,
      createdReviews: [{ id: 'review-1' }],
    })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)

    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-review-response',
      { reviewId: 'review-1', autoPost: true },
      { jobId: 'respond-review-review-1' }
    )
  })

  it('does not enqueue review AI responses when aiResponseMode is OFF', async () => {
    vi.mocked(aiRespondQueue.add).mockResolvedValue({} as never)
    const fetchReviews = vi.fn().mockResolvedValue([
      { externalId: 'rev-ext-1', rating: 5, text: 'Love it', authorName: 'Jo', createdAt: new Date() },
    ])
    const { deps } = makeDeps({
      account: makeAccount({ workspace: { aiResponseMode: 'OFF' } }),
      fetchReviews,
      createdReviews: [{ id: 'review-1' }],
    })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)

    expect(aiRespondQueue.add).not.toHaveBeenCalled()
  })

  it('still persists comments fetched for the account even when the review fetch for that same account fails', async () => {
    const fetchRecentComments = vi.fn().mockResolvedValue([
      { externalId: 'c-ext-1', postExternalId: 'p-1', authorName: 'A Commenter', text: 'Nice!', createdAt: new Date() },
    ])
    const fetchReviews = vi.fn().mockRejectedValue(new Error('Zernio 500'))
    const { deps } = makeDeps({
      fetchRecentComments,
      fetchReviews,
      createdComments: [{ id: 'comment-1', content: 'Nice!' }],
    })

    await expect(
      processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)
    ).resolves.toBeUndefined()

    expect(deps.prisma.comment.createManyAndReturn).toHaveBeenCalled()
    expect(deps.prisma.review.createManyAndReturn).not.toHaveBeenCalled()
  })

  it('still enqueues AI responses and runs crisis detection for comments from the same job when review persistence throws', async () => {
    vi.mocked(aiRespondQueue.add).mockResolvedValue({} as never)
    const fetchRecentComments = vi.fn().mockResolvedValue([
      { externalId: 'c-ext-1', postExternalId: 'p-1', authorName: 'A Commenter', text: 'Nice!', createdAt: new Date() },
    ])
    const fetchReviews = vi.fn().mockResolvedValue([
      { externalId: 'rev-ext-1', rating: 5, text: 'Love it', authorName: 'Jo', createdAt: new Date() },
    ])
    const { deps } = makeDeps({
      account: makeAccount({ workspace: { aiResponseMode: 'DRAFT_APPROVE' } }),
      fetchRecentComments,
      fetchReviews,
      createdComments: [{ id: 'comment-1', content: 'Nice!' }],
    })
    deps.prisma.review.createManyAndReturn.mockRejectedValue(new Error('connection reset'))

    const { checkAndTriggerCrisis } = await import('@/services/ai/crisis-detector')

    await expect(
      processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)
    ).resolves.toBeUndefined()

    // The review insert threw, but that must not have prevented the
    // already-persisted comments from this same job from getting an
    // AI response enqueued or a crisis check -- this is the exact
    // regression this fix guards against.
    expect(deps.prisma.comment.createManyAndReturn).toHaveBeenCalled()
    expect(aiRespondQueue.add).toHaveBeenCalledWith(
      'generate-response',
      { commentId: 'comment-1', autoPost: false },
      { jobId: 'respond-comment-1' }
    )
    expect(checkAndTriggerCrisis).toHaveBeenCalledWith('ws-1', [{ id: 'comment-1', content: 'Nice!' }])

    // No review AI response should have been enqueued since nothing was
    // actually persisted (createdReviews degraded to []).
    expect(aiRespondQueue.add).not.toHaveBeenCalledWith(
      'generate-review-response',
      expect.anything(),
      expect.anything()
    )
  })

  it('does not call fetchReviews or persist reviews when the account is inactive', async () => {
    const fetchReviews = vi.fn().mockResolvedValue([{ externalId: 'x', rating: 1, text: null, authorName: null, createdAt: new Date() }])
    const { deps } = makeDeps({
      account: makeAccount({ isActive: false }),
      fetchReviews,
    })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps)

    expect(fetchReviews).not.toHaveBeenCalled()
    expect(deps.prisma.review.createManyAndReturn).not.toHaveBeenCalled()
  })
})

// Added 2026-11-06. SocialAccount.lastCommentSyncAt had existed in the schema
// for months with no code reading or writing it, and this worker logs only
// failures -- so a fleet quietly succeeding with nothing to collect and a
// fleet consuming nothing at all produced identical empty logs. These lock in
// the distinction: every terminal path must leave a timestamp, and the error
// column must say which kind of ending it was.
describe('processCommentMonitorJob sync outcome recording', () => {
  function makeDeps(account: Record<string, unknown> | null, fetchRecentComments = vi.fn().mockResolvedValue([])) {
    const update = vi.fn().mockResolvedValue({})
    const deps = {
      prisma: {
        socialAccount: {
          findUnique: vi.fn().mockResolvedValue(account),
          findMany:   vi.fn().mockResolvedValue(account ? [account] : []),
          update,
        },
        comment: { createManyAndReturn: vi.fn().mockResolvedValue([]) },
        review:  { createManyAndReturn: vi.fn().mockResolvedValue([]) },
      },
      getProvider: vi.fn().mockReturnValue({
        fetchRecentComments,
        fetchReviews: vi.fn().mockResolvedValue([]),
      }),
    }
    return { deps, update }
  }

  const zernioAccount = {
    id: 'acc-1', workspaceId: 'ws-1', platform: 'INSTAGRAM', platformId: 'p1',
    handle: 'acme', name: 'Acme', provider: 'ZERNIO', zernioAccountId: 'z-1',
    accessToken: null, isActive: true, workspace: { aiResponseMode: 'DRAFT_APPROVE' },
  }

  // The case that matters most: a quiet account is the normal state, and it
  // has to read as a completed sync rather than as no sync at all.
  it('records a timestamp and no error when a sync finds nothing', async () => {
    const { deps, update } = makeDeps(zernioAccount)

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps as never)

    expect(update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data:  { lastCommentSyncAt: expect.any(Date), lastCommentSyncError: null },
    })
  })

  it("records the provider's own message when the fetch fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('Zernio 503 upstream unavailable'))
    const { deps, update } = makeDeps(zernioAccount, fetch)

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps as never)

    expect(update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data:  { lastCommentSyncAt: expect.any(Date), lastCommentSyncError: 'Zernio 503 upstream unavailable' },
    })
  })

  // Previously returned silently, which is why "this account has never synced"
  // had no visible explanation anywhere.
  it('records an unsupported platform rather than returning silently', async () => {
    const err = new ZernioApiError(400, 'nope', { code: 'PLATFORM_NOT_SUPPORTED' })
    const { deps, update } = makeDeps(zernioAccount, vi.fn().mockRejectedValue(err))

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps as never)

    expect(update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data:  { lastCommentSyncAt: expect.any(Date), lastCommentSyncError: 'Platform does not support comment sync' },
    })
  })

  it('records a missing access token on a non-Zernio account', async () => {
    const { deps, update } = makeDeps({ ...zernioAccount, provider: 'NATIVE', zernioAccountId: null, accessToken: null })

    await processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps as never)

    expect(update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data:  { lastCommentSyncAt: expect.any(Date), lastCommentSyncError: 'No access token stored for this account' },
    })
  })

  // An observability write is never worth failing real work for.
  it('does not throw when recording the outcome itself fails', async () => {
    const { deps, update } = makeDeps(zernioAccount)
    update.mockRejectedValue(new Error('db write failed'))

    await expect(processCommentMonitorJob({ socialAccountId: 'acc-1' }, deps as never)).resolves.toBeUndefined()
  })
})
