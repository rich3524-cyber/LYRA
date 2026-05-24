# Engagement-Optimised Posting Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analyse each workspace's PostMetrics to find optimal posting windows per platform and topic, feed them into the AI schedule generator prompt, show hints in the composer, and visualise them as a heat map on the brand intelligence page.

**Architecture:** Pure-DB analysis service writes engagement patterns into `BrandProfile.postingPatterns` (merged alongside the existing `guidelines` string). Three consumers: schedule generator Claude prompt, composer hint chips, brand intelligence heat map panel. No new DB models — `Post.topic` and the existing `postingPatterns Json?` field are the only schema changes.

**Tech Stack:** Prisma, Next.js 15 App Router, TypeScript, shadcn/ui, Tailwind tokens, Lucide React

---

## File Map

### Create
- `services/ai/engagement-analyzer.ts` — analysis algorithm + exported TypeScript types
- `app/api/brand-intelligence/analyze-engagement/route.ts` — manual trigger endpoint
- `components/lyra/brand/engagement-insights.tsx` — heat map + insights panel component

### Modify
- `prisma/schema.prisma` — add `topic String?` to `Post`
- `services/ai/schedule-generator.ts` — accept `postingPatterns`, replace hardcoded time block
- `app/api/schedule/generate/route.ts` — extract and pass `postingPatterns` to generator
- `app/api/posts/route.ts` — accept and store `topic` field
- `app/api/cron/brand-refresh/route.ts` — call `analyzeEngagement` for all workspaces with profiles
- `components/lyra/composer/post-composer.tsx` — add time hint chips below schedule picker
- `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx` — fetch and pass `postingPatterns`
- `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` — render insights panel, fetch postCounts + connectedPlatforms
- `components/lyra/schedule/schedule-generator.tsx` — pass `topic` when saving posts to calendar

---

## Task 1: Schema — add `topic` to Post

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field**

In `prisma/schema.prisma`, find the `Post` model. After the line `aiGenerated Boolean @default(false)`, add:

```prisma
topic           String?
```

- [ ] **Step 2: Push schema to DB**

Run in **Command Prompt** (not PowerShell — Windows SSL issue with Prisma):
```
npx prisma db push
```
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate client**

```
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add topic field to Post model"
```

---

## Task 2: Create engagement analyzer service

**Files:**
- Create: `services/ai/engagement-analyzer.ts`

- [ ] **Step 1: Create the file**

