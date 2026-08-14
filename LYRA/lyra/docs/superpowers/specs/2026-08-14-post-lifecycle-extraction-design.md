# Post-Lifecycle Extraction — Design Spec

**Status:** Approved by Richard 2026-08-14. Ready for implementation planning.

## Problem

The post approval/status-transition logic is independently implemented in 4 places, with no single owner. This is finding "Architecture C1" from the 2026-08-13 comprehensive review (`.full-review/05-final-report.md`), and it has already caused two real, independently-shipped bugs:

- The self-approval-deadlock fix (`docs/superpowers/specs/2026-08-07-self-approval-deadlock-design.md`) had to land in 2 separate files because the rule was duplicated.
- A missing-`PostApproval`-row bug was fixed once in `POST /api/posts`, then independently rediscovered and fixed a second time in the bulk-import route in a later session — the fix wasn't known to exist in the other file because there was no single place it lived.

### The 4 copies (verified against current code, 2026-08-14)

1. **`app/api/posts/[id]/route.ts:79-220`** (PATCH handler) — the canonical/most complete copy. Contains:
   - The `APPROVER_ROLES` role check (`lib/authz.ts`).
   - The conditional self-approval rule: self-approval is blocked *unless* no other approver-capable `WorkspaceAccess` row exists on the workspace (lines 74-101).
   - The `finalStatus` decision (lines 140-151): an `isApprovingReadyPost` shortcut straight to `SCHEDULED` when media/schedule requirements are already met, otherwise a `clientAccessLevel === 'APPROVE'` redirect from `SCHEDULED` to `PENDING_APPROVAL`, exempting an already-`APPROVED` post whose content hasn't changed since approval (`contentChanged`).
   - Three-branch `PostApproval` upsert bookkeeping keyed off `finalStatus`/`status` (lines 176-220): PENDING (with SLA-clock `submittedAt` and a `notifyChannel` alert), APPROVED (reviewer bookkeeping), REJECTED (on a PENDING_APPROVAL → DRAFT recall).

2. **`app/api/posts/route.ts:171-208`** (POST handler, create) — independently re-implements the same `clientAccessLevel === 'APPROVE'` → `PENDING_APPROVAL` routing rule at create time (`finalStatus`, lines 177-180), and independently creates the nested `PostApproval` record (lines 204-208). No role/self-approval logic — not applicable at creation time.

3. **`app/api/workspaces/[id]/bulk-import/commit/route.ts:166,180-184`** — a near-identical third copy of the same two things (routing rule + `PostApproval` create). Its own comment explicitly says this is the same gap as copy #2, independently rediscovered and re-fixed because copy #2's fix wasn't known about here.

4. **`components/lyra/calendar/post-detail-panel.tsx:33-115`** (`getNextStatuses`, exported) — the frontend mirror. Full `switch` over every status (DRAFT/PENDING_APPROVAL/APPROVED/SCHEDULED/FAILED/CANCELLED), imports the shared `APPROVER_ROLES` constant, and explicitly re-implements copy #1's self-approval conditional (own comments: "Mirrors the backend's conditional self-approval rule"). This is the second file the self-approval-deadlock fix had to land in.

### Known live drift (fixed as part of this work, see UX Decision below)

