import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findFirst: vi.fn() },
    agency:    { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    stripe: { checkout: { sessions: { create: vi.fn() } } },
  }
})

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/stripe/crisis-aware-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/stripe/crisis-aware-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_CRISIS_AWARE_PRICE_ID = 'price_monthly'
    process.env.STRIPE_CRISIS_AWARE_ANNUAL_PRICE_ID = 'price_annual'
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'PRO' } as any)
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: null } as any)
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/xyz' } as any)
  })

  it('creates a monthly checkout session when billing is omitted', async () => {
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(200)
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_monthly', quantity: 1 }] })
    )
  })

  it('creates an annual checkout session when billing is "annual"', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', billing: 'annual' }))
    expect(res.status).toBe(200)
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_annual', quantity: 1 }] })
    )
  })

  it('returns 403 when the workspace is not on the Pro plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(403)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 404 when the workspace is not found or not accessible', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null)
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(401)
  })

  // Regression: `billing` was previously typed but never runtime-checked, so
  // any string other than 'annual' silently resolved to the monthly price ID
  // instead of being rejected. A malformed/unexpected value must now 400
  // rather than silently billing the wrong amount.
  it('returns 400 for an unrecognised billing value instead of silently defaulting to monthly', async () => {
    const res = await POST(req({ workspaceId: 'ws-1', billing: 'weekly' }))
    expect(res.status).toBe(400)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  // Regression: missing workspaceId previously reached
  // prisma.workspace.findFirst({ where: { id: undefined, ... } }), which is a
  // Prisma-level type violation that throws and falls through to the generic
  // 500 handler. It now 400s before any Prisma call.
  it('returns 400 (not 500) when workspaceId is missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect(prisma.workspace.findFirst).not.toHaveBeenCalled()
  })

  it('returns 400 (not 500) for a body that is not valid JSON', async () => {
    const badReq = new Request('http://localhost/api/stripe/crisis-aware-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(badReq)
    expect(res.status).toBe(400)
    expect(prisma.workspace.findFirst).not.toHaveBeenCalled()
  })
})
