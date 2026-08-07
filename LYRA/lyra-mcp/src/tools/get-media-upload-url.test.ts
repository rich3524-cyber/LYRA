import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getMediaUploadUrl } from './get-media-upload-url'

describe('getMediaUploadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('resolves the workspace and forwards to the backend media-presign route', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({
      uploadUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.mp4', 'Content-Type': 'video/mp4' },
      publicUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/abc.mp4',
    })

    const result = await getMediaUploadUrl({ workspace_id: 'ws-1', contentType: 'video/mp4' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/media-presign', 'token-abc', {
      workspaceId: 'ws-1',
      contentType: 'video/mp4',
    })
    expect(result).toEqual({
      uploadUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.mp4', 'Content-Type': 'video/mp4' },
      publicUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/abc.mp4',
    })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({
      uploadUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/',
      fields: {},
      publicUrl: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/abc.jpg',
    })

    await getMediaUploadUrl({ contentType: 'image/jpeg' }, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/media-presign', 'token-abc', expect.objectContaining({ workspaceId: 'ws-1' }))
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(415, { error: 'File type not permitted' }))

    await expect(
      getMediaUploadUrl({ workspace_id: 'ws-1', contentType: 'application/x-msdownload' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
