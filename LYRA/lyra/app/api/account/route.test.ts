import { describe, it, expect, vi, beforeEach } from 'vitest'
import Stripe from 'stripe'

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

// Helper to build a fake Stripe "not found" error the same way the real SDK
// raises it -- a real StripeInvalidRequestError instance with code
// 'resource_missing', since the route narrows on `instanceof` + `.code`.
function resourceMissingError(message = 'No such subscription') {
  return new Stripe.errors.StripeInvalidRequestError({ message, code: 'resource_missing', type: 'invalid_request_error' })
}

// `role` on the User object itself is never populated by any code path in
// this codebase (every user sits on the schema default, SMB_OWNER) -- the
// route intentionally ignores it and derives ownership from
// WorkspaceAccess.role instead. Included here only for shape realism.
function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    role: 'SMB_OWNER',
    workspaceAccess: [
      { workspaceId: 'ws-1', role: 'SMB_OWNER', workspace: { id: 'ws-1', trendSubId: null } },
    ],
    agency: { id: 'agency-1', stripeSubId: 'sub_123', crisisAwareSubId: null },
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
      where: {
        agencyId: 'agency-1',
        id: { not: 'user-1' },
        workspaceAccess: { some: { role: { in: ['AGENCY_ADMIN', 'SMB_OWNER'] } } },
      },
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

  it('does not call Stripe at all when the agency has no stripeSubId or crisisAwareSubId', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({ agency: { id: 'agency-1', stripeSubId: null, crisisAwareSubId: null } }) as any)
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

  it('does not trigger any Stripe calls for a user who owns zero workspaces, even if user.agency exists', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({ workspaceAccess: [] }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(prisma.user.count).not.toHaveBeenCalled()
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('cancels crisisAwareSubId under the same last-owner gate as the main subscription', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({
      agency: { id: 'agency-1', stripeSubId: 'sub_123', crisisAwareSubId: 'sub_crisis_456' },
    }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123')
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_crisis_456')
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123')
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_crisis_456')
  })

  it('cancels an owned workspace\'s trendSubId unconditionally, even when another agency owner remains', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1) // another owner remains -- agency-level subs must NOT be touched
    vi.mocked(requireAuth).mockResolvedValue(baseUser({
      workspaceAccess: [
        { workspaceId: 'ws-1', role: 'SMB_OWNER', workspace: { id: 'ws-1', trendSubId: 'sub_trend_789' } },
      ],
    }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_trend_789')
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_trend_789')
    // Agency-level main subscription was NOT cancelled -- another owner remains.
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalledWith('sub_123')
  })

  it('treats a resource_missing retrieve error as non-fatal and proceeds with deletion', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(resourceMissingError())
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
    expect(prisma.user.delete).toHaveBeenCalled()
  })

  it('treats any non-resource_missing retrieve error as fatal and aborts deletion', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(
      new Stripe.errors.StripeAPIError({ message: 'Stripe is down', type: 'api_error' })
    )
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(prisma.user.delete).not.toHaveBeenCalled()
    expect(prisma.workspace.deleteMany).not.toHaveBeenCalled()
  })
})
