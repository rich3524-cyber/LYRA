import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { callLyraApi, LyraApiError } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getAnalytics } from './get-analytics'

const sampleResponse = {
  summary: {
    postsPublished: 12,
    totalReach: 1000,
    totalViews: 4200,
    totalLikes: 340,
    totalComments: 58,
    totalShares: 21,
    commentResponseRate: 87,
    inboxPending: 3,
  },
  series: [
    { date: 'Aug 1', likes: 10, comments: 2, shares: 1, reach: 100, views: 300 },
  ],
  platformBreakdown: [
    { platform: 'FACEBOOK', count: 8 },
    { platform: 'INSTAGRAM', count: 4 },
  ],
  topPosts: [
    {
      id: 'p1', content: 'Check out our new product!', platform: 'FACEBOOK',
      reach: 500, views: 1200, likes: 90, comments: 12, publishedAt: '2026-08-01T10:00:00.000Z',
    },
  ],
}

describe('getAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('calls GET /api/analytics with workspace_id and default period, returns the response as-is', async () => {
    vi.mocked(callLyraApi).mockResolvedValue(sampleResponse)

    const result = await getAnalytics({ workspace_id: 'ws-1' }, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/analytics', 'token-abc', { workspaceId: 'ws-1', period: '30' })
    expect(result).toEqual(sampleResponse)
  })

  it('passes through a custom period when given', async () => {
    vi.mocked(callLyraApi).mockResolvedValue(sampleResponse)
    await getAnalytics({ workspace_id: 'ws-1', period: 7 }, 'token-abc')
    expect(callLyraApi).toHaveBeenCalledWith('/api/analytics', 'token-abc', { workspaceId: 'ws-1', period: '7' })
  })

  it('delegates workspace_id resolution to resolveWorkspaceId and uses its resolved value', async () => {
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-resolved')
    vi.mocked(callLyraApi).mockResolvedValue(sampleResponse)

    await getAnalytics({} as any, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(callLyraApi).toHaveBeenCalledWith('/api/analytics', 'token-abc', { workspaceId: 'ws-resolved', period: '30' })
  })

  it('propagates errors thrown by resolveWorkspaceId', async () => {
    vi.mocked(resolveWorkspaceId).mockRejectedValue(new Error('workspace_id is required: caller has access to multiple workspaces (A, B) -- specify which one'))

    await expect(getAnalytics({} as any, 'token-abc')).rejects.toThrow('multiple workspaces')
    expect(callLyraApi).not.toHaveBeenCalled()
  })

  it('propagates errors from callLyraApi unchanged', async () => {
    vi.mocked(callLyraApi).mockRejectedValue(new LyraApiError(500, {}))

    await expect(getAnalytics({ workspace_id: 'ws-1' }, 'token-abc')).rejects.toThrow(LyraApiError)
  })
})
