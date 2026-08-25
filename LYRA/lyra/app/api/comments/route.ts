import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [comments, reviews] = await Promise.all([
      prisma.comment.findMany({
        where:   { workspaceId },
        include: { socialAccount: { select: { platform: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    100,
      }),
      prisma.review.findMany({
        where:   { workspaceId },
        include: { socialAccount: { select: { platform: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    100,
      }).catch((err) => {
        console.error('Failed to fetch reviews for /api/comments (Review table may not exist yet):', err)
        return []
      }),
    ])

    // Known, accepted limitation: each query independently caps at 100 before
    // the merge, then the combined+sorted result caps at 100 again -- in a
    // workspace with >100 comments AND >100 reviews, the merge could
    // theoretically under-represent one type if the other dominates recent
    // activity. This is an inherited limitation (the existing `take: 100`
    // already had it for comments alone), not something to solve here -- a
    // genuinely correct combined-pagination approach is a bigger change than
    // this fix warrants.
    const merged = [
      ...comments.map((c) => ({ ...c, type: 'comment' as const })),
      ...reviews.map((r) => ({ ...r, type: 'review' as const })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100)

    return NextResponse.json(merged)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/comments error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
