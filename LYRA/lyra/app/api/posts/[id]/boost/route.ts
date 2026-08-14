import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import {
  validateBoostRequest,
  checkBoostEligibility,
  createPostBoost,
  checkCancelEligibility,
  cancelPostBoost,
} from '@/services/posts/boost'

export const dynamic = 'force-dynamic'


type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()

    // This route spends real money via Meta's Ads API on success. The
    // per-post ACTIVE-boost check below stops a single post being boosted
    // twice, but nothing else stopped a compromised session looping this
    // across every published post in a workspace back-to-back.
    const { allowed } = await checkRateLimit(`boost-create:${user.id}`, 10, 300)
    if (!allowed) return rateLimitResponse()

    const { id: postId } = await params
    const body = await req.json() as {
      budget: number
      durationDays: number
      audience: 'followers' | 'followers_lookalike' | 'broad'
    }

    const validation = validateBoostRequest(body)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { budget, durationDays, audience } = validation

    // Fetch and authorize in one scoped query so there's never an unscoped
    // post object in scope that a future edit could act on before an access
    // check runs. The fallback lookup below only decides which error to
    // return -- it plays no role in authorizing the boost.
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
      include: {
        workspace: { select: { id: true, plan: true } },
        socialAccount: true,
      },
    })
    if (!post) {
      const exists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Post not found' }, { status: exists ? 403 : 404 })
    }

    const eligibility = checkBoostEligibility(post)
    if (!eligibility.eligible) {
      return NextResponse.json({ error: eligibility.error }, { status: eligibility.status })
    }

    // Call Meta — this may throw if the post is ineligible or ad account is suspended
    const boost = await createPostBoost({
      postId,
      platform: post.socialAccount.platform,
      platformPostId: post.platformPostId!,
      pageId: post.socialAccount.platformId,
      adAccountId: post.socialAccount.adAccountId!,
      encryptedAccessToken: post.socialAccount.accessToken!,
      budget,
      durationDays,
      audience,
    })

    return NextResponse.json(boost, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/posts/[id]/boost error:', error)
    return NextResponse.json({ error: 'This post could not be boosted. The platform may have rejected it.' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params

    // Fetch and authorize in one scoped query so there's never an unscoped
    // post object in scope that a future edit could act on before an access
    // check runs. The fallback lookup below only decides which error to
    // return -- it plays no role in authorizing the cancellation.
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
      include: {
        socialAccount: true,
        boost: true,
      },
    })
    if (!post) {
      const exists = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Post not found' }, { status: exists ? 403 : 404 })
    }

    const eligibility = checkCancelEligibility(post)
    if (!eligibility.eligible) {
      return NextResponse.json({ error: eligibility.error }, { status: eligibility.status })
    }

    // Delete campaign on Meta — if this fails, we return an error and leave status as ACTIVE
    const updated = await cancelPostBoost(post.boost!.id, post.boost!.adCampaignId, post.socialAccount.accessToken!)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/posts/[id]/boost error:', error)
    return NextResponse.json({ error: 'Failed to cancel boost. Try again in a moment.' }, { status: 500 })
  }
}
