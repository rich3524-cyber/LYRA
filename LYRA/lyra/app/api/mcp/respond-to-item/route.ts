import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBody, ValidationError } from '@/lib/validate'
import { generateCommentResponse, checkGuardrailViolation } from '@/services/ai/response-generator'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'

export const dynamic = 'force-dynamic'

const respondSchema = z.object({
  commentId:    z.string().min(1),
  responseText: z.string().min(1).optional(),
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
    if (comment.status === 'RESPONDED') {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    const workspace = comment.socialAccount.workspace

    let finalText = responseText?.trim()
    if (!finalText) {
      const [brandProfile, guardrails] = await Promise.all([
        prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
        prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
      ])
      const result = await generateCommentResponse(comment, brandProfile, guardrails)
      if (result.shouldEscalate) {
        await prisma.comment.update({
          where: { id: commentId },
          data: { status: 'ESCALATED', isEscalated: true, escalationReason: result.escalationReason },
        })
        return NextResponse.json({ sent: false, shouldEscalate: true, escalationReason: result.escalationReason })
      }
      finalText = result.response!
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

    // Re-check guardrails against whatever is actually about to be sent.
    // When finalText came from generateCommentResponse it was already
    // checked once inside that function, but re-checking here covers the
    // caller-supplied (responseText) path too, right before anything
    // reaches a real platform.
    const guardrails = await prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } })
    const violation = checkGuardrailViolation(finalText, guardrails)
    if (violation) {
      return NextResponse.json({ sent: false, refused: true, rule: violation.rule, value: violation.value })
    }

    const resolvesToZernio =
      comment.socialAccount.provider === 'ZERNIO' && comment.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !comment.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    await getProvider(comment.socialAccount).replyToComment(
      comment.socialAccount,
      comment.platformPostId ?? '',
      comment.platformCommentId,
      finalText
    )

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'RESPONDED', finalResponse: finalText, respondedAt: new Date() },
    })

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
