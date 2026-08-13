import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'
import { rollbackCommentClaim } from '@/lib/comment-rollback'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Rolls a comment this request's own claim just set to RESPONDED back to a
// state a human can act on again, for the two cases where the claim won but
// the send itself didn't happen: the provider threw, or (not currently
// possible on this route, but kept for parity with the same helper shape in
// workers/ai-responder.worker.ts) some other pre-send failure.
//
// Restores ESCALATED rather than always downgrading to AI_DRAFTED when the
// comment was ESCALATED before this request's claim. Escalation is a
// deliberate signal -- set by an ALWAYS_ESCALATE guardrail, or a human
// clicking Escalate -- that the autonomous paths
// (workers/ai-responder.worker.ts, POST /api/mcp/respond-to-item) must not
// touch this comment. Downgrading to AI_DRAFTED on a failed manual send would
// silently re-arm both of those paths on a comment that was deliberately
// withheld from them, and would leave isEscalated/escalationReason set on a
// row whose status no longer says ESCALATED -- an inconsistent pair the UI's
// escalation banner (components/lyra/inbox/comment-card.tsx) derives from.
// Neither field is touched by this write either way, so they stay intact
// and back in sync once status is restored to ESCALATED.
//
// Wrapped in the same inline-retry pattern as workers/ai-responder.worker.ts's
// rollbackToDraft() (itself matching post-publisher.worker.ts's post-publish
// write) and for the identical reason: once the claim above has flipped the
// comment to RESPONDED, this write must not simply throw and propagate
// uncaught. An uncaught throw here escapes to this route's outer catch,
// which returns a generic 502 -- but leaves the comment permanently
// RESPONDED with nothing sent and no way to retry, since this route's own
// guard now answers every further attempt with "Already responded." Three
// attempts with brief backoff cover ordinary transient DB blips. If every
// attempt still fails there is genuinely nothing more this function can do
// beyond logging loudly -- same accepted residual risk as the worker's
// rollbackToDraft, not resolved here.
async function rollbackClaim(commentId: string, priorStatus: string, draftResponse: string): Promise<void> {
  const restoredStatus = priorStatus === 'ESCALATED' ? 'ESCALATED' : 'AI_DRAFTED'
  await rollbackCommentClaim(prisma.comment, commentId, draftResponse, restoredStatus)
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: commentId } = await params
    const { response } = await req.json().catch(() => ({})) as { response?: string }

    if (!response?.trim()) {
      return NextResponse.json({ error: 'Response text required' }, { status: 400 })
    }
    // Matches the cap the sibling MCP route (respond-to-item) already
    // enforces -- unbounded caller text was reaching a real public post and
    // the DB unchecked.
    if (response.length > 2000) {
      return NextResponse.json({ error: 'Response text must be 2000 characters or fewer' }, { status: 400 })
    }

    // Fetch and authorize in one scoped query so there's never an unscoped
    // comment object in scope that a future edit could act on before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing the reply.
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        socialAccount: { workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } },
      },
      include: { socialAccount: true },
    })
    if (!comment) {
      const exists = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Comment not found' }, { status: exists ? 403 : 404 })
    }

    // Deliberately does NOT also refuse ESCALATED here, unlike every other
    // send path in this codebase (workers/ai-responder.worker.ts,
    // app/api/mcp/respond-to-item/route.ts). This route is the human-facing
    // manual "Reply" button, and ESCALATED comments are specifically meant
    // to remain repliable by a human through it -- escalation only means the
    // *autonomous* paths declined to handle it (see the `isEscalated`
    // handling in components/lyra/inbox/comment-card.tsx: "Escalated
    // comments can still be replied to or ignored -- they were only kept out
    // of AI drafting because the AI itself declined, not because a human
    // can't act on them"). Excluding ESCALATED from the claim predicate
    // below would silently reintroduce that exact previously-fixed bug --
    // an escalated comment could never be cleared from the Inbox again
    // short of direct DB access.
    if (comment.status === 'RESPONDED') {
      // alreadyResolved/status match the shape app/api/ai/respond/route.ts's
      // alreadyResolvedResponse and app/api/comments/[id]/route.ts's guarded
      // PATCH already return, so the frontend (comment-card.tsx's handleSend)
      // can treat this identically to those: move the stale card straight to
      // the status it actually landed on instead of leaving it stuck showing
      // Pending, which would just lose this same race again on the next
      // click.
      return NextResponse.json({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' }, { status: 400 })
    }

    const resolvesToZernio =
      comment.socialAccount.provider === 'ZERNIO' && comment.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !comment.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    const finalResponse = response.trim()

    // Captured before the claim overwrites it -- the only record of what
    // status this comment needs to be restored to if the send fails and
    // rollbackClaim runs. See rollbackClaim's own comment for why ESCALATED
    // specifically must be restored rather than downgraded to AI_DRAFTED.
    const priorStatus = comment.status

    // Atomic claim, taken BEFORE calling the provider. This route (the
    // human-facing manual "Reply" button) used to check status, then send,
    // then write an UNGUARDED prisma.comment.update to RESPONDED at the very
    // end -- the exact same unguarded-write bug this whole fix exists to
    // close, just living in a different file. Concretely: a comment claimed
    // and actually sent by workers/ai-responder.worker.ts or
    // POST /api/mcp/respond-to-item could roll back to AI_DRAFTED on a lost
    // confirmation write, reappear in the Pending tab, and then get a SECOND
    // real reply from a human clicking Reply here -- and the old
    // unconditional write at the end would happily clobber whatever state
    // the row was in by then. Claiming straight to RESPONDED here, keyed on
    // the comment still NOT being RESPONDED, closes that: only one writer --
    // whichever gets here first, human or automated -- can win this write
    // and proceed to the actual send.
    //
    // Deliberately `notIn: ['RESPONDED']` only, NOT `['RESPONDED', 'ESCALATED']`
    // like the claim predicates in app/api/mcp/respond-to-item/route.ts and
    // workers/ai-responder.worker.ts -- see the ESCALATED comment above for
    // why this route must still be able to claim (and thus send from) an
    // ESCALATED comment. This is still race-safe: neither of those other two
    // paths ever acts on an ESCALATED comment (both refuse it outright), so
    // the only writers that can ever contend for this claim on an ESCALATED
    // comment are two concurrent invocations of this same manual route --
    // and the first one to win this write flips status to RESPONDED, which
    // correctly fails the second one's own claim attempt.
    const claimed = await prisma.comment.updateMany({
      where: { id: commentId, status: { not: 'RESPONDED' } },
      data:  { status: 'RESPONDED', finalResponse, respondedAt: new Date() },
    })
    if (claimed.count === 0) {
      // Same alreadyResolved/status shape as the pre-send check above -- this
      // claim's predicate is `status: { not: 'RESPONDED' }`, so a count of 0
      // can only mean the comment is currently RESPONDED.
      return NextResponse.json({ error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' }, { status: 400 })
    }

    try {
      await getProvider(comment.socialAccount).replyToComment(
        comment.socialAccount,
        comment.platformPostId ?? '',
        comment.platformCommentId,
        finalResponse
      )
    } catch (sendError) {
      // The claim above already flipped this comment to RESPONDED before we
      // knew whether the platform call would actually succeed. Roll it back
      // (preserving what the human typed as aiDraftResponse so they don't
      // have to retype it) so a legitimate retry isn't permanently blocked by
      // our own claim -- see rollbackClaim for the crash-safety and
      // ESCALATED-restoration reasoning. Same accepted risk as the
      // equivalent rollback in app/api/mcp/respond-to-item/route.ts and
      // workers/ai-responder.worker.ts: a thrown error occasionally means
      // the platform actually received the reply and only the confirmation
      // was lost (e.g. a timeout after successful delivery), in which case
      // this rollback is wrong and a retry -- by this same human, or an
      // automated path picking the comment back up -- could double-post.
      // That's judged the lesser risk versus every send failure leaving the
      // comment permanently stuck as "RESPONDED" with no real reply ever
      // sent and no way to retry.
      await rollbackClaim(commentId, priorStatus, finalResponse)
      if (sendError instanceof ProviderUnsupported) {
        return NextResponse.json({ error: sendError.message }, { status: 400 })
      }
      console.error('POST /api/comments/[id]/reply send error:', sendError)
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
    console.error('POST /api/comments/[id]/reply error:', error)
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 502 })
  }
}
