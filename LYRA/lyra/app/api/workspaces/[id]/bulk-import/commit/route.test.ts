// app/api/workspaces/[id]/bulk-import/commit/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    socialAccount: { findMany: vi.fn() },
    post: { create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }))
vi.mock('@/lib/s3', () => ({ putObjectBuffer: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { safeFetch } from '@/lib/safe-fetch'
import { putObjectBuffer } from '@/lib/s3'
import { POST } from './route'

function ctx(id = 'ws-1') {
  return { params: Promise.resolve({ id }) }
}

function req(rows: unknown[]) {
  return new Request('http://localhost', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ rows }),
  })
}

const ROW = {
  socialAccountId: 'acc-fb',
  content:         'Hello',
  scheduledAt:     '2026-07-14T23:00:00.000Z',
  mediaUrl:        null,
}

function accessAs(role: string, clientAccessLevel = 'NONE') {
  return { role, workspace: { clientAccessLevel } }
}

describe('POST /api/workspaces/[id]/bulk-import/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(accessAs('AGENCY_ADMIN') as never)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([
      { id: 'acc-fb' }, { id: 'acc-ig' },
    ] as never)
    vi.mocked(prisma.post.create).mockImplementation((async ({ data }: { data: unknown }) => ({
      id: 'post-1', ...(data as object),
    })) as never)
    process.env.AWS_S3_BUCKET = 'lyra-media'
    process.env.S3_REGION = 'ap-southeast-2'
  })

  it('returns 403 for a CLIENT_VIEW role', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(accessAs('CLIENT_VIEW') as never)
    const res = await POST(req([ROW]), ctx())
    expect(res.status).toBe(403)
    expect(prisma.post.create).not.toHaveBeenCalled()
  })

  it('returns 400 when rows is missing or empty', async () => {
    expect((await POST(req([]), ctx())).status).toBe(400)
  })

  it('returns 422 when more rows are submitted than a single import allows', async () => {
    const many = Array.from({ length: 501 }, () => ROW)
    const res = await POST(req(many), ctx())
    expect(res.status).toBe(422)
    expect(prisma.post.create).not.toHaveBeenCalled()
  })

  it('rejects a socialAccountId that does not belong to this workspace', async () => {
    // The client posts back parsed rows, so the account id is caller-supplied
    // -- without this check it could attach a post to another tenant's account.
    const res = await POST(req([{ ...ROW, socialAccountId: 'acc-someone-else' }]), ctx())
    expect(res.status).toBe(400)
    expect(prisma.post.create).not.toHaveBeenCalled()
  })

  it('creates posts directly as SCHEDULED when the workspace does not require approval', async () => {
    const res = await POST(req([ROW]), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) })
    )
  })

  it('routes to PENDING_APPROVAL when the workspace requires client approval, same as any other creation path', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(
      accessAs('AGENCY_ADMIN', 'APPROVE') as never
    )

    await POST(req([ROW]), ctx())

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) })
    )
  })

  it('creates every row in a single transaction', async () => {
    await POST(req([ROW, { ...ROW, socialAccountId: 'acc-ig' }]), ctx())

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.post.create).toHaveBeenCalledTimes(2)
  })

  it('re-hosts a reachable media URL to S3 and stores the resulting LYRA URL, not the original', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok:          true,
      headers:     { get: () => 'image/jpeg' },
      arrayBuffer: async () => new ArrayBuffer(4),
    } as never)

    await POST(req([{ ...ROW, mediaUrl: 'https://example.com/photo.jpg' }]), ctx())

    expect(putObjectBuffer).toHaveBeenCalledTimes(1)
    const createCall = vi.mocked(prisma.post.create).mock.calls[0][0] as { data: { mediaUrls: string[] } }
    expect(createCall.data.mediaUrls[0]).toMatch(
      /^https:\/\/lyra-media\.s3\.ap-southeast-2\.amazonaws\.com\/media\/ws-1\/[0-9a-f-]+\.jpg$/
    )
  })

  it('still creates the post, without media, when the re-fetch fails at commit time', async () => {
    // The parse-time HEAD check said the URL was fine; it can still die in the
    // gap before the user clicks Import. Losing the image is acceptable,
    // losing the post is not.
    vi.mocked(safeFetch).mockRejectedValue(new Error('gone'))

    const res = await POST(req([{ ...ROW, mediaUrl: 'https://example.com/now-dead.jpg' }]), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    const createCall = vi.mocked(prisma.post.create).mock.calls[0][0] as { data: { mediaUrls: string[] } }
    expect(createCall.data.mediaUrls).toEqual([])
  })

  it('skips re-hosting a content type it cannot name an extension for', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok:          true,
      headers:     { get: () => 'application/pdf' },
      arrayBuffer: async () => new ArrayBuffer(4),
    } as never)

    await POST(req([{ ...ROW, mediaUrl: 'https://example.com/doc.pdf' }]), ctx())

    expect(putObjectBuffer).not.toHaveBeenCalled()
    const createCall = vi.mocked(prisma.post.create).mock.calls[0][0] as { data: { mediaUrls: string[] } }
    expect(createCall.data.mediaUrls).toEqual([])
  })

  it('tolerates a content-type carrying a charset parameter', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok:          true,
      headers:     { get: () => 'image/png; charset=binary' },
      arrayBuffer: async () => new ArrayBuffer(4),
    } as never)

    await POST(req([{ ...ROW, mediaUrl: 'https://example.com/a.png' }]), ctx())

    expect(putObjectBuffer).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    expect((await POST(req([ROW]), ctx())).status).toBe(401)
  })
})
