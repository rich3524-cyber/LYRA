import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: vi.fn() } },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    processedWebhookEvent: { create: vi.fn(), delete: vi.fn() },
    agency: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    workspace: { update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    workspaceAccess: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { POST } from './route'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

function makeRequest(signature: string | null = 'sig_test'): Request {
  const headers = new Headers()
  if (signature) headers.set('stripe-signature', signature)
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: '{}',
    headers,
  })
}

function makeEvent(overrides: { id: string; type: string; object: Record<string, unknown> }): Stripe.Event {
  return {
    id: overrides.id,
    type: overrides.type,
    data: { object: overrides.object },
  } as unknown as Stripe.Event
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.processedWebhookEvent.create).mockResolvedValue({ id: 'evt_default' } as never)
  vi.mocked(prisma.processedWebhookEvent.delete).mockResolvedValue({ id: 'evt_default' } as never)
})

describe('POST /api/stripe/webhook', () => {
  it('returns 400 and never touches the database when signature verification fails', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('invalid signature')
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled()
  })

  it('returns 400 without touching the database when the stripe-signature header is missing', async () => {
    const res = await POST(makeRequest(null))

    expect(res.status).toBe(400)
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled()
    expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled()
  })

  it('returns early without processing a duplicate (already-processed) event', async () => {
    const event = makeEvent({
      id: 'evt_dup',
      type: 'customer.subscription.updated',
      object: { id: 'sub_1', customer: 'cus_1', metadata: { plan: 'PRO' } },
    })
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
    vi.mocked(prisma.processedWebhookEvent.create).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on the fields: (`id`)'), { code: 'P2002' })
    )

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(json).toEqual({ received: true, duplicate: true })
    expect(prisma.agency.findMany).not.toHaveBeenCalled()
    expect(prisma.workspace.update).not.toHaveBeenCalled()
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled()
  })

  it('un-marks the event as processed (deletes the idempotency record) when the handler throws', async () => {
    const event = makeEvent({
      id: 'evt_err',
      type: 'customer.subscription.updated',
      object: { id: 'sub_1', customer: 'cus_1', metadata: { plan: 'PRO' } },
    })
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
    vi.mocked(prisma.agency.findMany).mockRejectedValue(new Error('db unavailable'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(prisma.processedWebhookEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt_err' } })
  })

  it('surfaces (logs) it when the compensating delete itself fails, instead of swallowing it silently', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const event = makeEvent({
      id: 'evt_err2',
      type: 'customer.subscription.updated',
      object: { id: 'sub_1', customer: 'cus_1', metadata: { plan: 'PRO' } },
    })
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
    vi.mocked(prisma.agency.findMany).mockRejectedValue(new Error('db unavailable'))
    vi.mocked(prisma.processedWebhookEvent.delete).mockRejectedValue(new Error('db still unavailable'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL'),
      expect.any(Error)
    )
    consoleErrorSpy.mockRestore()
  })

  it('updates Workspace.trendSubId and never touches Agency.plan for a trend_addon subscription update with no plan in metadata', async () => {
    const event = makeEvent({
      id: 'evt_trend',
      type: 'customer.subscription.updated',
      object: { id: 'sub_trend_1', customer: 'cus_1', metadata: { type: 'trend_addon', workspaceId: 'ws_1' } },
    })
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'ws_1' },
      data: { trendSubId: 'sub_trend_1' },
    })
    expect(prisma.agency.update).not.toHaveBeenCalled()
    expect(prisma.agency.updateMany).not.toHaveBeenCalled()
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled()
  })
})
