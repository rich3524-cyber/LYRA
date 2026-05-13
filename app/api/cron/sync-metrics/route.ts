import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
    select: { id: true, socialAccountId: true },
    take:   200,
  })

  // Upsert placeholder metrics rows so they exist — real platform polling
  // will be implemented per-platform as social API access is granted
  let upserted = 0
  for (const post of posts) {
    await prisma.postMetrics.upsert({
      where:  { postId: post.id },
      create: { postId: post.id, lastSyncedAt: new Date() },
      update: { lastSyncedAt: new Date() },
    })
    upserted++
  }

  return NextResponse.json({ synced: upserted })
}
