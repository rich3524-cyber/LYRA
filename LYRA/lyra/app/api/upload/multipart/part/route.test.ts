import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/s3', () => ({ uploadPart: vi.fn() }))
vi.mock('@/lib/upload-session', () => ({
  getUploadSessionMeta: vi.fn(),
  recordPart: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 119 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

import { requireAuth } from '@/lib/auth'
import { uploadPart } from '@/lib/s3'
import { getUploadSessionMeta, recordPart } from '@/lib/upload-session'
import { checkRateLimit } from '@/lib/rate-limit'
import { PUT } from './route'

// Deliberately not evenly divisible (14 / 10 -> 2 parts, with the second
// part 4 bytes) so the last-chunk remainder math in the route is actually
// exercised, rather than every chunk happening to be the same size. Kept
// small (bytes, not real 6MB chunk sizes) purely so the base64-encoded test
// payloads stay cheap to build -- the byte-count math is what's under test,
// not the production CHUNK_SIZE_BYTES constant (that lives in and is
// exercised by the /start route's own tests).
const SESSION = {
  s3Key: 'media/ws-1/file.mp4',
  s3UploadId: 'real-upload-id-123',
  workspaceId: 'ws-1',
  userId: 'user-1',
  contentType: 'video/mp4',
  totalSizeBytes: 14,
  chunkSizeBytes: 10,
  expectedParts: 2,
}
const NON_LAST_CHUNK_SIZE = 10
const LAST_CHUNK_SIZE = 4 // 14 - 10 * (2 - 1)

function sizedBase64(size: number): string {
  return Buffer.alloc(size, 'a').toString('base64')
}

function req(body: unknown) {
  return new Request('http://localhost/api/upload/multipart/part', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/upload/multipart/part', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 119 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getUploadSessionMeta).mockResolvedValue(SESSION)
    vi.mocked(uploadPart).mockResolvedValue('"real-etag"')
  })

  it('uploads the chunk to S3 with a 1-indexed part number and records the etag', async () => {
    const chunk = Buffer.alloc(NON_LAST_CHUNK_SIZE, 'a')
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: chunk.toString('base64') }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ received: true, chunkIndex: 0 })
    expect(uploadPart).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123', 1, chunk)
    expect(recordPart).toHaveBeenCalledWith('upload-1', 0, '"real-etag"')
  })

  it('uploads the final (smaller, remainder-sized) chunk successfully', async () => {
    const chunk = Buffer.alloc(LAST_CHUNK_SIZE, 'a')
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 1, data: chunk.toString('base64') }))
    expect(res.status).toBe(200)
    expect(uploadPart).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123', 2, chunk)
    expect(recordPart).toHaveBeenCalledWith('upload-1', 1, '"real-etag"')
  })

  it('returns 404 when the upload session does not exist or has expired', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue(null)
    const res = await PUT(req({ uploadId: 'missing', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(404)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('returns 403 when the session belongs to a different user', async () => {
    vi.mocked(getUploadSessionMeta).mockResolvedValue({ ...SESSION, userId: 'someone-else' })
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(403)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('rejects a chunkIndex outside the expected range', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 5, data: 'YQ==' }))
    expect(res.status).toBe(400)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('rejects a chunkIndex equal to expectedParts (boundary, off-by-one check)', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 2, data: 'YQ==' }))
    expect(res.status).toBe(400)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('rejects a fractional chunkIndex', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0.5, data: 'YQ==' }))
    expect(res.status).toBe(400)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('rejects a non-last chunk whose decoded size does not match chunkSizeBytes', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: sizedBase64(1000) }))
    expect(res.status).toBe(400)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('rejects the last chunk whose decoded size does not match the expected remainder', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 1, data: sizedBase64(1000) }))
    expect(res.status).toBe(400)
    expect(uploadPart).not.toHaveBeenCalled()
  })

  it('requires uploadId', async () => {
    const res = await PUT(req({ chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(400)
  })

  it('requires chunkIndex', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', data: 'YQ==' }))
    expect(res.status).toBe(400)
  })

  it('requires data', async () => {
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: 'YQ==' }))
    expect(res.status).toBe(429)
  })
})
