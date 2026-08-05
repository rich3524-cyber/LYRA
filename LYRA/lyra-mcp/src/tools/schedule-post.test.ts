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
      { id: 'p1', status: 'PENDING_APPROVAL', socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } },
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
      posts: [{ id: 'p1', status: 'PENDING_APPROVAL', platform: 'FACEBOOK', accountName: 'ITWM Page' }],
    })
  })

  it('throws when scheduledAt is missing', async () => {
    await expect(
      schedulePost({ workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'] } as any, 'token-abc')
    ).rejects.toThrow('scheduledAt is required')
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('propagates errors from postLyraApi unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(422, { error: 'media required' }))

    await expect(
      schedulePost({ workspace_id: 'ws-1', content: 'x', platforms: ['FACEBOOK'], scheduledAt: '2026-09-01T00:00:00.000Z' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
