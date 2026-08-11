import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workspaceAccess: { findFirst: vi.fn() },
    postApproval: { upsert: vi.fn(), deleteMany: vi.fn() },
    comment: { updateMany: vi.fn() },
    postMetrics: { deleteMany: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

// The PENDING_APPROVAL branch notifies the workspace's Slack channel.
// notifyChannel is fail-open so it would only log against the mocked prisma
// above, but stubbing it keeps these cases about approval-status resolution.
vi.mock('@/services/notifications/channel-notifier', () => ({ notifyChannel: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { APPROVER_ROLES } from '@/lib/authz'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { PATCH, DELETE } from './route'

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
        create: { postId: 'post-1', status: 'PENDING', submittedAt: expect.any(Date) },
        update: {
          status: 'PENDING', reviewedAt: null, reviewerId: null,
          // Start of the new pending cycle, and the once-only SLA flag reset
          // so a resubmitted post can alert again.
          submittedAt: expect.any(Date), slaAlertedAt: null,
        },
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
        create: { postId: 'post-1', status: 'PENDING', submittedAt: expect.any(Date) },
        update: {
          status: 'PENDING', reviewedAt: null, reviewerId: null,
          // Start of the new pending cycle, and the once-only SLA flag reset
          // so a resubmitted post can alert again.
          submittedAt: expect.any(Date), slaAlertedAt: null,
        },
      })
    )
  })

  it('stamps a fresh submittedAt on the UPDATE branch, so a resubmitted post is not instantly overdue', async () => {
    // The row is upserted on every approval transition, so createdAt still
    // holds the FIRST submission after a recall-and-resubmit. If the SLA clock
    // read createdAt, a post submitted weeks ago, rejected, and resubmitted now
    // would read as long overdue the moment it re-entered approval.
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'DRAFT', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'Resubmitted copy', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE', name: 'Acme' },
      author: { name: 'Author' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const before = Date.now()
    await PATCH(req({ status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z' }), ctx('post-1'))

    const call = vi.mocked(prisma.postApproval.upsert).mock.calls[0][0] as any
    expect(call.update.submittedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(call.update.slaAlertedAt).toBeNull()
    // create and update agree, so which branch Prisma takes cannot change the clock.
    expect(call.create.submittedAt.getTime()).toBe(call.update.submittedAt.getTime())
  })

  it('notifies the workspace channel when a post enters approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'DRAFT', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'Needs review', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE', name: 'Acme' },
      author: { name: 'Jane' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    await PATCH(req({ status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z' }), ctx('post-1'))

    expect(notifyChannel).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        event:         'POST_PENDING_APPROVAL',
        workspaceName: 'Acme',
        excerpt:       'Needs review',
        authorName:    'Jane',
      }),
      expect.objectContaining({ dedupeKey: expect.stringContaining('pending-post-1-') })
    )
  })

  it('does not notify when the post does not enter approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'DRAFT', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'NONE', name: 'Acme' },
      author: { name: 'Jane' },
    } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))

    await PATCH(req({ status: 'SCHEDULED', scheduledAt: '2026-09-01T00:00:00.000Z' }), ctx('post-1'))

    expect(notifyChannel).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/posts/[id] — approval authorization (status: APPROVED)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects with 403 when the reviewer\'s role is not in APPROVER_ROLES', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    // CLIENT_VIEW would never actually reach this far in practice (the
    // earlier post.findFirst filters out CLIENT_VIEW workspace access
    // entirely), but this exercises the APPROVER_ROLES.includes() check
    // itself in isolation, as defense-in-depth against that upstream
    // invariant ever changing.
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(403)
    expect(prisma.post.update).not.toHaveBeenCalled()
  })

  it('rejects with 403 and "Cannot approve your own post" when the reviewer is the post\'s own author', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-1',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Cannot approve your own post')
    expect(prisma.post.update).not.toHaveBeenCalled()
  })

  it('allows approval when the reviewer has an approver role and did not author the post, auto-scheduling since media is ready', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: false,
      scheduledAt: new Date('2026-09-01T00:00:00.000Z'),
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
        update: { status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
      })
    )
  })

  it('rejects self-approval with 403 when another approver-capable member exists on the workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-1',
      content: 'x', mediaUrls: [], requiresMedia: false,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst)
      .mockResolvedValueOnce({ role: 'SMB_OWNER' } as any)    // the reviewer's own access row
      .mockResolvedValueOnce({ role: 'AGENCY_ADMIN' } as any) // a different, approver-capable member

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Cannot approve your own post')
    expect(prisma.workspaceAccess.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        workspaceId: 'ws-1',
        userId: { not: 'user-1' },
        role: { in: [...APPROVER_ROLES] },
      },
    })
    expect(prisma.post.update).not.toHaveBeenCalled()
  })

  it('allows self-approval when no other approver-capable member exists on the workspace, auto-scheduling since media is ready', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-1',
      content: 'x', mediaUrls: [], requiresMedia: false,
      scheduledAt: new Date('2026-09-01T00:00:00.000Z'),
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst)
      .mockResolvedValueOnce({ role: 'SMB_OWNER' } as any) // the reviewer's own access row
      .mockResolvedValueOnce(null)                          // nobody else on the workspace can approve
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
  })

  it('stays at APPROVED (does not auto-schedule) when the post still requires media', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: true,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('APPROVED')
    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
        update: { status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
      })
    )
  })

  it('auto-schedules when requiresMedia is true but the post already has media attached', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: ['https://example.com/a.png'], requiresMedia: true,
      scheduledAt: new Date('2026-09-01T00:00:00.000Z'),
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('SCHEDULED')
  })

  it('stays at APPROVED when the post has no scheduledAt set, even if media is ready', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1', authorId: 'user-2',
      content: 'x', mediaUrls: [], requiresMedia: false, scheduledAt: null,
      socialAccount: { platform: 'FACEBOOK' },
      workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as any)
    ;(prisma.post.update as any).mockImplementation(async ({ data }: any) => ({ id: 'post-1', ...data }))
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    const res = await PATCH(req({ status: 'APPROVED' }), ctx('post-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('APPROVED')
  })
})

