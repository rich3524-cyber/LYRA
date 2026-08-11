import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sanitizeEvents } from '@/services/notifications/events'

export const dynamic = 'force-dynamic'

const OWNER_ROLES: UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

/**
 * Loads a channel only if the caller owns its workspace. Every mutating route
 * here goes through this -- the channel id alone must never be sufficient.
 */
async function getOwnedChannel(channelId: string, userId: string) {
  return prisma.notificationChannel.findFirst({
    where: {
      id:        channelId,
      workspace: { access: { some: { userId, role: { in: OWNER_ROLES } } } },
    },
    select: { id: true, workspaceId: true },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const channel = await getOwnedChannel(id, user.id)
    if (!channel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = (await req.json().catch(() => null)) as { enabledEvents?: unknown } | null
    if (!body || !Array.isArray(body.enabledEvents)) {
      return NextResponse.json({ error: 'enabledEvents array required' }, { status: 400 })
    }

    // Unknown keys are dropped rather than 400'd, so a client on an older
    // build can still save its toggles.
    const enabledEvents = sanitizeEvents(body.enabledEvents)

    const updated = await prisma.notificationChannel.update({
      where:  { id },
      data:   { enabledEvents },
      select: { id: true, enabledEvents: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/notification-channels/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const channel = await getOwnedChannel(id, user.id)
    if (!channel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Only the LYRA-side record is removed. The Zernio account itself stays
    // connected (and billable) until removed in Zernio, and the Slack app stays
    // installed until the customer removes it there -- LYRA has no delete
    // endpoint for either, and silently implying otherwise would be worse than
    // saying so in the UI.
    await prisma.notificationChannel.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/notification-channels/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
