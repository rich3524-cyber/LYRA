import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PostStatus, type UserRole } from '@prisma/client'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkMediaCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'

export const dynamic = 'force-dynamic'

// Everyone except the read-only CLIENT_VIEW role can approve a post.
const APPROVER_ROLES: UserRole[] = ['PLATFORM_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'SMB_OWNER', 'CLIENT_APPROVE']

const patchPostSchema = z.object({
  content:     z.string().min(1).optional(),
  status:      z.nativeEnum(PostStatus).optional(),
  scheduledAt: z.string().nullish(),
  mediaUrls:   z.array(z.string()).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const { content, status, scheduledAt, mediaUrls } = await parseBody(req, patchPostSchema)

    // Verify the post belongs to a workspace the user has access to
    const existing = await prisma.post.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id } } },
      },
      select: { id: true, status: true, workspaceId: true, authorId: true, socialAccount: { select: { platform: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Same pre-flight check as POST /api/posts -- an "Edit in Composer" media
    // swap on an already-scheduled post could otherwise reintroduce a
    // known-broken platform/format combo (e.g. GIF -> Instagram) undetected.
    const effectiveStatus = status ?? existing.status
    if (mediaUrls !== undefined && effectiveStatus === 'SCHEDULED') {
      const issues = checkMediaCompatibility(mediaUrls, [existing.socialAccount.platform])
      if (issues.length > 0) {
        return NextResponse.json(
          { error: issues.map(formatCompatibilityIssue).join(' ') },
          { status: 422 }
        )
      }
    }

    // Approval requires a real reviewer, not just any member and not the post's own author
    if (status === 'APPROVED') {
      const access = await prisma.workspaceAccess.findFirst({
        where:  { workspaceId: existing.workspaceId, userId: user.id },
        select: { role: true },
      })
      if (!access || !APPROVER_ROLES.includes(access.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (user.id === existing.authorId) {
        return NextResponse.json({ error: 'Cannot approve your own post' }, { status: 403 })
      }
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
    if (error instanceof ValidationError) {
      console.error('PATCH /api/posts/[id] validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
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
