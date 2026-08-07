# Auto-Schedule on Approval — Design Spec

## Background

Today, approving a post (`PATCH /api/posts/[id]` with `status: 'APPROVED'`) only ever moves it to the `APPROVED` status — a separate, manual "Schedule post" action is required afterward to actually queue it for the publish worker (`status: 'SCHEDULED'`). This surfaced during manual testing of the self-approval-deadlock fix: the reviewer asked whether `Approved` and `Scheduled` mean the same thing. They don't today, but for the common case — a post submitted for approval with a target time already set, then approved with nothing else standing in the way — the extra manual click is friction, not a safeguard. There is exactly one legitimate reason a post can't move straight to `SCHEDULED` on approval: it still needs media attached (`requiresMedia: true` and no `mediaUrls`), which is a real, existing blocker enforced elsewhere in this same route.

## Rule change

Approving a post (`status: 'APPROVED'`) now transitions it straight to `SCHEDULED` when its media requirement is already satisfied. If media is still required and missing, the post stays at `APPROVED`, exactly as it does today, until media is attached — at which point the existing manual "Schedule post" action (already present in the UI, unchanged by this work) finishes the job.

This means `APPROVED` becomes a narrower, more meaningful status going forward: the only way a post can be sitting at `APPROVED` is that it was approved while still awaiting media. Every other approval goes straight to `SCHEDULED`.

The `PostApproval` record — which tracks that a review decision happened, separately from what the post's live status is — is still written on every approval, regardless of which final status the post lands on. This is keyed off "was this an approval request" (the requested `status`), not "did the post land on `APPROVED`" (the resulting status), so the review is correctly recorded even when the post skips past `APPROVED` straight to `SCHEDULED`.

No other system needs to change: the MCP write tools and the compose UI both only ever create posts as `DRAFT` or `SCHEDULED`, and the only path to `APPROVED` at all is this same `PATCH` route — so there's exactly one place this rule needs to live.

## Backend implementation

In `app/api/posts/[id]/route.ts`'s `PATCH` handler, the existing self-approval-deadlock authorization block (`if (status === 'APPROVED') { ... }`, lines 75-98) is unchanged — it still decides *whether* the approval is allowed at all. What changes is what happens after authorization passes, where `finalStatus` is currently computed:

```ts
const contentChanged =
  (content !== undefined && content !== existing.content) ||
  (mediaUrls !== undefined && mediaUrls.join('\u0000') !== existing.mediaUrls.join('\u0000'))

const finalStatus: PostStatus | undefined =
  status === 'SCHEDULED' &&
  existing.workspace.clientAccessLevel === 'APPROVE' &&
  !(existing.status === 'APPROVED' && !contentChanged)
    ? 'PENDING_APPROVAL'
    : status
```

This becomes:

```ts
const contentChanged =
  (content !== undefined && content !== existing.content) ||
  (mediaUrls !== undefined && mediaUrls.join('\u0000') !== existing.mediaUrls.join('\u0000'))

// Approving no longer leaves the post sitting in APPROVED waiting for a
// separate "Schedule post" click. If media requirements are already
// satisfied, the approval itself is the last gate, so it goes straight to
// SCHEDULED. APPROVED stays reachable only when the post still needs media
// -- the existing manual "Schedule post" action remains available, unchanged,
// once that media is attached.
const effectiveMediaUrls = mediaUrls ?? existing.mediaUrls
const isApprovingReadyPost =
  status === 'APPROVED' && !(existing.requiresMedia && effectiveMediaUrls.length === 0)

const finalStatus: PostStatus | undefined = isApprovingReadyPost
  ? 'SCHEDULED'
  : status === 'SCHEDULED' &&
    existing.workspace.clientAccessLevel === 'APPROVE' &&
    !(existing.status === 'APPROVED' && !contentChanged)
    ? 'PENDING_APPROVAL'
    : status
```

And the `PostApproval` bookkeeping block further down changes its middle branch's condition from `finalStatus === 'APPROVED'` to `status === 'APPROVED'`, so it still fires when the post auto-schedules:

```ts
if (finalStatus === 'PENDING_APPROVAL') {
  // unchanged
} else if (status === 'APPROVED') {
  // An approval decision happened, regardless of whether the post landed on
  // APPROVED (still awaiting media) or jumped straight to SCHEDULED.
  await prisma.postApproval.upsert({
    where:  { postId: id },
    create: { postId: id, status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
    update: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
  })
} else if (finalStatus === 'DRAFT' && existing.status === 'PENDING_APPROVAL') {
  // unchanged
}
```

No new validation is added for `scheduledAt` being in the past or future — the existing manual "Schedule post" action has never validated that either, so this doesn't introduce a new gap, just reaches the same end state one click sooner.

## Frontend implementation

The "Awaiting media" badge treatment exists in two places, both currently restricted to `status === 'DRAFT'` even though the underlying condition (`requiresMedia` true, no media attached) isn't actually status-specific:

- `components/lyra/calendar/post-preview-card.tsx`: `const isAwaitingMedia = post.status === 'DRAFT' && post.requiresMedia && post.mediaUrls.length === 0` — drives both the badge color and label on the compact calendar-grid card.
- `components/lyra/calendar/post-detail-panel.tsx`: the badge label ternary `isAwaitingMedia && post.status === 'DRAFT' ? 'Awaiting media' : (STATUS_LABEL[post.status] ?? post.status)` (the underlying `isAwaitingMedia` value used for the `getNextStatuses` SCHEDULED-filtering is already status-agnostic — only this label ternary has the extra `DRAFT` restriction).

Both restrictions change from `post.status === 'DRAFT'` to `(post.status === 'DRAFT' || post.status === 'APPROVED')`. After the backend change above, `APPROVED` can only mean "approved, still awaiting media" — so this isn't a special case being bolted on, it's the badge catching up to what `APPROVED` now actually means. Once media is attached, `isAwaitingMedia` naturally flips to `false` and the badge reverts to showing the real status (`Approved`, briefly, until the next manual "Schedule post" click, or immediately `Scheduled` if that's clicked right away).

`STATUS_COLORS` in `post-preview-card.tsx` has no entry for `APPROVED` today (it falls back to a plain gray badge) — that's unaffected by this change, since the amber "awaiting media" styling is applied as an override before that fallback is ever reached, exactly as it already is for `DRAFT`.

## Testing & rollout

- Backend: extend `app/api/posts/[id]/route.test.ts`'s approval-related tests. The existing tests that approve a post with `requiresMedia: false` (including the two self-approval-deadlock tests added this session) currently assert `body.status === 'APPROVED'` — these assertions must change to `'SCHEDULED'`, since that's now the correct outcome for a media-ready post. Add two new cases: approving a post with `requiresMedia: true` and empty `mediaUrls` stays at `APPROVED` (not `SCHEDULED`); the `PostApproval` upsert is called with `status: 'APPROVED'` in both the auto-scheduled and stays-at-`APPROVED` cases.
- Frontend: no new test file needed — `getNextStatuses` itself is unchanged by this work (its `APPROVED` case and the `isAwaitingMedia` filtering that already exists were already correct for this new narrower meaning of `APPROVED`, as reasoned through above). Manually verify in the running app: approve a media-ready post and confirm it shows `Scheduled` immediately with no extra click; approve a media-less post and confirm it shows `Awaiting media` (not a bare `Approved`) in both the calendar card and the detail panel.
- No migration, no new infrastructure — logic-only changes against existing fields.
