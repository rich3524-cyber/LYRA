import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { format, subDays, eachDayOfInterval } from 'date-fns'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const period      = parseInt(searchParams.get('period') ?? '30', 10)

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

    // Aggregate totals
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalReach = 0

    for (const post of posts) {
      if (post.metrics) {
        totalLikes    += post.metrics.likes
        totalComments += post.metrics.comments
        totalShares   += post.metrics.shares
        totalReach    += post.metrics.reach
      }
    }

    // Build daily series — one entry per day, sum metrics for posts published that day
    const days = eachDayOfInterval({ start: since, end: new Date() })
    const dailyMap = new Map<string, { likes: number; comments: number; shares: number; reach: number }>()

    for (const day of days) {
      dailyMap.set(format(day, 'MMM d'), { likes: 0, comments: 0, shares: 0, reach: 0 })
    }

    for (const post of posts) {
      if (!post.publishedAt || !post.metrics) continue
      const key = format(post.publishedAt, 'MMM d')
      const entry = dailyMap.get(key)
      if (entry) {
        entry.likes    += post.metrics.likes
        entry.comments += post.metrics.comments
        entry.shares   += post.metrics.shares
        entry.reach    += post.metrics.reach
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

    // Top posts by reach
    const topPosts = posts
      .filter(p => p.metrics)
      .sort((a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0))
      .slice(0, 5)
      .map(p => ({
        id:        p.id,
        content:   p.content.slice(0, 120),
        platform:  p.socialAccount.platform,
        reach:     p.metrics?.reach ?? 0,
        likes:     p.metrics?.likes ?? 0,
        comments:  p.metrics?.comments ?? 0,
        publishedAt: p.publishedAt,
      }))

    return NextResponse.json({
      summary: {
        postsPublished: posts.length,
        totalReach,
        totalLikes,
        totalComments,
        totalShares,
        commentResponseRate: commentCount > 0 ? Math.round((respondedCount / commentCount) * 100) : 0,
        inboxPending: commentCount - respondedCount,
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
