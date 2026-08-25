import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CommentStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Mirrors app/api/comments/[id]/route.ts's PATCH handler (the backend for
// Escalate/Ignore-style status updates) exactly, substituted for Review --
// Review reuses the Comment status enum (see the model comment in
// prisma/schema.prisma), so the same VALID_STATUSES whitelist and the same
// guarded-updateMany-excluding-RESPONDED write pattern both apply unchanged.
//
// Deliberately does NOT send a Slack notification on a transition into
// ESCALATED, unlike the comment route's identical PATCH. There is no
// REVIEW_ESCALATED entry in services/notifications/events.ts's canonical
// event catalogue yet (see workers/ai-review-responder.worker.ts's own
// escalation branch for the identical gap and reasoning) -- reusing
// COMMENT_ESCALATED's message text, which says "comment" explicitly in
// services/notifications/message.ts, would mislabel a review alert. Adding a
// genuine REVIEW_ESCALATED event (events.ts, message.ts, the Settings toggle
// list, slack-formatter) is a larger, separate change out of scope here --
// a known, noted gap rather than a silent omission.
const VALID_STATUSES: readonly string[] = Object.values(CommentStatus)

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    // Fetch and authorize in one scoped query so there's never an unscoped
    // review object in scope that a future edit could mutate before an
    // access check runs. Review has a direct `workspace` relation (unlike
    // Comment, only reachable via `socialAccount.workspace`), so this joins
    // through `workspace` directly. The fallback lookup below only decides
    // which error to return -- it plays no role in authorizing the update.
    const review = await prisma.review.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
    })
    if (!review) {
      const exists = await prisma.review.findUnique({ where: { id }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    // Reject an invalid status BEFORE it ever reaches the write below --
    // same reasoning as app/api/comments/[id]/route.ts's identical check: a
    // caller setting status: 'PENDING' on a review that was legitimately
    // RESPONDED would re-arm workers/ai-review-responder.worker.ts's own
    // top-of-function status check, inviting a second real reply.
    if ('status' in body && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }

    const allowed = ['status', 'aiDraftResponse', 'finalResponse', 'respondedAt', 'isEscalated', 'escalationReason'] as const
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    // Guarded updateMany, not a plain unconditional update -- matches
    // app/api/reviews/[id]/reply/route.ts's exact predicate (`status: { not:
    // 'RESPONDED' }`), NOT the `notIn: ['RESPONDED', 'ESCALATED']` variant
    // used by the autonomous send path
    // (workers/ai-review-responder.worker.ts): this route is specifically
    // how a human moves a review INTO the ESCALATED state in the first
    // place, so excluding ESCALATED from the guard would break that
    // legitimate transition. The only state this route must never silently
    // overwrite is RESPONDED.
    const updated = await prisma.review.updateMany({
      where: { id, status: { not: 'RESPONDED' } },
      data,
    })
    if (updated.count === 0) {
      // Unlike app/api/ai/respond-review/route.ts's alreadyResolvedResponse,
      // no follow-up read is needed: this route's guard excludes only
      // RESPONDED, so a count of 0 can only mean the review is currently
      // RESPONDED.
      return NextResponse.json(
        { error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' },
        { status: 400 }
      )
    }

    // updateMany doesn't return the written row. No follow-up read is
    // needed though -- `data` above is exactly what was just written, so
    // merging it over the already-fetched `review` reproduces the same
    // shape without a second query.
    return NextResponse.json({ ...review, ...data })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/reviews/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
