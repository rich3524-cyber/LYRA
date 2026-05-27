import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { replyToComment } from '@/services/social/facebook'

export const dynamic = 'force-dynamic'


type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: commentId } = await params
    const { response } = await req.json() as { response: string }

    if (!response?.trim()) {
      return NextResponse.json({ error: 'Response text required' }, { status: 400 })
    }

    const comment = await prisma.comment.findUnique({
      where:   { id: commentId },
      include: { socialAccount: true },
    })
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: comment.workspaceId, userId: user.id },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (comment.status === 'RESPONDED') {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    const platform = comment.socialAccount.platform
    if (platform !== 'FACEBOOK' && platform !== 'INSTAGRAM') {
      return NextResponse.json(
        { error: 'Platform not supported for live replies.' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(comment.socialAccount.accessToken)
    await replyToComment(comment.platformCommentId, response.trim(), accessToken)

    await prisma.comment.update({
      where: { id: commentId },
      data:  {
        status:        'RESPONDED',
        finalResponse: response.trim(),
        respondedAt:   new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/comments/[id]/reply error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send reply'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
