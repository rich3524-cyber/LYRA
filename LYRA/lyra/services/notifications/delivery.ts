import { prisma } from '@/lib/prisma'
import { zernioClient, ZernioApiError } from '@/services/social/zernio-client'
import { buildMessage, type NotificationInput } from './message'
import { formatSlackMessage } from './slack-formatter'

// The actual send. Lives here rather than in workers/notification.worker.ts so
// the "Send test message" route can call it directly and report a real result
// -- importing the worker file from a serverless route would execute its
// `new Worker(...)` as a side effect and start a second BullMQ consumer inside
// the Netlify function (see the header comment in lib/queues.ts).

export interface DeliveryJob {
  channelId: string
  input:     NotificationInput
  /**
   * The caller's stable, per-event-instance key (see NotifyOptions in
   * channel-notifier). Becomes Zernio's x-request-id.
   *
   * It must identify the specific event, not just its type: Zernio dedupes on
   * this for roughly five minutes, so a key of merely "this channel + this
   * event type" would make a second genuine crisis (or failure, or approval
   * request) within that window silently vanish instead of alerting.
   */
  dedupeKey: string
}

export async function deliverNotification(job: DeliveryJob): Promise<void> {
  const { channelId, input, dedupeKey } = job
  const appBaseUrl = process.env.APP_BASE_URL!

  const channel = await prisma.notificationChannel.findUnique({
    where:  { id: channelId },
    select: {
      id:              true,
      type:            true,
      zernioAccountId: true,
      workspaceId:     true,
      workspace:       { select: { timezone: true } },
    },
  })
  // Disconnected between enqueue and delivery -- nothing to do, and not an error.
  if (!channel) return

  if (channel.type !== 'SLACK') {
    // TEAMS is reserved in the enum but has no formatter yet. Returning rather
    // than throwing: a retry could never succeed, so failing the job would just
    // burn attempts and fill the failed set.
    console.error(`notification: channel ${channelId} has unsupported type ${channel.type}`)
    return
  }

  const message = buildMessage(input, {
    workspaceId: channel.workspaceId,
    appBaseUrl,
    timeZone:    channel.workspace.timezone,
  })
  const { content, platformSpecificData } = formatSlackMessage(message, appBaseUrl)

  try {
    await zernioClient.sendSlackMessage(
      channel.zernioAccountId,
      content,
      platformSpecificData,
      // Stable across every BullMQ attempt of this job, so Zernio's
      // x-request-id layer dedupes a retry instead of posting a second real
      // message. This codebase has already been bitten by exactly that, live
      // (2026-07-21, publishNow). Scoped by channel as well as by the caller's
      // key, so two workspaces can never collide on one.
      `notify-${channelId}-${dedupeKey}`
    )

    await prisma.notificationChannel.update({
      where: { id: channelId },
      data:  { lastDeliveryAt: new Date(), lastDeliveryError: null, consecutiveFailures: 0 },
    })
  } catch (error) {
    const detail = error instanceof ZernioApiError
      ? `Zernio ${error.status}: ${error.message}`
      : error instanceof Error
        ? error.message
        : 'Unknown delivery error'

    // Health tracking must survive the failure it is recording, so it gets its
    // own try/catch -- if this write is what threw, swallowing it would lose
    // the original error entirely.
    try {
      await prisma.notificationChannel.update({
        where: { id: channelId },
        data:  {
          lastDeliveryError:   detail.slice(0, 500),
          consecutiveFailures: { increment: 1 },
        },
      })
    } catch (trackingError) {
      console.error(`notification: failed to record delivery error for channel ${channelId}:`, trackingError)
    }

    // Rethrow so BullMQ retries with backoff, and so the test route can report
    // the real reason. A 4xx from Zernio (revoked app, deleted channel) will
    // exhaust its attempts and land in the failed set, which is correct -- the
    // health fields above are what the UI reads.
    throw error
  }
}
