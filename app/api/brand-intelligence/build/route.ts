import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { brandSyncQueue } from '@/workers/brand-sync.worker'

export const maxDuration = 10
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    const workspace = await prisma.workspace.findFirst({
      where:  { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enqueue the brand sync job — the worker handles scraping + Claude profiling.
    // This avoids timing out in the Netlify serverless function (2-min operation).
    await brandSyncQueue.add(
      'sync-brand',
      { workspaceId },
      { jobId: `brand-build-${workspaceId}-${Date.now()}`, priority: 1 }
    )

    return NextResponse.json({ queued: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/build error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
