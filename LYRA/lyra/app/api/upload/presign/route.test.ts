import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mirrors app/api/upload/media-presign/route.test.ts's setup -- same route
// shape, same collaborators -- so the two presign routes are tested the same
// way rather than each inventing its own harness.
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: vi.fn() }))
vi.mock('@/lib/s3', () => ({ s3: {} }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const MAX_SIZE = 50 * 1024 * 1024

function req(body: unknown) {
  return new Request('http://localhost/api/upload/presign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload/presign', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/',
      fields: { key: 'media/ws-1/abc.jpg', 'Content-Type': 'image/jpeg' },
    } as never)
  })

  it('returns a presigned POST with the policy fields the client must replay', async () => {
    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 1234, workspaceId: 'ws-1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.uploadUrl).toBe('https://lyra-media-test.s3.ap-southeast-2.amazonaws.com/')
    expect(body.fields).toEqual({ key: 'media/ws-1/abc.jpg', 'Content-Type': 'image/jpeg' })
    expect(body.publicUrl).toMatch(/^https:\/\/lyra-media-test\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\/.+\.jpg$/)
  })

  // The core regression test for this route's security fix. The previous
  // version presigned a plain PUT, so nothing constrained the uploaded body's
  // length at all -- the only size check was against a number the client
  // volunteered, and it could be skipped by omitting that number.
  it('puts the size cap in the S3 policy, so the limit does not depend on the client being honest', async () => {
    await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 1234, workspaceId: 'ws-1' }))

    const args = vi.mocked(createPresignedPost).mock.calls[0][1]
    expect(args.Conditions).toContainEqual(['content-length-range', 1, MAX_SIZE])
    expect(args.Conditions).toContainEqual(['eq', '$Content-Type', 'image/jpeg'])
    expect(args.Fields).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(args.Bucket).toBe('lyra-media-test')
    expect(args.Key).toMatch(/^media\/ws-1\/.+\.jpg$/)
  })

  // Previously `typeof size === 'number' && size > MAX_SIZE` meant a request
  // with no `size` at all skipped the check entirely. It still succeeds (the
  // field is genuinely optional), but the policy now carries the real limit.
  it('still issues a capped policy when the caller omits size entirely', async () => {
    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', workspaceId: 'ws-1' }))

    expect(res.status).toBe(200)
    const args = vi.mocked(createPresignedPost).mock.calls[0][1]
    expect(args.Conditions).toContainEqual(['content-length-range', 1, MAX_SIZE])
  })

  it('rejects an honestly-reported oversized file early with 413', async () => {
    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: MAX_SIZE + 1, workspaceId: 'ws-1' }))

    expect(res.status).toBe(413)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric size rather than treating it as absent', async () => {
    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: '10', workspaceId: 'ws-1' }))

    expect(res.status).toBe(413)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('rejects a content type outside the allowlist', async () => {
    const res = await POST(req({ filename: 'a.svg', contentType: 'image/svg+xml', size: 10, workspaceId: 'ws-1' }))

    expect(res.status).toBe(415)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  // A plain ALLOWED_MIME_TYPES[contentType] lookup also resolves inherited
  // Object.prototype members, so "constructor" returned a truthy value and
  // passed the allowlist. media-presign already guarded this; this route did
  // not until now.
  it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
    'does not accept the inherited Object.prototype key %s as a content type',
    async (contentType) => {
      const res = await POST(req({ filename: 'a.jpg', contentType, size: 10, workspaceId: 'ws-1' }))

      expect(res.status).toBe(415)
      expect(createPresignedPost).not.toHaveBeenCalled()
    }
  )

  it('requires a workspaceId, so the tenant check can never be skipped', async () => {
    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 10 }))

    expect(res.status).toBe(400)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('refuses a user with no access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null as never)

    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 10, workspaceId: 'ws-1' }))

    expect(res.status).toBe(403)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('refuses a read-only client viewer', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)

    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 10, workspaceId: 'ws-1' }))

    expect(res.status).toBe(403)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('returns 429 without presigning when the rate limit is exhausted', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 } as never)

    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 10, workspaceId: 'ws-1' }))

    expect(res.status).toBe(429)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })

  it('returns 401 for an unauthenticated caller', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))

    const res = await POST(req({ filename: 'a.jpg', contentType: 'image/jpeg', size: 10, workspaceId: 'ws-1' }))

    expect(res.status).toBe(401)
    expect(createPresignedPost).not.toHaveBeenCalled()
  })
})
