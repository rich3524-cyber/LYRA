import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})

import { callLyraApi, LyraApiError } from '../lyra-api-client'
import { listScheduledPosts } from './list-scheduled-posts'

describe('listScheduledPosts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /api/posts with workspace_id and shapes each post compactly', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([
      {
        id: 'p1', content: 'Check out our new product!', status: 'SCHEDULED',
        scheduledAt: '2026-08-10T14:00:00.000Z', publishedAt: null, failureReason: null,
        socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' },
      },
    ])

    const result = await listScheduledPosts({ workspace_id: 'ws-1' }, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', { workspaceId: 'ws-1' })
    expect(result).toEqual({
      posts: [{
        id: 'p1', content: 'Check out our new product!', status: 'SCHEDULED',
        scheduledAt: '2026-08-10T14:00:00.000Z', publishedAt: null, failureReason: null,
        platform: 'FACEBOOK', accountName: 'ITWM Page',
      }],
    })
  })

  it('passes through optional status and month filters', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([])
    await listScheduledPosts({ workspace_id: 'ws-1', status: 'FAILED', month: '2026-08' }, 'token-abc')
    expect(callLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', { workspaceId: 'ws-1', status: 'FAILED', month: '2026-08' })
  })

  it('throws when workspace_id is missing', async () => {
    await expect(listScheduledPosts({} as any, 'token-abc')).rejects.toThrow('workspace_id is required')
  })

  it('propagates errors from callLyraApi unchanged', async () => {
    vi.mocked(callLyraApi).mockRejectedValue(new LyraApiError(500, {}))

    await expect(listScheduledPosts({ workspace_id: 'ws-1' }, 'token-abc')).rejects.toThrow(LyraApiError)
  })
})
