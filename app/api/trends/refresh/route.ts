import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { trendSyncQueue } from '@/workers/trend-sync.worker'

const RATE_LIMIT_SECONDS = 600 // 10 minutes

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : null
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

    const rateLimitKey = `trend-refresh-rl:${workspaceId}`
    const acquired = await redis.set(rateLimitKey, '1', 'EX', RATE_LIMIT_SECONDS, 'NX')
    if (!acquired) {
      return NextResponse.json(
        { error: 'Refresh already in progress. Try again in a few minutes.' },
        { status: 429 }
      )
    }

    await trendSyncQueue.add(
      'manual-refresh',
      { workspaceId },
      { jobId: `trend-manual-${workspaceId}-${Date.now()}`, removeOnComplete: true }
    )

    return NextResponse.json({ queued: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/trends/refresh error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
