import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { subDays } from 'date-fns'
import { zernioClient } from '@/services/social/zernio-client'

function checkCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (auth.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
}

// Touches lastSyncedAt without overwriting existing metric values -- used both
// when Zernio reports the platform-side sync isn't finished yet (syncStatus
// other than "synced") and when the analytics call itself fails, so either
// case gets picked up again next run instead of retrying forever on the same
// stale timestamp or locking in incomplete zeros.
function touchOnly(postId: string) {
  return prisma.postMetrics.upsert({
    where:  { postId },
    create: { postId, lastSyncedAt: new Date() },
    update: { lastSyncedAt: new Date() },
  })
}

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
    select: { id: true, platformPostId: true },
    take:   200,
  })

  let synced = 0
  let pending = 0
  let failed = 0

  for (const post of posts) {
    try {
      // platformPostId filtered non-null in the query above; assert for TS.
      const res = await zernioClient.getPostAnalytics(post.platformPostId!)

      if (res.syncStatus !== 'synced' || !res.analytics) {
        await touchOnly(post.id)
        pending++
        continue
      }

      const a = res.analytics
      await prisma.postMetrics.upsert({
        where:  { postId: post.id },
        create: {
          postId:       post.id,
          likes:        a.likes ?? 0,
          comments:     a.comments ?? 0,
          shares:       a.shares ?? 0,
          reach:        a.reach ?? 0,
          impressions:  a.impressions ?? 0,
          clicks:       a.clicks ?? 0,
          saves:        a.saves ?? 0,
          lastSyncedAt: new Date(),
        },
        update: {
          likes:        a.likes ?? 0,
          comments:     a.comments ?? 0,
          shares:       a.shares ?? 0,
          reach:        a.reach ?? 0,
          impressions:  a.impressions ?? 0,
          clicks:       a.clicks ?? 0,
          saves:        a.saves ?? 0,
          lastSyncedAt: new Date(),
        },
      })
      synced++
    } catch (err) {
      // A single post's analytics failing (e.g. 424 -- platform-side sync
      // failed) shouldn't block the rest of the batch.
      console.error(`sync-metrics: failed to fetch analytics for post ${post.id}:`, err)
      await touchOnly(post.id)
      failed++
    }
  }

  return NextResponse.json({ synced, pending, failed, total: posts.length })
}