function deleteReq() {
  return new Request('http://localhost/api/posts/post-1', { method: 'DELETE' })
}

describe('DELETE /api/posts/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a post that has a related PostApproval row, without a foreign-key violation', async () => {
    // Regression test: PostApproval/PostMetrics don't cascade at the DB
    // level, so a bare prisma.post.delete() throws a foreign-key-violation
    // for any post that's ever entered PENDING_APPROVAL (which creates a
    // PostApproval row) -- surfacing to the user as a generic "Failed to
    // delete post". This test would fail if the route regressed back to a
    // bare prisma.post.delete() call, since postApproval.deleteMany would
    // never be invoked.
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      id: 'post-1', status: 'PENDING_APPROVAL', workspaceId: 'ws-1',
    } as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.postApproval.deleteMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.postMetrics.deleteMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.post.delete).mockResolvedValue({ id: 'post-1' } as any)

    const res = await DELETE(deleteReq(), ctx('post-1'))

    expect(res.status).toBe(204)
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({ where: { postId: 'post-1' }, data: { postId: null } })
    expect(prisma.postApproval.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } })
    expect(prisma.postMetrics.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } })
    expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } })
    // All four operations must run inside the same transaction -- a partial
    // failure (e.g. the post.delete rejecting) must not leave orphaned
    // detached comments or a deleted PostApproval with no post to describe.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('detaches comments from the post rather than deleting them', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue({ id: 'post-1', status: 'PUBLISHED', workspaceId: 'ws-1' } as any)
    vi.mocked(prisma.comment.updateMany).mockResolvedValue({ count: 3 } as any)
    vi.mocked(prisma.postApproval.deleteMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.postMetrics.deleteMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.post.delete).mockResolvedValue({ id: 'post-1' } as any)

    const res = await DELETE(deleteReq(), ctx('post-1'))

    expect(res.status).toBe(204)
    // Comments are updated (detached), never deleted -- no prisma.comment.delete*
    // call exists in the mock at all, so calling one would throw.
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({ where: { postId: 'post-1' }, data: { postId: null } })
  })

  it('returns 404 without touching the transaction when the post is not found or not accessible', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.post.findFirst).mockResolvedValue(null)

    const res = await DELETE(deleteReq(), ctx('missing-post'))

    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))

    const res = await DELETE(deleteReq(), ctx('post-1'))

    expect(res.status).toBe(401)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
