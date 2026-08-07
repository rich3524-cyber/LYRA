import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { attachMedia } from './attach-media'

describe('attachMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('resolves the workspace and forwards to the backend from-url route', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg' })

    const result = await attachMedia(
      { workspace_id: 'ws-1', source_url: 'https://higgsfield.example.com/generated/photo.jpg' },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/from-url', 'token-abc', {
      workspaceId: 'ws-1',
      sourceUrl: 'https://higgsfield.example.com/generated/photo.jpg',
    })
    expect(result).toEqual({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg' })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg' })

    await attachMedia({ source_url: 'https://higgsfield.example.com/generated/photo.jpg' }, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/from-url', 'token-abc', expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(415, { error: 'File type not permitted' }))

    await expect(
      attachMedia({ workspace_id: 'ws-1', source_url: 'https://example.com/file.exe' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
