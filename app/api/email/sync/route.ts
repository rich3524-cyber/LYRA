import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncEmailCampaigns } from '@/services/email/sync'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await syncEmailCampaigns(workspaceId)

    const connection = await prisma.emailConnection.findUnique({
      where:  { workspaceId },
      select: { lastSyncAt: true, lastSyncError: true },
    })

    return NextResponse.json({ success: true, lastSyncAt: connection?.lastSyncAt })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : 'Sync failed'
    console.error('[email/sync] error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
