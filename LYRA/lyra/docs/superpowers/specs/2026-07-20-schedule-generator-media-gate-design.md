# Schedule Generator Caption Export & Awaiting-Media Gate — Design

## Problem

The AI Schedule Generator produces captions and hashtags but no creative — there is no
built-in handoff to whoever produces the images/video (an in-house designer, an
agency's creative team, or the future Creative Studio add-on). Today the only way to
get those captions to a designer is to manually copy-paste them out of LYRA, and
nothing stops a caption-only post from being scheduled and published with no media
attached at all.

This gap will persist even after Creative Studio ships, since Creative Studio is a
paid post-launch add-on — workspaces without it will always need a plain export path.

## Scope

Applies **only** to posts created via the AI Schedule Generator → Review Schedule flow
(`components/lyra/schedule/schedule-generator.tsx` → `schedule-review.tsx`). Regular
Compose-created posts are unaffected — a hand-written text-only post (common on
LinkedIn, X, Facebook) continues to schedule exactly as it does today. This is a
deliberate scope decision: only the Schedule Generator's pipeline currently produces
caption-only content by design.

## Data model

Add one field to `Post`:

```prisma
model Post {
  ...
  requiresMedia Boolean @default(false)
  ...
}
```

`requiresMedia` is set `true` only at creation time, only by the Schedule Review
screen's "Add all to calendar" action, and only for posts that still have no media
attached at that moment. Every other post (regular Compose posts, or Schedule
Generator posts where media was attached during Review) is created with the default
`false` and behaves identically to today.

"Awaiting media" is **not** a new `PostStatus` enum value — it is a derived state,
computed wherever it's needed as:

```
isAwaitingMedia = post.requiresMedia && post.mediaUrls.length === 0
```

This means attaching media to a post later requires no explicit "clear the flag"
step — the derived state flips to `false` automatically the moment `mediaUrls`
becomes non-empty, and the underlying `requiresMedia` column never needs updating
after creation.

## Export flow (Schedule Review screen)

Two independent, side-by-side actions replace the current single "Add all to
calendar" button:

- **Export captions (CSV)** — generated entirely client-side (the post list already
  lives in component state / `sessionStorage`, no new API endpoint needed) and
  downloaded via a `Blob` immediately on click. One row per post still lacking
  media at click time. Columns: `Date`, `Time`, `Platform`, `Topic`, `Caption`
  (hashtags are already inline in the caption text, same as everywhere else in
  LYRA — no separate hashtag column). Can be clicked more than once (e.g. after
  attaching media to some posts and wanting a re-export of what's left).
- **Add all to calendar** — unchanged behavior and unchanged request shape, except
  each post's create payload now includes `requiresMedia: mediaUrls.length === 0`
  computed per-post at save time.

## Enforcement

The gate must live server-side because there are two independent client paths that
can move a post to `SCHEDULED`, and only one of them goes through Compose:

1. Compose's Schedule button (`components/lyra/composer/post-composer.tsx`,
   `handleSubmit('SCHEDULED', ...)`).
2. The Calendar's post detail panel status dropdown
   (`components/lyra/calendar/post-detail-panel.tsx`, `getNextStatuses` →
   "Mark as scheduled" / "Schedule post"), which calls `PATCH /api/posts/[id]`
   directly and never opens Compose.

### API (source of truth)

- `POST /api/posts` (`app/api/posts/route.ts`): the existing
  `resolvedStatus === 'SCHEDULED'` pre-flight block (currently only running the
  media-compatibility check) gains a second condition — reject with 422 if the
  incoming `requiresMedia` is true and `mediaUrls` is empty. Message: "This post is
  awaiting media. Attach an image or video before scheduling."
- `PATCH /api/posts/[id]` (`app/api/posts/[id]/route.ts`): the `existing` post
  lookup's `select` gains `requiresMedia: true, mediaUrls: true`. The same
  `effectiveStatus === 'SCHEDULED'` block gains the same condition, evaluated
  against the *effective* media (`mediaUrls` from the request body if provided,
  else `existing.mediaUrls`) and the *existing* `requiresMedia` (not client-settable
  on PATCH — only set at creation).
- **`PENDING_APPROVAL` is explicitly not gated.** An awaiting-media post can still be
  submitted for client approval — the approver reviews and approves the caption
  itself, independent of whether artwork exists yet. Only the transition into
  `SCHEDULED` (the status the publish worker actually queues on) is blocked. This
  keeps "not sent to publication" accurate without blocking the approval
  conversation.
- `GET /api/posts` (`app/api/posts/route.ts`): add `requiresMedia: true` to the
  `select` so the calendar and detail panel can read it.

### Client-side (UX, not the security boundary)

- `CalendarPost` type (`components/lyra/calendar/post-preview-card.tsx`) gains
  `requiresMedia: boolean`.
- On the calendar grid, a post where `isAwaitingMedia` is true shows an amber
  **"Awaiting media"** badge (reusing the existing warning color used for
  `PENDING_APPROVAL`) instead of the generic grey "Draft" badge — a targeted
  override in the existing status-badge render, not a new entry in `STATUS_COLORS`
  keyed by `PostStatus` (since the underlying status is still `DRAFT`).
- `post-detail-panel.tsx`'s `getNextStatuses` takes an additional
  `isAwaitingMedia` parameter and omits any option whose `value` is `'SCHEDULED'`
  when true (i.e. "Mark as scheduled" from `DRAFT`, "Schedule post" from
  `APPROVED`). `"Submit for approval"` remains offered, per the scope decision
  above.
- `EditingPost` type (`components/lyra/composer/compose-client.tsx`) gains
  `requiresMedia: boolean`, populated by the compose page's server-side post fetch
  (`app/(dashboard)/workspace/[workspaceId]/compose/page.tsx`).
- In `post-composer.tsx`, when editing a post where `requiresMedia && mediaUrls.length
  === 0`, the "Schedule" and "Post now" buttons are disabled with an inline message
  ("This post needs media before it can be scheduled — it was generated by the AI
  Schedule Generator without artwork."). "Save draft" remains enabled throughout.

## Non-goals

- No calendar-wide "export all awaiting-media posts" action. The export button lives
  only on the Schedule Review screen, at the moment posts are first created. Can be
  added later if a re-export-from-the-calendar need actually comes up.
- No override/bypass toggle for the hard block — confirmed with the user this pipeline
  is specifically for media-driven content, so no escape hatch is being built.
- Mailchimp/Customer.io/other integrations are unrelated to this feature — not touched.
