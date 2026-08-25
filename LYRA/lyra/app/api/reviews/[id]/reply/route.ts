import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'
import { rollbackCommentClaim } from '@/lib/comment-rollback'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Mirrors app/api/comments/[id]/reply/route.ts exactly, substituting Review
// for Comment and replyToReview's 3-arg (account, externalId, text)
// signature for replyToComment's 4-arg
// (account, postExternalId, externalId, text) one -- reviews have no
// platformPostId concept, so there's no postExternalId to pass. See that
// file's own comments for the full race-condition/rollback reasoning, which
// applies identically here.

// Rolls a review this request's own claim just set to RESPONDED back to a
// state a human can act on again -- see the identical helper in
// app/api/comments/[id]/reply/route.ts for the full reasoning (including why
// ESCALATED is restored rather than always downgraded to AI_DRAFTED).
// Delegates to the same shared, crash-safe rollbackCommentClaim
// implementation used by every other claim-rollback site in this codebase.
async function rollbackClaim(reviewId: string, priorStatus: string, draftResponse: string): Promise<void> {
  const restoredStatus = priorStatus === 'ESCALATED' ? 'ESCALATED' : 'AI_DRAFTED'
  await rollbackCommentClaim(prisma.review, reviewId, draftResponse, restoredStatus, 'Review')
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: reviewId } = await params
    const { response } = await req.json().catch(() => ({})) as { response?: string }

    if (!response?.trim()) {
      return NextResponse.json({ error: 'Response text required' }, { status: 400 })
    }
    // Matches the cap app/api/comments/[id]/reply/route.ts already enforces.
    if (response.length > 2000) {
      return NextResponse.json({ error: 'Response text must be 2000 characters or fewer' }, { status: 400 })
    }

    // Fetch and authorize in one scoped query so there's never an unscoped
    // review object in scope that a future edit could act on before an
    // access check runs. Review has a direct `workspace` relation (unlike
    // Comment, which is only reachable via `socialAccount.workspace`), so
    // this joins through `workspace` directly. The fallback lookup below
    // only decides which error to return -- it plays no role in authorizing
    // the reply.
    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
      include: { socialAccount: true },
    })
    if (!review) {
      const exists = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Review not found' }, { status: exists ? 403 : 404 })
    }

    // Deliberately does NOT also refuse ESCALATED here, unlike
    // workers/ai-review-responder.worker.ts -- this route is the
    // human-facing manual "Reply" button, and ESCALATED reviews are
    // specifically meant to remain repliable by a human through it. See the
    // identical reasoning in app/api/comments/[id]/reply/route.ts.
    if (review.status === 'RESPONDED') {
      return NextResponse.json({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' }, { status: 400 })
    }

    const resolvesToZernio =
      review.socialAccount.provider === 'ZERNIO' && review.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !review.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    const finalResponse = response.trim()

    // Captured before the claim overwrites it -- the only record of what
    // status this review needs to be restored to if the send fails.
    const priorStatus = review.status

    // Atomic claim, taken BEFORE calling the provider -- same reasoning as
    // app/api/comments/[id]/reply/route.ts's identical claim. Deliberately
    // `notIn: ['RESPONDED']` only (not also excluding ESCALATED) -- see that
    // route's own comment on its equivalent claim predicate for why.
    const claimed = await prisma.review.updateMany({
      where: { id: reviewId, status: { not: 'RESPONDED' } },
      data:  { status: 'RESPONDED', finalResponse, respondedAt: new Date() },
    })
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' }, { status: 400 })
    }

    try {
      // 3-arg replyToReview(account, externalId, text) -- NOT
      // replyToComment's 4-arg shape. review.zernioReviewId is the
      // provider's review id (see services/social/provider/types.ts's
      // NormalizedReview.externalId comment).
      await getProvider(review.socialAccount).replyToReview(
        review.socialAccount,
        review.zernioReviewId,
        finalResponse
      )
    } catch (sendError) {
      // Same accepted risk as app/api/comments/[id]/reply/route.ts's
      // identical catch: a thrown error occasionally means the platform
      // actually received the reply and only the confirmation was lost, in
      // which case this rollback is wrong and a retry could double-post --
      // judged the lesser risk versus a review permanently stuck "RESPONDED"
      // with no real reply ever sent and no way to retry.
      await rollbackClaim(reviewId, priorStatus, finalResponse)
      if (sendError instanceof ProviderUnsupported) {
        return NextResponse.json({ error: sendError.message }, { status: 400 })
      }
      console.error('POST /api/reviews/[id]/reply send error:', sendError)
      return NextResponse.json({ error: 'Failed to send reply' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ProviderUnsupported) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/reviews/[id]/reply error:', error)
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 502 })
  }
}
