# AI Schedule Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Generate schedule" button to the Calendar page that uses the brand profile to produce a full 3 or 6 week content calendar across connected platforms, with AI captions and hashtags, presented as an editable review screen before landing in the calendar as drafts.

**Architecture:** A service function (`schedule-generator.ts`) calls Claude once per week of content, returning structured JSON posts. An SSE API route streams week-by-week progress to the client. A single client component (`schedule-generator.tsx`) manages three phases inline — config panel, generation progress bar, and review screen — opening as a Dialog. After review, posts are bulk-submitted to the existing `POST /api/posts` route as `DRAFT`. No schema changes required.

**Tech Stack:** React client component, Anthropic Claude API (`claude-sonnet-4-6`), Server-Sent Events (ReadableStream), existing `/api/posts` POST route, shadcn/ui Dialog, Lucide icons, date-fns

---

## File Map

**Create:**
- `lyra/services/ai/schedule-generator.ts` — Claude service; generates one week's posts per call
- `lyra/app/api/schedule/generate/route.ts` — SSE POST route; loops weeks, streams progress
- `lyra/components/lyra/schedule/schedule-generator.tsx` — Full modal component (config → generating → review)

**Modify:**
- `lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` — Add brand profile + platform fetch; render `<ScheduleGenerator>`

---

### Task 1: Schedule generator service

**Files:**
- Create: `lyra/services/ai/schedule-generator.ts`

- [ ] **Step 1: Confirm the services/ai/ directory exists**

Run: `cd lyra && ls services/ai/`
Expected: `caption-generator.ts`, `response-generator.ts`, `prompt-builder.ts` (or similar — directory must exist)

- [ ] **Step 2: Create the service file**

Create `lyra/services/ai/schedule-generator.ts` with this exact content:

```typescript
import { anthropic } from '@/lib/anthropic'

export type GeneratedPost = {
  platform: string
  topic: string
  content: string
  scheduledAt: string
}

type BrandContext = {
  voiceSummary: string | null
  toneAttributes: string[]
  contentThemes: string[]
  audienceProfile: unknown
}

export async function generateWeekPosts(
  brand: BrandContext,
  weekNumber: number,
  weekStartDate: Date,
  platforms: Record<string, number>,
): Promise<GeneratedPost[]> {
  const platformList = Object.entries(platforms)
    .map(([platform, count]) => `${platform}: ${count} posts`)
    .join('\n')

  const themes = brand.contentThemes.length > 0 ? brand.contentThemes.join(', ') : 'General business content'
  const voice = brand.voiceSummary ?? 'Professional and engaging'
  const tone = brand.toneAttributes.length > 0 ? brand.toneAttributes.join(', ') : 'Professional'
  const weekStartStr = weekStartDate.toISOString().split('T')[0]

  const prompt = `You are a social media content strategist creating week ${weekNumber} of a scheduled campaign.

BRAND VOICE: ${voice}
TONE ATTRIBUTES: ${tone}
CONTENT THEMES: ${themes}
AUDIENCE: ${JSON.stringify(brand.audienceProfile ?? {})}

PLATFORMS AND POST COUNT THIS WEEK:
${platformList}

WEEK START DATE: ${weekStartStr}

Generate exactly the specified number of posts for each platform. Distribute posts across different days of the 7-day window starting ${weekStartStr}. Prefer different content themes for consecutive posts on the same platform.

Optimal posting times per platform:
- INSTAGRAM: 09:00, 12:00, 18:00
- LINKEDIN: 08:00, 12:00, 17:00
- FACEBOOK: 10:00, 15:00, 20:00
- TWITTER: 08:00, 12:00, 17:00, 20:00
- TIKTOK: 09:00, 15:00, 19:00
- GOOGLE_BUSINESS: 09:00, 14:00

Return ONLY a JSON array with no markdown fences, no explanation, and no trailing text. Use this exact shape:
[
  {
    "platform": "INSTAGRAM",
    "topic": "behind the scenes at our workshop",
    "content": "Full caption text with hashtags at the end. #hashtag1 #hashtag2",
    "scheduledAt": "2026-05-26T09:00:00.000Z"
  }
]