```typescript
import { prisma } from '@/lib/prisma'

export type PostingSlot = {
  dayOfWeek: number
  hour: number
  score: number
  sampleSize: number
}

export type PlatformPattern = {
  topSlots: PostingSlot[]
  byTopic: Record<string, PostingSlot[]>
  totalPostsAnalyzed: number
  analyzedAt: string
}

export type PostingPatterns = Record<string, PlatformPattern>

type SlotAcc = { rawScore: number; count: number }

function slotKey(dow: number, hour: number): string {
  return `${dow}:${hour}`
}

function parseSlotKey(key: string): { dayOfWeek: number; hour: number } {
  const [d, h] = key.split(':').map(Number)
  return { dayOfWeek: d, hour: h }
}

function normalizeSlots(slots: Record<string, SlotAcc>, topN: number): PostingSlot[] {
  const eligible = Object.entries(slots).filter(([, acc]) => acc.count >= 5)
  if (eligible.length === 0) return []
  const max = Math.max(...eligible.map(([, acc]) => acc.rawScore))
  const normalized: PostingSlot[] = eligible.map(([key, acc]) => ({
    ...parseSlotKey(key),
    score: max > 0 ? acc.rawScore / max : 0,
    sampleSize: acc.count,
  }))
  normalized.sort((a, b) => b.score - a.score)
  return normalized.slice(0, topN)
}

export async function analyzeEngagement(
  workspaceId: string
): Promise<PostingPatterns | null> {
  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      publishedAt: { not: null },
      metrics: {
        OR: [
          { likes: { gt: 0 } },
          { comments: { gt: 0 } },
          { shares: { gt: 0 } },
          { saves: { gt: 0 } },
          { clicks: { gt: 0 } },
        ],
      },
    },
    select: {
      publishedAt: true,
      topic: true,
      socialAccount: { select: { platform: true } },
      metrics: {
        select: { likes: true, comments: true, shares: true, saves: true, clicks: true },
      },
    },
  })

  if (posts.length === 0) return null

  const byPlatform: Record<string, typeof posts> = {}
  for (const post of posts) {
    const pl = post.socialAccount.platform
    if (!byPlatform[pl]) byPlatform[pl] = []
    byPlatform[pl].push(post)
  }

  const result: PostingPatterns = {}

  for (const [platform, pPosts] of Object.entries(byPlatform)) {
    if (pPosts.length < 20) continue

    const platformSlots: Record<string, SlotAcc> = {}
    const topicSlots: Record<string, Record<string, SlotAcc>> = {}

    for (const post of pPosts) {
      if (!post.publishedAt || !post.metrics) continue
      const dow = post.publishedAt.getUTCDay()
      const hour = post.publishedAt.getUTCHours()
      const key = slotKey(dow, hour)
      const score =
        post.metrics.likes * 1 +
        post.metrics.comments * 3 +
        post.metrics.shares * 2 +
        post.metrics.saves * 2 +
        post.metrics.clicks * 1

      if (!platformSlots[key]) platformSlots[key] = { rawScore: 0, count: 0 }
      platformSlots[key].rawScore += score
      platformSlots[key].count += 1

      if (post.topic) {
        if (!topicSlots[post.topic]) topicSlots[post.topic] = {}
        if (!topicSlots[post.topic][key]) topicSlots[post.topic][key] = { rawScore: 0, count: 0 }
        topicSlots[post.topic][key].rawScore += score
        topicSlots[post.topic][key].count += 1
      }
    }

    const topSlots = normalizeSlots(platformSlots, 5)
    if (topSlots.length === 0) continue

    const byTopic: Record<string, PostingSlot[]> = {}
    for (const [topic, tSlots] of Object.entries(topicSlots)) {
      const total = Object.values(tSlots).reduce((s, a) => s + a.count, 0)
      if (total < 10) continue
      const slots = normalizeSlots(tSlots, 3)
      if (slots.length > 0) byTopic[topic] = slots
    }

    result[platform] = {
      topSlots,
      byTopic,
      totalPostsAnalyzed: pPosts.length,
      analyzedAt: new Date().toISOString(),
    }
  }

  return Object.keys(result).length > 0 ? result : null
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors in `services/ai/engagement-analyzer.ts`

- [ ] **Step 3: Commit**

```bash
git add services/ai/engagement-analyzer.ts
git commit -m "feat: add engagement analysis service"
```

---

## Task 3: Create manual trigger API endpoint

**Files:**
- Create: `app/api/brand-intelligence/analyze-engagement/route.ts`

- [ ] **Step 1: Create the route**

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { analyzeEngagement } from '@/services/ai/engagement-analyzer'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json() as { workspaceId: string }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, brandProfile: { select: { id: true, postingPatterns: true } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    if (!workspace.brandProfile) {
      return NextResponse.json({ error: 'Brand profile required' }, { status: 400 })
    }

    const result = await analyzeEngagement(workspaceId)

    if (result !== null) {
      const existing = (workspace.brandProfile.postingPatterns as Record<string, unknown>) ?? {}
      await prisma.brandProfile.update({
        where: { workspaceId },
        data: { postingPatterns: { ...existing, ...result } },
      })
    }

    return NextResponse.json({ postingPatterns: result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/analyze-engagement error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/brand-intelligence/analyze-engagement/route.ts
git commit -m "feat: add analyze-engagement API endpoint"
```

---

## Task 4: Wire engagement analysis into brand refresh cron

**Files:**
- Modify: `app/api/cron/brand-refresh/route.ts`

- [ ] **Step 1: Update the cron route**

