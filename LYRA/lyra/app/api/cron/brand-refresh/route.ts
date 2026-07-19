import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'
import { brandSyncQueue } from '@/lib/queues'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const staleThreshold = subDays(new Date(), 7)

    const workspaces = await prisma.workspace.findMany({
      where: {
        websiteUrl: { not: null },
        OR: [
          { brandProfile: null },
          { brandProfile: { lastScrapedAt: { lt: staleThreshold } } },
        ],
      },
      select: { id: true },
      take: 50,
    })

    await Promise.all(
      workspaces.map(w =>
        brandSyncQueue.add(
          'sync-brand',
          { workspaceId: w.id },
          { jobId: `brand-sync-${w.id}`, removeOnComplete: true }
        )
      )
    )

    // Queue engagement analysis as individual BullMQ jobs — avoids inline timeout risk
    const profileWorkspaces = await prisma.brandProfile.findMany({
      select: { workspaceId: true },
      take: 50,
    })

    await Promise.all(
      profileWorkspaces.map(({ workspaceId }) =>
        brandSyncQueue.add(
          'analyze-engagement',
          { workspaceId },
          { jobId: `engagement-${workspaceId}`, removeOnComplete: true }
        )
      )
    )

    return NextResponse.json({ queued: workspaces.length, engagementQueued: profileWorkspaces.length })
  } catch (error) {
    console.error('GET /api/cron/brand-refresh error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
