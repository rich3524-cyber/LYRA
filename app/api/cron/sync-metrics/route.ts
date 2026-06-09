import { checkCronAuth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find posts published in the last 30 days that haven't been synced recently
  const since     = subDays(new Date(), 30)
  const staleSync = subDays(new Date(), 1)

  const posts = await prisma.post.findMany({
    where: {
      status:      'PUBLISHED',
      publishedAt: { gte: since },
      OR: [
        { metrics: null },
        { metrics: { lastSyncedAt: { lt: staleSync } } },
      ],
    },
    select: { id: true, socialAccountId: true, metrics: { select: { postId: true } } },
    take:   200,
  })

  const now = new Date()

  // Create placeholder rows for posts with no metrics yet — single query
  await prisma.postMetrics.createMany({
    data:         posts.filter(p => !p.metrics).map(p => ({ postId: p.id, lastSyncedAt: now })),
    skipDuplicates: true,
  })

  // Stamp lastSyncedAt on rows that already exist — single query
  const existingIds = posts.filter(p => p.metrics).map(p => p.id)
  if (existingIds.length > 0) {
    await prisma.postMetrics.updateMany({
      where: { postId: { in: existingIds } },
      data:  { lastSyncedAt: now },
    })
  }

  return NextResponse.json({ synced: posts.length })
}
