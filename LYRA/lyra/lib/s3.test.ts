import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above top-level const declarations, so sendMock
// must be created via vi.hoisted -- matching the pattern used in
// services/social/twitter.test.ts for mocking a class-based client.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(function MockS3Client() { return { send: sendMock } }),
  }
})

import {
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
} from './s3'

describe('multipart upload functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createMultipartUpload returns the real S3 UploadId', async () => {
    sendMock.mockResolvedValue({ UploadId: 'real-upload-id-123' })
    const uploadId = await createMultipartUpload('media/ws-1/file.mp4', 'video/mp4')
    expect(uploadId).toBe('real-upload-id-123')
  })

  it('createMultipartUpload throws if S3 does not return an UploadId', async () => {
    sendMock.mockResolvedValue({})
    await expect(createMultipartUpload('media/ws-1/file.mp4', 'video/mp4')).rejects.toThrow('UploadId')
  })

  it('uploadPart returns the real S3 ETag', async () => {
    sendMock.mockResolvedValue({ ETag: '"abc123etag"' })
    const etag = await uploadPart('media/ws-1/file.mp4', 'real-upload-id-123', 1, Buffer.from('chunk data'))
    expect(etag).toBe('"abc123etag"')
  })

  it('uploadPart throws if S3 does not return an ETag', async () => {
    sendMock.mockResolvedValue({})
    await expect(uploadPart('media/ws-1/file.mp4', 'real-upload-id-123', 1, Buffer.from('x'))).rejects.toThrow('ETag')
  })

  it('completeMultipartUpload sends the parts list in part-number order', async () => {
    sendMock.mockResolvedValue({})
    await completeMultipartUpload('media/ws-1/file.mp4', 'real-upload-id-123', [
      { partNumber: 1, etag: '"etag1"' },
      { partNumber: 2, etag: '"etag2"' },
    ])
    expect(sendMock).toHaveBeenCalledTimes(1)
    const commandArg = sendMock.mock.calls[0][0]
    expect(commandArg.input.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: '"etag1"' },
      { PartNumber: 2, ETag: '"etag2"' },
    ])
  })

  it('abortMultipartUpload calls S3 with the right key and upload id', async () => {
    sendMock.mockResolvedValue({})
    await abortMultipartUpload('media/ws-1/file.mp4', 'real-upload-id-123')
    expect(sendMock).toHaveBeenCalledTimes(1)
    const commandArg = sendMock.mock.calls[0][0]
    expect(commandArg.input.Key).toBe('media/ws-1/file.mp4')
    expect(commandArg.input.UploadId).toBe('real-upload-id-123')
  })
})
