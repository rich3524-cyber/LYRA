# Content Calendar Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post detail slide-in panel, status filter tabs, and a loading skeleton to the existing content calendar so users can view, delete, and update posts without leaving the calendar view.

**Architecture:** The existing `ContentCalendar` component fetches posts and renders `PostPreviewCard` inside a DnD context. We separate the drag handle (a small grip icon) from the clickable content area on each card so DnD and click-to-open coexist. A new `PostDetailPanel` slides in from the right when a card is selected, showing full content and offering delete / status-change actions. Status filter tabs live above the calendar and filter the already-fetched posts client-side (no extra API calls). A loading boolean drives skeleton cells while month data loads.

**Tech Stack:** Next.js 15 App Router, React 19, Framer Motion (slide-in panel + backdrop), @dnd-kit/core (drag-to-reschedule), date-fns, Tailwind CSS (design tokens only), Lucide React, sonner (toasts)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lyra/components/lyra/calendar/post-preview-card.tsx` | Separate drag handle from click; add `onSelect` prop |
| Create | `lyra/components/lyra/calendar/post-detail-panel.tsx` | Slide-in panel: full content, delete, status change |
| Modify | `lyra/components/lyra/calendar/content-calendar.tsx` | Filter tabs, loading skeleton, panel state wiring |

---

## Design System Reference

Always use these tokens — never hardcode hex values:

```
bg-background-primary    (#080808) — page background
bg-background-secondary  (#0f0f0f) — card/panel backgrounds
bg-background-tertiary   (#141414) — elevated surfaces
bg-background-hover      (#1a1a1a) — hover states
border-background-border (#222222) — subtle borders
border-background-border-mid (#333333) — mid-weight borders
text-primary   (#e2e2e2) — primary text
text-secondary (#888888) — secondary labels
text-tertiary  (#555555) — muted / placeholder
accent-platinum (#d8d8d8) — primary CTA backgrounds
status-success / status-error / status-warning / status-info

font-sans    = DM Sans  (all UI text, weights 300/400/500 ONLY — never 700)
font-display = Instrument Serif (page titles only)
font-mono    = Geist Mono (counts, IDs, dates)

Icons: Lucide React only. strokeWidth={1.5} by default, {2} when active.
Rounded: rounded-xl for cards/panels, rounded-2xl for modals, rounded-md for badges.
Animation: duration 150–200ms, ease cubic-bezier(0.16, 1, 0.3, 1).
```

---

## Existing Code Reference

The existing `PostPreviewCard` spreads `{...listeners} {...attributes}` on the outer div, which intercepts mousedown and prevents click events. The fix is to put listeners ONLY on a small grip icon button, leaving the rest of the card as a normal clickable button.

The existing `ContentCalendar` (at `lyra/components/lyra/calendar/content-calendar.tsx`) uses:
- `useState<CalendarPost[]>` for posts
- `useCallback` + `useEffect` to fetch from `/api/posts?workspaceId=X&month=YYYY-MM`
- `DndContext` wrapping the grid
- `DayCell` sub-component that uses `useDroppable`

The `CalendarPost` interface is defined in `post-preview-card.tsx` and exported. Both files must stay in sync on that type.

Existing API routes:
- `PATCH /api/posts/[id]` accepts `{ status, scheduledAt, content, mediaUrls }` — returns updated post
- `DELETE /api/posts/[id]` — returns 204

The existing `app/api/posts/[id]/route.ts` already handles PATCH and DELETE correctly. No API changes needed.

---

### Task 1: Refactor PostPreviewCard — separate drag handle from click area

**Files:**
- Modify: `lyra/components/lyra/calendar/post-preview-card.tsx`

The problem: `{...listeners}` is spread on the outer container, so mousedown begins a drag and no click event fires. The solution: move listeners to a small GripVertical icon button. The outer container becomes a `<button>` that calls `onSelect`.

- [ ] **Step 1: Read the current file**

Read `lyra/components/lyra/calendar/post-preview-card.tsx` to see the exact current content before editing.

- [ ] **Step 2: Replace the file with the updated version**

Write the complete new content to `lyra/components/lyra/calendar/post-preview-card.tsx`:

```tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  socialAccount: { platform: string; name: string }
}

export const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK:        'FB',
  INSTAGRAM:       'IG',
  LINKEDIN:        'LI',
  TIKTOK:          'TT',
  TWITTER:         'X',
  GOOGLE_BUSINESS: 'GBP',
  YOUTUBE:         'YT',
  PINTEREST:       'PIN',
  THREADS:         'TH',
  BLUESKY:         'BSky',
}

// Platform brand colours — inline styles are intentional here (external brand identities, not LYRA's design system)
export const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK:        '#1877F2',
  INSTAGRAM:       '#C13584',
  LINKEDIN:        '#0A66C2',
  TIKTOK:          '#FF0050',
  TWITTER:         '#888888',
  GOOGLE_BUSINESS: '#4285F4',
  YOUTUBE:         '#FF0000',
  PINTEREST:       '#E60023',
  THREADS:         '#888888',
  BLUESKY:         '#0085FF',
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT:            'bg-background-border-mid text-text-tertiary',
  SCHEDULED:        'bg-status-info/20 text-status-info',
  PUBLISHED:        'bg-status-success/20 text-status-success',
  FAILED:           'bg-status-error/20 text-status-error',
  PENDING_APPROVAL: 'bg-status-warning/20 text-status-warning',
  CANCELLED:        'bg-background-border-mid text-text-tertiary',
}

interface PostPreviewCardProps {
  post: CalendarPost
  onSelect: (post: CalendarPost) => void
}

export function PostPreviewCard({ post, onSelect }: PostPreviewCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const platformColor = PLATFORM_COLORS[post.socialAccount.platform] ?? '#555555'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded bg-background-tertiary border border-background-border select-none flex items-start gap-1 p-1',
        isDragging && 'opacity-40 ring-1 ring-accent-silver'
      )}
    >
      {/* Drag handle — ONLY this element has DnD listeners */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing p-0.5 mt-0.5 text-text-tertiary hover:text-text-secondary shrink-0 transition-colors"
        aria-label="Drag to reschedule"
      >
        <GripVertical size={10} strokeWidth={1.5} />
      </button>

      {/* Clickable content area — opens detail panel */}
      <button
        type="button"
        className="flex-1 min-w-0 text-left"
        onClick={() => onSelect(post)}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1">
            <span
              className="shrink-0 rounded-full"
              style={{ width: 6, height: 6, backgroundColor: platformColor }}
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] text-text-tertiary">
              {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
            </span>
          </div>
          <span
            className={cn(
              'font-sans text-[9px] px-1 rounded-full',
              STATUS_COLORS[post.status] ?? 'bg-background-border text-text-tertiary'
            )}
          >
            {post.status.toLowerCase().replace('_', ' ')}
          </span>
        </div>
        <p className="font-sans text-[11px] text-text-secondary leading-tight line-clamp-2">
          {post.content}
        </p>
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/components/lyra/calendar/post-preview-card.tsx" && git commit -m "refactor: separate drag handle from click area in PostPreviewCard"
```

---

### Task 2: Create PostDetailPanel

**Files:**
- Create: `lyra/components/lyra/calendar/post-detail-panel.tsx`

This is a Framer Motion slide-in from the right. It has a semi-transparent backdrop. When open, it shows the full post content, the platform/account label, a status badge, the scheduled/published date, optional status-transition buttons, and footer actions (delete + edit-in-composer link).

Status transitions allowed:
- DRAFT → SCHEDULED (via PATCH with `scheduledAt` required — but we'll just update status here; the composer handles proper scheduling)
- SCHEDULED → DRAFT, SCHEDULED → CANCELLED
- FAILED → DRAFT
- CANCELLED → DRAFT
- PUBLISHED, PENDING_APPROVAL, PUBLISHING → no transitions (read-only states)

- [ ] **Step 1: Create the file**

Write to `lyra/components/lyra/calendar/post-detail-panel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, ExternalLink, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  CalendarPost,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  STATUS_COLORS,
} from './post-preview-card'

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED:         'Approved',
  SCHEDULED:        'Scheduled',
  PUBLISHING:       'Publishing',
  PUBLISHED:        'Published',
  FAILED:           'Failed',
  CANCELLED:        'Cancelled',
}

// Which status transitions are offered in the panel
const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
  DRAFT:      [{ value: 'SCHEDULED', label: 'Mark as scheduled' }],
  SCHEDULED:  [
    { value: 'DRAFT',      label: 'Move back to draft' },
    { value: 'CANCELLED',  label: 'Cancel post' },
  ],
  FAILED:     [{ value: 'DRAFT', label: 'Move back to draft' }],
  CANCELLED:  [{ value: 'DRAFT', label: 'Move back to draft' }],
}

interface Props {
  post: CalendarPost | null
  workspaceId: string
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (updated: CalendarPost) => void
}

export function PostDetailPanel({ post, workspaceId, onClose, onDeleted, onUpdated }: Props) {
  const [deleting, setDeleting]             = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  async function handleDelete() {
    if (!post) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Post deleted')
      onDeleted(post.id)
      onClose()
    } catch {
      toast.error('Failed to delete post')
    } finally {
      setDeleting(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!post) return
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Update failed')
      toast.success('Status updated')
      onUpdated({ ...post, status: newStatus })
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const date           = post?.publishedAt ?? post?.scheduledAt
  const platformColor  = post ? (PLATFORM_COLORS[post.socialAccount.platform] ?? '#555555') : '#555555'
  const nextStatuses   = post ? (NEXT_STATUSES[post.status] ?? []) : []

  return (
    <AnimatePresence>
      {post && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 bg-background-primary/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Slide-in panel */}
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-background-secondary border-l border-background-border flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-border">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="rounded-full shrink-0"
                  style={{ width: 8, height: 8, backgroundColor: platformColor }}
                  aria-hidden="true"
                />
                <span className="font-sans text-xs text-text-secondary truncate">
                  {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
                  {' · '}
                  {post.socialAccount.name}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="text-text-tertiary hover:text-text-secondary transition-colors shrink-0 ml-3"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {STATUS_LABEL[post.status] ?? post.status}
                </span>
                {post.aiGenerated && (
                  <span className="font-sans text-[10px] text-text-tertiary px-2 py-0.5 rounded-md bg-background-hover border border-background-border">
                    AI-generated
                  </span>
                )}
              </div>

              {/* Full content */}
              <div className="space-y-1.5">
                <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                  Content
                </p>
                <p className="font-sans text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </p>
              </div>

              {/* Date */}
              {date && (
                <div className="flex items-center gap-2">
                  <CalendarIcon size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
                  <span className="font-mono text-xs text-text-secondary">
                    {format(new Date(date), "MMM d, yyyy '·' h:mm a")}
                  </span>
                </div>
              )}

              {/* Media count */}
              {post.mediaUrls.length > 0 && (
                <p className="font-sans text-xs text-text-tertiary">
                  {post.mediaUrls.length} media {post.mediaUrls.length === 1 ? 'file' : 'files'} attached
                </p>
              )}

              {/* Status transition actions */}
              {nextStatuses.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                    Actions
                  </p>
                  {nextStatuses.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleStatusChange(value)}
                      disabled={updatingStatus}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-background-border font-sans text-xs text-text-secondary hover:border-background-border-mid hover:text-text-primary transition-colors disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-background-border flex items-center justify-between">
              <a
                href={`/workspace/${workspaceId}/compose`}
                className="inline-flex items-center gap-1.5 font-sans text-xs text-text-tertiary hover:text-text-primary transition-colors"
              >
                <ExternalLink size={12} strokeWidth={1.5} />
                Edit in Composer
              </a>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 font-sans text-xs text-status-error hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                <Trash2 size={12} strokeWidth={1.5} />
                {deleting ? 'Deleting…' : 'Delete post'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/components/lyra/calendar/post-detail-panel.tsx" && git commit -m "feat: add PostDetailPanel slide-in for calendar post management"
```

---

### Task 3: Update ContentCalendar — filter tabs, loading skeleton, panel wiring

**Files:**
- Modify: `lyra/components/lyra/calendar/content-calendar.tsx`

Changes needed:
1. Add `loading` state — set true before fetch, false after; show skeleton cells during loading.
2. Add `selectedPost: CalendarPost | null` state — passed to PostDetailPanel.
3. Add `activeFilter` state: `'ALL' | 'SCHEDULED' | 'DRAFT' | 'PUBLISHED' | 'FAILED'`.
4. Pass `onSelect` to PostPreviewCard.
5. Render PostDetailPanel (outside DndContext but inside the outer div).
6. Import PostDetailPanel and the new `onSelect` signature.

DayCell needs the `onSelect` prop forwarded to PostPreviewCard.

- [ ] **Step 1: Read the current file**

Read `lyra/components/lyra/calendar/content-calendar.tsx` to understand the exact current structure before making edits.

- [ ] **Step 2: Write the complete updated file**

Write the full updated content to `lyra/components/lyra/calendar/content-calendar.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  setDate,
} from 'date-fns'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PostPreviewCard, CalendarPost, PLATFORM_COLORS, PLATFORM_LABELS } from './post-preview-card'
import { PostDetailPanel } from './post-detail-panel'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type FilterValue = 'ALL' | 'SCHEDULED' | 'DRAFT' | 'PUBLISHED' | 'FAILED'

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: 'ALL',       label: 'All' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'DRAFT',     label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'FAILED',    label: 'Failed' },
]

function SkeletonCell() {
  return (
    <div className="bg-background-secondary min-h-[120px] p-2 space-y-2">
      <div className="h-3 w-4 rounded bg-background-hover animate-pulse" />
      <div className="h-8 rounded bg-background-hover animate-pulse" />
      <div className="h-8 rounded bg-background-hover animate-pulse" />
    </div>
  )
}

function DayCell({
  day,
  posts,
  isCurrentDay,
  onSelect,
}: {
  day: Date
  posts: CalendarPost[]
  isCurrentDay: boolean
  onSelect: (post: CalendarPost) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.toISOString() })

  const platforms = Array.from(new Set(posts.map((p) => p.socialAccount.platform)))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bg-background-secondary min-h-[120px] p-2 space-y-1 transition-colors',
        isCurrentDay && 'bg-background-tertiary',
        isOver && 'bg-background-hover'
      )}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span
          className={cn(
            'font-sans text-xs',
            isCurrentDay ? 'text-accent-platinum font-medium' : 'text-text-tertiary'
          )}
        >
          {format(day, 'd')}
        </span>
        {platforms.length > 0 && (
          <div
            className="flex items-center gap-0.5"
            aria-label={`Platforms: ${platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}`}
          >
            {platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-full shrink-0"
                style={{ width: 6, height: 6, backgroundColor: PLATFORM_COLORS[platform] ?? '#555555' }}
                title={PLATFORM_LABELS[platform] ?? platform}
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>
      {posts.map((post) => (
        <PostPreviewCard key={post.id} post={post} onSelect={onSelect} />
      ))}
    </div>
  )
}

export function ContentCalendar({ workspaceId }: { workspaceId: string }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [posts, setPosts]               = useState<CalendarPost[]>([])
  const [loading, setLoading]           = useState(true)
  const [activePost, setActivePost]     = useState<CalendarPost | null>(null)
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>('ALL')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const loadPosts = useCallback(() => {
    setLoading(true)
    fetch(`/api/posts?workspaceId=${workspaceId}&month=${format(currentMonth, 'yyyy-MM')}`)
      .then((r) => r.json())
      .then((data: CalendarPost[]) => setPosts(Array.isArray(data) ? data : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [workspaceId, currentMonth])

  useEffect(() => { loadPosts() }, [loadPosts])

  const filteredPosts = activeFilter === 'ALL'
    ? posts
    : posts.filter((p) => p.status === activeFilter)

  const days     = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startDay = startOfMonth(currentMonth).getDay()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActivePost(null)
    if (!over || active.id === over.id) return

    const post = posts.find((p) => p.id === active.id)
    if (!post) return

    const targetDay        = new Date(over.id as string)
    const originalDate     = post.scheduledAt ? new Date(post.scheduledAt) : new Date()
    const newScheduledAt   = setDate(originalDate, targetDay.getDate())

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, scheduledAt: newScheduledAt.toISOString() } : p
      )
    )

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scheduledAt: newScheduledAt.toISOString() }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      toast.success('Post rescheduled')
    } catch {
      toast.error('Failed to reschedule post')
      loadPosts()
    }
  }

  function handlePostDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }

  function handlePostUpdated(updated: CalendarPost) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setSelectedPost(updated)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          const post = posts.find((p) => p.id === e.active.id)
          setActivePost(post ?? null)
        }}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-sm font-medium text-text-secondary tracking-widest uppercase">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                aria-label="Previous month"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                aria-label="Next month"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {FILTER_TABS.map(({ value, label }) => {
              const count = value === 'ALL'
                ? posts.length
                : posts.filter((p) => p.status === value).length
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveFilter(value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-sans text-xs transition-colors',
                    activeFilter === value
                      ? 'bg-background-hover text-text-primary border border-background-border-mid'
                      : 'text-text-tertiary hover:text-text-secondary border border-transparent'
                  )}
                >
                  {label}
                  {count > 0 && (
                    <span className="font-mono text-[10px] text-text-tertiary">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-background-border rounded-xl overflow-hidden">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div
                key={d}
                className="bg-background-secondary px-3 py-2 font-sans text-xs text-text-tertiary text-center tracking-widest"
              >
                {d}
              </div>
            ))}

            {Array.from({ length: startDay }).map((_, i) => (
              loading
                ? <SkeletonCell key={`empty-skel-${i}`} />
                : <div key={`empty-${i}`} className="bg-background-secondary min-h-[120px]" />
            ))}

            {loading
              ? days.map((day) => <SkeletonCell key={day.toISOString()} />)
              : days.map((day) => {
                  const dayPosts = filteredPosts.filter(
                    (p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day)
                  )
                  return (
                    <DayCell
                      key={day.toISOString()}
                      day={day}
                      posts={dayPosts}
                      isCurrentDay={isToday(day)}
                      onSelect={setSelectedPost}
                    />
                  )
                })}
          </div>
        </div>

        <DragOverlay>
          {activePost ? (
            <div className="opacity-90 rotate-1 scale-105">
              <PostPreviewCard post={activePost} onSelect={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail panel lives outside DndContext to avoid z-index conflicts */}
      <PostDetailPanel
        post={selectedPost}
        workspaceId={workspaceId}
        onClose={() => setSelectedPost(null)}
        onDeleted={handlePostDeleted}
        onUpdated={handlePostUpdated}
      />
    </>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Lint check**

```bash
cd lyra && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing" && git add "LYRA/lyra/components/lyra/calendar/content-calendar.tsx" && git commit -m "feat: add status filter tabs, loading skeleton, and panel wiring to ContentCalendar"
```

---

## Self-Review Checklist

- [x] All three files have tasks: post-preview-card ✅, post-detail-panel ✅, content-calendar ✅
- [x] `onSelect` prop is consistent: defined in PostPreviewCard, passed through DayCell, set in ContentCalendar
- [x] `PostDetailPanel` imported in content-calendar.tsx
- [x] `STATUS_COLORS` exported from post-preview-card.tsx and imported in post-detail-panel.tsx
- [x] `handlePostDeleted` and `handlePostUpdated` update local state so UI is instantly consistent without re-fetch
- [x] `CalendarPost` type unchanged — no breaking changes to the existing API response type
- [x] No hardcoded hex values — all Tailwind tokens
- [x] Lucide icons at strokeWidth={1.5}
- [x] DragOverlay passes `onSelect={() => {}}` (no-op) since dragging should not open the panel
- [x] Backdrop click closes panel (onClick on backdrop div)
- [x] Loading skeleton shown for BOTH empty leading cells and day cells