Replace the entire file content:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { brandSyncQueue } from '@/workers/brand-sync.worker'
import { analyzeEngagement } from '@/services/ai/engagement-analyzer'
import { subDays } from 'date-fns'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staleThreshold = subDays(new Date(), 7)

  const workspaces = await prisma.workspace.findMany({
    where: {
      websiteUrl: { not: null },
      OR: [
        { brandProfile: null },
        { brandProfile: { lastScrapedAt: { lt: staleThreshold } } },
      ],
    },
    select: { id: true },
    take: 50,
  })

  await Promise.all(
    workspaces.map(w =>
      brandSyncQueue.add(
        'sync-brand',
        { workspaceId: w.id },
        { jobId: `brand-sync-${w.id}`, removeOnComplete: true }
      )
    )
  )

  // Run engagement analysis for all workspaces with brand profiles
  const profileWorkspaces = await prisma.brandProfile.findMany({
    select: { workspaceId: true, postingPatterns: true },
    take: 50,
  })

  const analysisResults = await Promise.allSettled(
    profileWorkspaces.map(async ({ workspaceId, postingPatterns }) => {
      const result = await analyzeEngagement(workspaceId)
      if (result !== null) {
        const existing = (postingPatterns as Record<string, unknown>) ?? {}
        await prisma.brandProfile.update({
          where: { workspaceId },
          data: { postingPatterns: { ...existing, ...result } },
        })
      }
    })
  )

  const analysisErrors = analysisResults.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    queued: workspaces.length,
    analysisRan: profileWorkspaces.length,
    analysisErrors,
  })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/brand-refresh/route.ts
git commit -m "feat: run engagement analysis in brand refresh cron"
```

---

## Task 5: Store topic on posts

**Files:**
- Modify: `app/api/posts/route.ts`
- Modify: `components/lyra/schedule/schedule-generator.tsx`

- [ ] **Step 1: Accept topic in POST /api/posts**

In `app/api/posts/route.ts`, in the POST handler:

1. On line 71, update the destructure to include `topic`:
```typescript
const { workspaceId, content, platforms, scheduledAt, mediaUrls, status, topic } = body
```

2. In the `prisma.post.create` data object, add `topic` after `scheduledAt`:
```typescript
scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
topic: topic ?? null,
```

- [ ] **Step 2: Pass topic from schedule-generator.tsx when saving to calendar**

In `components/lyra/schedule/schedule-generator.tsx`, find `handleAddToCalendar`. Inside the function, find where each post is saved to `POST /api/posts`. The request body should already contain `content`, `platforms`, `scheduledAt`, etc. Add `topic` to the body:

```typescript
body: JSON.stringify({
  workspaceId,
  content:     post.content,
  platforms:   [post.platform],
  scheduledAt: post.scheduledAt,
  mediaUrls:   [],
  status:      'DRAFT',
  topic:       post.topic ?? null,
}),
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/posts/route.ts components/lyra/schedule/schedule-generator.tsx
git commit -m "feat: store topic on posts from AI schedule generator"
```

---

## Task 6: Feed posting patterns into schedule generator

**Files:**
- Modify: `services/ai/schedule-generator.ts`
- Modify: `app/api/schedule/generate/route.ts`

- [ ] **Step 1: Replace services/ai/schedule-generator.ts**

```typescript
import { anthropic } from '@/lib/anthropic'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'

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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtHour(h: number): string {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}

function buildTimingBlock(postingPatterns?: PostingPatterns): string {
  if (!postingPatterns || Object.keys(postingPatterns).length === 0) {
    return `Optimal posting times per platform:
- INSTAGRAM: 09:00, 12:00, 18:00
- LINKEDIN: 08:00, 12:00, 17:00
- FACEBOOK: 10:00, 15:00, 20:00
- TWITTER: 08:00, 12:00, 17:00, 20:00
- TIKTOK: 09:00, 15:00, 19:00
- GOOGLE_BUSINESS: 09:00, 14:00`
  }

  const lines: string[] = ["Optimal posting times (based on this workspace's engagement data):"]
  for (const [platform, pattern] of Object.entries(postingPatterns)) {
    const slotStr = pattern.topSlots
      .slice(0, 3)
      .map(s => `${DAY_NAMES[s.dayOfWeek]} ${fmtHour(s.hour)} (score ${s.score.toFixed(2)})`)
      .join(', ')
    lines.push(`- ${platform} top slots: ${slotStr}`)
    for (const [topic, slots] of Object.entries(pattern.byTopic)) {
      const tStr = slots
        .map(s => `${DAY_NAMES[s.dayOfWeek]} ${fmtHour(s.hour)} (score ${s.score.toFixed(2)})`)
        .join(', ')
      lines.push(`- ${platform} — "${topic}": ${tStr}`)
    }
  }
  lines.push('')
  lines.push('Instructions:')
  lines.push("- For each post, prefer the highest-scoring slot that matches the post's topic if byTopic data exists")
  lines.push('- Fall back to the platform top slots if no topic match is available')
  lines.push('- Distribute posts to avoid scheduling two posts in the same slot on the same platform')
  return lines.join('\n')
}

