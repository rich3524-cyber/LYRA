# Schedule Generator Caption Export & Awaiting-Media Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export AI Schedule Generator captions to CSV for a designer, and
prevent those posts from being scheduled/published until media is attached.

**Architecture:** One new boolean column (`Post.requiresMedia`), set only by the
Schedule Review screen at creation time. "Awaiting media" is a derived value
(`requiresMedia && mediaUrls.length === 0`) computed wherever it's needed — no new
status, no explicit clearing logic. The enforcement lives server-side in both
`POST /api/posts` and `PATCH /api/posts/[id]` (the two independent paths that can
move a post to `SCHEDULED`); the client-side UI (calendar badge, detail panel
actions, Compose buttons) mirrors that same server rule for a good experience, but
the API is the actual boundary.

**Tech Stack:** Next.js 16 / TypeScript / Prisma 6 (Supabase Postgres) / Zod / Vitest.

**Design doc:** `docs/superpowers/specs/2026-07-20-schedule-generator-media-gate-design.md`

---

### Task 1: Add `requiresMedia` column to `Post`

**Files:**
- Modify: `prisma/schema.prisma:176-205` (the `Post` model)

- [ ] **Step 1: Add the field to the Prisma schema**

In `prisma/schema.prisma`, inside `model Post { ... }`, add the new field directly
below `failureReason`:

```prisma
  failureReason   String?
  requiresMedia   Boolean       @default(false)
```

- [ ] **Step 2: Apply the migration directly to the production database**

This project has no local `prisma/migrations` directory — schema changes are applied
directly via the Supabase MCP tool, matching how `failureReason` was added earlier.
Run:

```
mcp__claude_ai_Supabase__apply_migration
  name: add_post_requires_media
  query: ALTER TABLE "Post" ADD COLUMN "requiresMedia" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes with no errors. This makes `requiresMedia` available on
`prisma.post` types for every subsequent task.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(posts): add requiresMedia column for Schedule Generator media gate"
```

---

### Task 2: Pure CSV-builder service (with test)

**Files:**
- Create: `services/schedule/captions-csv.ts`
- Test: `services/schedule/captions-csv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/schedule/captions-csv.test.ts
import { describe, it, expect } from 'vitest'
import { buildCaptionsCsv } from './captions-csv'

describe('buildCaptionsCsv', () => {
  it('builds a header row plus one row per caption', () => {
    const csv = buildCaptionsCsv([
      { date: '2026-07-21', time: '08:00', platform: 'Instagram', topic: 'behind the scenes', caption: 'Hello world #bts' },
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Date,Time,Platform,Topic,Caption')
    expect(lines[1]).toBe('"2026-07-21","08:00","Instagram","behind the scenes","Hello world #bts"')
    expect(lines.length).toBe(2)
  })

  it('escapes embedded double quotes and commas in caption text', () => {
    const csv = buildCaptionsCsv([
      { date: '2026-07-21', time: '08:00', platform: 'LinkedIn', topic: 'launch', caption: 'She said "great, launch it" today' },
    ])
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('"2026-07-21","08:00","LinkedIn","launch","She said ""great, launch it"" today"')
  })

  it('returns just the header row for an empty list', () => {
    expect(buildCaptionsCsv([])).toBe('Date,Time,Platform,Topic,Caption')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run services/schedule/captions-csv.test.ts`
Expected: FAIL — `Cannot find module './captions-csv'`

- [ ] **Step 3: Write the implementation**

```ts
// services/schedule/captions-csv.ts
export interface CaptionCsvRow {
  date:     string
  time:     string
  platform: string
  topic:    string
  caption:  string
}

const CSV_HEADER = ['Date', 'Time', 'Platform', 'Topic', 'Caption'].join(',')

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Pure CSV builder for the Schedule Review "Export captions" action -- takes
 * already-formatted row data (no date/timezone logic here) and returns a
 * CRLF-joined CSV string ready to hand to a Blob.
 */
export function buildCaptionsCsv(rows: CaptionCsvRow[]): string {
  const body = rows.map((row) =>
    [row.date, row.time, row.platform, row.topic, row.caption].map(escapeCsvField).join(',')
  )
  return [CSV_HEADER, ...body].join('\r\n')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run services/schedule/captions-csv.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add services/schedule/captions-csv.ts services/schedule/captions-csv.test.ts
git commit -m "feat(schedule): add pure CSV builder for caption export"
```

