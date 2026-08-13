// services/posts/post-lifecycle.ts
//
// Pure, framework-agnostic post-lifecycle decisions -- the single owner of
// logic previously duplicated across app/api/posts/[id]/route.ts (PATCH),
// app/api/posts/route.ts (POST), app/api/workspaces/[id]/bulk-import/commit/route.ts,
// and components/lyra/calendar/post-detail-panel.tsx's getNextStatuses. See
// docs/superpowers/specs/2026-08-14-post-lifecycle-extraction-design.md.
//
// Every export here is a pure function -- no I/O, no Prisma runtime import
// (only type-only imports, which erase at compile time) -- so this file is
// safe to import from a 'use client' component with zero risk of pulling
// @prisma/client's runtime into a browser bundle.
import type { PostStatus, ClientAccess } from '@prisma/client'

export function resolveCreateStatus(
  requestedStatus: PostStatus,
  clientAccessLevel: ClientAccess
): PostStatus {
  return requestedStatus === 'SCHEDULED' && clientAccessLevel === 'APPROVE'
    ? 'PENDING_APPROVAL'
    : requestedStatus
}

export function canSelfApprove(input: { isAuthor: boolean; hasOtherApprover: boolean }): boolean {
  return !input.isAuthor || !input.hasOtherApprover
}

export interface ResolveApprovalTransitionInput {
  requestedStatus: PostStatus | undefined
  existingStatus: PostStatus
  clientAccessLevel: ClientAccess
  contentChanged: boolean
  hasMediaIfRequired: boolean
  hasScheduledAt: boolean
}

export function resolveApprovalTransition(input: ResolveApprovalTransitionInput): PostStatus | undefined {
  const {
    requestedStatus, existingStatus, clientAccessLevel,
    contentChanged, hasMediaIfRequired, hasScheduledAt,
  } = input

  // Approving no longer leaves the post sitting in APPROVED waiting for a
  // separate "Schedule post" click -- if media/schedule requirements are
  // already satisfied, the approval itself is the last gate.
  const isApprovingReadyPost =
    requestedStatus === 'APPROVED' && hasMediaIfRequired && hasScheduledAt
  if (isApprovingReadyPost) return 'SCHEDULED'

  // A SCHEDULED request under an approval workflow is redirected to
  // PENDING_APPROVAL, EXCEPT for the one legitimate route out of the
  // approval flow: an already-APPROVED post whose content hasn't changed
  // since approval. A content change forces re-review same as any other
  // non-approved post -- see the bypass-fix test above.
  const needsReview =
    requestedStatus === 'SCHEDULED' &&
    clientAccessLevel === 'APPROVE' &&
    !(existingStatus === 'APPROVED' && !contentChanged)
  if (needsReview) return 'PENDING_APPROVAL'

  return requestedStatus
}