export async function generateWeekPosts(
  brand: BrandContext,
  weekNumber: number,
  weekStartDate: Date,
  platforms: Record<string, number>,
  postingPatterns?: PostingPatterns,
): Promise<GeneratedPost[]> {
  const platformList = Object.entries(platforms)
    .map(([platform, count]) => `${platform}: ${count} posts`)
    .join('\n')

  const themes = brand.contentThemes.length > 0 ? brand.contentThemes.join(', ') : 'General business content'
  const voice = brand.voiceSummary ?? 'Professional and engaging'
  const tone = brand.toneAttributes.length > 0 ? brand.toneAttributes.join(', ') : 'Professional'
  const weekStartStr = weekStartDate.toISOString().split('T')[0]

  const prompt = `You are a social media content strategist creating content for week ${weekNumber} of a scheduled campaign.

BRAND VOICE: ${voice}
TONE ATTRIBUTES: ${tone}
CONTENT THEMES: ${themes}
AUDIENCE: ${JSON.stringify(brand.audienceProfile ?? {})}

PLATFORMS AND POST COUNT THIS WEEK:
${platformList}

WEEK START DATE: ${weekStartStr}

Generate exactly the specified number of posts for each platform. Distribute posts across different days of the 7-day window starting ${weekStartStr}. Prefer different content themes for consecutive posts on the same platform.

${buildTimingBlock(postingPatterns)}

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

  let text = '[]'
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  } catch (err) {
    console.error('schedule-generator: Claude request failed', err instanceof Error ? err.message : err)
    return []
  }

  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const raw = JSON.parse(stripped)
    if (!Array.isArray(raw)) {
      console.error('schedule-generator: expected array, got', typeof raw)
      return []
    }
    return raw.filter((p): p is GeneratedPost =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as GeneratedPost).platform === 'string' &&
      typeof (p as GeneratedPost).content === 'string' &&
      typeof (p as GeneratedPost).scheduledAt === 'string' &&
      !Number.isNaN(Date.parse((p as GeneratedPost).scheduledAt))
    )
  } catch {
    console.error('schedule-generator: failed to parse Claude response', text.slice(0, 500))
    return []
  }
}
```

- [ ] **Step 2: Update app/api/schedule/generate/route.ts**

Add the import at the top of the file:
```typescript
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'
```

Change the workspace query's `include` to use an explicit `select` on `brandProfile`:
```typescript
const workspace = await prisma.workspace.findFirst({
  where: { id: workspaceId, access: { some: { userId: user.id } } },
  include: {
    brandProfile: {
      select: {
        voiceSummary: true,
        toneAttributes: true,
        contentThemes: true,
        audienceProfile: true,
        postingPatterns: true,
      },
    },
  },
})
```

After extracting `brand`, and before the `generateWeekPosts` call, add:
```typescript
const rawPatterns = workspace.brandProfile.postingPatterns as Record<string, unknown> | null
const postingPatterns: PostingPatterns = {}
if (rawPatterns) {
  for (const [key, val] of Object.entries(rawPatterns)) {
    if (key !== 'guidelines' && typeof val === 'object' && val !== null && 'topSlots' in val) {
      postingPatterns[key] = val as PostingPatterns[string]
    }
  }
}

const posts = await generateWeekPosts(
  brand,
  weekNumber,
  new Date(weekStartDate),
  platforms,
  Object.keys(postingPatterns).length > 0 ? postingPatterns : undefined,
)
```

Remove the old `generateWeekPosts` call that doesn't pass `postingPatterns`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add services/ai/schedule-generator.ts app/api/schedule/generate/route.ts
git commit -m "feat: feed engagement posting patterns into schedule generator"
```

---

## Task 7: Add composer hints

**Files:**
- Modify: `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx`
- Modify: `components/lyra/composer/post-composer.tsx`

- [ ] **Step 1: Update compose/page.tsx**

Add import at top:
```typescript
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'
```

Update the workspace Prisma query to include brandProfile:
```typescript
const workspace = await prisma.workspace.findFirst({
  where: { id: workspaceId, access: { some: { userId: user.id } } },
  select: {
    id: true,
    name: true,
    brandProfile: { select: { postingPatterns: true } },
  },
})
```

After the workspace null check, extract engagement patterns:
```typescript
const rawPatterns = workspace.brandProfile?.postingPatterns as Record<string, unknown> | null
const postingPatterns: PostingPatterns = {}
if (rawPatterns) {
  for (const [key, val] of Object.entries(rawPatterns)) {
    if (key !== 'guidelines' && typeof val === 'object' && val !== null && 'topSlots' in val) {
      postingPatterns[key] = val as PostingPatterns[string]
    }
  }
}
```

Update the `PostComposer` JSX to pass the new prop:
```tsx
<PostComposer
  workspaceId={workspaceId}
  connectedPlatforms={connectedPlatforms}
  postingPatterns={Object.keys(postingPatterns).length > 0 ? postingPatterns : null}
/>
```

- [ ] **Step 2: Update components/lyra/composer/post-composer.tsx**

Add import at the top of the file (after existing imports):
```typescript
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'
```

Update `PostComposerProps`:
```typescript
interface PostComposerProps {
  workspaceId: string
  connectedPlatforms: string[]
  postingPatterns?: PostingPatterns | null
}
```

Update the component signature:
```typescript
export function PostComposer({ workspaceId, connectedPlatforms, postingPatterns = null }: PostComposerProps) {
```

Add these two helpers directly above the component (after the `CHAR_LIMITS` constant):
```typescript
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function fmtHintHour(h: number): string {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}
function nextSlotOccurrence(dayOfWeek: number, hour: number): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  const daysAhead = (dayOfWeek - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + daysAhead)
  return d
}
```

Find the schedule date/time section in the JSX (near `scheduleTime` and `scheduleDate`). After the closing element of that section, add the hints block:

```tsx
{/* Engagement hints */}
{selectedPlatforms.length > 0 && (
  <div className="space-y-1.5">
    {selectedPlatforms.map((platform) => {
      const pattern = postingPatterns?.[platform]
      if (!pattern) {
        return (
          <p key={platform} className="font-sans text-xs text-text-tertiary">
            Publish more posts to unlock timing insights for {platform.charAt(0) + platform.slice(1).toLowerCase().replace('_', ' ')}.
          </p>
        )
      }
      return (
        <div key={platform} className="flex flex-wrap items-center gap-1.5">
          <span className="font-sans text-xs text-text-tertiary">
            Best times for {platform.charAt(0) + platform.slice(1).toLowerCase().replace('_', ' ')}:
          </span>
          {pattern.topSlots.slice(0, 3).map((slot, i) => {
            const d = nextSlotOccurrence(slot.dayOfWeek, slot.hour)
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setScheduleDate(d)
                  setScheduleTime(`${String(slot.hour).padStart(2, '0')}:00`)
                }}
                className="px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary hover:border-accent-silver hover:text-text-primary transition-colors duration-150"
              >
                {DAY_SHORT[slot.dayOfWeek]} {fmtHintHour(slot.hour)}
              </button>
            )
          })}
        </div>
      )
    })}
  </div>
)}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/workspace/[workspaceId]/compose/page.tsx" components/lyra/composer/post-composer.tsx
git commit -m "feat: add engagement time hints to post composer"
```

---

## Task 8: EngagementInsights component + brand page integration

**Files:**
- Create: `components/lyra/brand/engagement-insights.tsx`
- Modify: `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx`

- [ ] **Step 1: Create components/lyra/brand/engagement-insights.tsx**

```tsx
'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { PostingPatterns, PostingSlot } from '@/services/ai/engagement-analyzer'

