import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CommentStatus } from '@prisma/client'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { getPlatformLabel } from '@/lib/platform-labels'

export const dynamic = 'force-dynamic'

// Every real status the schema defines, read off the generated Prisma enum
// rather than hand-copied -- so this check can never silently drift out of
// sync with prisma/schema.prisma's CommentStatus.
const VALID_STATUSES: readonly string[] = Object.values(CommentStatus)

// This is the backend for the Escalate and Ignore buttons in
// components/lyra/inbox/comment-card.tsx. It's also the last unguarded writer
// in the double-send bug this same-day fix closes across
// app/api/mcp/respond-to-item/route.ts, workers/ai-responder.worker.ts, and
// app/api/comments/[id]/reply/route.ts. Concrete exploit path this closes:
// workers/ai-responder.worker.ts, under FULL autonomy, claims and sends a
// real reply, marking a comment RESPONDED -- but the operator's browser still
// shows the card as Pending (stale local state, no live refresh). The
// operator clicks Escalate. An unguarded write here would clobber RESPONDED
// straight to ESCALATED with no check at all, moving the card to the
// Escalated tab. The operator then types a reply and clicks Send --
// POST /api/comments/[id]/reply's claim predicate (`status: { not:
// 'RESPONDED' }`, deliberately permissive for ESCALATED comments so a human
// can still clear them) now passes, because this route already moved the
// status away from RESPONDED -- and a SECOND real reply goes out to the same
// customer.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()

    // Fetch and authorize in one scoped query so there's never an unscoped
    // comment object in scope that a future edit could mutate before an
    // access check runs. The fallback lookup below only decides which error
    // to return -- it plays no role in authorizing the update.
    const comment = await prisma.comment.findFirst({
      where: {
        id,
        socialAccount: { workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } },
      },
    })
    if (!comment) {
      const exists = await prisma.comment.findUnique({ where: { id }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }

    // Reject an invalid status BEFORE it ever reaches the write below.
    // Previously any string in body.status was written straight to the DB
    // unchecked -- not just a malformed value, but potentially one that
    // re-arms an autonomous path. E.g. a caller setting status: 'PENDING' on
    // a comment that was legitimately RESPONDED would make
    // workers/ai-responder.worker.ts's and POST /api/mcp/respond-to-item's
    // own top-of-function status checks see it as untouched again, inviting a
    // second real reply through either of those paths.
    if ('status' in body && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }

    const allowed = ['status', 'aiDraftResponse', 'finalResponse', 'respondedAt', 'isEscalated', 'escalationReason'] as const
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    // Guarded updateMany, not the plain unconditional update this route used
    // to do -- see the exploit path documented above this function. Matches
    // POST /api/comments/[id]/reply's exact predicate (`status: { not:
    // 'RESPONDED' }`), NOT the `notIn: ['RESPONDED', 'ESCALATED']` variant
    // used by the autonomous send paths (app/api/mcp/respond-to-item/route.ts,
    // workers/ai-responder.worker.ts): this route is specifically how a human
    // moves a comment INTO the ESCALATED state in the first place, via the
    // Escalate button sending { status: 'ESCALATED', isEscalated: true }
    // through here, so excluding ESCALATED from the guard would break that
    // legitimate transition. The only state this route must never silently
    // overwrite is RESPONDED -- the same reasoning already established for
    // the reply route's identical predicate choice.
    const updated = await prisma.comment.updateMany({
      where: { id, status: { not: 'RESPONDED' } },
      data,
    })
    if (updated.count === 0) {
      // Unlike app/api/ai/respond/route.ts's alreadyResolvedResponse, no
      // follow-up read is needed to find out which status actually won: this
      // route's guard excludes only RESPONDED (not also ESCALATED), so a
      // count of 0 can only mean one thing -- the comment is currently
      // RESPONDED.
      return NextResponse.json(
        { error: 'Already responded.', alreadyResolved: true, status: 'RESPONDED' },
        { status: 400 }
      )
    }

    // A human just moved this comment into ESCALATED via the Escalate
    // button -- the same alert the AI's own autonomous escalation fires in
    // workers/ai-responder.worker.ts, so a teammate on Slack finds out
    // either way. Looked up separately from the response below, and
    // swallowed on failure, so a notification problem can never affect what
    // the Escalate button itself sees back -- notifyChannel is fail-open too
    // (see channel-notifier.ts), so this is belt and braces.
    if (data.status === 'ESCALATED') {
      try {
        const account = await prisma.socialAccount.findUnique({
          where:  { id: comment.socialAccountId },
          select: { platform: true, workspace: { select: { name: true } } },
        })
        if (account) {
          await notifyChannel(
            comment.workspaceId,
            {
              event:            'COMMENT_ESCALATED',
              workspaceName:    account.workspace.name,
              platform:         getPlatformLabel(account.platform),
              excerpt:          comment.content,
              authorName:       comment.authorName,
              escalationReason: typeof data.escalationReason === 'string' ? data.escalationReason : null,
            },
            // Same dedupe key the autonomous escalation path uses -- one
            // alert per comment reaching ESCALATED, regardless of which
            // path got it there first.
            { dedupeKey: `escalated-${id}` }
          )
        }
      } catch (err) {
        console.error(`Failed to notify channel for escalated comment ${id}:`, err)
      }
    }

    // updateMany doesn't return the written row the way update() did. No
    // follow-up read is needed to reconstruct it though: `data` above is
    // exactly what was just written -- the guarded updateMany either wrote
    // precisely this (updated.count > 0, handled here) or wrote nothing at
    // all (updated.count === 0, handled above) -- so merging it over the
    // already-fetched `comment` reproduces the same shape update() used to
    // return, without a second query.
    return NextResponse.json({ ...comment, ...data })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/comments/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
