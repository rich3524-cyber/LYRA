# Composer UI — Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Post Composer so users can schedule posts at a specific date + time, guide AI generation with a topic, see a per-platform character limit, and view/delete saved drafts.

**Architecture:** The PostComposer client component is extended in-place (no new component files needed for the composer itself). A new `DraftList` client component fetches drafts independently and uses a custom DOM event to stay in sync with PostComposer saves. The posts API gains a `status` query filter to support draft retrieval.

**Tech Stack:** Next.js 15 App Router, Tiptap, shadcn/ui Calendar, date-fns, Tailwind design tokens, Lucide icons, Sonner toast.

---

## Context — what already exists

- `lyra/components/lyra/composer/post-composer.tsx` — fully functional composer: Tiptap editor, platform selector, media uploader, AI generate, save draft, schedule. **Gaps:** date-only picker (no time), no topic for AI, no char counter.
- `lyra/components/lyra/composer/platform-selector.tsx` — renders connected platform chips.
- `lyra/components/lyra/composer/media-uploader.tsx` — S3 upload via `/api/upload`.
- `lyra/app/(dashboard)/workspace/[workspaceId]/compose/page.tsx` — server component, checks workspace access, renders PostComposer.
- `lyra/app/api/posts/route.ts` — GET (by month filter) + POST. **Gap:** no status filter.
- `lyra/app/api/posts/[id]/route.ts` — PATCH + DELETE.

