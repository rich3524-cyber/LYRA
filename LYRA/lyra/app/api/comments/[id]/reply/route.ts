import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'

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

    const resolvesToZernio =
      comment.socialAccount.provider === 'ZERNIO' && comment.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !comment.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    await getProvider(comment.socialAccount).replyToComment(
      comment.socialAccount,
      comment.platformPostId ?? '',
      comment.platformCommentId,
      response.trim()
    )

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
    if (error instanceof ProviderUnsupported) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/comments/[id]/reply error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send reply'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
