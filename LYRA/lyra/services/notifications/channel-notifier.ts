import { prisma } from '@/lib/prisma'
import { notificationQueue } from '@/lib/queues'
import { hasNotificationChannelAccess } from '@/lib/plan-access'
import { isNotificationEvent } from './events'
import type { NotificationInput } from './message'

// The single entry point every trigger site calls. Resolves the workspace's
// channel, applies plan gating and the per-event toggle, then enqueues.
//
// FAIL-OPEN, ALWAYS. This is called from inside crisis detection, the publish
// worker, and the post-approval route. A notification problem must never break
// any of them -- same rule sendCrisisAlertEmail already follows. Nothing in
// this file throws.

export interface NotifyOptions {
  /**
   * Stable idempotency seed. Two calls with the same seed collapse into one
   * delivered message, both at the BullMQ level (jobId) and at Zernio's
   * (x-request-id). Callers should derive it from the subject, e.g.
   * `post-failed-${postId}`.
   */
  dedupeKey: string
}

export async function notifyChannel(
  workspaceId: string,
  input: NotificationInput,
  opts: NotifyOptions
): Promise<void> {
  try {
    const channel = await prisma.notificationChannel.findUnique({
      where:  { workspaceId },
      select: {
        id:            true,
        enabledEvents: true,
        workspace:     {
          select: { plan: true, agency: { select: { crisisAwareSubId: true } } },
        },
      },
    })
    if (!channel) return

    // Re-check plan access at send time, not only at connect time. A workspace
    // that downgrades, or an agency whose Crisis Aware subscription lapses,
    // must stop receiving messages into a channel it no longer pays for --
    // the stored row would otherwise keep delivering indefinitely.
    if (!hasNotificationChannelAccess(channel.workspace.plan, channel.workspace.agency?.crisisAwareSubId)) {
      return
    }

    // TEST bypasses the toggle list by design -- the whole point of the test
    // button is to verify a channel that may have every event switched off.
    if (input.event !== 'TEST') {
      if (!isNotificationEvent(input.event)) return
      if (!channel.enabledEvents.includes(input.event)) return
    }

    await notificationQueue.add(
      'deliver',
      { channelId: channel.id, workspaceId, input, dedupeKey: opts.dedupeKey },
      {
        // Stable jobId so a duplicate enqueue for the same logical event (a
        // cron re-run, a BullMQ retry of the *calling* worker) is a no-op
        // rather than a second message in the customer's channel.
        jobId:            `notify-${opts.dedupeKey}`,
        removeOnComplete: true,
      }
    )
  } catch (error) {
    console.error(`notifyChannel failed for workspace ${workspaceId} (${input.event}):`, error)
  }
}
