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
  // Optional defense-in-depth check, not a primary auth gate -- this route's
  // real authorization already comes from the scoped comment.findFirst query
  // below. When the caller (the MCP gateway) supplies this, it's cross-checked
  // against the comment's own real workspace (comment.socialAccount.workspaceId)
  // so a caller can't claim workspace_id A while acting on a comment that
  // actually belongs to workspace B -- which would otherwise silently
  // misattribute the gateway's audit log/rate-limit accounting to the wrong
  // workspace even though the send itself still correctly targets B. Omitted
  // entirely by any other caller of this endpoint, which skips the check.
  workspaceId:  z.string().min(1).optional(),
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

    const { commentId, responseText, workspaceId: claimedWorkspaceId } = await parseBody(req, respondSchema)

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
    // Defense-in-depth, not this route's primary auth gate (that's the
    // scoped findFirst above): if the caller told us which workspace it
    // believes this comment belongs to, that claim must match the comment's
    // REAL workspace before anything else happens. Same status/shape as the
    // "no access" branch above so this can't be used to distinguish "wrong
    // workspace" from "no access to this comment at all." Checked before the
    // RESPONDED/ESCALATED status check and every write below it, since it's
    // an authorization concern, not a state concern.
    if (claimedWorkspaceId && claimedWorkspaceId !== comment.socialAccount.workspaceId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    // Echoed back on every response shape below (parent spec 6.2: every
    // write echoes workspace name, platform, and account handle so a
    // misresolution is visible immediately). All three are already loaded
    // via the `include` above -- no extra query needed.
    const echo = {
      workspaceName: workspace.name,
      platform: comment.socialAccount.platform,
      accountName: comment.socialAccount.name,
    }

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
      // Guarded the same way as every other status write in this route: a
      // concurrent request could have already claimed RESPONDED between the
      // top-of-function guard and this write. Without this predicate, this
      // write would silently clobber that RESPONDED status back to
      // ESCALATED -- corrupting a comment that may have already been
      // replied to for real. If that's what happened, this write correctly
      // no-ops and the caller gets the same "already responded" outcome as
      // every other claim loss in this route, not a false escalation report.
      const escalated = await prisma.comment.updateMany({
        where: { id: commentId, status: { notIn: ['RESPONDED'] } },
        data: { status: 'ESCALATED', isEscalated: true, escalationReason },
      })
      if (escalated.count === 0) {
        return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
      }
      return NextResponse.json({ sent: false, shouldEscalate: true, escalationReason, ...echo })
    }

    // A whitespace-only responseText (passes Zod's .min(1) but trims to '')
    // falls through to AI generation below rather than erroring -- accepted
    // as low severity: it never reaches a platform as whitespace, and a
    // caller that meant to supply real text gets a real draft/send back
    // instead of a hard failure. Revisit if callers report this as
    // surprising rather than convenient.
    let finalText = responseText?.trim()
    if (!finalText) {
      const brandProfile = await prisma.brandProfile.findUnique({ where: { workspaceId } })
      const result = await generateCommentResponse(comment, brandProfile, guardrails)
      if (result.shouldEscalate) {
        // Same guard as the ALWAYS_ESCALATE pre-check write above -- a
        // concurrent request could have claimed RESPONDED while this
        // request was mid-generation.
        const escalated = await prisma.comment.updateMany({
          where: { id: commentId, status: { notIn: ['RESPONDED'] } },
          data: { status: 'ESCALATED', isEscalated: true, escalationReason: result.escalationReason },
        })
        if (escalated.count === 0) {
          return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
        }
        return NextResponse.json({ sent: false, shouldEscalate: true, escalationReason: result.escalationReason, ...echo })
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

    // Guarded the same way as the send-path claim further down (same
    // notIn:['RESPONDED','ESCALATED'] predicate) -- NOT a plain unconditional
    // update. Without this predicate, a slower concurrent request could
    // still be sitting here, between its own RESPONDED/ESCALATED guard check
    // above and this write, when a faster concurrent request has already
    // claimed and sent (see the send-path claim's comment). An unconditional
    // write would silently clobber that faster request's RESPONDED status
    // back to AI_DRAFTED, which then matches the slower request's own
    // send-path claim predicate and lets it send a SECOND real reply -- the
    // exact double-send Fix 2 exists to prevent. Guarding this write closes
    // that: once a comment is RESPONDED/ESCALATED, every later write in this
    // request chain (including this one) becomes a no-op (count 0), not a
    // silent overwrite.
    const draftClaimed = await prisma.comment.updateMany({
      where: { id: commentId, status: { notIn: ['RESPONDED', 'ESCALATED'] } },
      data:  { status: 'AI_DRAFTED', aiDraftResponse: finalText },
    })
    if (draftClaimed.count === 0) {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    // The autonomy gate: only the workspace's own stored aiResponseMode can
    // authorize an actual send. The caller (an MCP tool call, eventually
    // LLM-driven) has no field in respondSchema that can influence this --
    // there is no "force send" parameter to smuggle past it.
    if (workspace.aiResponseMode !== 'FULL') {
      return NextResponse.json({ sent: false, draft: finalText, ...echo })
    }

    // Re-check NEVER_USE_WORD/NEVER_DISCUSS guardrails against whatever is
    // actually about to be sent. When finalText came from
    // generateCommentResponse it was already checked once inside that
    // function, but re-checking here covers the caller-supplied
    // (responseText) path too, right before anything reaches a real platform.
    const violation = checkGuardrailViolation(finalText, guardrails)
    if (violation) {
      return NextResponse.json({ sent: false, refused: true, rule: violation.rule, value: violation.value, ...echo })
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
      // with no real reply ever sent and no way to retry. For ZERNIO-routed
      // accounts, a retry that resends the EXACT SAME text (e.g. a client
      // retrying with the same cached draft) is deduped server-side by
      // Zernio's x-request-id layer (see services/social/provider/zernio.ts)
      // -- but a retry with different text (e.g. a fresh AI regeneration
      // after this very rollback) gets its own key and is NOT deduped, so
      // the risk above still fully applies whenever the retried text
      // differs from what was actually sent. Native-path accounts have no
      // dedup at all, regardless of text.
      //
      // Own-claim-scoped (status: 'RESPONDED'), not unconditional: only roll
      // back if the comment is still in the exact RESPONDED state this
      // request's own claim above just set. If a concurrent write changed
      // it in between, this correctly no-ops instead of silently
      // overwriting whatever that other state now is (e.g. a legitimate
      // concurrent ESCALATED write).
      await prisma.comment.updateMany({
        where: { id: commentId, status: 'RESPONDED' },
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

    return NextResponse.json({ sent: true, response: finalText, ...echo })
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
