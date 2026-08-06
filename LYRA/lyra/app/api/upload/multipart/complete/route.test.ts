import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/s3', () => ({ completeMultipartUpload: vi.fn(), abortMultipartUpload: vi.fn() }))
vi.mock('@/lib/upload-session', () => ({
  getUploadSessionMeta: vi.fn(),
  getReceivedParts: vi.fn(),
  deleteUploadSession: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

import { requireAuth } from '@/lib/auth'
import { completeMultipartUpload, abortMultipartUpload } from '@/lib/s3'
import { getUploadSessionMeta, getReceivedParts, deleteUploadSession } from '@/lib/upload-session'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const SESSION = {
  s3Key: 'media/ws-1/file.mp4',
  s3UploadId: 'real-upload-id-123',
  workspaceId: 'ws-1',
  userId: 'user-1',
  contentType: 'video/mp4',
  totalSizeBytes: 12_000_000,
  chunkSizeBytes: 6_000_000,
  expectedParts: 2,
}

function req(body: unknown) {
  return new Request('http://localhost/api/upload/multipart/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/multipart/complete', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getUploadSessionMeta).mockResolvedValue(SESSION)
    vi.mocked(getReceivedParts).mockResolvedValue({ 0: '"etag-0"', 1: '"etag-1"' })
  })

  it('completes the S3 upload with parts sorted by part number and returns the public URL', async () => {
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/media/ws-1/file.mp4')
    expect(completeMultipartUpload).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123', [
      { partNumber: 1, etag: '"etag-0"' },
      { partNumber: 2, etag: '"etag-1"' },
    ])
    expect(deleteUploadSession).toHaveBeenCalledWith('upload-1')
  })

  it('returns 422 naming exactly which chunks are missing', async () => {
    vi.mocked(getReceivedParts).mockResolvedValue({ 0: '"etag-0"' }) // part 1 (index 1) missing
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('1')
    expect(completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('returns 404 when the upload session does not exist or has expired', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue(null)
    const res = await POST(req({ uploadId: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when the session belongs to a different user', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue({ ...SESSION, userId: 'someone-else' })
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(403)
  })

  it('requires uploadId', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ uploadId: 'upload-1' }))
    expect(res.status).toBe(429)
  })

  it('aborts the multipart upload and returns 500 if S3 completion fails', async () => {
    vi.mocked(completeMultipartUpload).mockRejectedValue(new Error('S3: InvalidPart'))
    vi.mocked(abortMultipartUpload).mockResolvedValue(undefined)

    const res = await POST(req({ uploadId: 'upload-1' }))

    expect(res.status).toBe(500)
    expect(abortMultipartUpload).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123')
    expect(deleteUploadSession).not.toHaveBeenCalled() // session left in place -- nothing to retry against once aborted, but not this route's job to clean that up
  })

  it('still returns 500 for the original completion error if the abort attempt itself also fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(completeMultipartUpload).mockRejectedValue(new Error('S3: InvalidPart'))
    vi.mocked(abortMultipartUpload).mockRejectedValue(new Error('S3: NoSuchUpload'))

    const res = await POST(req({ uploadId: 'upload-1' }))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error') // generic message -- the original completion error, not the abort failure, drives the response
    // the outer catch-all logs the error that drove the 500 response -- confirm it's the
    // original completion error, not the abort failure, even though both produce the same generic HTTP response
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'POST /api/upload/multipart/complete error:',
      expect.objectContaining({ message: 'S3: InvalidPart' })
    )
    consoleErrorSpy.mockRestore()
  })
})
