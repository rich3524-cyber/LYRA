// services/notifications/delivery.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { notificationChannel: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/services/social/zernio-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/social/zernio-client')>(
    '@/services/social/zernio-client'
  )
  return { ...actual, zernioClient: { sendSlackMessage: vi.fn() } }
})

import { deliverNotification } from './delivery'
import { prisma } from '@/lib/prisma'
import { zernioClient, ZernioApiError } from '@/services/social/zernio-client'

const CRISIS = {
  event:         'CRISIS_DETECTED',
  workspaceName: 'Acme',
  triggerType:   'KEYWORD_MATCH',
  comment:       null,
} as const

function slackChannel(overrides: Record<string, unknown> = {}) {
  return {
    id:              'chan_1',
    type:            'SLACK',
    zernioAccountId: 'zern_acct_1',
    workspaceId:     'ws_1',
    workspace:       { timezone: 'Australia/Sydney' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_BASE_URL = 'https://lyraonline.ai'
})

describe('deliverNotification', () => {
  it('sends the formatted message to the channel s Zernio account', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(slackChannel() as never)

    await deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'crisis-abc' })

    expect(zernioClient.sendSlackMessage).toHaveBeenCalledTimes(1)
    const [accountId, content, platformSpecificData] = vi.mocked(zernioClient.sendSlackMessage).mock.calls[0]
    expect(accountId).toBe('zern_acct_1')
    expect(content).toContain('*Crisis detected — Acme*')
    expect(platformSpecificData).toMatchObject({ username: 'LYRA' })
  })

  it('derives the idempotency key from the caller s per-event key, not the event type', async () => {
    // Regression guard. Zernio dedupes on x-request-id for ~5 minutes, so a key
    // of "channel + event type" would make a SECOND genuine crisis inside that
    // window silently vanish instead of alerting anyone.
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(slackChannel() as never)

    await deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'crisis-first' })
    await deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'crisis-second' })

    const keys = vi.mocked(zernioClient.sendSlackMessage).mock.calls.map((c) => c[3])
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[0]).toContain('crisis-first')
    expect(keys[1]).toContain('crisis-second')
  })

  it('scopes the idempotency key by channel so two workspaces cannot collide', async () => {
    vi.mocked(prisma.notificationChannel.findUnique)
      .mockResolvedValueOnce(slackChannel({ id: 'chan_1' }) as never)
      .mockResolvedValueOnce(slackChannel({ id: 'chan_2' }) as never)

    await deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'same' })
    await deliverNotification({ channelId: 'chan_2', input: CRISIS, dedupeKey: 'same' })

    const keys = vi.mocked(zernioClient.sendSlackMessage).mock.calls.map((c) => c[3])
    expect(keys[0]).not.toBe(keys[1])
  })

  it('records a successful delivery and clears prior failures', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(slackChannel() as never)

    await deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'k' })

    expect(prisma.notificationChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chan_1' },
        data:  expect.objectContaining({ lastDeliveryError: null, consecutiveFailures: 0 }),
      })
    )
  })

  it('records the failure and rethrows so BullMQ retries', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(slackChannel() as never)
    vi.mocked(zernioClient.sendSlackMessage).mockRejectedValue(new ZernioApiError(404, 'channel_not_found'))

    await expect(
      deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'k' })
    ).rejects.toThrow()

    expect(prisma.notificationChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastDeliveryError:   'Zernio 404: channel_not_found',
          consecutiveFailures: { increment: 1 },
        }),
      })
    )
  })

  it('does nothing when the channel was disconnected between enqueue and delivery', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(null as never)
    await expect(
      deliverNotification({ channelId: 'gone', input: CRISIS, dedupeKey: 'k' })
    ).resolves.toBeUndefined()
    expect(zernioClient.sendSlackMessage).not.toHaveBeenCalled()
  })

  it('does not throw for a TEAMS channel, which has no formatter yet', async () => {
    // Returning rather than throwing: a retry could never succeed.
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(
      slackChannel({ type: 'TEAMS' }) as never
    )
    await expect(
      deliverNotification({ channelId: 'chan_1', input: CRISIS, dedupeKey: 'k' })
    ).resolves.toBeUndefined()
    expect(zernioClient.sendSlackMessage).not.toHaveBeenCalled()
  })
})
