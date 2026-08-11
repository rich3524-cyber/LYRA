// services/notifications/channel-notifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { notificationChannel: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/queues', () => ({
  notificationQueue: { add: vi.fn() },
}))

import { notifyChannel } from './channel-notifier'
import { prisma } from '@/lib/prisma'
import { notificationQueue } from '@/lib/queues'

const CRISIS = {
  event:         'CRISIS_DETECTED',
  workspaceName: 'Acme',
  triggerType:   'KEYWORD_MATCH',
  comment:       null,
} as const

function channel(overrides: Record<string, unknown> = {}) {
  return {
    id:            'chan_1',
    enabledEvents: ['CRISIS_DETECTED'],
    workspace:     { plan: 'AGENCY', agency: { crisisAwareSubId: null } },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyChannel', () => {
  it('enqueues when the event is enabled and the plan allows it', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(channel() as never)

    await notifyChannel('ws_1', CRISIS, { dedupeKey: 'crisis-1' })

    expect(notificationQueue.add).toHaveBeenCalledTimes(1)
    const [name, data, opts] = vi.mocked(notificationQueue.add).mock.calls[0]
    expect(name).toBe('deliver')
    expect(data).toMatchObject({ channelId: 'chan_1', workspaceId: 'ws_1' })
    expect(opts?.jobId).toBe('notify-crisis-1')
  })

  it('does nothing when the workspace has no channel', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(null as never)
    await notifyChannel('ws_1', CRISIS, { dedupeKey: 'k' })
    expect(notificationQueue.add).not.toHaveBeenCalled()
  })

  it('does not deliver an event the workspace has switched off', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(
      channel({ enabledEvents: ['POST_FAILED'] }) as never
    )
    await notifyChannel('ws_1', CRISIS, { dedupeKey: 'k' })
    expect(notificationQueue.add).not.toHaveBeenCalled()
  })

  it('stops delivering to a workspace that no longer has plan access', async () => {
    // The stored channel row outlives a downgrade; without a send-time check it
    // would keep delivering into a channel the customer no longer pays for.
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(
      channel({ workspace: { plan: 'PRO', agency: { crisisAwareSubId: null } } }) as never
    )
    await notifyChannel('ws_1', CRISIS, { dedupeKey: 'k' })
    expect(notificationQueue.add).not.toHaveBeenCalled()
  })

  it('delivers to a Pro workspace holding the Crisis Aware add-on', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(
      channel({ workspace: { plan: 'PRO', agency: { crisisAwareSubId: 'sub_123' } } }) as never
    )
    await notifyChannel('ws_1', CRISIS, { dedupeKey: 'k' })
    expect(notificationQueue.add).toHaveBeenCalledTimes(1)
  })

  it('sends a TEST message even with every event switched off', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(
      channel({ enabledEvents: [] }) as never
    )
    await notifyChannel('ws_1', { event: 'TEST', workspaceName: 'Acme' }, { dedupeKey: 'test-1' })
    expect(notificationQueue.add).toHaveBeenCalledTimes(1)
  })

  it('never throws when the database is unreachable', async () => {
    // Fail-open is the whole contract: this runs inside crisis detection, the
    // publish worker, and the approval route.
    vi.mocked(prisma.notificationChannel.findUnique).mockRejectedValue(new Error('db down'))
    await expect(notifyChannel('ws_1', CRISIS, { dedupeKey: 'k' })).resolves.toBeUndefined()
  })

  it('never throws when enqueueing fails', async () => {
    vi.mocked(prisma.notificationChannel.findUnique).mockResolvedValue(channel() as never)
    vi.mocked(notificationQueue.add).mockRejectedValue(new Error('redis down'))
    await expect(notifyChannel('ws_1', CRISIS, { dedupeKey: 'k' })).resolves.toBeUndefined()
  })
})
