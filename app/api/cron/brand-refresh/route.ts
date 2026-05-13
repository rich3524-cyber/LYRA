import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { brandSyncQueue } from '@/workers/brand-sync.worker'
import { subDays } from 'date-fns'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Re-sync workspaces with a website URL whose brand profile is stale (>7 days)
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
    take:   50,
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

  return NextResponse.json({ queued: workspaces.length })
}
