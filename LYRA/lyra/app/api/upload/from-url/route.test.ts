import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspaceAccess: { findFirst: vi.fn() } } }))
vi.mock('@/lib/s3', () => ({ putObjectBuffer: vi.fn() }))
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 19 }),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))
vi.mock('@/lib/authz', () => ({ canWrite: (role: string) => role !== 'CLIENT_VIEW' }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { putObjectBuffer } from '@/lib/s3'
import { safeFetch } from '@/lib/safe-fetch'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/upload/from-url', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function fakeFetchResponse(opts: { ok?: boolean; status?: number; contentType?: string; contentLength?: string; body?: Uint8Array }) {
  const bytes = opts.body ?? new Uint8Array([1, 2, 3, 4])
  const headers = new Map<string, string>()
  if (opts.contentType !== undefined) headers.set('content-type', opts.contentType)
  if (opts.contentLength !== undefined) headers.set('content-length', opts.contentLength)
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response
}

describe('POST /api/upload/from-url', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_S3_BUCKET', 'lyra-media-test')
    vi.stubEnv('S3_REGION', 'ap-southeast-2')
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(putObjectBuffer).mockResolvedValue(undefined)
  })

  it('fetches sourceUrl and uploads the bytes to S3, returning the public URL', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ contentType: 'image/jpeg', contentLength: '4' }))

    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toMatch(/^https:\/\/lyra-media-test\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\/.+\.jpg$/)
    expect(safeFetch).toHaveBeenCalledWith('https://example.com/photo.jpg', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(putObjectBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/ws-1\/.+\.jpg$/),
      expect.any(Buffer),
      'image/jpeg'
    )
  })

  it('rejects an unsupported content type without uploading anything', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ contentType: 'application/x-msdownload' }))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/malware.exe' }))
    expect(res.status).toBe(415)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('rejects a prototype-pollution content type ("constructor") instead of resolving Object.prototype members', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ contentType: 'constructor' }))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/evil' }))
    expect(res.status).toBe(415)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('rejects when Content-Length declares a size over the video cap, without reading the body', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      fakeFetchResponse({ contentType: 'video/mp4', contentLength: String(26 * 1024 * 1024) })
    )
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/video.mp4' }))
    expect(res.status).toBe(413)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('rejects when the actual downloaded body exceeds the cap even if Content-Length under-reported it', async () => {
    const oversized = new Uint8Array(26 * 1024 * 1024)
    vi.mocked(safeFetch).mockResolvedValue(
      fakeFetchResponse({ contentType: 'video/mp4', contentLength: '10', body: oversized })
    )
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/video.mp4' }))
    expect(res.status).toBe(413)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('returns 502 when the fetch responds with a non-ok status', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeFetchResponse({ ok: false, status: 404 }))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/missing.jpg' }))
    expect(res.status).toBe(502)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('returns 400 when sourceUrl fails the SSRF safety check', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('URL resolves to a private/reserved address: 169.254.169.254'))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://metadata.example.com/evil' }))
    expect(res.status).toBe(400)
    expect(putObjectBuffer).not.toHaveBeenCalled()
  })

  it('returns 504 when the fetch times out', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new DOMException('aborted', 'TimeoutError'))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/slow.jpg' }))
    expect(res.status).toBe(504)
  })

  it('requires workspaceId', async () => {
    const res = await POST(req({ sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(400)
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('requires sourceUrl', async () => {
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(400)
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('returns 403 when the user lacks write access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(403)
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req({ workspaceId: 'ws-1', sourceUrl: 'https://example.com/photo.jpg' }))
    expect(res.status).toBe(429)
  })
})
