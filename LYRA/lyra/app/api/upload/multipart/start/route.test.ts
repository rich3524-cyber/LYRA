import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@/lib/s3', () => ({ createMultipartUpload: vi.fn(), abortMultipartUpload: vi.fn() }))
vi.mock('@/lib/upload-session', () => ({ createUploadSession: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createMultipartUpload, abortMultipartUpload } from '@/lib/s3'
import { createUploadSession } from '@/lib/upload-session'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/upload/multipart/start', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/multipart/start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(createMultipartUpload).mockResolvedValue('real-upload-id-123')
    vi.mocked(abortMultipartUpload).mockResolvedValue(undefined)
  })

  it('opens a real multipart session and returns an uploadId plus chunk size', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.uploadId).toBe('string')
    expect(body.chunkSizeBytes).toBe(6 * 1024 * 1024)
    expect(createUploadSession).toHaveBeenCalledWith(body.uploadId, expect.objectContaining({
      s3Key: expect.stringMatching(/^media\/ws-1\/.+\.jpg$/),
      s3UploadId: 'real-upload-id-123',
      workspaceId: 'ws-1',
      userId: 'user-1',
      contentType: 'image/jpeg',
      totalSizeBytes: 2_000_000,
      expectedParts: 1,
    }))
  })

  it('rejects an unsupported content type before touching S3', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'x.exe', contentType: 'application/x-msdownload', totalSizeBytes: 1000 }))
    expect(res.status).toBe(415)
    expect(createMultipartUpload).not.toHaveBeenCalled()
  })

  it('rejects a prototype-pollution content type ("constructor") instead of resolving Object.prototype members', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'evil', contentType: 'constructor', totalSizeBytes: 1000 }))
    expect(res.status).toBe(415)
    expect(createMultipartUpload).not.toHaveBeenCalled()
  })

  it('rejects "__proto__" as a content type', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'evil', contentType: '__proto__', totalSizeBytes: 1000 }))
    expect(res.status).toBe(415)
    expect(createMultipartUpload).not.toHaveBeenCalled()
  })

  it('rejects an image over 50MB', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'huge.png', contentType: 'image/png', totalSizeBytes: 51 * 1024 * 1024 }))
    expect(res.status).toBe(413)
  })

  it('allows a video up to 200MB, rejects over', async () => {
    const ok = await POST(req({ workspaceId: 'ws-1', filename: 'clip.mp4', contentType: 'video/mp4', totalSizeBytes: 199 * 1024 * 1024 }))
    expect(ok.status).toBe(200)

    const tooLarge = await POST(req({ workspaceId: 'ws-1', filename: 'clip.mp4', contentType: 'video/mp4', totalSizeBytes: 201 * 1024 * 1024 }))
    expect(tooLarge.status).toBe(413)
  })

  it('requires workspaceId', async () => {
    const res = await POST(req({ filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the caller has no write access to the workspace, without ever opening an S3 upload', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(403)
    expect(createMultipartUpload).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 1000 }))
    expect(res.status).toBe(429)
  })

  it('computes expectedParts correctly for a file spanning multiple chunks', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'clip.mp4', contentType: 'video/mp4', totalSizeBytes: 13 * 1024 * 1024 }))
    const body = await res.json()
    // 13MB / 6MB chunks = 3 parts (6 + 6 + 1)
    expect(createUploadSession).toHaveBeenCalledWith(body.uploadId, expect.objectContaining({ expectedParts: 3 }))
  })

  it('aborts the orphaned S3 multipart upload when createUploadSession fails, and still returns 500', async () => {
    vi.mocked(createUploadSession).mockRejectedValue(new Error('Redis unreachable'))
    const res = await POST(req({ workspaceId: 'ws-1', filename: 'photo.jpg', contentType: 'image/jpeg', totalSizeBytes: 2_000_000 }))
    expect(res.status).toBe(500)
    expect(abortMultipartUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/ws-1\/.+\.jpg$/),
      'real-upload-id-123'
    )
  })
})