---

### Task 3: Gate `POST /api/posts` on `requiresMedia`

**Files:**
- Modify: `app/api/posts/route.ts:11-19` (schema), `:90-113` (POST handler), `:135-151` (create call)

- [ ] **Step 1: Add `requiresMedia` to the request schema**

In `app/api/posts/route.ts`, change:

```ts
const createPostSchema = z.object({
  workspaceId: z.string().min(1),
  content:     z.string().min(1),
  platforms:   z.array(z.nativeEnum(Platform)).min(1),
  scheduledAt: z.string().nullish(),
  mediaUrls:   z.array(z.string()).optional(),
  status:      z.nativeEnum(PostStatus).optional(),
  topic:       z.string().nullish(),
})
```

to:

```ts
const createPostSchema = z.object({
  workspaceId:   z.string().min(1),
  content:       z.string().min(1),
  platforms:     z.array(z.nativeEnum(Platform)).min(1),
  scheduledAt:   z.string().nullish(),
  mediaUrls:     z.array(z.string()).optional(),
  status:        z.nativeEnum(PostStatus).optional(),
  topic:         z.string().nullish(),
  requiresMedia: z.boolean().optional(),
})
```

- [ ] **Step 2: Destructure the new field and add the gate**

Change:

```ts
    const { workspaceId, content, platforms, scheduledAt, mediaUrls, status, topic } = await parseBody(req, createPostSchema)
```

to:

```ts
    const { workspaceId, content, platforms, scheduledAt, mediaUrls, status, topic, requiresMedia } = await parseBody(req, createPostSchema)
```

Then, directly below the existing media-compatibility check block (still inside
`if (resolvedStatus === 'SCHEDULED') { ... }`), add a second check:

```ts
    if (resolvedStatus === 'SCHEDULED') {
      const issues = checkMediaCompatibility(mediaUrls ?? [], platforms)
      if (issues.length > 0) {
        return NextResponse.json(
          { error: issues.map(formatCompatibilityIssue).join(' ') },
          { status: 422 }
        )
      }
      if (requiresMedia && (mediaUrls ?? []).length === 0) {
        return NextResponse.json(
          { error: 'This post is awaiting media. Attach an image or video before scheduling.' },
          { status: 422 }
        )
      }
    }
```

- [ ] **Step 3: Pass `requiresMedia` through to the create call**

Change:

```ts
        prisma.post.create({
          data: {
            workspaceId,
            socialAccountId: account.id,
            authorId: user.id,
            content: content.trim(),
            mediaUrls: mediaUrls ?? [],
            status: resolvedStatus,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            topic: topic ?? null,
          },
        })
```

to:

```ts
        prisma.post.create({
          data: {
            workspaceId,
            socialAccountId: account.id,
            authorId: user.id,
            content: content.trim(),
            mediaUrls: mediaUrls ?? [],
            status: resolvedStatus,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            topic: topic ?? null,
            requiresMedia: requiresMedia ?? false,
          },
        })
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/api/posts/route.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/posts/route.ts
git commit -m "feat(posts): block POST /api/posts SCHEDULED creation when awaiting media"
```

---

### Task 4: Gate `PATCH /api/posts/[id]` and expose `requiresMedia` on `GET /api/posts`

**Files:**
- Modify: `app/api/posts/[id]/route.ts:31-55`
- Modify: `app/api/posts/route.ts:59-72` (GET select)

- [ ] **Step 1: Add `requiresMedia` and `mediaUrls` to the existing-post lookup**

In `app/api/posts/[id]/route.ts`, change:

```ts
    const existing = await prisma.post.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id } } },
      },
      select: { id: true, status: true, workspaceId: true, authorId: true, socialAccount: { select: { platform: true } } },
    })
```

to:

```ts
    const existing = await prisma.post.findFirst({
      where: {
        id,
        workspace: { access: { some: { userId: user.id } } },
      },
      select: {
        id: true, status: true, workspaceId: true, authorId: true,
        mediaUrls: true, requiresMedia: true,
        socialAccount: { select: { platform: true } },
      },
    })
```

- [ ] **Step 2: Add the awaiting-media gate next to the existing compatibility check**

Directly below the existing block:

```ts
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
```

add:

```ts
    if (effectiveStatus === 'SCHEDULED' && existing.requiresMedia) {
      const effectiveMediaUrls = mediaUrls ?? existing.mediaUrls
      if (effectiveMediaUrls.length === 0) {
        return NextResponse.json(
          { error: 'This post is awaiting media. Attach an image or video before scheduling.' },
          { status: 422 }
        )
      }
    }
```

- [ ] **Step 3: Expose `requiresMedia` on the calendar's `GET /api/posts`**

In `app/api/posts/route.ts`, in the `GET` handler's `select`, change:

```ts
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        failureReason: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
```

to:

```ts
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        failureReason: true,
        requiresMedia: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/api/posts/[id]/route.ts` or `app/api/posts/route.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/posts/[id]/route.ts app/api/posts/route.ts
git commit -m "feat(posts): block PATCH SCHEDULED transitions when awaiting media, expose requiresMedia on GET"
```

---

### Task 5: Calendar badge — `post-preview-card.tsx`

**Files:**
- Modify: `components/lyra/calendar/post-preview-card.tsx`

- [ ] **Step 1: Add `requiresMedia` to the `CalendarPost` interface**

Change:

```ts
export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformPostId: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  failureReason: string | null
  socialAccount: { platform: string; name: string; platformId: string; adAccountId: string | null }
  boost: PostBoost | null
}
```

to:

```ts
export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformPostId: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  failureReason: string | null
  requiresMedia: boolean
  socialAccount: { platform: string; name: string; platformId: string; adAccountId: string | null }
  boost: PostBoost | null
}
```

- [ ] **Step 2: Derive `isAwaitingMedia` and override the badge**

In the `PostPreviewCard` component, change:

```ts
  const platformColor = PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']
```

to:

```ts
  const platformColor  = PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']
  const isAwaitingMedia = post.status === 'DRAFT' && post.requiresMedia && post.mediaUrls.length === 0
```

Then change the status badge span:

```tsx
          <span
            className={cn(
              'font-sans text-[10px] uppercase tracking-wide px-1 rounded-full',
              STATUS_COLORS[post.status] ?? 'bg-background-border text-text-tertiary'
            )}
            title={post.status === 'FAILED' && post.failureReason ? post.failureReason : undefined}
          >
            {post.status.toLowerCase().replace(/_/g, ' ')}
          </span>
```

to:

