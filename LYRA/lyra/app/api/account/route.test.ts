import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user:              { count: vi.fn(), delete: vi.fn() },
    commentResponse:   { deleteMany: vi.fn() },
    comment:           { deleteMany: vi.fn() },
    postMetrics:       { deleteMany: vi.fn() },
    postApproval:      { deleteMany: vi.fn() },
    post:              { deleteMany: vi.fn() },
    socialAccount:     { deleteMany: vi.fn() },
    brandProfile:      { deleteMany: vi.fn() },
    guardrail:         { deleteMany: vi.fn() },
    onboardingToken:   { deleteMany: vi.fn() },
    seoConnection:     { deleteMany: vi.fn() },
    seoPage:           { deleteMany: vi.fn() },
    searchConsoleData: { deleteMany: vi.fn() },
    workspaceAccess:   { deleteMany: vi.fn() },
    workspace:         { deleteMany: vi.fn() },
    $transaction:      vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    stripe: { subscriptions: { retrieve: vi.fn(), cancel: vi.fn() } },
  }
})

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { DELETE } from './route'

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    role: 'SMB_OWNER',
    workspaceAccess: [],
    agency: { id: 'agency-1', stripeSubId: 'sub_123' },
    ...overrides,
  }
}

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.count).mockResolvedValue(0)
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: 'active' } as any)
    vi.mocked(stripe.subscriptions.cancel).mockResolvedValue({} as any)
    for (const model of ['commentResponse', 'comment', 'postMetrics', 'postApproval', 'post', 'socialAccount', 'brandProfile', 'guardrail', 'onboardingToken', 'seoConnection', 'seoPage', 'searchConsoleData', 'workspaceAccess', 'workspace'] as const) {
      vi.mocked((prisma as any)[model].deleteMany).mockResolvedValue({ count: 0 })
    }
  })

  it('cancels the Stripe subscription when the deleting user is the last owner-role member of their agency', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { agencyId: 'agency-1', id: { not: 'user-1' }, role: { in: ['AGENCY_ADMIN', 'SMB_OWNER'] } },
    })
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123')
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123')
  })

  it('does not cancel when another owner-role member remains in the same agency', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(prisma.user.count).mockResolvedValue(1)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('does not call Stripe at all when the user has no agency', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({ agency: null }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(prisma.user.count).not.toHaveBeenCalled()
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('does not call Stripe at all when the agency has no stripeSubId', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({ agency: { id: 'agency-1', stripeSubId: null } }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('does not error when the subscription is already canceled, and deletion still proceeds', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: 'canceled' } as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
    expect(prisma.user.delete).toHaveBeenCalled()
  })

  it('aborts before the deletion transaction runs when Stripe returns a genuine error', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(new Error('Stripe API error'))
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(prisma.user.delete).not.toHaveBeenCalled()
    expect(prisma.workspace.deleteMany).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await DELETE()
    expect(res.status).toBe(401)
  })
})
