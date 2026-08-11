import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ZernioApiError } from '@/services/social/zernio-client'
import { deliverNotification } from '@/services/notifications/delivery'

export const dynamic = 'force-dynamic'

const OWNER_ROLES: UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

// Sends synchronously rather than queueing, deliberately. The whole value of a
// test button is telling the user whether the channel actually works right now
// -- "queued" tells them nothing, which is exactly the silent-failure problem
// this button exists to prevent.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const channel = await prisma.notificationChannel.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id, role: { in: OWNER_ROLES } } } },
      },
      select: { id: true, workspace: { select: { name: true } } },
    })
    if (!channel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await deliverNotification({
      channelId: channel.id,
      // TEST bypasses the per-event toggles by design -- a channel with every
      // event switched off must still be testable.
      input:     { event: 'TEST', workspaceName: channel.workspace.name },
      // Timestamped so pressing the button twice genuinely sends twice.
      // A fixed key would hit Zernio's own request dedupe and make the second
      // press look like it worked while nothing arrived -- the exact
      // silent-failure the test button exists to rule out.
      dedupeKey: `test-${Date.now()}`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Surface the real reason. deliverNotification has already recorded it on
    // the channel's health fields and rethrown.
    if (error instanceof ZernioApiError) {
      console.error(`POST /api/notification-channels/[id]/test Zernio error (${error.status}):`, error.message)
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error('POST /api/notification-channels/[id]/test error:', error)
    return NextResponse.json({ error: 'Test message failed to send' }, { status: 500 })
  }
}
