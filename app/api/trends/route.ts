import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        access: { some: { userId: user.id } },
      },
      select: { trendEnabled: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!workspace.trendEnabled) {
      return NextResponse.json({ error: 'LYRA Trend not enabled' }, { status: 403 })
    }

    const trends = await prisma.trendItem.findMany({
      where: {
        workspaceId,
        status: { not: 'DISMISSED' },
      },
      orderBy: { relevanceScore: 'desc' },
    })

    return NextResponse.json({ trends })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/trends error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
