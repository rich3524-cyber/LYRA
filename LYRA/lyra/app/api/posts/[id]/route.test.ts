import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: vi.fn(), update: vi.fn() },
    workspaceAccess: { findFirst: vi.fn() },
    postApproval: { upsert: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/posts/post-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/posts/[id] — approval-status resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves a SCHEDULED transition to PENDING_APPROVAL when the workspace requires client approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'DRAFT', workspaceId: 'ws-1', authorId: 'user-2',
      mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('PENDING_APPROVAL')
    // Confirms the PENDING_APPROVAL branch actually fired (not just that
    // upsert was called with *some* args) -- this is what a wrong branch
    // (e.g. the APPROVED branch, which sets reviewerId/reviewedAt) would fail.
    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'PENDING' },
        update: { status: 'PENDING', reviewedAt: null, reviewerId: null },
      })
    )
  })

  it('leaves a SCHEDULED transition unchanged when the workspace does not require client approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'DRAFT', workspaceId: 'ws-1', authorId: 'user-2',
      mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'NONE' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })

  it('regression: an APPROVED post being scheduled with no content change reaches SCHEDULED, not bounced back to PENDING_APPROVAL', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'APPROVED', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'Approved copy', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })

  it('regression: an APPROVED post being scheduled with the SAME content explicitly re-sent still reaches SCHEDULED', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'APPROVED', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'Approved copy', mediaUrls: ['https://example.com/a.png'], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({
      status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z',
      content: 'Approved copy', mediaUrls: ['https://example.com/a.png'],
    }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })

  it('bypass fix: an APPROVED post scheduled with CHANGED content is redirected to PENDING_APPROVAL for re-review', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'APPROVED', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'Approved copy', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({
      status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z',
      content: 'Author changed this after approval',
    }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('PENDING_APPROVAL')
    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'PENDING' },
        update: { status: 'PENDING', reviewedAt: null, reviewerId: null },
      })
    )
  })
})