```tsx
          <span
            className={cn(
              'font-sans text-[10px] uppercase tracking-wide px-1 rounded-full',
              isAwaitingMedia
                ? 'bg-status-warning/20 text-status-warning'
                : STATUS_COLORS[post.status] ?? 'bg-background-border text-text-tertiary'
            )}
            title={post.status === 'FAILED' && post.failureReason ? post.failureReason : undefined}
          >
            {isAwaitingMedia ? 'awaiting media' : post.status.toLowerCase().replace(/_/g, ' ')}
          </span>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `post-preview-card.tsx`. (This will surface every
place that constructs a `CalendarPost` without `requiresMedia` — expected, fixed in
later tasks.)

- [ ] **Step 4: Commit**

```bash
git add components/lyra/calendar/post-preview-card.tsx
git commit -m "feat(calendar): show Awaiting media badge for Schedule Generator posts without media"
```

---

### Task 6: Detail panel — filter SCHEDULED actions and show a note

**Files:**
- Modify: `components/lyra/calendar/post-detail-panel.tsx:28-70` (`getNextStatuses`), `:215-217` (call site), `:286-301` (status badge), `:338-343` (actions section)

- [ ] **Step 1: Rewrite `getNextStatuses` to accept and apply `isAwaitingMedia`**

Replace the entire function:

```ts
function getNextStatuses(
  status: string,
  userRole: string,
  clientAccessLevel: string,
): { value: string; label: string; variant?: 'approve' | 'reject' }[] {
  const isClientApprover = userRole === 'CLIENT_APPROVE'
  const hasApprovalFlow  = clientAccessLevel === 'APPROVE'

  if (isClientApprover) {
    if (status === 'PENDING_APPROVAL') {
      return [
        { value: 'APPROVED', label: 'Approve',           variant: 'approve' },
        { value: 'DRAFT',    label: 'Request changes',   variant: 'reject'  },
      ]
    }
    return []
  }

  switch (status) {
    case 'DRAFT':
      return [
        ...(hasApprovalFlow ? [{ value: 'PENDING_APPROVAL', label: 'Submit for approval' }] : []),
        { value: 'SCHEDULED', label: 'Mark as scheduled' },
      ]
    case 'PENDING_APPROVAL':
      return [{ value: 'DRAFT', label: 'Recall for editing' }]
    case 'APPROVED':
      return [
        { value: 'SCHEDULED', label: 'Schedule post' },
        { value: 'DRAFT',     label: 'Move back to draft' },
      ]
    case 'SCHEDULED':
      return [
        { value: 'DRAFT',     label: 'Move back to draft' },
        { value: 'CANCELLED', label: 'Cancel post' },
      ]
    case 'FAILED':
    case 'CANCELLED':
      return [{ value: 'DRAFT', label: 'Move back to draft' }]
    default:
      return []
  }
}
```

with:

```ts
function getNextStatuses(
  status: string,
  userRole: string,
  clientAccessLevel: string,
  isAwaitingMedia: boolean,
): { value: string; label: string; variant?: 'approve' | 'reject' }[] {
  const isClientApprover = userRole === 'CLIENT_APPROVE'
  const hasApprovalFlow  = clientAccessLevel === 'APPROVE'

  const options = (() => {
    if (isClientApprover) {
      if (status === 'PENDING_APPROVAL') {
        return [
          { value: 'APPROVED', label: 'Approve',         variant: 'approve' as const },
          { value: 'DRAFT',    label: 'Request changes', variant: 'reject'  as const },
        ]
      }
      return []
    }

    switch (status) {
      case 'DRAFT':
        return [
          ...(hasApprovalFlow ? [{ value: 'PENDING_APPROVAL', label: 'Submit for approval' }] : []),
          { value: 'SCHEDULED', label: 'Mark as scheduled' },
        ]
      case 'PENDING_APPROVAL':
        return [{ value: 'DRAFT', label: 'Recall for editing' }]
      case 'APPROVED':
        return [
          { value: 'SCHEDULED', label: 'Schedule post' },
          { value: 'DRAFT',     label: 'Move back to draft' },
        ]
      case 'SCHEDULED':
        return [
          { value: 'DRAFT',     label: 'Move back to draft' },
          { value: 'CANCELLED', label: 'Cancel post' },
        ]
      case 'FAILED':
      case 'CANCELLED':
        return [{ value: 'DRAFT', label: 'Move back to draft' }]
      default:
        return []
    }
  })()

  // Schedule Generator posts without media can still move through approval --
  // only the transition into SCHEDULED (what the publish worker queues on) is
  // blocked, per the design decision to keep "not sent to publication" accurate
  // without blocking the approval conversation.
  return isAwaitingMedia ? options.filter((o) => o.value !== 'SCHEDULED') : options
}
```

- [ ] **Step 2: Update the call site**

Change:

```ts
  const date          = post?.scheduledAt
  const platformColor = post ? (PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']) : PLATFORM_COLORS['TWITTER']
  const nextStatuses  = post ? getNextStatuses(post.status, userRole, clientAccessLevel) : []
```

to:

```ts
  const date           = post?.scheduledAt
  const platformColor  = post ? (PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']) : PLATFORM_COLORS['TWITTER']
  const isAwaitingMedia = post ? post.requiresMedia && post.mediaUrls.length === 0 : false
  const nextStatuses   = post ? getNextStatuses(post.status, userRole, clientAccessLevel, isAwaitingMedia) : []
```

- [ ] **Step 3: Override the status badge for awaiting-media posts**

Change:

```tsx
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {STATUS_LABEL[post.status] ?? post.status}
                </span>
```

to:

```tsx
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    isAwaitingMedia && post.status === 'DRAFT'
                      ? 'bg-status-warning/20 text-status-warning'
                      : STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {isAwaitingMedia && post.status === 'DRAFT' ? 'Awaiting media' : (STATUS_LABEL[post.status] ?? post.status)}
                </span>
```

- [ ] **Step 4: Add an explanatory note above the Actions section**

Change:

```tsx
              {/* Status transition actions */}
              {nextStatuses.length > 0 && (
```

to:

```tsx
              {isAwaitingMedia && (
                <p className="font-sans text-xs text-status-warning leading-relaxed">
                  This post was generated by the AI Schedule Generator without artwork and can&apos;t be scheduled until media is attached.
                </p>
              )}

              {/* Status transition actions */}
              {nextStatuses.length > 0 && (
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `post-detail-panel.tsx`

- [ ] **Step 6: Commit**

```bash
git add components/lyra/calendar/post-detail-panel.tsx
git commit -m "feat(calendar): hide Schedule actions and explain the block for awaiting-media posts"
```

---

### Task 7: Compose — block Schedule/Post now for awaiting-media posts

**Files:**
- Modify: `components/lyra/composer/compose-client.tsx:10-17` (`EditingPost`)
- Modify: `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx:30-53`
- Modify: `components/lyra/composer/post-composer.tsx`

- [ ] **Step 1: Add `requiresMedia` to `EditingPost`**

In `components/lyra/composer/compose-client.tsx`, change:

```ts
export interface EditingPost {
  id: string
  content: string
  mediaUrls: string[]
  scheduledAt: string | null
  status: string
  platform: string
}
```

to:

```ts
export interface EditingPost {
  id: string
  content: string
  mediaUrls: string[]
  scheduledAt: string | null
  status: string
  platform: string
  requiresMedia: boolean
}
```

- [ ] **Step 2: Populate it in the Compose page's server-side fetch**

In `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx`, change:

```ts
  const postToEdit = postId
    ? await prisma.post.findFirst({
        where: { id: postId, workspaceId },
        select: {
          id: true,
          content: true,
          mediaUrls: true,
          scheduledAt: true,
          status: true,
          socialAccount: { select: { platform: true } },
        },
      })
    : null

  const editingPost = postToEdit
    ? {
        id: postToEdit.id,
        content: postToEdit.content,
        mediaUrls: postToEdit.mediaUrls,
        scheduledAt: postToEdit.scheduledAt ? postToEdit.scheduledAt.toISOString() : null,
        status: postToEdit.status,
        platform: postToEdit.socialAccount.platform,
      }
    : null
```

to:

```ts
  const postToEdit = postId
    ? await prisma.post.findFirst({
        where: { id: postId, workspaceId },
        select: {
          id: true,
          content: true,
          mediaUrls: true,
          scheduledAt: true,
          status: true,
          requiresMedia: true,
          socialAccount: { select: { platform: true } },
        },
      })
    : null

  const editingPost = postToEdit
    ? {
        id: postToEdit.id,
        content: postToEdit.content,
        mediaUrls: postToEdit.mediaUrls,
        scheduledAt: postToEdit.scheduledAt ? postToEdit.scheduledAt.toISOString() : null,
        status: postToEdit.status,
        platform: postToEdit.socialAccount.platform,
        requiresMedia: postToEdit.requiresMedia,
      }
    : null
```

- [ ] **Step 3: Derive `isAwaitingMedia` in `post-composer.tsx`**

Directly below the existing `mediaCompatibilityIssues` derivation:

```ts
  const mediaCompatibilityIssues = checkMediaCompatibility(
    mediaUrls,
    (editingPost ? [editingPost.platform] : selectedPlatforms) as Platform[]
  )
```

add:

```ts
  const isAwaitingMedia = !!editingPost?.requiresMedia && mediaUrls.length === 0
```

- [ ] **Step 4: Guard `handleSubmit` against scheduling while awaiting media**

Directly below the existing `mediaCompatibilityIssues` guard inside `handleSubmit`:

```ts
    if (mediaCompatibilityIssues.length > 0) {
      mediaCompatibilityIssues.forEach((issue) => toast.error(formatCompatibilityIssue(issue)))
      return
    }
```

add:

```ts
    if (status === 'SCHEDULED' && isAwaitingMedia) {
      toast.error('This post needs media before it can be scheduled.')
      return
    }
```

- [ ] **Step 5: Show an inline warning and disable the Schedule/Post now buttons**

Directly above `{/* Toolbar — row 2: publish actions */}`, add:

```tsx
      {isAwaitingMedia && (
        <p className="px-5 pt-2 font-sans text-xs text-status-warning leading-relaxed">
          This post needs media before it can be scheduled — it was generated by the AI Schedule Generator without artwork.
        </p>
      )}

```

Then change the "Post now" button's `disabled` prop:

```tsx
          onClick={() => handleSubmit('SCHEDULED', new Date())}
          disabled={isSubmitting}
```

to:

```tsx
          onClick={() => handleSubmit('SCHEDULED', new Date())}
          disabled={isSubmitting || isAwaitingMedia}
```

And the "Schedule"/"Save changes" button's `disabled` prop:

```tsx
            onClick={() => handleSubmit('SCHEDULED')}
            disabled={isSubmitting || !scheduledAt}
```

to:

```tsx
            onClick={() => handleSubmit('SCHEDULED')}
            disabled={isSubmitting || !scheduledAt || isAwaitingMedia}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `compose-client.tsx`, `compose/page.tsx`, or
`post-composer.tsx`

- [ ] **Step 7: Commit**

```bash
git add components/lyra/composer/compose-client.tsx app/\(dashboard\)/workspace/\[workspaceId\]/compose/page.tsx components/lyra/composer/post-composer.tsx
git commit -m "feat(composer): block scheduling an awaiting-media post from Compose"
```

---

### Task 8: Schedule Review — Export captions button and `requiresMedia` on save

**Files:**
- Modify: `components/lyra/schedule/schedule-review.tsx`

- [ ] **Step 1: Import the CSV builder, `format`, and the `Download` icon**

Change:

```ts
import {
  Calendar, Pencil, Trash2, Check, X,
  Loader2, Paperclip, Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import type { GeneratedPost } from '@/services/ai/schedule-generator'
```

to:

```ts
import {
  Calendar, Pencil, Trash2, Check, X,
  Loader2, Paperclip, Video, Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import type { GeneratedPost } from '@/services/ai/schedule-generator'
import { buildCaptionsCsv } from '@/services/schedule/captions-csv'
```

- [ ] **Step 2: Add the `requiresMedia` flag when saving to the calendar**

In `handleAddToCalendar`, change:

```ts
              body:    JSON.stringify({
                workspaceId,
                content:     post.content,
                platforms:   [post.platform],
                scheduledAt: post.scheduledAt,
                mediaUrls:   post.mediaUrls,
                status:      'DRAFT',
                topic:       post.topic ?? null,
              }),
```

to:

```ts
              body:    JSON.stringify({
                workspaceId,
                content:       post.content,
                platforms:     [post.platform],
                scheduledAt:   post.scheduledAt,
                mediaUrls:     post.mediaUrls,
                status:        'DRAFT',
                topic:         post.topic ?? null,
                requiresMedia: post.mediaUrls.length === 0,
              }),
```

- [ ] **Step 3: Add the export handler**

Directly above `async function handleAddToCalendar() {`, add:

```ts
  function handleExportCsv() {
    const rows = posts
      .filter((p) => p.mediaUrls.length === 0)
      .map((p) => ({
        date:     format(parseISO(p.scheduledAt), 'yyyy-MM-dd'),
        time:     format(parseISO(p.scheduledAt), 'HH:mm'),
        platform: PLATFORM_LABELS[p.platform] ?? p.platform,
        topic:    p.topic,
        caption:  p.content,
      }))

    if (rows.length === 0) {
      toast.error('No posts without media to export.')
      return
    }

    const csv  = buildCaptionsCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `lyra-captions-${workspaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

```

- [ ] **Step 4: Add the Export button next to "Add all to calendar"**

Change:

```tsx
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">{posts.length} posts</span>
          <button
            onClick={handleAddToCalendar}
            disabled={isSaving || posts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium hover:bg-accent-white transition-colors disabled:opacity-50"
          >
            {isSaving
              ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
              : <Calendar size={12} strokeWidth={1.5} />
            }
            {isSaving ? 'Saving…' : 'Add all to calendar'}
          </button>
        </div>
```

to:

```tsx
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">{posts.length} posts</span>
          <button
            onClick={handleExportCsv}
            disabled={posts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-background-border text-text-secondary hover:text-text-primary hover:border-background-border-mid font-sans text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Download size={12} strokeWidth={1.5} />
            Export captions (CSV)
          </button>
          <button
            onClick={handleAddToCalendar}
            disabled={isSaving || posts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium hover:bg-accent-white transition-colors disabled:opacity-50"
          >
            {isSaving
              ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
              : <Calendar size={12} strokeWidth={1.5} />
            }
            {isSaving ? 'Saving…' : 'Add all to calendar'}
          </button>
        </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `schedule-review.tsx`

- [ ] **Step 6: Commit**

```bash
git add components/lyra/schedule/schedule-review.tsx
git commit -m "feat(schedule): add Export captions CSV button and set requiresMedia on save"
```

---

### Task 9: Manual verification

No test framework covers API routes or React components in this codebase (confirmed:
only `services/**` have `.test.ts` files) — every prior fix this project has shipped
was verified by type-check plus a live walkthrough, and this task follows the same
convention.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Full unit test run**

Run: `npx vitest run`
Expected: all tests pass, including the new `captions-csv.test.ts`.

- [ ] **Step 3: Live walkthrough**

Against a real workspace (dev or prod, whichever the user prefers to test in):

1. Open **Generate schedule**, pick 3 weeks and one platform, generate.
2. On the Review screen, click **Export captions (CSV)** — confirm a CSV downloads
   with one row per post (Date, Time, Platform, Topic, Caption) and opens cleanly in
   Excel/Sheets.
3. Click **Add all to calendar** — confirm the posts land on the Calendar with an
   amber **"Awaiting media"** badge instead of grey "Draft".
4. Open one from the Calendar's detail panel — confirm there is no "Mark as
   scheduled" action, and the amber explanatory note is visible.
5. Click **Edit in Composer** on that post — confirm "Schedule" and "Post now" are
   disabled with the inline warning message, and "Save draft" still works.
6. Attach an image via Compose, save — confirm the badge disappears from the
   Calendar and "Mark as scheduled" / "Schedule" are available again.
7. Schedule it for real — confirm it publishes normally (no regression to the
   existing publish path).
8. As a sanity check that scope is correctly limited: compose a plain text-only post
   by hand (not via Schedule Generator) for a platform that allows it (e.g. LinkedIn)
   and confirm it schedules with no media-related blocking at all.

- [ ] **Step 4: Update the Testing Checklist**

Add a line to `docs/LYRA-Testing-Checklist.md` recording this feature under whichever
section fits best (likely "Ongoing / lower priority" or a new Week 1 item), per the
existing convention of documenting what to (re)test post-launch.
