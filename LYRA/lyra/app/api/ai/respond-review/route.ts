import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateReviewResponse } from '@/services/ai/response-generator'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Mirrors app/api/ai/respond/route.ts exactly, substituting Review/
// generateReviewResponse for Comment/generateCommentResponse -- see that
// file's own comments for the full reasoning behind every guard below, which
// applies identically here. The one structural difference: Review has a
// direct `workspaceId` field (and a direct `workspace` relation), unlike
// Comment which is only reachable via `socialAccount.workspace`, so the
// authorization scoping below joins through `workspace` directly rather than
// through `socialAccount.workspace`.

// Called when this route's own guarded write loses the race (see the two
// call sites below) -- see alreadyResolvedResponse in
// app/api/ai/respond/route.ts for the full reasoning.
async function alreadyResolvedResponse(reviewId: string) {
  const current = await prisma.review.findUnique({ where: { id: reviewId }, select: { status: true } })
  return NextResponse.json(
    { error: 'Already responded.', alreadyResolved: true, status: current?.status ?? 'RESPONDED' },
    { status: 400 }
  )
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`ai-respond-review:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { reviewId } = await req.json()

    // Fetch and authorize in one scoped query so there's never an unscoped
    // review object in scope that a future edit could act on before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing anything downstream.
    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
    })
    if (!review) {
      const exists = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    // Cheap early exit on an already-terminal review, matching the sibling
    // send paths (workers/ai-review-responder.worker.ts and
    // app/api/reviews/[id]/reply/route.ts) -- avoids burning a full AI
    // generation call on a review that's already resolved.
    if (review.status === 'RESPONDED' || review.status === 'ESCALATED') {
      return NextResponse.json(
        { error: 'Already responded.', alreadyResolved: true, status: review.status },
        { status: 400 }
      )
    }

    const [brandProfile, guardrails] = await Promise.all([
      prisma.brandProfile.findUnique({ where: { workspaceId: review.workspaceId } }),
      prisma.guardrail.findMany({ where: { workspaceId: review.workspaceId } }),
    ])

    const result = await generateReviewResponse(review, brandProfile, guardrails)

    // This route's whole race window is generateReviewResponse above -- a
    // multi-second external Claude call sitting between the read at the top
    // of this function and the writes below. While that call is in flight, a
    // completely independent path -- workers/ai-review-responder.worker.ts,
    // or a human clicking the manual Reply button on
    // POST /api/reviews/[id]/reply -- can claim and actually reply to this
    // exact review, setting status to RESPONDED (or ESCALATED). Both writes
    // below are guarded the same way as the equivalent escalation/draft-only
    // writes in workers/ai-review-responder.worker.ts, keyed on
    // `notIn: ['RESPONDED', 'ESCALATED']`.
    if (result.shouldEscalate) {
      const escalated = await prisma.review.updateMany({
        where: { id: reviewId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
        data: {
          status:           'ESCALATED',
          isEscalated:      true,
          escalationReason: result.escalationReason,
          sentiment:        result.sentiment,
        },
      })
      if (escalated.count === 0) {
        return alreadyResolvedResponse(reviewId)
      }
      return NextResponse.json({ shouldEscalate: true, escalationReason: result.escalationReason })
    }

    const drafted = await prisma.review.updateMany({
      where: { id: reviewId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: result.response, sentiment: result.sentiment },
    })
    if (drafted.count === 0) {
      return alreadyResolvedResponse(reviewId)
    }

    return NextResponse.json({ response: result.response, shouldEscalate: false })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/ai/respond-review error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
