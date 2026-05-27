import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { createBoost, cancelBoost } from '@/services/social/meta-ads'

export const dynamic = 'force-dynamic'


type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params
    const body = await req.json() as {
      budget: number
      durationDays: number
      audience: 'followers' | 'followers_lookalike' | 'broad'
    }
    const { budget, durationDays, audience } = body

    const VALID_BUDGETS   = [1000, 2500, 5000, 10000]
    const VALID_DURATIONS = [3, 7, 14, 30]
    const VALID_AUDIENCES = ['followers', 'followers_lookalike', 'broad']

    if (!budget || !durationDays || !audience) {
      return NextResponse.json({ error: 'budget, durationDays, and audience required' }, { status: 400 })
    }
    if (!VALID_BUDGETS.includes(budget)) {
      return NextResponse.json({ error: 'Invalid budget. Choose $10, $25, $50, or $100.' }, { status: 400 })
    }
    if (!VALID_DURATIONS.includes(durationDays)) {
      return NextResponse.json({ error: 'Invalid duration. Choose 3, 7, 14, or 30 days.' }, { status: 400 })
    }
    if (!VALID_AUDIENCES.includes(audience)) {
      return NextResponse.json({ error: 'Invalid audience option.' }, { status: 400 })
    }

    // Fetch post and verify workspace access
    const post = await prisma.post.findFirst({
      where: { id: postId },
      include: {
        workspace: { select: { id: true, plan: true } },
        socialAccount: true,
      },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Plan gate — STARTER cannot boost
    if (post.workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Boosting requires Pro or Agency plan' }, { status: 403 })
    }

    // Post must be published with a platformPostId
    if (post.status !== 'PUBLISHED' || !post.platformPostId) {
      return NextResponse.json({ error: 'Post must be published to boost' }, { status: 400 })
    }

    // Platform must be Facebook or Instagram
    const platform = post.socialAccount.platform
    if (platform !== 'FACEBOOK' && platform !== 'INSTAGRAM') {
      return NextResponse.json({ error: 'Boosting is only available for Facebook and Instagram posts' }, { status: 400 })
    }

    // Must have an ad account configured
    if (!post.socialAccount.adAccountId) {
      return NextResponse.json({ error: 'No Facebook Ad Account connected. Connect one in Facebook Business Manager.' }, { status: 400 })
    }

    const accessToken = decrypt(post.socialAccount.accessToken)
    const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

    // Call Meta — this may throw if the post is ineligible or ad account is suspended
    const { adCampaignId, adSetId, adId } = await createBoost({
      pageId: post.socialAccount.platformId,
      platformPostId: post.platformPostId,
      adAccountId: post.socialAccount.adAccountId,
      accessToken,
      budget,
      durationDays,
      audience,
    })

    // Remove any existing ended/cancelled boost for this post before creating the new one
    await prisma.postBoost.deleteMany({
      where: {
        postId,
        status: { in: ['ENDED', 'CANCELLED', 'FAILED'] },
      },
    })

    const boost = await prisma.postBoost.create({
      data: {
        postId,
        platform,
        adCampaignId,
        adSetId,
        adId,
        budget,
        durationDays,
        audience,
        status: 'ACTIVE',
        endsAt,
      },
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

    const post = await prisma.post.findFirst({
      where: { id: postId },
      include: {
        socialAccount: true,
        boost: true,
      },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!post.boost || post.boost.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'No active boost to cancel' }, { status: 400 })
    }

    // Decrypt after confirming there is something to cancel
    const accessToken = decrypt(post.socialAccount.accessToken)

    // Delete campaign on Meta — if this fails, we return an error and leave status as ACTIVE
    await cancelBoost({ adCampaignId: post.boost.adCampaignId, accessToken })

    const updated = await prisma.postBoost.update({
      where: { id: post.boost.id },
      data: { status: 'CANCELLED' },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/posts/[id]/boost error:', error)
    return NextResponse.json({ error: 'Failed to cancel boost. Try again in a moment.' }, { status: 500 })
  }
}
