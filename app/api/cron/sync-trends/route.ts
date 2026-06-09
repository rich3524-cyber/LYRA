import { checkCronAuth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { trendSyncQueue } from '@/workers/trend-sync.worker'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspaces = await prisma.workspace.findMany({
    where:  { trendEnabled: true },
    select: { id: true },
  })

  const today = new Date().toISOString().split('T')[0]

  await Promise.all(
    workspaces.map(w =>
      trendSyncQueue.add(
        'sync-workspace-trends',
        { workspaceId: w.id },
        { jobId: `trend-sync-${w.id}-${today}`, removeOnComplete: true }
      )
    )
  )

  return NextResponse.json({ queued: workspaces.length })
}
