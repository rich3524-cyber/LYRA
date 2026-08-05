import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { generateCommentResponse, checkGuardrailViolation, checkAlwaysEscalate } from '@/services/ai/response-generator'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'

export const dynamic = 'force-dynamic'

const respondSchema = z.object({
  commentId:    z.string().min(1),
  // Caller-supplied replacement for the AI-drafted text. Capped at 2000 chars
  // -- generous for any real platform's comment-reply limit, but bounded so
  // unbounded caller text can't reach a platform API or the DB unchecked.
  responseText: z.string().min(1).max(2000).optional(),
})

// Composes the existing draft (POST /api/ai/respond) and send
// (POST /api/comments/[id]/reply) logic with autonomy-mode gating neither
// of those two routes has: OFF/DRAFT_APPROVE stop at the draft, FULL
// proceeds to actually send -- driven entirely by the workspace's own
// aiResponseMode, never a parameter the caller supplies. Also re-checks
// guardrails against whatever text is about to be sent (whether freshly
// generated here or caller-supplied via responseText) before it reaches a
// real platform, since generateCommentResponse's own guardrail check only
// ever covers text IT generated.
export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    // This route makes the same generateCommentResponse/Claude call as
    // /api/ai/respond (rate-limited there at 20/60s per user) but is ALSO
    // reachable directly over a browser session -- requireAuth() falls back
    // to the session cookie when there's no bearer token, so this isn't only
    // hit via the MCP gateway. Without its own limit it would be an
    // unmetered alias for an already-metered endpoint.
    const { allowed } = await checkRateLimit(`mcp-respond:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { commentId, responseText } = await parseBody(req, respondSchema)

    // Fetch and authorize in one scoped query so there's never an unscoped
    // comment object in scope that a future edit could act on before an
    // access check runs, matching the pattern in both reference routes.
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        socialAccount: { workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } },
      },
      include: { socialAccount: { include: { workspace: true } } },
    })
    if (!comment) {
      const exists = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
      return NextResponse.json({ error: exists ? 'Forbidden' : 'Not found' }, { status: exists ? 403 : 404 })
    }
    // ESCALATED means a human must handle this (set by an ALWAYS_ESCALATE
    // guardrail -- refunds, legal threats, etc.); it must be refused here
    // exactly like RESPONDED, the same as this codebase's only other
    // autonomous-send path (workers/ai-responder.worker.ts) already does.
    if (comment.status === 'RESPONDED' || comment.status === 'ESCALATED') {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    // Authorization and autonomy both key off the account's real workspace
    // (comment.socialAccount.workspaceId / .workspace), not the denormalized
    // comment.workspaceId column -- this route's whole safety argument rests
    // on "the workspace's own guardrails gate the send," so guardrails and
    // brand profile are loaded from the same workspace reference throughout,
    // with no possibility of the two ever pointing at different workspaces.
    const workspaceId = comment.socialAccount.workspaceId
    const workspace   = comment.socialAccount.workspace

    // Single guardrail fetch, reused for: the pre-generation ALWAYS_ESCALATE
    // check below, generateCommentResponse's own internal checks, and the
    // send-path NEVER_USE_WORD/NEVER_DISCUSS re-check further down -- rather
    // than hitting the DB again for the same workspaceId on the same request.
    const guardrails = await prisma.guardrail.findMany({ where: { workspaceId } })

    // ALWAYS_ESCALATE is checked against the comment's own content BEFORE
    // either path below produces a response. generateCommentResponse also
    // has this check internally, but that only covers the AI-generation
    // path -- checking it here up front means the caller-supplied
    // responseText path can't skip it just because generateCommentResponse
    // was never called.
    const escalateTrigger = checkAlwaysEscalate(comment.content, guardrails)
    if (escalateTrigger) {
      const escalationReason = `Contains escalation trigger: "${escalateTrigger.trigger}"`
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'ESCALATED', isEscalated: true, escalationReason },
      })
      return NextResponse.json({ sent: false, shouldEscalate: true, escalationReason })
    }

    let finalText = responseText?.trim()
    if (!finalText) {
      const brandProfile = await prisma.brandProfile.findUnique({ where: { workspaceId } })
      const result = await generateCommentResponse(comment, brandProfile, guardrails)
      if (result.shouldEscalate) {
        await prisma.comment.update({
          where: { id: commentId },
          data: { status: 'ESCALATED', isEscalated: true, escalationReason: result.escalationReason },
        })
        return NextResponse.json({ sent: false, shouldEscalate: true, escalationReason: result.escalationReason })
      }
      // extractClaudeText can return '' (the model's reply wasn't a text
      // block), which generateCommentResponse doesn't itself treat as an
      // escalation -- without this check that empty string would sail
      // through as a "successful" draft/send.
      if (!result.response?.trim()) {
        return NextResponse.json({ error: 'Generated response was empty.' }, { status: 400 })
      }
      finalText = result.response
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'AI_DRAFTED', aiDraftResponse: finalText },
    })

    // The autonomy gate: only the workspace's own stored aiResponseMode can
    // authorize an actual send. The caller (an MCP tool call, eventually
    // LLM-driven) has no field in respondSchema that can influence this --
    // there is no "force send" parameter to smuggle past it.
    if (workspace.aiResponseMode !== 'FULL') {
      return NextResponse.json({ sent: false, draft: finalText })
    }

    // Re-check NEVER_USE_WORD/NEVER_DISCUSS guardrails against whatever is
    // actually about to be sent. When finalText came from
    // generateCommentResponse it was already checked once inside that
    // function, but re-checking here covers the caller-supplied
    // (responseText) path too, right before anything reaches a real platform.
    const violation = checkGuardrailViolation(finalText, guardrails)
    if (violation) {
      return NextResponse.json({ sent: false, refused: true, rule: violation.rule, value: violation.value })
    }

    const resolvesToZernio =
      comment.socialAccount.provider === 'ZERNIO' && comment.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !comment.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    // Atomic claim: this route can be driven by an LLM tool-call with its
    // own retry logic (unlike the human-click-once /api/comments/[id]/reply
    // route this is modeled on), and two concurrent calls for the same
    // commentId are a real possibility, not just a hypothetical. Claiming
    // straight to RESPONDED -- keyed on the comment still NOT being
    // RESPONDED/ESCALATED -- closes that race the same way
    // post-publisher.worker.ts's updateMany claim closes its own
    // SCHEDULED->PUBLISHING race: only one concurrent request can win this
    // write, so only one can proceed to actually call the provider below.
    // A losing request (count === 0) treats it as already handled, not a 500.
    const claimed = await prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data:  { status: 'RESPONDED', finalResponse: finalText, respondedAt: new Date() },
    })
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    try {
      await getProvider(comment.socialAccount).replyToComment(
        comment.socialAccount,
        comment.platformPostId ?? '',
        comment.platformCommentId,
        finalText
      )
    } catch (sendError) {
      // The claim above already flipped this comment to RESPONDED before we
      // knew whether the actual platform call would succeed. Roll it back to
      // AI_DRAFTED (preserving the draft so a retry doesn't need to
      // regenerate it) so a legitimate retry -- by the calling LLM tool, or
      // a human via the dashboard -- isn't permanently blocked by our own
      // claim. This accepts a narrow risk: a thrown error occasionally means
      // the platform actually received the request and only the response
      // was lost (e.g. a timeout after successful delivery), in which case a
      // retry could double-post. That's judged the lesser risk versus every
      // send failure leaving the comment permanently stuck as "RESPONDED"
      // with no real reply ever sent and no way to retry.
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'AI_DRAFTED', finalResponse: null, respondedAt: null },
      })
      if (sendError instanceof ProviderUnsupported) {
        return NextResponse.json({ error: sendError.message }, { status: 400 })
      }
      console.error('POST /api/mcp/respond-to-item send error:', sendError)
      // 502, not 500: an MCP client needs to be able to tell "failed before
      // any send attempt, safe to retry blindly" (500/400 elsewhere in this
      // route) apart from "the send itself failed, retry with more care"
      // (this branch) -- matching the same 502 the reference send route
      // (/api/comments/[id]/reply) already returns for send failures.
      return NextResponse.json({ error: 'Failed to send reply' }, { status: 502 })
    }

    return NextResponse.json({ sent: true, response: finalText })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof ProviderUnsupported) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/mcp/respond-to-item error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
