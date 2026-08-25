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
  ZernioApiError: class ZernioApiError extends Error {},
}))

import { enqueueAiResponses, enqueueReviewAiResponses, processCommentMonitorJob } from './comment-monitor.worker'
import { aiRespondQueue } from '@/lib/queues'

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
  } = {}) {
    const account = overrides.account === undefined ? makeAccount() : overrides.account
    const fetchRecentComments = overrides.fetchRecentComments ?? vi.fn().mockResolvedValue([])
    const fetchReviews = overrides.fetchReviews ?? vi.fn().mockResolvedValue([])

    const deps = {
      prisma: {
        socialAccount: {
          findUnique: vi.fn().mockResolvedValue(account),
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
