import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const events = await prisma.crisisEvent.findMany({
      where:   { workspaceId },
      orderBy: { triggeredAt: 'desc' },
      take:    20,
      select:  { id: true, triggeredAt: true, resolvedAt: true, triggerType: true, commentIds: true },
    })

    return NextResponse.json(events)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Crisis history error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
