import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { subDays, subHours } from 'date-fns'
import { zernioClient } from '@/services/social/zernio-client'

export const dynamic = 'force-dynamic'

function touchOnly(postId: string) {
  return prisma.postMetrics.upsert({
    where:  { postId },
    create: { postId, lastSyncedAt: new Date() },
    update: { lastSyncedAt: new Date() },
  })
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json() as { workspaceId: string }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const since      = subDays(new Date(), 30)
    const recentSync = subHours(new Date(), 1)

    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        status:         'PUBLISHED',
        publishedAt:    { gte: since },
        platformPostId: { not: null },
        socialAccount:  { provider: 'ZERNIO' },
        OR: [
          { metrics: null },
          { metrics: { lastSyncedAt: { lt: recentSync } } },
        ],
      },
      select: { id: true, platformPostId: true, zernioPostId: true },
      take:   50,
    })

    let synced = 0
    let pending = 0
    let failed = 0

    for (const post of posts) {
      try {
        const lookupId = post.zernioPostId ?? post.platformPostId!
        const res = await zernioClient.getPostAnalytics(lookupId)

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
            views:        a.views ?? 0,
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
            views:        a.views ?? 0,
            clicks:       a.clicks ?? 0,
            saves:        a.saves ?? 0,
            lastSyncedAt: new Date(),
          },
        })
        synced++
      } catch (err) {
        console.error(`analytics/sync: failed for post ${post.id}:`, err)
        await touchOnly(post.id)
        failed++
      }
    }

    return NextResponse.json({ synced, pending, failed, total: posts.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/analytics/sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