All working directory paths below are relative to `lyra/` inside the repo (`c:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra\`).

---

## Task 1: Add `status` filter to GET /api/posts

**Files:**
- Modify: `app/api/posts/route.ts`

- [ ] **Step 1: Open `app/api/posts/route.ts`.** The relevant block starts at line where `const where = {` is defined. Add a status query param:

```typescript
// After the existing month filter lines, update the where block:
const status = searchParams.get('status')

const where = {
  workspaceId,
  ...(scheduledAtFilter ? { scheduledAt: scheduledAtFilter } : {}),
  ...(status ? { status } : {}),
}
```

Full updated GET handler (replace the existing one):

```typescript
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const month = searchParams.get('month')
    const status = searchParams.get('status')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let scheduledAtFilter: { gte: Date; lt: Date } | undefined
    if (month) {
      const [year, mon] = month.split('-').map(Number)
      scheduledAtFilter = {
        gte: new Date(year, mon - 1, 1),
        lt: new Date(year, mon, 1),
      }
    }

    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        ...(scheduledAtFilter ? { scheduledAt: scheduledAtFilter } : {}),
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        mediaUrls: true,
        aiGenerated: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(posts)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run from `lyra/`:
```bash
npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/app/api/posts/route.ts
git commit -m "feat: add status filter to GET /api/posts"
```

---

## Task 2: Add time picker, topic input, and character counter to PostComposer

**Files:**
- Modify: `lyra/components/lyra/composer/post-composer.tsx`

The three changes go into one file. Full replacement of `post-composer.tsx`:

- [ ] **Step 1: Replace `components/lyra/composer/post-composer.tsx` with the following:**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Sparkles, CalendarIcon, Send } from 'lucide-react'
import { PlatformSelector } from './platform-selector'
import { MediaUploader } from './media-uploader'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const CHAR_LIMITS: Record<string, number> = {
  TWITTER:          280,
  GOOGLE_BUSINESS:  1500,
  INSTAGRAM:        2200,
  TIKTOK:           2200,
  LINKEDIN:         3000,
  FACEBOOK:         63206,
}

interface PostComposerProps {
  workspaceId: string
  connectedPlatforms: string[]
}

export function PostComposer({ workspaceId, connectedPlatforms }: PostComposerProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [scheduleDate, setScheduleDate]             = useState<Date | undefined>()
  const [scheduleTime, setScheduleTime]             = useState('09:00')
  const [mediaUrls, setMediaUrls]                   = useState<string[]>([])
  const [topic, setTopic]                           = useState('')
  const [isGenerating, setIsGenerating]             = useState(false)
  const [isSubmitting, setIsSubmitting]             = useState(false)

  // Combine date + time into a single Date for the API
  const scheduledAt = useMemo(() => {
    if (!scheduleDate) return undefined
    const [h, m] = scheduleTime.split(':').map(Number)
    const d = new Date(scheduleDate)
    d.setHours(h, m, 0, 0)
    return d
  }, [scheduleDate, scheduleTime])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your post, or let LYRA AI generate it…' }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[160px] text-sm text-text-primary leading-relaxed outline-none',
      },
    },
  })

  // Character counter
  const charCount = editor?.getText().length ?? 0
  const charLimit = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map((p) => CHAR_LIMITS[p] ?? 63206))
    : null
  const overLimit = charLimit !== null && charCount > charLimit

  const handleAIGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Select at least one platform first')
      return
    }
    setIsGenerating(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, platforms: selectedPlatforms, topic: topic.trim() || undefined }),
      })
      const data = await res.json()
      editor?.commands.setContent(data.content)
    } catch {
      toast.error('Failed to generate content')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async (status: 'DRAFT' | 'SCHEDULED') => {
    const content = editor?.getText()
    if (!content?.trim()) { toast.error('Post content is required'); return }
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return }
    if (status === 'SCHEDULED' && !scheduledAt) { toast.error('Set a schedule date and time'); return }
    if (overLimit) { toast.error(`Content exceeds the ${charLimit}-character limit`); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content, platforms: selectedPlatforms, scheduledAt, mediaUrls, status }),
      })
      if (!res.ok) throw new Error('Failed to save post')
      toast.success(status === 'SCHEDULED' ? 'Post scheduled' : 'Draft saved')
      editor?.commands.clearContent()
      setSelectedPlatforms([])
      setScheduleDate(undefined)
      setScheduleTime('09:00')
      setMediaUrls([])
      setTopic('')
      // Signal DraftList to refresh
      window.dispatchEvent(new CustomEvent('draft-saved'))
    } catch {
      toast.error('Failed to save post')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-background-secondary border border-background-border rounded-xl overflow-hidden">
      {/* Platform selector */}
      <div className="px-5 py-4 border-b border-background-border">
        <p className="font-sans text-xs text-text-tertiary mb-3 tracking-wider uppercase">Post to</p>
        <PlatformSelector
          connectedPlatforms={connectedPlatforms}
          selected={selectedPlatforms}
          onChange={setSelectedPlatforms}
        />
      </div>

      {/* Topic input */}
      <div className="px-5 pt-4">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic hint for AI (optional) — e.g. spring sale, new product launch…"
          className="w-full bg-transparent text-xs text-text-tertiary placeholder:text-text-tertiary/60 outline-none border-b border-background-border pb-3 focus:border-background-border-mid transition-colors"
        />
      </div>

      {/* Editor */}
      <div className="px-5 py-4">
        <EditorContent editor={editor} />
      </div>

      {/* Media previews */}
      {mediaUrls.length > 0 && (
        <div className="px-5 pb-4">
          <div className="flex gap-2 flex-wrap">
            {mediaUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                className="h-16 w-16 object-cover rounded-md border border-background-border"
              />
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-background-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={handleAIGenerate}
            disabled={isGenerating}
            className="text-text-secondary hover:text-text-primary gap-2 text-xs"
          >
            <Sparkles size={14} className={cn(isGenerating && 'animate-pulse')} />
            {isGenerating ? 'Generating…' : 'AI Generate'}
          </Button>
          <MediaUploader
            workspaceId={workspaceId}
            onUpload={(url) => setMediaUrls((prev) => [...prev, url])}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Character counter */}
          {charLimit !== null && (
            <span className={cn(
              'font-mono text-xs tabular-nums',
              overLimit ? 'text-status-error' : charCount > charLimit * 0.9 ? 'text-status-warning' : 'text-text-tertiary'
            )}>
              {charCount}/{charLimit}
            </span>
          )}

          {/* Schedule picker */}
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors h-8 px-2 rounded-md hover:bg-background-hover bg-transparent border-0 cursor-pointer"
              aria-label="Set schedule time"
            >
              <CalendarIcon size={14} />
              {scheduleDate
                ? `${format(scheduleDate, 'MMM d')} at ${scheduleTime}`
                : 'Schedule'}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-background-tertiary border-background-border">
              <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} />
              <div className="px-3 pb-3 border-t border-background-border pt-3">
                <label className="block font-sans text-xs text-text-tertiary mb-1.5">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-lg bg-background-secondary border border-background-border px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-background-border-mid transition-colors"
                />
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => handleSubmit('DRAFT')}
            disabled={isSubmitting}
            className="text-text-tertiary hover:text-text-primary text-xs"
          >
            Save draft
          </Button>

          <Button
            size="sm"
            type="button"
            onClick={() => handleSubmit('SCHEDULED')}
            disabled={isSubmitting || !scheduleDate}
            className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
          >
            <Send size={12} />
            {isSubmitting ? 'Scheduling…' : 'Schedule'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/components/lyra/composer/post-composer.tsx
git commit -m "feat: add time picker, topic input, and char counter to PostComposer"
```

---

## Task 3: Create DraftList component

**Files:**
- Create: `lyra/components/lyra/composer/draft-list.tsx`

- [ ] **Step 1: Create `components/lyra/composer/draft-list.tsx`:**

```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Draft {
  id: string
  content: string
  createdAt: string
  socialAccount: { platform: string; name: string }
}

const PLATFORM_SHORT: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
}

export function DraftList({ workspaceId }: { workspaceId: string }) {
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/posts?workspaceId=${workspaceId}&status=DRAFT`)
      .then((r) => r.json())
      .then((data: Draft[]) => { setDrafts(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => {
    load()
    window.addEventListener('draft-saved', load)
    return () => window.removeEventListener('draft-saved', load)
  }, [load])

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/posts/${id}`, { method: 'DELETE' })
      setDrafts((prev) => prev.filter((d) => d.id !== id))
      toast.success('Draft deleted')
    } catch {
      toast.error('Failed to delete draft')
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
        ))}
      </div>
    )
  }

  if (drafts.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="font-sans text-xs uppercase tracking-wider text-text-tertiary">Saved drafts</p>
      <div className="space-y-2">
        {drafts.map((d) => (
          <div
            key={d.id}
            className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-accent-silver">
                  {PLATFORM_SHORT[d.socialAccount.platform] ?? d.socialAccount.platform}
                </span>
                <span className="font-sans text-xs text-text-tertiary">
                  {format(new Date(d.createdAt), 'MMM d')}
                </span>
              </div>
              <p className="font-sans text-sm text-text-secondary truncate">
                {d.content.length > 80 ? `${d.content.slice(0, 80)}…` : d.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(d.id)}
              aria-label="Delete draft"
              className="shrink-0 text-text-tertiary hover:text-status-error transition-colors mt-0.5"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/components/lyra/composer/draft-list.tsx
git commit -m "feat: add DraftList component — shows saved drafts with delete"
```

---

## Task 4: Wire DraftList into the compose page

**Files:**
- Modify: `lyra/app/(dashboard)/workspace/[workspaceId]/compose/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx`:**

```typescript
import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PostComposer } from '@/components/lyra/composer/post-composer'
import { DraftList } from '@/components/lyra/composer/draft-list'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function ComposePage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true },
  })
  if (!workspace) notFound()

  const socialAccounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true },
    select: { platform: true },
  })
  const connectedPlatforms = [...new Set(socialAccounts.map((a) => a.platform as string))]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Compose</h2>
        <p className="font-sans text-sm text-text-secondary mt-1">{workspace.name}</p>
      </div>

      <PostComposer workspaceId={workspaceId} connectedPlatforms={connectedPlatforms} />

      {connectedPlatforms.length === 0 && (
        <p className="font-sans text-xs text-text-tertiary text-center">
          No social accounts connected yet.{' '}
          <a
            href={`/workspace/${workspaceId}/settings`}
            className="text-accent-silver hover:text-text-primary underline"
          >
            Connect accounts
          </a>{' '}
          to start posting.
        </p>
      )}

      <DraftList workspaceId={workspaceId} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/app/\(dashboard\)/workspace/\[workspaceId\]/compose/page.tsx
git commit -m "feat: add DraftList to compose page"
```

---

## Task 5: Final verification and push

- [ ] **Step 1: Type-check one final time**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra"
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 2: Manual smoke test**

Start dev server:
```bash
npm run dev
```

Navigate to `/workspace/[any-workspace-id]/compose` and verify:
- Platform selector shows connected accounts
- Topic input appears above the editor
- Editor accepts text
- Character counter appears when a platform is selected (e.g. select Twitter → shows `0/280`)
- Counter turns warning colour at 90% of limit
- Counter turns red when over limit
- "Schedule" popover shows Calendar + time input; selecting a date and time updates the trigger label (e.g. `May 20 at 09:00`)
- "Save draft" saves and resets the form; draft appears in the list below
- "Delete" on a draft removes it
- "AI Generate" calls the AI (requires a brand profile + connected social account)

- [ ] **Step 3: Push**

```bash
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing"
git push origin main
```

Expected: Netlify picks up the push and deploys.
