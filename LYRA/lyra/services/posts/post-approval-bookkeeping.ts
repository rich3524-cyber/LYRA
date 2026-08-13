// services/posts/post-approval-bookkeeping.ts
//
// Server-only. Owns the PostApproval record read/write shapes previously
// duplicated across app/api/posts/[id]/route.ts (PATCH), app/api/posts/route.ts
// (POST), and app/api/workspaces/[id]/bulk-import/commit/route.ts -- the
// duplication that caused the same missing-approval-row bug to be fixed twice
// independently. See docs/superpowers/specs/2026-08-14-post-lifecycle-extraction-design.md.
//
// Deliberately NOT in post-lifecycle.ts: ApprovalStatus is a runtime import
// from @prisma/client (not type-only), and this module calls prisma directly
// -- bundling either into a 'use client' component would be a real risk this
// split avoids entirely.
import { ApprovalStatus, type PostStatus, type Platform } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notifyChannel } from '@/services/notifications/channel-notifier'
import { getPlatformLabel } from '@/lib/platform-labels'

export function buildApprovalCreateInput(finalStatus: PostStatus, submittedAt: Date) {
  return finalStatus === 'PENDING_APPROVAL'
    ? { approval: { create: { status: ApprovalStatus.PENDING, submittedAt } } }
    : {}
}

export interface UpsertApprovalOnTransitionInput {
  postId: string
  finalStatus: PostStatus | undefined
  requestedStatus: PostStatus | undefined
  existingStatus: PostStatus
  reviewerId: string
  workspaceId: string
  workspaceName: string
  platform: Platform
  excerpt: string
  scheduledAt: Date | null
  authorName: string | null
}

export async function upsertApprovalOnTransition(input: UpsertApprovalOnTransitionInput): Promise<void> {
  const {
    postId, finalStatus, requestedStatus, existingStatus, reviewerId,
    workspaceId, workspaceName, platform, excerpt, scheduledAt, authorName,
  } = input

  // Branches key off finalStatus (what was actually written) for the
  // PENDING_APPROVAL/DRAFT cases, matching the route's own comment: a
  // SCHEDULED request redirected to PENDING_APPROVAL still needs a reviewable
  // PostApproval record.
  if (finalStatus === 'PENDING_APPROVAL') {
    // submittedAt starts the SLA clock for THIS pending cycle, and
    // slaAlertedAt is cleared so a resubmitted post can alert again. Neither
    // can key off createdAt: this row is upserted, so on a resubmit the
    // update branch runs and createdAt still holds the first ever submission.
    const submittedAt = new Date()
    await prisma.postApproval.upsert({
      where:  { postId },
      create: { postId, status: 'PENDING', submittedAt },
      update: { status: 'PENDING', reviewedAt: null, reviewerId: null, submittedAt, slaAlertedAt: null },
    })

    // Fire-and-forget by design -- notifyChannel never throws, and an alert
    // problem must not fail a real approval submission.
    await notifyChannel(
      workspaceId,
      {
        event: 'POST_PENDING_APPROVAL',
        workspaceName,
        platform: getPlatformLabel(platform),
        excerpt,
        scheduledAt,
        authorName,
      },
      // Keyed on the submission instant, so a resubmit is a genuinely new
      // alert while a double-click on Submit is not.
      { dedupeKey: `pending-${postId}-${submittedAt.getTime()}` }
    )
  } else if (requestedStatus === 'APPROVED') {
    // An approval decision happened, regardless of whether the post landed
    // on APPROVED (still awaiting media) or jumped straight to SCHEDULED --
    // checks the RAW requested status, not finalStatus, deliberately.
    await prisma.postApproval.upsert({
      where:  { postId },
      create: { postId, status: 'APPROVED', reviewerId, reviewedAt: new Date() },
      update: { status: 'APPROVED', reviewerId, reviewedAt: new Date() },
    })
  } else if (finalStatus === 'DRAFT' && existingStatus === 'PENDING_APPROVAL') {
    await prisma.postApproval.upsert({
      where:  { postId },
      create: { postId, status: 'REJECTED', reviewedAt: new Date() },
      update: { status: 'REJECTED', reviewedAt: new Date() },
    })
  }
}