`getNextStatuses` offers "Mark as scheduled" from `DRAFT` unconditionally whenever `hasApprovalFlow` is true — alongside a separate "Submit for approval" button. But the backend (copy #1's `finalStatus` logic) silently reroutes that `SCHEDULED` request back to `PENDING_APPROVAL` server-side. The outcome is safe (backend enforcement is correct), but the button's label doesn't match what happens when it's clicked, and there's no indication to the user.

### Explicitly out of scope

The `SCHEDULED → PUBLISHING → PUBLISHED/FAILED` sub-machine (`app/api/posts/[id]/publish/route.ts` and `workers/post-publisher.worker.ts`) has its own, separate duplication — two independently hand-written atomic-claim (`updateMany` compare-and-swap) implementations. Richard confirmed (2026-08-14) this is out of scope for this pass: both copies are already individually correct, this is lower risk than the approval-logic duplication, and it can be a separate follow-up.

## Architecture

Two new files, split by purity — this split exists specifically so the pure decision logic can be safely imported into a `'use client'` component with zero risk of a server-only (Prisma) import leaking into the client bundle:

### `services/posts/post-lifecycle.ts` — pure, framework-agnostic

No runtime imports beyond type-only imports from `@prisma/client` (e.g. `import type { PostStatus, ClientAccessLevel } from '@prisma/client'` — type-only imports erase at compile time, so this doesn't pull the Prisma client runtime into a client bundle; `post-detail-panel.tsx` already does exactly this for the `Platform` type). Every export here is a pure function: same inputs always produce the same output, no I/O, no side effects. Safe to import from server routes, services, and client components alike.

**`resolveCreateStatus(requestedStatus: PostStatus, clientAccessLevel: ClientAccessLevel): PostStatus`**

Exact port of the existing one-line ternary duplicated in copies #2 and #3:

```ts
export function resolveCreateStatus(
  requestedStatus: PostStatus,
  clientAccessLevel: ClientAccessLevel
): PostStatus {
  return requestedStatus === 'SCHEDULED' && clientAccessLevel === 'APPROVE'
    ? 'PENDING_APPROVAL'
    : requestedStatus
}
```

**`canSelfApprove(input: { isAuthor: boolean; hasOtherApprover: boolean }): boolean`**

Extracts the self-approval predicate embedded in copy #1 (lines 87-101) and mirrored by copy #4 (lines 57-67):

```ts
export function canSelfApprove({ isAuthor, hasOtherApprover }: { isAuthor: boolean; hasOtherApprover: boolean }): boolean {
  return !isAuthor || !hasOtherApprover
}
```

Copy #1 calls this after its own DB lookup for `hasOtherApprover` (an existing `WorkspaceAccess` query — this does NOT move into the pure module, since it's a DB call). Copy #4 already receives `hasOtherApprover` as a prop (threaded down from the calendar page's server component per the 2026-08-07 self-approval-deadlock design) — no DB access needed on the frontend side either way.

**`resolveApprovalTransition(input: ResolveApprovalTransitionInput): PostStatus`**

Exact port of copy #1's `finalStatus` ternary (lines 140-151):

```ts
export interface ResolveApprovalTransitionInput {
  requestedStatus: PostStatus
  existingStatus: PostStatus
  clientAccessLevel: ClientAccessLevel
  contentChanged: boolean
  hasMediaIfRequired: boolean
  hasScheduledAt: boolean
}

export function resolveApprovalTransition(input: ResolveApprovalTransitionInput): PostStatus {
  const { requestedStatus, existingStatus, clientAccessLevel, contentChanged, hasMediaIfRequired, hasScheduledAt } = input

  const isApprovingReadyPost =
    requestedStatus === 'APPROVED' && hasMediaIfRequired && hasScheduledAt
  if (isApprovingReadyPost) return 'SCHEDULED'

  const needsReview =
    requestedStatus === 'SCHEDULED' &&
    clientAccessLevel === 'APPROVE' &&
    !(existingStatus === 'APPROVED' && !contentChanged)
  if (needsReview) return 'PENDING_APPROVAL'

  return requestedStatus
}
```

Copy #1 still does its own DB fetch (`existing`) and computes `contentChanged`/`hasMediaIfRequired`/`hasScheduledAt` itself from that fetch (this logic touches request-specific `content`/`mediaUrls`/`scheduledAt` diffing against `existing` and stays in the route) — it then calls `resolveApprovalTransition` purely for the decision.

### `services/posts/post-approval-bookkeeping.ts` — server-only

Imports `prisma`. Owns the duplicated `PostApproval` record shape — two exports, reflecting the two real call shapes already present in the code (a nested create at post-creation time vs. an upsert at update time — same underlying rule, different Prisma calls, so not literally one function):

**`buildApprovalCreateInput(finalStatus: PostStatus, submittedAt: Date): { approval: { create: { status: 'PENDING'; submittedAt: Date } } } | {}`**

Port of the identical `approvalCreate` ternary duplicated in copies #2 and #3 (embedded into `prisma.post.create({ data: { ...approvalCreate } })`).

**`upsertApprovalOnTransition(tx, postId, params): Promise<void>`**

Port of copy #1's three-branch upsert (lines 176-220: PENDING with SLA `submittedAt`/`slaAlertedAt` reset + `notifyChannel` call, APPROVED with reviewer bookkeeping, REJECTED on recall). Takes whatever Prisma transaction client copy #1 is already using, plus the same parameters that branch already closes over (`finalStatus`, `status`, `existing`, `user.id`, `content`, `scheduledAt`, etc. — exact parameter list to be finalized during implementation planning against the real call site). The `notifyChannel` call for `POST_PENDING_APPROVAL` stays inside this helper, ported verbatim including its dedupe key.

## Frontend change (copy #4)

`getNextStatuses` calls `canSelfApprove` and `resolveApprovalTransition` instead of hand-rolling both:

- The self-approval branches (lines 57-67) call `canSelfApprove({ isAuthor, hasOtherApprover })` instead of the inline `isAuthor && hasOtherApprover` check.
- The `DRAFT` case (lines 83-87) calls `resolveApprovalTransition` with `requestedStatus: 'SCHEDULED'`, `existingStatus: 'DRAFT'`, and the panel's known `clientAccessLevel`/`contentChanged: false`/media state to determine what a "Mark as scheduled" click would actually resolve to.

### UX decision (confirmed 2026-08-14)

When `resolveApprovalTransition` shows that a `SCHEDULED` request from `DRAFT` would actually resolve to `PENDING_APPROVAL` (i.e. `hasApprovalFlow` is on), the `DRAFT` case drops the "Mark as scheduled" option entirely rather than showing it with a corrected label. "Submit for approval" already covers that outcome, so showing both was redundant, and the redundant one was the misleading one:

```ts
case 'DRAFT': {
  const wouldNeedApproval = resolveApprovalTransition({
    requestedStatus: 'SCHEDULED',
    existingStatus: 'DRAFT',
    clientAccessLevel,
    contentChanged: false,
    hasMediaIfRequired: !isAwaitingMedia,
    hasScheduledAt: true, // scheduling a draft always sets a time in the same action
  }) === 'PENDING_APPROVAL'

  return [
    ...(hasApprovalFlow ? [{ value: 'PENDING_APPROVAL', label: 'Submit for approval' }] : []),
    ...(wouldNeedApproval ? [] : [{ value: 'SCHEDULED', label: 'Mark as scheduled' }]),
  ]
}
```

(Exact input values for the DRAFT case — e.g. whether `hasScheduledAt` should genuinely always be `true` here — to be verified against the real component during implementation, since `post-detail-panel.tsx`'s actual scheduling flow may set `scheduledAt` in a separate step. This spec fixes the *decision logic and behavior*; the implementer should confirm this specific call site against the live component rather than trust this snippet verbatim.)

## Testing plan

- **New unit tests for `post-lifecycle.ts`** (no DB, no mocking): every named branch in this design gets a direct test — self-approval allowed when no other approver exists, blocked when one does and the caller is the author, unaffected when the caller isn't the author; the `isApprovingReadyPost` shortcut firing and not firing; the `contentChanged` exemption allowing an unchanged `APPROVED` post through to `SCHEDULED` and blocking a changed one; `resolveCreateStatus`'s two branches.
- **New unit tests for `post-approval-bookkeeping.ts`**: mocked Prisma client (matching this codebase's existing test patterns, e.g. `lib/comment-rollback.test.ts`), asserting the exact upsert/create shapes for each of the three transition branches plus the create-time nested-create shape.
- **Existing tests updated, not rewritten**: `app/api/posts/[id]/route.test.ts`, `app/api/posts/route.test.ts`, the bulk-import commit test suite, and `post-detail-panel.test.ts` keep their current assertions (behavior must not change, except the one UX fix above) but call through the shared functions where they currently duplicate logic inline.
- **Characterization pass before touching any route**: run the full existing test suite once as a baseline immediately before starting, and again after each route is migrated, confirming zero unintended behavior change at each step.

## Rollout

Feature branch + PR (branch protection on `main` requires a passing PR now — no direct-push workflow). Recommended commit granularity for implementation planning: one commit for the new pure module + its tests, one for the bookkeeping module + its tests, then one commit per consuming file migrated (copy #1, #2, #3, #4) so each is independently reviewable and revertable.
