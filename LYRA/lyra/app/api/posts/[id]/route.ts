import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PostStatus } from '@prisma/client'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkMediaCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'
import { APPROVER_ROLES } from '@/lib/authz'
import { getPlatformLabel } from '@/lib/platform-labels'
import { notifyChannel } from '@/services/notifications/channel-notifier'

export const dynamic = 'force-dynamic'

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

    // Verify the post belongs to a workspace the user has write access to
    const existing = await prisma.post.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
      select: {
        id: true, status: true, workspaceId: true, authorId: true,
        content: true, mediaUrls: true, requiresMedia: true, scheduledAt: true,
        socialAccount: { select: { platform: true } },
        // name/author are read only by the POST_PENDING_APPROVAL notification below.
        workspace: { select: { clientAccessLevel: true, name: true } },
        author:    { select: { name: true } },
      },
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

    if (effectiveStatus === 'SCHEDULED' && existing.requiresMedia) {
      const effectiveMediaUrls = mediaUrls ?? existing.mediaUrls
      if (effectiveMediaUrls.length === 0) {
        return NextResponse.json(
          { error: 'This post is awaiting media. Attach an image or video before scheduling.' },
          { status: 422 }
        )
      }
    }

    // Approval requires a real reviewer, not just any member. Self-approval is
    // blocked UNLESS no other approver-capable member exists on the workspace --
    // otherwise a solo operator (e.g. SMB_OWNER) who turns on clientAccessLevel:
    // APPROVE before a genuine second reviewer is active would hit a permanent
    // deadlock, since whoever tries to approve is always the post's own author.
    if (status === 'APPROVED') {
      const access = await prisma.workspaceAccess.findFirst({
        where:  { workspaceId: existing.workspaceId, userId: user.id },
        select: { role: true },
      })
      if (!access || !APPROVER_ROLES.includes(access.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (user.id === existing.authorId) {
        const otherApprover = await prisma.workspaceAccess.findFirst({
          where: {
            workspaceId: existing.workspaceId,
            userId: { not: user.id },
            // Spread into a plain mutable array -- Prisma's generated
            // EnumUserRoleFilter.in expects UserRole[], and APPROVER_ROLES is
            // typed readonly UserRole[] (deliberately, see lib/authz.ts).
            role: { in: [...APPROVER_ROLES] },
          },
        })
        if (otherApprover) {
          return NextResponse.json({ error: 'Cannot approve your own post' }, { status: 403 })
        }
      }
    }

    // Same approval-routing rule as POST /api/posts (parent MCP spec 3.4). This
    // is the path the web app's UI actually uses most often for DRAFT ->
    // SCHEDULED (e.g. post-detail-panel.tsx's "Mark as scheduled" action), so
    // without it here a two-call POST-then-PATCH sequence could bypass the
    // approval gate the create-time fix alone put in place.
    //
    // An APPROVED post being scheduled is exempted from the redirect below --
    // that's the one legitimate route out of the approval flow, and without
    // the exemption no approved post could ever reach the publisher -- but
    // ONLY when its content/media haven't changed since approval. "Edit in
    // Composer" lets the post's own author change content on an APPROVED
    // post and re-save with status: 'SCHEDULED'; without the contentChanged
    // check that would publish unreviewed content under an approval a
    // reviewer gave to different content, bypassing the APPROVER_ROLES /
    // self-approval guard above (which only fires for status: 'APPROVED',
    // not 'SCHEDULED'). A content change forces re-review same as any other
    // non-approved post.
    //
    // A re-save of an already-SCHEDULED post (existing.status === 'SCHEDULED',
    // e.g. editing content/media via the Composer and saving again) is
    // deliberately still routed back to PENDING_APPROVAL here regardless of
    // contentChanged: it's already past the one-time APPROVED exemption, so
    // it should be reviewed again before it publishes.
    const contentChanged =
      (content !== undefined && content !== existing.content) ||
      (mediaUrls !== undefined && mediaUrls.join('\u0000') !== existing.mediaUrls.join('\u0000'))

    // Approving no longer leaves the post sitting in APPROVED waiting for a
    // separate "Schedule post" click. If media requirements are already
    // satisfied AND the post already has a scheduled time, the approval
    // itself is the last gate, so it goes straight to SCHEDULED. APPROVED
    // stays reachable only when the post still needs media or a scheduled
    // time -- attaching media or a time re-routes it back through
    // PENDING_APPROVAL for re-review (via the Composer, since editing
    // content/media sets contentChanged), and approving again is what
    // actually reaches SCHEDULED.
    const effectiveMediaUrls = mediaUrls ?? existing.mediaUrls
    const hasMediaIfRequired = !(existing.requiresMedia && effectiveMediaUrls.length === 0)
    const isApprovingReadyPost =
      status === 'APPROVED' && hasMediaIfRequired && existing.scheduledAt !== null

    const finalStatus: PostStatus | undefined = isApprovingReadyPost
      ? 'SCHEDULED'
      : status === 'SCHEDULED' &&
        existing.workspace.clientAccessLevel === 'APPROVE' &&
        !(existing.status === 'APPROVED' && !contentChanged)
        ? 'PENDING_APPROVAL'
        : status

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(content !== undefined && { content }),
        ...(status !== undefined && { status: finalStatus }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        ...(mediaUrls !== undefined && { mediaUrls }),
      },
      // Must match the shape GET /api/posts returns (CalendarPost): the
      // frontend swaps this response straight into calendar state as a
      // complete post rather than merging it, so a missing relation here
      // isn't just an unused field -- it's `post.socialAccount.platform`
      // throwing undefined on the very next render of that post's card.
      include: {
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost:         true,
      },
    })

    // Manage PostApproval record on approval-related status transitions.
    // Branches key off finalStatus (what was actually written), not the raw
    // requested status, so a SCHEDULED request redirected to PENDING_APPROVAL
    // above still gets a reviewable PostApproval record created.
    if (finalStatus === 'PENDING_APPROVAL') {
      // submittedAt starts the SLA clock for THIS pending cycle, and
      // slaAlertedAt is cleared so a resubmitted post can alert again. Neither
      // can key off createdAt: this row is upserted, so on a resubmit the
      // update branch runs and createdAt still holds the first ever submission.
      const submittedAt = new Date()
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'PENDING', submittedAt },
        update: { status: 'PENDING', reviewedAt: null, reviewerId: null, submittedAt, slaAlertedAt: null },
      })

      // Fire-and-forget by design -- notifyChannel never throws, and an alert
      // problem must not fail a real approval submission.
      await notifyChannel(
        existing.workspaceId,
        {
          event:         'POST_PENDING_APPROVAL',
          workspaceName: existing.workspace.name,
          platform:      getPlatformLabel(existing.socialAccount.platform),
          excerpt:       content ?? existing.content,
          scheduledAt:   scheduledAt !== undefined
            ? (scheduledAt ? new Date(scheduledAt) : null)
            : existing.scheduledAt,
          authorName:    existing.author?.name ?? null,
        },
        // Keyed on the submission instant, so a resubmit is a genuinely new
        // alert while a double-click on Submit is not.
        { dedupeKey: `pending-${id}-${submittedAt.getTime()}` }
      )
    } else if (status === 'APPROVED') {
      // An approval decision happened, regardless of whether the post landed
      // on APPROVED (still awaiting media) or jumped straight to SCHEDULED.
      await prisma.postApproval.upsert({
        where:  { postId: id },
        create: { postId: id, status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
        update: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
      })
    } else if (finalStatus === 'DRAFT' && existing.status === 'PENDING_APPROVAL') {
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
        workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // PostApproval and PostMetrics don't cascade at the DB level (same gap
    // documented in app/api/account/route.ts's bulk-delete transaction), so
    // deleting the post directly throws a foreign-key-violation error for any
    // post that's ever been through approval (has a PostApproval row) or had
    // metrics synced -- which surfaces to the user as a generic "Failed to
    // delete post". Comments are detached (postId set to null) rather than
    // deleted -- they represent real platform engagement history that should
    // outlive the internal post record, unlike PostApproval/PostMetrics,
    // which are pure metadata about the post itself. PostBoost already
    // cascades at the DB level, so it needs no explicit handling here.
    await prisma.$transaction([
      prisma.comment.updateMany({ where: { postId: id }, data: { postId: null } }),
      prisma.postApproval.deleteMany({ where: { postId: id } }),
      prisma.postMetrics.deleteMany({ where: { postId: id } }),
      prisma.post.delete({ where: { id } }),
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/posts/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
