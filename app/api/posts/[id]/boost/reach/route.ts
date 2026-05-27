import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { getBoostReach } from '@/services/social/meta-ads'

export const dynamic = 'force-dynamic'


type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params

    const post = await prisma.post.findFirst({
      where: { id: postId },
      include: { socialAccount: true, boost: true },
    })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!post.boost || post.boost.status !== 'ACTIVE') {
      return NextResponse.json({ reached: 0 })
    }

    const accessToken = decrypt(post.socialAccount.accessToken)
    const reached = await getBoostReach({ adCampaignId: post.boost.adCampaignId, accessToken })
    return NextResponse.json({ reached })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/posts/[id]/boost/reach error:', error)
    return NextResponse.json({ error: 'reach_unavailable' }, { status: 502 })
  }
}
