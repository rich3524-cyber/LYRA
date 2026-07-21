import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { format, subDays, eachDayOfInterval } from 'date-fns'

export const dynamic = 'force-dynamic'


export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const rawPeriod    = parseInt(searchParams.get('period') ?? '30', 10)
    const period      = Number.isFinite(rawPeriod) ? Math.min(Math.max(rawPeriod, 1), 365) : 30
    const rawOffset   = parseInt(searchParams.get('tzOffset') ?? '0', 10)
    const tzOffset    = Number.isFinite(rawOffset) ? Math.min(Math.max(rawOffset, -840), 840) : 0
    const offsetMs    = tzOffset * 60 * 1000

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const since = subDays(new Date(), period)

    // Posts published in range with metrics
    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        status:      'PUBLISHED',
        publishedAt: { gte: since },
      },
      include: {
        metrics:       true,
        socialAccount: { select: { platform: true } },
      },
      orderBy: { publishedAt: 'asc' },
    })

    // Comments in range
    const commentCount = await prisma.comment.count({
      where: { workspaceId, createdAt: { gte: since } },
    })
    const respondedCount = await prisma.comment.count({
      where: { workspaceId, createdAt: { gte: since }, status: 'RESPONDED' },
    })
    const pendingCount = await prisma.comment.count({
      where: { workspaceId, createdAt: { gte: since }, status: { in: ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL', 'ESCALATED'] } },
    })

    // Aggregate totals
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalReach = 0, totalViews = 0

    for (const post of posts) {
      if (post.metrics) {
        totalLikes    += post.metrics.likes
        totalComments += post.metrics.comments
        totalShares   += post.metrics.shares
        totalReach    += post.metrics.reach
        totalViews    += post.metrics.views
      }
    }

    // Build daily series — one entry per day, sum metrics for posts published that day.
    // All dates are shifted by the client's timezone offset before formatting so that
    // a Brisbane post published at 10:45pm UTC (= 8:45am AEST next day) buckets into
    // the correct local date instead of the UTC date.
    const localFmt = (d: Date) => format(new Date(d.getTime() + offsetMs), 'MMM d')

    // The day-list boundaries must be shifted by the same offset as individual
    // posts below, or the axis never generates a bucket for "today" during the
    // ~10h/day window (for a UTC+10 timezone like Brisbane) where it's already
    // tomorrow locally but still today in UTC -- confirmed live 2026-07-22: a
    // post correctly computed a "Jul 22" bucket key, but dailyMap never had
    // that key at all (end: new Date() was still "Jul 21" in UTC), so the
    // entry silently failed the `if (entry)` check and the post's engagement
    // never appeared on the chart, even though the summary stat cards (which
    // sum directly over posts, not through dailyMap) updated correctly.
    const days = eachDayOfInterval({
      start: new Date(since.getTime() + offsetMs),
      end:   new Date(Date.now() + offsetMs),
    })
    const dailyMap = new Map<string, { likes: number; comments: number; shares: number; reach: number; views: number }>()

    for (const day of days) {
      // Not localFmt here -- `day` is already shifted (the interval boundaries
      // above were pre-shifted), so applying the offset again would double-shift it.
      dailyMap.set(format(day, 'MMM d'), { likes: 0, comments: 0, shares: 0, reach: 0, views: 0 })
    }

    for (const post of posts) {
      if (!post.publishedAt || !post.metrics) continue
      const key = localFmt(post.publishedAt)
      const entry = dailyMap.get(key)
      if (entry) {
        entry.likes    += post.metrics.likes
        entry.comments += post.metrics.comments
        entry.shares   += post.metrics.shares
        entry.reach    += post.metrics.reach
        entry.views    += post.metrics.views
      }
    }

    const series = Array.from(dailyMap.entries()).map(([date, m]) => ({ date, ...m }))

    // Platform breakdown
    const platformMap = new Map<string, number>()
    for (const post of posts) {
      const p = post.socialAccount.platform
      platformMap.set(p, (platformMap.get(p) ?? 0) + 1)
    }
    const platformBreakdown = Array.from(platformMap.entries()).map(([platform, count]) => ({ platform, count }))

    // Top posts by reach, falling back to views as a tiebreaker -- reach is
    // often still 0 in the hours/first day after publish (platforms report it
    // more slowly than views/impressions), which otherwise left "top posts"
    // arbitrarily ordered with every entry showing 0 despite real activity.
    const topPosts = posts
      .filter(p => p.metrics)
      .sort((a, b) => {
        const reachDiff = (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0)
        return reachDiff !== 0 ? reachDiff : (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0)
      })
      .slice(0, 5)
      .map(p => ({
        id:        p.id,
        content:   p.content.slice(0, 120),
        platform:  p.socialAccount.platform,
        reach:     p.metrics?.reach ?? 0,
        views:     p.metrics?.views ?? 0,
        likes:     p.metrics?.likes ?? 0,
        comments:  p.metrics?.comments ?? 0,
        publishedAt: p.publishedAt,
      }))

    return NextResponse.json({
      summary: {
        postsPublished: posts.length,
        totalReach,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        commentResponseRate: (respondedCount + pendingCount) > 0 ? Math.round((respondedCount / (respondedCount + pendingCount)) * 100) : 0,
        inboxPending: pendingCount,
      },
      series,
      platformBreakdown,
      topPosts,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
