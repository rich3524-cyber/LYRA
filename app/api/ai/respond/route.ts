import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'

export const dynamic = 'force-dynamic'


export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { commentId } = await req.json()

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Verify caller has access to the workspace
    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId: comment.workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [brandProfile, guardrails] = await Promise.all([
      prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
      prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
    ])

    const result = await generateCommentResponse(comment, brandProfile, guardrails)

    if (result.shouldEscalate) {
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          status:           'ESCALATED',
          isEscalated:      true,
          escalationReason: result.escalationReason,
        },
      })
      return NextResponse.json({ shouldEscalate: true, escalationReason: result.escalationReason })
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { status: 'AI_DRAFTED', aiDraftResponse: result.response },
    })

    return NextResponse.json({ response: result.response, shouldEscalate: false })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/ai/respond error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
