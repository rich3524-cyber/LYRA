import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()
    const { content, status, scheduledAt, mediaUrls } = body

    // Verify the post belongs to a workspace the user has access to
    const existing = await prisma.post.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id } } },
      },
      select: { id: true, status: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(content !== undefined && { content }),
        ...(status !== undefined && { status }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        ...(mediaUrls !== undefined && { mediaUrls }),
      },
    })

    // Manage PostApproval record on approval-related status transitions
    if (status === 'PENDING_APPROVAL') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'PENDING' },
        update: { status: 'PENDING', reviewedAt: null, reviewerId: null },
      })
    } else if (status === 'APPROVED') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
        update: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
      })
    } else if (status === 'DRAFT' && existing.status === 'PENDING_APPROVAL') {
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'REJECTED', reviewedAt: new Date() },
        update: { status: 'REJECTED', reviewedAt: new Date() },
      })
    }

    return NextResponse.json(post)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/posts/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const existing = await prisma.post.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id } } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    await prisma.post.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/posts/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
