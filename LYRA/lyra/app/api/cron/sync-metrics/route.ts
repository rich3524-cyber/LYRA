import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'
import { metricsSyncQueue } from '@/lib/queues'

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find posts published in the last 30 days that haven't been synced recently
  const since     = subDays(new Date(), 30)
  const staleSync = subDays(new Date(), 1)

  const posts = await prisma.post.findMany({
    where: {
      status:         'PUBLISHED',
      publishedAt:    { gte: since },
      platformPostId: { not: null },
      socialAccount:  { provider: 'ZERNIO' },
      OR: [
        { metrics: null },
        { metrics: { lastSyncedAt: { lt: staleSync } } },
      ],
    },
    select: { id: true, platformPostId: true, zernioPostId: true },
    take:   200,
  })

  // Fan out to the metrics-sync worker (Railway) instead of fetching all ~200 posts'
  // analytics sequentially inline in this serverless function -- the inline version
  // risked exceeding Netlify's function duration ceiling on any workspace with real
  // publishing volume. See workers/metrics-sync.worker.ts.
  await metricsSyncQueue.addBulk(
    posts.map((post) => ({
      name: 'sync-post-metrics',
      data: {
        postId:   post.id,
        // Prefer Zernio's own internal id -- confirmed live 17 Jul 2026 that the
        // analytics endpoint's id auto-resolution doesn't reliably handle every
        // platform's native id format (works for Instagram's numeric id, 404s on
        // LinkedIn's urn:li:share:... format), but always accepts its own id.
        // Falls back to platformPostId for posts published before this field
        // existed.
        lookupId: post.zernioPostId ?? post.platformPostId!,
      },
      opts: { jobId: `metrics-sync-${post.id}` },
    }))
  )

  return NextResponse.json({ enqueued: posts.length })
}
