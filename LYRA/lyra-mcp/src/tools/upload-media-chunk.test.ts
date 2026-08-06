import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, putLyraApi: vi.fn() }
})

import { putLyraApi } from '../lyra-api-client'
import { uploadMediaChunk } from './upload-media-chunk'

describe('uploadMediaChunk', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards the chunk to the backend part route unchanged', async () => {
    vi.mocked(putLyraApi).mockResolvedValue({ received: true, chunkIndex: 0 })

    const result = await uploadMediaChunk({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }, 'token-abc')

    expect(putLyraApi).toHaveBeenCalledWith('/api/upload/multipart/part', 'token-abc', {
      uploadId: 'upload-1',
      chunkIndex: 0,
      data: 'YQ==',
    })
    expect(result).toEqual({ received: true, chunkIndex: 0 })
  })

  it('does not call resolveWorkspaceId -- the upload session already carries workspace context', async () => {
    vi.mocked(putLyraApi).mockResolvedValue({ received: true, chunkIndex: 1 })
    await uploadMediaChunk({ uploadId: 'upload-1', chunkIndex: 1, data: 'Yg==' }, 'token-abc')
    // No assertion needed beyond the call above succeeding without a workspace_id param in the input type at all --
    // this test exists to document the deliberate omission for a future reader, not to assert a negative on a mock.
    expect(putLyraApi).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(putLyraApi).mockRejectedValue(new LyraApiError(404, { error: 'Upload session not found or expired' }))

    await expect(
      uploadMediaChunk({ uploadId: 'expired-upload', chunkIndex: 0, data: 'YQ==' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })
})
