import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    agency: { findFirst: vi.fn() },
  },
}))
// vi.hoisted runs before vi.mock's factory below (which reads PLANS off the
// real module via vi.importActual) -- PLANS.<KEY>.priceId/annualPriceId are
// computed once, at that import, straight from process.env, so setting them
// in beforeEach would be too late. Only needed here because the new
// in-place-update tests assert on which exact price ID gets sent; the
// pre-existing tests never did.
vi.hoisted(() => {
  process.env.STRIPE_AGENCY_PRICE_ID        ||= 'price_test_agency'
  process.env.STRIPE_AGENCY_ANNUAL_PRICE_ID ||= 'price_test_agency_annual'
  process.env.STRIPE_PRO_PRICE_ID           ||= 'price_test_pro'
})
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    stripe: {
      checkout: { sessions: { create: vi.fn() } },
      subscriptions: { retrieve: vi.fn(), update: vi.fn() },
    },
  }
})

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, PLANS } from '@/lib/stripe'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// A subscription with a single plan item, matching the codebase's
// single-item-per-plan-subscription assumption. `interval` controls whether
// it looks like a monthly or annual subscriber.
function activeSubscription(interval: 'month' | 'year' = 'month') {
  return {
    status: 'active',
    items: { data: [{ id: 'si_789', price: { recurring: { interval } } }] },
  } as any
}

describe('POST /api/stripe/create-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1', role: 'AGENCY_ADMIN' } as any)
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: null, stripeSubId: null } as any)
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/xyz' } as any)
  })

  it('creates a checkout session for a real plan key', async () => {
    const res = await POST(req({ plan: 'PRO' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/xyz')
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
  })

  it('modifies the existing subscription in place when the agency already has one, instead of creating a new checkout session', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(activeSubscription())
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    const res = await POST(req({ plan: 'AGENCY' }))

    expect(res.status).toBe(200)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_456')
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_456', expect.objectContaining({
      // The exact price ID matters here, not just its type -- a wrong plan
      // or wrong billing-interval price silently double-charges or
      // undercharges the subscriber. expect.any(String) would pass even if
      // the wrong plan's price were sent.
      items: [{ id: 'si_789', price: PLANS.AGENCY.priceId }],
      proration_behavior: 'create_prorations',
    }))
  })

  it('maps a different requested plan to its own distinct price ID, not the previous test plan\'s', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(activeSubscription())
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    await POST(req({ plan: 'PRO' }))

    expect(PLANS.PRO.priceId).not.toBe(PLANS.AGENCY.priceId)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_456', expect.objectContaining({
      items: [{ id: 'si_789', price: PLANS.PRO.priceId }],
    }))
  })

  it('keeps an annual subscriber on the annual price when upgrading in place, instead of silently switching them to monthly', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(activeSubscription('year'))
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    await POST(req({ plan: 'AGENCY' }))

    expect(PLANS.AGENCY.annualPriceId).not.toBe(PLANS.AGENCY.priceId)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_456', expect.objectContaining({
      items: [{ id: 'si_789', price: PLANS.AGENCY.annualPriceId }],
    }))
  })

  it('sets metadata.plan on the in-place subscription update to the requested plan, so the webhook syncs correctly', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(activeSubscription())
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    await POST(req({ plan: 'AGENCY' }))

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_456', expect.objectContaining({
      metadata: { agencyId: 'agency-1', plan: 'AGENCY', userId: 'user-1' },
    }))
  })

  it('returns a success response with no url when modifying an existing subscription in place', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(activeSubscription())
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    const res = await POST(req({ plan: 'AGENCY' }))
    const body = await res.json()

    expect(body.url).toBeUndefined()
    expect(body.success).toBe(true)
  })

  // Regression: a stripeSubId pointing at a subscription that's already
  // canceled or fully expired (a missed webhook, or the account-deletion
  // cancellation path) can't be revived with subscriptions.update() -- Stripe
  // rejects it. The route must fall through to Checkout instead of leaving
  // the agency's upgrade path permanently broken.
  it.each(['canceled', 'incomplete_expired'])(
    'falls through to a fresh Checkout session when the existing subscription status is "%s"',
    async (status) => {
      vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ ...activeSubscription(), status } as any)

      const res = await POST(req({ plan: 'AGENCY' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.url).toBe('https://checkout.stripe.com/xyz')
      expect(stripe.subscriptions.update).not.toHaveBeenCalled()
      expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
    }
  )

  // Regression: subscription.items.data[0] was indexed without a guard --
  // an unexpected empty items array should fail with a diagnosable error,
  // not throw an opaque TypeError.
  it('fails clearly instead of throwing an opaque TypeError when the existing subscription has no items', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: 'active', items: { data: [] } } as any)

    const res = await POST(req({ plan: 'AGENCY' }))

    expect(res.status).toBe(500)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
  })

  it('rejects an unrecognised plan value', async () => {
    const res = await POST(req({ plan: 'NOT_A_REAL_PLAN' }))
    expect(res.status).toBe(400)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  // Regression test: PLANS is a plain object literal, so a naive
  // `!PLANS[plan]` truthiness check is bypassable by any Object.prototype
  // property name -- these must all be rejected the same as any other
  // unrecognised string, not silently resolve to Object.prototype.
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'rejects the prototype-chain property name "%s" as an invalid plan',
    async (plan) => {
      const res = await POST(req({ plan }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('Invalid plan')
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    }
  )

  it('returns 403 when the user cannot write', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1', role: 'CLIENT_VIEW' } as any)
    const res = await POST(req({ plan: 'PRO' }))
    expect(res.status).toBe(403)
    expect(prisma.agency.findFirst).not.toHaveBeenCalled()
  })

  it('returns 404 when the user has no agency', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue(null)
    const res = await POST(req({ plan: 'PRO' }))
    expect(res.status).toBe(404)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ plan: 'PRO' }))
    expect(res.status).toBe(401)
  })

  // Regression: a malformed JSON body previously reached `await req.json()`
  // unguarded, threw a SyntaxError, and fell through to the generic 500
  // handler. parseBody now converts that into a clean 400 before any
  // Stripe/Prisma call happens.
  it('returns 400 (not 500) for a body that is not valid JSON', async () => {
    const badReq = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(badReq)
    expect(res.status).toBe(400)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 400 when plan is missing from the body', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
})
