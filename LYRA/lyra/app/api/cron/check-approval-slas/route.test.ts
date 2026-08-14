import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ checkCronAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: vi.fn() },
    postApproval: { updateMany: vi.fn() },
  },
}))
vi.mock('@/services/notifications/channel-notifier', () => ({
  notifyChannel: vi.fn(),
}))

import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { GET } from './route'

function req() {
  return new Request('http://localhost/api/cron/check-approval-slas')
}

// scheduledAt far enough in the past/future that (scheduledAt - approvalSlaHours)
// is unambiguously before/after "now" regardless of test execution jitter.
const FAR_PAST_SCHEDULE = new Date(Date.now() - 100 * 60 * 60 * 1000)
const FAR_FUTURE_SCHEDULE = new Date(Date.now() + 100 * 60 * 60 * 1000)

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    content: 'hello',
    scheduledAt: FAR_PAST_SCHEDULE,
    workspaceId: 'ws-1',
    socialAccount: { platform: 'FACEBOOK' },
    approval: { id: 'appr-1', submittedAt: new Date(Date.now() - 200 * 60 * 60 * 1000) },
    workspace: { name: 'Acme', approvalSlaHours: 4, approvalSlaUnscheduledHours: 24 },
    ...overrides,
  }
}

describe('GET /api/cron/check-approval-slas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 and never touches the database when checkCronAuth rejects the request', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(false)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(prisma.post.findMany).not.toHaveBeenCalled()
    expect(notifyChannel).not.toHaveBeenCalled()
  })

  it('claims the approval row and notifies exactly once for an overdue post', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([candidate()] as never)
    vi.mocked(prisma.postApproval.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ scanned: 1, alerted: 1 })
    expect(prisma.postApproval.updateMany).toHaveBeenCalledWith({
      where: { id: 'appr-1', slaAlertedAt: null },
      data: { slaAlertedAt: expect.any(Date) },
    })
    expect(notifyChannel).toHaveBeenCalledTimes(1)
    const [workspaceId, input, opts] = vi.mocked(notifyChannel).mock.calls[0]
    expect(workspaceId).toBe('ws-1')
    expect(input).toMatchObject({ event: 'APPROVAL_SLA_BREACH', workspaceName: 'Acme', platform: 'Facebook' })
    expect(opts).toEqual({ dedupeKey: 'sla-appr-1' })
  })

  it('skips a post whose deadline has not yet passed, without claiming or notifying', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([
      candidate({ id: 'post-not-due', scheduledAt: FAR_FUTURE_SCHEDULE, approval: { id: 'appr-not-due', submittedAt: new Date() } }),
    ] as never)

    const res = await GET(req())

    expect(await res.json()).toEqual({ scanned: 1, alerted: 0 })
    expect(prisma.postApproval.updateMany).not.toHaveBeenCalled()
    expect(notifyChannel).not.toHaveBeenCalled()
  })

  it('does not notify when the atomic claim loses the race (updateMany count 0)', async () => {
    // Two overlapping cron runs both see the post as overdue; only one write
    // should win and only one notification should be sent.
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([candidate({ id: 'post-raced', approval: { id: 'appr-raced', submittedAt: new Date() } })] as never)
    vi.mocked(prisma.postApproval.updateMany).mockResolvedValue({ count: 0 } as never)

    const res = await GET(req())

    expect(await res.json()).toEqual({ scanned: 1, alerted: 0 })
    expect(notifyChannel).not.toHaveBeenCalled()
  })

  it('processes a mixed batch, alerting only the post that is overdue and wins its claim', async () => {
    vi.mocked(checkCronAuth).mockReturnValue(true)
    vi.mocked(prisma.post.findMany).mockResolvedValue([
      candidate({ id: 'post-A', approval: { id: 'appr-A', submittedAt: new Date() } }),
      candidate({ id: 'post-B', scheduledAt: FAR_FUTURE_SCHEDULE, approval: { id: 'appr-B', submittedAt: new Date() } }),
      candidate({ id: 'post-C', approval: { id: 'appr-C', submittedAt: new Date() } }),
    ] as never)
    ;(prisma.postApproval.updateMany as any).mockImplementation(async (args: { where?: { id?: string } }) => ({
      count: args?.where?.id === 'appr-C' ? 0 : 1,
    }))

    const res = await GET(req())

    expect(await res.json()).toEqual({ scanned: 3, alerted: 1 })
    expect(notifyChannel).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyChannel).mock.calls[0][2]).toEqual({ dedupeKey: 'sla-appr-A' })
  })

  it('caps the candidate query at 500 rows and warns when the cap is hit', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(checkCronAuth).mockReturnValue(true)
    // 500 minimal rows with no approval row -- each is skipped immediately via
    // the `if (!post.approval) continue` guard, so this stays cheap while still
    // exercising the cap-hit warning path.
    vi.mocked(prisma.post.findMany).mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => ({ id: `p-${i}`, approval: null })) as never
    )

    await GET(req())

    expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('500-candidate cap'))
    consoleSpy.mockRestore()
  })
})
