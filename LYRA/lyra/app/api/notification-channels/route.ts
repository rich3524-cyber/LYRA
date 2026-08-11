import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET the current workspace's channel, or null. Membership is enough to read
// (mirrors GET /api/workspaces/[id]); mutating routes are owner-gated.
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where:  { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const channel = await prisma.notificationChannel.findUnique({
      where: { workspaceId },
      // zernioAccountId is deliberately not selected -- the client has no use
      // for it, and an internal integration id has no business in a response.
      select: {
        id:                  true,
        type:                true,
        label:               true,
        enabledEvents:       true,
        lastDeliveryAt:      true,
        lastDeliveryError:   true,
        consecutiveFailures: true,
        createdAt:           true,
      },
    })

    return NextResponse.json(channel)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/notification-channels error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