interface Props {
  workspaceId: string
  postingPatterns: PostingPatterns | null
  connectedPlatforms: string[]
  postCounts: Record<string, number>
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const GRID_DAYS = [1, 2, 3, 4, 5, 6, 0] // Mon–Sun in JS dayOfWeek
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am–10pm
const THRESHOLD = 20

function fmtHour(h: number): string {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}

function scoreCell(score: number | undefined): string {
  if (score === undefined || score === 0)
    return 'bg-background-tertiary text-text-tertiary'
  if (score < 0.4) return 'bg-background-hover text-text-tertiary'
  if (score < 0.7) return 'border border-accent-silver text-accent-silver bg-background-tertiary'
  return 'bg-background-tertiary border border-accent-platinum text-accent-platinum'
}

function HeatMap({ slots }: { slots: PostingSlot[] }) {
  const lookup: Record<string, number> = {}
  for (const s of slots) lookup[`${s.dayOfWeek}:${s.hour}`] = s.score

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="w-10 pb-2" />
            {DAY_LABELS.map((d) => (
              <th key={d} className="pb-2 text-center font-sans text-[11px] text-text-tertiary font-medium tracking-[0.05em] uppercase">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <td className="pr-2 py-0.5 text-right font-sans text-[11px] text-text-tertiary tabular-nums">
                {fmtHour(hour)}
              </td>
              {GRID_DAYS.map((dow) => {
                const score = lookup[`${dow}:${hour}`]
                return (
                  <td key={dow} className="py-0.5 px-0.5">
                    <div className={`h-6 w-full rounded-sm flex items-center justify-center font-mono text-[10px] tabular-nums ${scoreCell(score)}`}>
                      {score !== undefined && score > 0 ? score.toFixed(2) : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function platformLabel(p: string): string {
  return p.charAt(0) + p.slice(1).toLowerCase().replace('_', ' ')
}

export function EngagementInsights({
  workspaceId,
  postingPatterns: initialPatterns,
  connectedPlatforms,
  postCounts,
}: Props) {
  const [patterns, setPatterns] = useState(initialPatterns)
  const [activeTab, setActiveTab] = useState<string>(
    connectedPlatforms.find((p) => initialPatterns?.[p]) ?? connectedPlatforms[0] ?? ''
  )
  const [isRefreshing, setIsRefreshing] = useState(false)

  const hasAnyData = patterns !== null && Object.keys(patterns).length > 0

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/brand-intelligence/analyze-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) throw new Error('Request failed')
      const { postingPatterns: updated } = await res.json() as { postingPatterns: PostingPatterns | null }
      if (updated) {
        setPatterns(updated)
        if (!activeTab || !updated[activeTab]) {
          setActiveTab(Object.keys(updated)[0] ?? '')
        }
        toast.success('Engagement data refreshed.')
      } else {
        toast.error('Not enough data yet. Publish more posts to unlock insights.')
      }
    } catch {
      toast.error('Refresh failed. Try again.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Engagement Insights
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary"
          aria-label="Refresh engagement data"
        >
          <RefreshCw
            size={12}
            strokeWidth={1.5}
            className={isRefreshing ? 'animate-spin mr-1.5' : 'mr-1.5'}
          />
          Refresh
        </Button>
      </div>

      {!hasAnyData ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {connectedPlatforms.map((platform) => {
              const count = postCounts[platform] ?? 0
              const pct = Math.min((count / THRESHOLD) * 100, 100)
              return (
                <div key={platform} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-xs text-text-secondary">{platformLabel(platform)}</span>
                    <span className="font-mono text-xs text-text-tertiary tabular-nums">
                      {count} of {THRESHOLD} posts
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-silver transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="font-sans text-xs text-text-tertiary leading-relaxed">
            LYRA tracks engagement on every published post. Once you reach the threshold, your optimal posting windows appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-1 flex-wrap">
            {connectedPlatforms.map((platform) => {
              const hasData = !!patterns?.[platform]
              const count = postCounts[platform] ?? 0
              const isActive = activeTab === platform
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => hasData && setActiveTab(platform)}
                  disabled={!hasData}
                  className={`px-3 py-1 rounded-md font-sans text-xs transition-colors duration-150 ${
                    isActive
                      ? 'bg-background-tertiary border border-accent-silver text-text-primary'
                      : hasData
                        ? 'border border-background-border text-text-secondary hover:border-background-border-mid hover:text-text-primary'
                        : 'border border-background-border text-text-tertiary cursor-not-allowed opacity-50'
                  }`}
                >
                  {platformLabel(platform)}
                  {!hasData && (
                    <span className="ml-1 text-[10px]">({count}/{THRESHOLD})</span>
                  )}
                </button>
              )
            })}
          </div>

          {activeTab && patterns?.[activeTab] && (() => {
            const pattern = patterns[activeTab]
            const topicEntries = Object.entries(pattern.byTopic)
            return (
              <div className="space-y-5">
                <HeatMap slots={pattern.topSlots} />

                {topicEntries.length > 0 && (
                  <div className="space-y-3">
                    <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                      By Content Theme
                    </p>
                    <div className="space-y-2">
                      {topicEntries.map(([topic, slots]) => (
                        <div key={topic} className="flex items-start gap-3">
                          <span className="font-sans text-xs text-text-secondary shrink-0 pt-0.5 min-w-[140px]">
                            {topic}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {slots.slice(0, 2).map((s, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                              >
                                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfWeek]} {fmtHour(s.hour)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="font-sans text-xs text-text-tertiary">
                  Based on {pattern.totalPostsAnalyzed} posts · Updated {timeAgo(pattern.analyzedAt)}
                </p>
              </div>
            )
          })()}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Update app/(dashboard)/workspace/[workspaceId]/brand/page.tsx**

1. Add imports at the top (after existing imports):
```typescript
import { EngagementInsights } from '@/components/lyra/brand/engagement-insights'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'
```

2. Remove the incorrect local `PostingPatterns` interface (the one with `guidelines?: string`) — delete those 3 lines entirely.

3. After `AudienceProfile`, add:
```typescript
interface BrandPatternsJson {
  guidelines?: string
  [key: string]: unknown
}
```

4. Update the workspace Prisma query — replace `_count: { select: { socialAccounts: ... } }` with the full list of active social accounts:
```typescript
const workspace = await prisma.workspace.findFirst({
  where: { id: workspaceId, access: { some: { userId: user.id } } },
  select: {
    id: true,
    name: true,
    websiteUrl: true,
    brandProfile: true,
    socialAccounts: {
      where: { isActive: true },
      select: { platform: true },
    },
  },
})
```

5. Update derived variables after the workspace fetch:
```typescript
const connectedPlatforms = [...new Set(workspace.socialAccounts.map(a => a.platform as string))]
const hasWebsite = !!workspace.websiteUrl
const hasSocial  = connectedPlatforms.length > 0
const brandReady = hasWebsite && hasSocial
const profile    = workspace.brandProfile
const audience   = profile?.audienceProfile as AudienceProfile | null
const patternsJson = profile?.postingPatterns as BrandPatternsJson | null
const guidelines = patternsJson?.guidelines ?? null

const engagementPatterns: PostingPatterns = {}
if (patternsJson) {
  for (const [key, val] of Object.entries(patternsJson)) {
    if (key !== 'guidelines' && typeof val === 'object' && val !== null && 'topSlots' in val) {
      engagementPatterns[key] = val as PostingPatterns[string]
    }
  }
}
```

6. Add postCounts query after the workspace fetch (inside the async function, before the return):
```typescript
const postCounts: Record<string, number> = {}
if (profile) {
  const publishedPosts = await prisma.post.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      metrics: {
        OR: [
          { likes: { gt: 0 } },
          { comments: { gt: 0 } },
          { shares: { gt: 0 } },
          { saves: { gt: 0 } },
          { clicks: { gt: 0 } },
        ],
      },
    },
    select: { socialAccount: { select: { platform: true } } },
  })
  for (const p of publishedPosts) {
    const pl = p.socialAccount.platform as string
    postCounts[pl] = (postCounts[pl] ?? 0) + 1
  }
}
```

7. In the JSX, update the `patterns?.guidelines` reference (around line 242) to use the new `guidelines` variable:
```tsx
{guidelines && (
  <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
    <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
      Posting Guidelines
    </p>
    <p className="font-sans text-sm text-text-primary leading-relaxed whitespace-pre-line">
      {guidelines}
    </p>
  </section>
)}
```

8. At the bottom of the profile display section — after the Metadata block and before the closing `</div>` of the profile section — add:
```tsx
<EngagementInsights
  workspaceId={workspaceId}
  postingPatterns={Object.keys(engagementPatterns).length > 0 ? engagementPatterns : null}
  connectedPlatforms={connectedPlatforms}
  postCounts={postCounts}
/>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Start dev server and manually verify**

```bash
npm run dev
```

Open `http://localhost:3000/workspace/[workspaceId]/brand`:
- Brand page renders correctly
- Posting guidelines section still shows if data present
- EngagementInsights section appears at bottom of profile display
- Cold start: per-platform progress bars visible, copy correct
- Refresh button present

Open `http://localhost:3000/workspace/[workspaceId]/compose`:
- Composer renders with no errors
- When a platform is selected and postingPatterns has no data: "Publish more posts…" message shows
- When postingPatterns has data (after running refresh): time chip hints appear and clicking one sets the date/time picker

- [ ] **Step 5: Commit**

```bash
git add components/lyra/brand/engagement-insights.tsx "app/(dashboard)/workspace/[workspaceId]/brand/page.tsx"
git commit -m "feat: add engagement insights panel to brand intelligence page"
```
