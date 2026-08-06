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
    const res = await PUT(req({ uploadId: 'upload-1', chunkIndex: 0, data: Buffer.from('chunk bytes').toString('base64') }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ received: true, chunkIndex: 0 })
    expect(uploadPart).toHaveBeenCalledWith('media/ws-1/file.mp4', 'real-upload-id-123', 1, Buffer.from('chunk bytes'))
    expect(recordPart).toHaveBeenCalledWith('upload-1', 0, '"real-etag"')
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

  it('requires uploadId, chunkIndex, and data', async () => {
    const res = await PUT(req({ chunkIndex: 0, data: 'YQ==' }))
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
