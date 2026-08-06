import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { startMediaUpload } from './start-media-upload'

describe('startMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('resolves the workspace and forwards to the backend start route', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ uploadId: 'upload-1', chunkSizeBytes: 6291456 })

    const result = await startMediaUpload(
      { workspace_id: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/multipart/start', 'token-abc', {
      workspaceId: 'ws-1',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      totalSizeBytes: 2_000_000,
    })
    expect(result).toEqual({ uploadId: 'upload-1', chunkSizeBytes: 6291456 })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ uploadId: 'upload-1', chunkSizeBytes: 6291456 })

    await startMediaUpload({ filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 }, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/multipart/start', 'token-abc', expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(413, { error: 'File too large (max 50MB)' }))

    await expect(
      startMediaUpload({ workspace_id: 'ws-1', filename: 'huge.png', contentType: 'image/png', totalSizeBytes: 60_000_000 }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
