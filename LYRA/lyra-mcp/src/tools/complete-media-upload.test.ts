import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})

import { postLyraApi } from '../lyra-api-client'
import { completeMediaUpload } from './complete-media-upload'

describe('completeMediaUpload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards to the backend complete route and returns the real URL', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/file.jpg' })

    const result = await completeMediaUpload({ uploadId: 'upload-1' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/upload/multipart/complete', 'token-abc', { uploadId: 'upload-1' })
    expect(result).toEqual({ url: 'https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/file.jpg' })
  })

  it('propagates a 422 missing-chunks error from the backend unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(422, { error: 'Missing chunks: 2, 3' }))

    await expect(completeMediaUpload({ uploadId: 'upload-1' }, 'token-abc')).rejects.toThrow(LyraApiError)
  })
})
