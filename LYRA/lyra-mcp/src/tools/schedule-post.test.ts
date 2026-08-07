import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))
vi.mock('../get-workspace-name', () => ({ getWorkspaceName: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'
import { schedulePost } from './schedule-post'

describe('schedulePost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
    vi.mocked(getWorkspaceName).mockResolvedValue('Into The Wild Marketing')
  })

  it('creates the post as SCHEDULED and truthfully reports the resulting status (may land as PENDING_APPROVAL)', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([
      { id: 'p1', status: 'PENDING_APPROVAL', mediaUrls: [], socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } },
    ])

    const result = await schedulePost(
      { workspace_id: 'ws-1', content: 'Announcing our new service', platforms: ['FACEBOOK'], scheduledAt: '2026-09-01T14:00:00.000Z' },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', {
      workspaceId: 'ws-1', content: 'Announcing our new service', platforms: ['FACEBOOK'],
      scheduledAt: '2026-09-01T14:00:00.000Z', status: 'SCHEDULED',
    })
    expect(result).toEqual({
      workspaceName: 'Into The Wild Marketing',
      posts: [{ id: 'p1', status: 'PENDING_APPROVAL', mediaUrls: [], platform: 'FACEBOOK', accountName: 'ITWM Page' }],
    })
  })

  it('reports back the real mediaUrls the backend actually bound to the post, so a caller can confirm attachment without a separate list_scheduled_posts call', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([
      {
        id: 'p1', status: 'PENDING_APPROVAL',
        mediaUrls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/clip.mp4'],
        socialAccount: { platform: 'TIKTOK', name: 'ITWM TikTok' },
      },
    ])

    const result = await schedulePost(
      {
        workspace_id: 'ws-1', content: 'A caption', platforms: ['TIKTOK'],
        scheduledAt: '2026-09-01T14:00:00.000Z',
        media_urls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/clip.mp4'],
      },
      'token-abc'
    )

    expect(result.posts[0].mediaUrls).toEqual(['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/clip.mp4'])
  })

  it('throws when scheduledAt is missing', async () => {
    await expect(
      schedulePost({ workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'] } as any, 'token-abc')
    ).rejects.toThrow('scheduledAt is required')
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('throws when scheduledAt is not a valid date', async () => {
    await expect(
      schedulePost(
        { workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'], scheduledAt: 'not-a-date' },
        'token-abc'
      )
    ).rejects.toThrow('scheduledAt must be a valid ISO 8601 date-time')
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('throws when scheduledAt is in the past', async () => {
    await expect(
      schedulePost(
        { workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'], scheduledAt: '2020-01-01T00:00:00.000Z' },
        'token-abc'
      )
    ).rejects.toThrow('scheduledAt must be in the future')
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('maps multiple created posts across platforms', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([
      { id: 'p1', status: 'SCHEDULED', mediaUrls: [], socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } },
      { id: 'p2', status: 'SCHEDULED', mediaUrls: [], socialAccount: { platform: 'LINKEDIN', name: 'ITWM LinkedIn' } },
    ])

    const result = await schedulePost(
      {
        workspace_id: 'ws-1',
        content: 'Announcing our new service',
        platforms: ['FACEBOOK', 'LINKEDIN'],
        scheduledAt: '2026-09-01T14:00:00.000Z',
      },
      'token-abc'
    )

    expect(result.posts).toEqual([
      { id: 'p1', status: 'SCHEDULED', mediaUrls: [], platform: 'FACEBOOK', accountName: 'ITWM Page' },
      { id: 'p2', status: 'SCHEDULED', mediaUrls: [], platform: 'LINKEDIN', accountName: 'ITWM LinkedIn' },
    ])
  })

  it('still succeeds and returns workspaceName: null when getWorkspaceName resolves to null', async () => {
    vi.mocked(getWorkspaceName).mockResolvedValue(null)
    vi.mocked(postLyraApi).mockResolvedValue([
      { id: 'p1', status: 'SCHEDULED', mediaUrls: [], socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } },
    ])

    const result = await schedulePost(
      { workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'], scheduledAt: '2026-09-01T14:00:00.000Z' },
      'token-abc'
    )

    expect(result.workspaceName).toBeNull()
    expect(result.posts).toEqual([{ id: 'p1', status: 'SCHEDULED', mediaUrls: [], platform: 'FACEBOOK', accountName: 'ITWM Page' }])
  })

  it('forwards media_urls to the backend when provided', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([{ id: 'post-1', status: 'SCHEDULED', mediaUrls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'], socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])

    await schedulePost(
      {
        workspace_id: 'ws-1',
        content: 'A caption',
        platforms: ['INSTAGRAM'],
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        media_urls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'],
      },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', expect.objectContaining({
      mediaUrls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'],
    }))
  })

  it('omits mediaUrls from the backend call entirely when not provided', async () => {
    vi.mocked(postLyraApi).mockResolvedValue([{ id: 'post-1', status: 'SCHEDULED', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])

    await schedulePost(
      { workspace_id: 'ws-1', content: 'A caption', platforms: ['INSTAGRAM'], scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
      'token-abc'
    )

    const postsCall = vi.mocked(postLyraApi).mock.calls[0]
    expect(postsCall[2]).not.toHaveProperty('mediaUrls')
  })

  it('propagates errors from postLyraApi unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(422, { error: 'media required' }))

    await expect(
      schedulePost({ workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'], scheduledAt: '2026-09-01T00:00:00.000Z' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