Rules:
- scheduledAt must be ISO 8601 UTC and fall within the 7 days starting ${weekStartStr}
- Each caption must match the brand voice and include 3–8 relevant hashtags
- No two consecutive posts on the same platform may share the same topic
- Do not repeat the exact same caption text for any two posts`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'

  try {
    return JSON.parse(text) as GeneratedPost[]
  } catch {
    console.error('schedule-generator: failed to parse Claude response', text.slice(0, 500))
    return []
  }
}
```

- [ ] **Step 3: Verify TypeScript for this file alone**

Run: `cd lyra && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: no errors referencing `schedule-generator.ts`

- [ ] **Step 4: Commit**

```bash
git add lyra/services/ai/schedule-generator.ts
git commit -m "feat: add AI schedule generator service"
```

---

### Task 2: SSE API route

**Files:**
- Create: `lyra/app/api/schedule/generate/route.ts`

- [ ] **Step 1: Create the directory and file**

Create `lyra/app/api/schedule/generate/route.ts` with this exact content:

```typescript
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateWeekPosts, GeneratedPost } from '@/services/ai/schedule-generator'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()

    const body = await req.json() as {
      workspaceId: string
      durationWeeks: 3 | 6
      platforms: Record<string, number>
    }
    const { workspaceId, durationWeeks, platforms } = body

    if (!workspaceId || !durationWeeks || !platforms) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      include: { brandProfile: true },
    })

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 })
    }
    if (!workspace.brandProfile) {
      return new Response(JSON.stringify({ error: 'Brand profile required' }), { status: 400 })
    }

    const brand = {
      voiceSummary: workspace.brandProfile.voiceSummary,
      toneAttributes: workspace.brandProfile.toneAttributes,
      contentThemes: workspace.brandProfile.contentThemes,
      audienceProfile: workspace.brandProfile.audienceProfile,
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        }

        try {
          // Start from next Monday at midnight UTC
          const weekStart = new Date()
          weekStart.setUTCHours(0, 0, 0, 0)
          const dayOfWeek = weekStart.getUTCDay() // 0 = Sunday
          const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
          weekStart.setUTCDate(weekStart.getUTCDate() + daysUntilMonday)

          for (let week = 1; week <= durationWeeks; week++) {
            send('progress', {
              week,
              total: durationWeeks,
              status: `Generating week ${week} of ${durationWeeks}…`,
            })

            const thisWeekStart = new Date(weekStart)
            thisWeekStart.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7)

            const posts = await generateWeekPosts(brand, week, thisWeekStart, platforms)
            send('week_posts', { week, posts })
          }

          send('done', {})
        } catch (error) {
          send('error', {
            message: error instanceof Error ? error.message : 'Generation failed',
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    console.error('POST /api/schedule/generate error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd lyra && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add lyra/app/api/schedule/generate/route.ts
git commit -m "feat: add SSE schedule generation API route"
```

---

### Task 3: Schedule generator modal component

**Files:**
- Create: `lyra/components/lyra/schedule/schedule-generator.tsx`

- [ ] **Step 1: Check whether shadcn Dialog is installed**

Run: `ls lyra/components/ui/ | grep dialog`
- If `dialog.tsx` is listed: proceed to Step 2
- If not found, run: `cd lyra && npx shadcn-ui@latest add dialog` and confirm the file appears

- [ ] **Step 2: Create the component directory and file**

Create `lyra/components/lyra/schedule/schedule-generator.tsx` with this exact content:

```tsx
'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Calendar, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import type { GeneratedPost } from '@/services/ai/schedule-generator'

type PostEntry = GeneratedPost & { id: string; weekNum: number }
type Phase = 'config' | 'generating' | 'review'

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM:       'Instagram',
  LINKEDIN:        'LinkedIn',
  FACEBOOK:        'Facebook',
  TWITTER:         'Twitter/X',
  TIKTOK:          'TikTok',
  GOOGLE_BUSINESS: 'Google Business',
}

interface ScheduleGeneratorProps {
  workspaceId: string
  connectedPlatforms: string[]
  hasBrandProfile: boolean
}

export function ScheduleGenerator({
  workspaceId,
  connectedPlatforms,
  hasBrandProfile,
}: ScheduleGeneratorProps) {
  const [open, setOpen]                   = useState(false)
  const [phase, setPhase]                 = useState<Phase>('config')
  const [durationWeeks, setDurationWeeks] = useState<3 | 6>(6)
  const [selected, setSelected]           = useState<Record<string, boolean>>(
    Object.fromEntries(connectedPlatforms.map(p => [p, true]))
  )
  const [postsPerWeek, setPostsPerWeek]   = useState<Record<string, number>>(
    Object.fromEntries(connectedPlatforms.map(p => [p, 3]))
  )
  const [progress, setProgress]           = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [posts, setPosts]                 = useState<PostEntry[]>([])
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editContent, setEditContent]     = useState('')
  const [isSaving, setIsSaving]           = useState(false)
  const abortRef                          = useRef<AbortController | null>(null)

  const activePlatforms = connectedPlatforms.filter(p => selected[p])
  const totalPosts = activePlatforms.reduce(
    (sum, p) => sum + postsPerWeek[p] * durationWeeks, 0
  )

  const handleOpen = () => {
    if (!hasBrandProfile) {
      toast.error('Build a brand profile first. LYRA needs your brand context to generate content.')
      return
    }
    if (connectedPlatforms.length === 0) {
      toast.error('Connect at least one social account before generating a schedule.')
      return
    }
    setPhase('config')
    setPosts([])
    setProgress(0)
    setOpen(true)
  }

  const handleGenerate = async () => {
    setPhase('generating')
    setProgress(0)
    setPosts([])

    const platforms: Record<string, number> = {}
    for (const p of activePlatforms) platforms[p] = postsPerWeek[p]

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, durationWeeks, platforms }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      let eventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'progress') {
              setProgress(Math.round((data.week / data.total) * 100))
              setProgressLabel(data.status)
            } else if (eventType === 'week_posts') {
              const incoming: PostEntry[] = (data.posts as GeneratedPost[]).map(p => ({
                ...p,
                id: crypto.randomUUID(),
                weekNum: data.week,
              }))
              setPosts(prev => [...prev, ...incoming])
            } else if (eventType === 'done') {
              setPhase('review')
            } else if (eventType === 'error') {
              throw new Error(data.message)
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      toast.error('Schedule generation failed. Try again.')
      setPhase('config')
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setPhase('config')
  }

  const handleDelete = (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  const handleEditSave = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, content: editContent } : p))
    setEditingId(null)
  }

  const handleAddToCalendar = async () => {
    setIsSaving(true)
    try {
      const results = await Promise.all(
        posts.map(post =>
          fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              content: post.content,
              platforms: [post.platform],
              scheduledAt: post.scheduledAt,
              status: 'DRAFT',
            }),
          })
        )
      )
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        toast.error(`${failed} posts failed to save. The rest were added.`)
      } else {
        toast.success(`${posts.length} posts added to your calendar as drafts.`)
      }
      window.dispatchEvent(new CustomEvent('draft-saved'))
      setOpen(false)
    } catch {
      toast.error('Failed to save posts. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const postsByWeek = posts.reduce<Record<number, PostEntry[]>>((acc, post) => {
    if (!acc[post.weekNum]) acc[post.weekNum] = []
    acc[post.weekNum].push(post)
    return acc
  }, {})

  const sortedWeeks = Object.keys(postsByWeek)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <>
      <Button
        onClick={handleOpen}
        variant="ghost"
        size="sm"
        className="gap-2 text-text-secondary hover:text-text-primary text-xs border border-background-border hover:border-background-border-mid transition-all duration-150"
      >
        <Sparkles size={13} strokeWidth={1.5} />
        Generate schedule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background-secondary border-background-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-background-border shrink-0">
            <DialogTitle className="font-sans text-base font-medium text-text-primary">
              {phase === 'config'     && 'Generate content schedule'}
              {phase === 'generating' && 'Generating your schedule…'}
              {phase === 'review'     && `Review ${posts.length} posts`}
            </DialogTitle>
          </DialogHeader>

          {/* ── CONFIG ── */}
          {phase === 'config' && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-widest mb-3">
                  Duration
                </p>
                <div className="flex gap-2">
                  {([3, 6] as const).map(weeks => (
                    <button
                      key={weeks}
                      onClick={() => setDurationWeeks(weeks)}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg text-sm font-sans border transition-colors',
                        durationWeeks === weeks
                          ? 'bg-background-tertiary border-background-border-mid text-text-primary'
                          : 'border-background-border text-text-secondary hover:text-text-primary hover:border-background-border-mid'
                      )}
                    >
                      {weeks} weeks
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-widest mb-3">
                  Platforms &amp; frequency
                </p>
                <div className="space-y-2">
                  {connectedPlatforms.map(platform => (
                    <div
                      key={platform}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-background-tertiary border border-background-border"
                    >
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selected[platform] ?? true}
                          onChange={e =>
                            setSelected(prev => ({ ...prev, [platform]: e.target.checked }))
                          }
                          className="accent-accent-platinum w-4 h-4 cursor-pointer"
                        />
                        <span className="text-sm text-text-primary">
                          {PLATFORM_LABELS[platform] ?? platform}
                        </span>
                      </label>
                      {selected[platform] && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setPostsPerWeek(prev => ({
                                ...prev,
                                [platform]: Math.max(1, prev[platform] - 1),
                              }))
                            }
                            className="w-6 h-6 rounded-md bg-background-hover text-text-secondary hover:text-text-primary flex items-center justify-center text-sm transition-colors"
                            aria-label={`Decrease posts per week for ${platform}`}
                          >
                            −
                          </button>
                          <span className="font-mono text-xs text-text-primary w-4 text-center">
                            {postsPerWeek[platform]}
                          </span>
                          <button
                            onClick={() =>
                              setPostsPerWeek(prev => ({
                                ...prev,
                                [platform]: Math.min(7, prev[platform] + 1),
                              }))
                            }
                            className="w-6 h-6 rounded-md bg-background-hover text-text-secondary hover:text-text-primary flex items-center justify-center text-sm transition-colors"
                            aria-label={`Increase posts per week for ${platform}`}
                          >
                            +
                          </button>
                          <span className="text-xs text-text-tertiary ml-1">/ week</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-text-tertiary">
                <span className="font-mono text-text-secondary">{totalPosts}</span> posts across{' '}
                <span className="font-mono text-text-secondary">{activePlatforms.length}</span>{' '}
                platforms over{' '}
                <span className="font-mono text-text-secondary">{durationWeeks}</span> weeks
              </p>
            </div>
          )}

          {/* ── GENERATING ── */}
          {phase === 'generating' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 space-y-6">
              <div className="w-full max-w-sm space-y-3">
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>{progressLabel}</span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-0.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-platinum rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-text-tertiary text-center">
                  LYRA is building your {durationWeeks}-week content plan. This takes about{' '}
                  {durationWeeks === 3 ? '30' : '60'} seconds.
                </p>
              </div>
            </div>
          )}

          {/* ── REVIEW ── */}
          {phase === 'review' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {sortedWeeks.map(weekNum => (
                <div key={weekNum}>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-widest mb-3">
                    Week {weekNum}
                  </p>
                  <div className="space-y-2">
                    {postsByWeek[weekNum]
                      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                      .map(post => {
                        const isEditing = editingId === post.id
                        return (
                          <div
                            key={post.id}
                            className="rounded-xl bg-background-tertiary border border-background-border p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium text-text-secondary shrink-0">
                                  {PLATFORM_LABELS[post.platform] ?? post.platform}
                                </span>
                                <span className="text-text-tertiary text-xs">·</span>
                                <span className="font-mono text-xs text-text-tertiary truncate">
                                  {format(parseISO(post.scheduledAt), 'EEE MMM d, h:mm a')}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleEditSave(post.id)}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-status-success transition-colors"
                                      aria-label="Save edit"
                                    >
                                      <Check size={13} strokeWidth={1.5} />
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary transition-colors"
                                      aria-label="Cancel edit"
                                    >
                                      <X size={13} strokeWidth={1.5} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingId(post.id)
                                        setEditContent(post.content)
                                      }}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary hover:text-text-secondary transition-colors"
                                      aria-label="Edit post"
                                    >
                                      <Pencil size={13} strokeWidth={1.5} />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(post.id)}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary hover:text-status-error transition-colors"
                                      aria-label="Delete post"
                                    >
                                      <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              <textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                rows={4}
                                autoFocus
                                className="w-full bg-background-secondary border border-background-border-mid rounded-lg px-3 py-2 text-sm text-text-primary font-sans resize-none focus:outline-none focus:border-accent-silver transition-colors"
                              />
                            ) : (
                              <p className="text-sm text-text-secondary leading-relaxed">
                                {post.content}
                              </p>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── FOOTER ── */}
          <div className="px-6 py-4 border-t border-background-border shrink-0 flex items-center justify-between gap-3">
            {phase === 'config' && (
              <>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <Button
                  onClick={handleGenerate}
                  disabled={activePlatforms.length === 0 || totalPosts === 0}
                  size="sm"
                  className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  Generate {totalPosts} posts
                </Button>
              </>
            )}
            {phase === 'generating' && (
              <button
                onClick={handleCancel}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
            )}
            {phase === 'review' && (
              <>
                <span className="text-xs text-text-tertiary">
                  <span className="font-mono text-text-secondary">{posts.length}</span> posts ready
                </span>
                <Button
                  onClick={handleAddToCalendar}
                  disabled={isSaving || posts.length === 0}
                  size="sm"
                  className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
                >
                  <Calendar size={12} strokeWidth={1.5} />
                  {isSaving ? 'Adding…' : `Add ${posts.length} to calendar`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd lyra && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add lyra/components/lyra/schedule/schedule-generator.tsx
git commit -m "feat: add schedule generator modal component"
```

---

### Task 4: Wire ScheduleGenerator into the Calendar page

**Files:**
- Modify: `lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx`

- [ ] **Step 1: Read the current file**

Open `lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` and confirm it matches this (the current state before modification):

```tsx
import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ContentCalendar } from '@/components/lyra/calendar/content-calendar'
import Link from 'next/link'
import { Plus } from 'lucide-react'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true },
  })

  if (!workspace) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Calendar</h2>
          <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
        </div>
        <Link
          href={`/workspace/${workspaceId}/compose`}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-text-inverse hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
        >
          <Plus size={13} />
          New post
        </Link>
      </div>

      <ContentCalendar workspaceId={workspaceId} />
    </div>
  )
}
```

- [ ] **Step 2: Replace the file with the updated version**

Replace the entire file with:

```tsx
import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ContentCalendar } from '@/components/lyra/calendar/content-calendar'
import { ScheduleGenerator } from '@/components/lyra/schedule/schedule-generator'
import Link from 'next/link'
import { Plus } from 'lucide-react'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      brandProfile: { select: { id: true } },
      socialAccounts: { where: { active: true }, select: { platform: true } },
    },
  })

  if (!workspace) notFound()

  const hasBrandProfile    = workspace.brandProfile !== null
  const connectedPlatforms = [...new Set(workspace.socialAccounts.map(a => a.platform))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Calendar</h2>
          <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <ScheduleGenerator
            workspaceId={workspaceId}
            hasBrandProfile={hasBrandProfile}
            connectedPlatforms={connectedPlatforms}
          />
          <Link
            href={`/workspace/${workspaceId}/compose`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-text-inverse hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
          >
            <Plus size={13} />
            New post
          </Link>
        </div>
      </div>

      <ContentCalendar workspaceId={workspaceId} />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript for the full project**

Run: `cd lyra && npx tsc --noEmit --skipLibCheck 2>&1 | head -50`
Expected: no errors

- [ ] **Step 4: Verify the build**

Run: `cd lyra && npm run build 2>&1 | tail -20`
Expected: clean build, no TypeScript or lint errors

- [ ] **Step 5: Manual smoke test**

1. Run `npm run dev`
2. Navigate to `/workspace/[id]/calendar`
3. Verify "Generate schedule" button appears in the header row (to the left of "New post")
4. Click it **without** a brand profile built — verify error toast: "Build a brand profile first."
5. Build a brand profile, connect a platform, return to Calendar
6. Click "Generate schedule" — config panel opens
7. Toggle 3 / 6 weeks — total post count updates
8. Adjust posts-per-week stepper — count updates
9. Click "Generate N posts" — progress bar appears and increments week by week
10. After generation completes, review screen shows posts grouped by week
11. Edit one post — textarea opens; save — content updates in place
12. Delete one post — it disappears from the list; count in footer decrements
13. Click "Add N to calendar" — toast confirms, modal closes, calendar refreshes with new DRAFT posts
14. Navigate to Calendar — verify DRAFT posts appear on correct dates

- [ ] **Step 6: Commit**

```bash
git add lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx
git commit -m "feat: wire schedule generator into calendar page"
```
