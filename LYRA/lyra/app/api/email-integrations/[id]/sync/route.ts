import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncEmailIntegration } from '@/services/email-marketing/sync'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  const { id } = await params

  const integration = await prisma.emailIntegration.findUnique({
    where: { id },
    select: { workspaceId: true },
  })
  if (!integration) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const access = await prisma.workspace.findFirst({
    where: { id: integration.workspaceId, access: { some: { userId: user.id } } },
    select: { id: true },
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { synced } = await syncEmailIntegration(id)
    return NextResponse.json({ synced })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
