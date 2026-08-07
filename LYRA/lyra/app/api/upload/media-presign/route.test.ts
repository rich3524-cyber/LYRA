import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/upload/media-presign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/media-presign', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.jpg', 'Content-Type': 'image/jpeg', Policy: 'xyz', 'X-Amz-Signature': 'sig' },
    } as never)
  })

  it('generates a presigned POST for an image with the correct size cap', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.uploadUrl).toBe('https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/')
    expect(body.fields).toEqual({ key: 'media/ws-1/abc.jpg', 'Content-Type': 'image/jpeg', Policy: 'xyz', 'X-Amz-Signature': 'sig' })
    expect(body.publicUrl).toMatch(/^https:\/\/lyra-media-test\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\/.+\.jpg$/)

    const callArgs = vi.mocked(createPresignedPost).mock.calls[0][1]
    expect(callArgs.Bucket).toBe('lyra-media-test')
    expect(callArgs.Key).toMatch(/^media\/ws-1\/.+\.jpg$/)
    expect(callArgs.Expires).toBe(600)
    expect(callArgs.Fields).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(callArgs.Conditions).toContainEqual(['content-length-range', 1, 50 * 1024 * 1024])
    expect(callArgs.Conditions).toContainEqual(['eq', '$Content-Type', 'image/jpeg'])
  })

  it('uses the video size cap for a video content type', async () => {
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.mp4' },
    } as never)

    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'video/mp4' }))
    expect(res.status).toBe(200)

    const callArgs = vi.mocked(createPresignedPost).mock.calls[0][1]
    expect(callArgs.Fields).toEqual({ 'Content-Type': 'video/mp4' })
    expect(callArgs.Conditions).toContainEqual(['content-length-range', 1, 200 * 1024 * 1024])
    expect(callArgs.Conditions).toContainEqual(['eq', '$Content-Type', 'video/mp4'])
  })

  it('rejects an unsupported content type without generating a presigned post', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'application/x-msdownload' }))
    expect(res.status).toBe(415)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('rejects a prototype-pollution content type ("constructor") instead of resolving Object.prototype members', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'constructor' }))
    expect(res.status).toBe(415)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('requires workspaceId', async () => {
    const res = await POST(req({ contentType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('requires contentType', async () => {
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(400)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks write access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(403)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ workspaceId: 'ws-1', contentType: 'image/jpeg' }))
    expect(res.status).toBe(429)
  })
})
