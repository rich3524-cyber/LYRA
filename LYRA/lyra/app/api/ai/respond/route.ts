import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Called when this route's own guarded write loses the race (see the two
// call sites below): the AI call finished, but a concurrent writer already
// resolved this comment while it was in flight, so the draft/escalation this
// request generated was never persisted anywhere. Silently returning success
// here would lie to the caller -- the UI (components/lyra/inbox/comment-card.tsx)
// would show "AI draft generated" for a draft nobody can act on, or fail to
// notice the comment has actually already moved to Escalated/Done. Instead
// of guessing which of RESPONDED/ESCALATED the concurrent writer landed on,
// re-reads the comment's real current status so the frontend can move the
// card in local state (via its onUpdate callback) to wherever it actually
// is, rather than leaving a stale Pending row that would just lose this same
// race again on retry.
async function alreadyResolvedResponse(commentId: string) {
  const current = await prisma.comment.findUnique({ where: { id: commentId }, select: { status: true } })
  return NextResponse.json(
    { error: 'Already responded.', alreadyResolved: true, status: current?.status ?? 'RESPONDED' },
    { status: 400 }
  )
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`ai-respond:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { commentId } = await req.json()

    // Fetch and authorize in one scoped query so there's never an unscoped
    // comment object in scope that a future edit could act on before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing anything downstream.
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        socialAccount: { workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } },
      },
    })
    if (!comment) {
      const exists = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    const [brandProfile, guardrails] = await Promise.all([
      prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
      prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
    ])

    const result = await generateCommentResponse(comment, brandProfile, guardrails)

    // This route's whole race window is generateCommentResponse above -- a
    // multi-second external Claude call sitting between the read at the top
    // of this function and the writes below, wider than any other writer in
    // this subsystem (every other writer's own window is a fast synchronous
    // DB operation). While that call is in flight, a completely independent
    // path -- workers/ai-responder.worker.ts, POST /api/mcp/respond-to-item
    // under FULL autonomy, or a human clicking the manual Reply button on
    // POST /api/comments/[id]/reply -- can claim and actually reply to this
    // exact comment, setting status to RESPONDED (or ESCALATED). This route
    // never itself sends anything, so there's no claim-before-external-call
    // pattern to apply here (that pattern exists specifically to protect an
    // irreversible send) -- it just must never silently clobber a status
    // another writer already set. Both writes below are guarded the same way
    // as the equivalent escalation/draft-only writes in
    // workers/ai-responder.worker.ts, keyed on `notIn: ['RESPONDED',
    // 'ESCALATED']`.
    if (result.shouldEscalate) {
      const escalated = await prisma.comment.updateMany({
        where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
        data: {
          status:           'ESCALATED',
          isEscalated:      true,
          escalationReason: result.escalationReason,
        },
      })
      if (escalated.count === 0) {
        return alreadyResolvedResponse(commentId)
      }
      return NextResponse.json({ shouldEscalate: true, escalationReason: result.escalationReason })
    }

    const drafted = await prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data: { status: 'AI_DRAFTED', aiDraftResponse: result.response },
    })
    if (drafted.count === 0) {
      return alreadyResolvedResponse(commentId)
    }

    return NextResponse.json({ response: result.response, shouldEscalate: false })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/ai/respond error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
