import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { postApproval: { upsert: vi.fn() } },
}))
vi.mock('@/services/notifications/channel-notifier', () => ({ notifyChannel: vi.fn() }))
vi.mock('@/lib/platform-labels', () => ({ getPlatformLabel: (p: string) => p }))

import { prisma } from '@/lib/prisma'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { buildApprovalCreateInput, upsertApprovalOnTransition } from './post-approval-bookkeeping'

describe('buildApprovalCreateInput', () => {
  it('returns a nested PostApproval create when landing in PENDING_APPROVAL', () => {
    const submittedAt = new Date('2026-08-14T00:00:00.000Z')
    expect(buildApprovalCreateInput('PENDING_APPROVAL', submittedAt)).toEqual({
      approval: { create: { status: 'PENDING', submittedAt } },
    })
  })

  it('returns an empty object for any other status', () => {
    expect(buildApprovalCreateInput('SCHEDULED', new Date())).toEqual({})
    expect(buildApprovalCreateInput('DRAFT', new Date())).toEqual({})
  })
})

describe('upsertApprovalOnTransition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts PENDING with a fresh submittedAt and notifies the workspace channel when landing in PENDING_APPROVAL', async () => {
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)
    const scheduledAt = new Date('2026-09-01T00:00:00.000Z')

    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'PENDING_APPROVAL', requestedStatus: 'SCHEDULED',
      existingStatus: 'DRAFT', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt, authorName: 'Jane',
    })

    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'PENDING', submittedAt: expect.any(Date) },
        update: {
          status: 'PENDING', reviewedAt: null, reviewerId: null,
          submittedAt: expect.any(Date), slaAlertedAt: null,
        },
      })
    )
    expect(notifyChannel).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        event: 'POST_PENDING_APPROVAL', workspaceName: 'Acme', platform: 'FACEBOOK',
        excerpt: 'hello', scheduledAt, authorName: 'Jane',
      }),
      expect.objectContaining({ dedupeKey: expect.stringContaining('pending-post-1-') })
    )
  })

  it('upserts APPROVED bookkeeping when the requested status is APPROVED, even if finalStatus jumped to SCHEDULED', async () => {
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'SCHEDULED', requestedStatus: 'APPROVED',
      existingStatus: 'PENDING_APPROVAL', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
        update: { status: 'APPROVED', reviewerId: 'user-1', reviewedAt: expect.any(Date) },
      })
    )
    expect(notifyChannel).not.toHaveBeenCalled()
  })

  it('upserts REJECTED bookkeeping on a recall from PENDING_APPROVAL back to DRAFT', async () => {
    vi.mocked(prisma.postApproval.upsert).mockResolvedValue({} as any)

    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'DRAFT', requestedStatus: 'DRAFT',
      existingStatus: 'PENDING_APPROVAL', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { postId: 'post-1' },
        create: { postId: 'post-1', status: 'REJECTED', reviewedAt: expect.any(Date) },
        update: { status: 'REJECTED', reviewedAt: expect.any(Date) },
      })
    )
  })

  it('does nothing when a DRAFT->DRAFT no-op transition does not come from PENDING_APPROVAL', async () => {
    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'DRAFT', requestedStatus: 'DRAFT',
      existingStatus: 'DRAFT', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })

  it('does nothing for an ordinary SCHEDULED transition outside any approval flow', async () => {
    await upsertApprovalOnTransition({
      postId: 'post-1', finalStatus: 'SCHEDULED', requestedStatus: 'SCHEDULED',
      existingStatus: 'DRAFT', reviewerId: 'user-1', workspaceId: 'ws-1',
      workspaceName: 'Acme', platform: 'FACEBOOK', excerpt: 'hello', scheduledAt: null, authorName: null,
    })

    expect(prisma.postApproval.upsert).not.toHaveBeenCalled()
  })
})
