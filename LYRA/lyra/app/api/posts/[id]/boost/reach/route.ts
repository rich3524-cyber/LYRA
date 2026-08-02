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

    // Fetch and authorize in one scoped query so there's never an unscoped
    // post object in scope that a future edit could read before an access
    // check runs. The fallback lookup below only decides which error to
    // return -- it plays no role in authorizing the read. This route's
    // policy is membership-only (no canWrite role gate), same as before.
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { access: { some: { userId: user.id } } },
      },
      include: { socialAccount: true, boost: true },
    })
    if (!post) {
      const exists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Post not found' }, { status: exists ? 403 : 404 })
    }

    if (!post.boost || post.boost.status !== 'ACTIVE') {
      return NextResponse.json({ reached: 0 })
    }

    if (!post.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
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
