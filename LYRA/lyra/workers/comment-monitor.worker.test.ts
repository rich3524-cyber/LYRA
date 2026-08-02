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

import { enqueueAiResponses } from './comment-monitor.worker'
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
