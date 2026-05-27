# Competitor Intelligence Implementation Plan

> **STATUS: ✅ COMPLETE — shipped across 8 commits ending `f3eb923` (May 2026)**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Competitors page to each workspace where PRO/AGENCY users can add up to 10 competitors (name + website URL + optional social handles). A daily BullMQ worker scrapes competitor content, calls Claude for theme extraction, and saves snapshots. The page shows posting frequency, recent topics, and post excerpts.

**Architecture:** New Prisma models (Competitor + CompetitorSnapshot) backed by REST API endpoints. A new BullMQ worker runs daily. The competitors page and competitor card components surface snapshot data. Sidebar gets a new nav item gated by plan.

**Tech Stack:** Prisma, Next.js App Router, Cheerio (SSRF-protected scraper from `services/brand-intelligence/scraper.ts`), Anthropic Claude API, BullMQ.

**Spec:** `docs/superpowers/specs/2026-05-25-competitor-intelligence-design.md`

---

## File Map

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add Competitor + CompetitorSnapshot models |
| `services/competitors/competitor-scraper.ts` | New — Cheerio scraping per competitor |
| `services/competitors/theme-extractor.ts` | New — Claude theme extraction |
| `workers/competitor-monitor.worker.ts` | New — daily BullMQ worker |
| `workers/index.ts` | Modified — register competitor monitor worker |
| `app/api/competitors/route.ts` | New — GET list, POST create |
| `app/api/competitors/[id]/route.ts` | New — DELETE |
| `components/lyra/competitors/competitor-card.tsx` | New — card component |
| `components/lyra/competitors/add-competitor-form.tsx` | New — inline add form |
| `app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx` | New — competitors page |
| `components/lyra/app-shell/sidebar.tsx` | Modified — add Competitors nav item |

---

### Task 1: Schema changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Competitor model**

Add this model to `prisma/schema.prisma`:

```prisma
model Competitor {
  id              String               @id @default(cuid())
  workspaceId     String
  workspace       Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  name            String
  websiteUrl      String?
  twitterHandle   String?
  facebookPageId  String?
  createdAt       DateTime             @default(now())
  snapshots       CompetitorSnapshot[]
}

model CompetitorSnapshot {
  id                  String     @id @default(cuid())
  competitorId        String
  competitor          Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)
  capturedAt          DateTime   @default(now())
  postsPerWeek        Float?
  recentTopics        String[]
  engagementBenchmark Float?
  recentPosts         Json?
}
```

Also add `competitors Competitor[]` to the Workspace model's relation list.

- [ ] **Step 2: Push and generate**

```bash
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/prisma/schema.prisma
git commit -m "feat: add Competitor and CompetitorSnapshot schema models"
```

---

### Task 2: Competitor scraper service

**Files:**
- Create: `services/competitors/competitor-scraper.ts`

- [ ] **Step 1: Create the scraper**

Create `lyra/services/competitors/competitor-scraper.ts`:

```typescript
import * as cheerio from 'cheerio'

// SSRF protection — block private/loopback ranges
function isPrivateAddress(hostname: string): boolean {
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
  ]
  return privatePatterns.some((p) => p.test(hostname))
}

export type CompetitorPost = {
  date: string
  excerpt: string
  url?: string
  platform: string
}

export type CompetitorData = {
  recentPosts: CompetitorPost[]
  postsPerWeek: number
  engagementBenchmark: number | null
}

export async function scrapeCompetitorWebsite(websiteUrl: string): Promise<CompetitorPost[]> {
  let parsed: URL
  try {
    parsed = new URL(websiteUrl)
  } catch {
    return []
  }

  if (isPrivateAddress(parsed.hostname)) {
    console.warn(`SSRF block: ${parsed.hostname}`)
    return []
  }

  let html: string
  try {
    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LYRABot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    html = await res.text()
  } catch {
    return []
  }

  const $ = cheerio.load(html)
  const posts: CompetitorPost[] = []

  // Try common blog post selectors
  const selectors = [
    'article',
    '[class*="post"]',
    '[class*="blog"]',
    'main li',
  ]

  for (const selector of selectors) {
    $(selector).slice(0, 5).each((_, el) => {
      const title = $(el).find('h2, h3, h1').first().text().trim()
      const link = $(el).find('a').first().attr('href')
      const date = $(el).find('time').first().attr('datetime') ?? ''

      if (title.length > 10) {
        posts.push({
          date,
          excerpt: title.slice(0, 200),
          url: link ? new URL(link, websiteUrl).href : undefined,
          platform: 'website',
        })
      }
    })
    if (posts.length >= 5) break
  }

  return posts.slice(0, 5)
}

export async function scrapeCompetitor(competitor: {
  websiteUrl?: string | null
  twitterHandle?: string | null
  facebookPageId?: string | null
}): Promise<CompetitorData> {
  const allPosts: CompetitorPost[] = []

  if (competitor.websiteUrl) {
    const webPosts = await scrapeCompetitorWebsite(competitor.websiteUrl)
    allPosts.push(...webPosts)
  }

  // Twitter + Facebook: skip silently if no API keys configured
  // (Phase 2 — not in scope for this version)

  // Estimate posts per week from dates found (fallback: assume once/week if no dates)
  const datedPosts = allPosts.filter((p) => p.date)
  let postsPerWeek = 1
  if (datedPosts.length >= 2) {
    const dates = datedPosts.map((p) => new Date(p.date).getTime()).filter((d) => !isNaN(d)).sort()
    if (dates.length >= 2) {
      const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24)
      postsPerWeek = spanDays > 0 ? (dates.length / spanDays) * 7 : 1
    }
  }

  return {
    recentPosts: allPosts,
    postsPerWeek: Math.round(postsPerWeek * 10) / 10,
    engagementBenchmark: null, // Not available from public scraping
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/services/competitors/competitor-scraper.ts"
git commit -m "feat: add competitor website scraper service"
```

---

### Task 3: Theme extractor service

**Files:**
- Create: `services/competitors/theme-extractor.ts`

- [ ] **Step 1: Create the extractor**

Create `lyra/services/competitors/theme-extractor.ts`:

```typescript
import { anthropic } from '@/lib/anthropic'

export async function extractThemes(posts: string[]): Promise<string[]> {
  if (posts.length === 0) return []

  const prompt = `Given these recent post titles/excerpts from a competitor's content, identify 3–5 content themes.
Return ONLY a JSON array of short phrase strings (2–5 words each).
Example: ["product launches", "customer testimonials", "tutorials"]

Posts:
${posts.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const themes = JSON.parse(text)
    return Array.isArray(themes) ? themes.slice(0, 5) : []
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/services/competitors/theme-extractor.ts"
git commit -m "feat: add Claude theme extractor for competitor content"
```

---

### Task 4: Competitor monitor worker

**Files:**
- Create: `workers/competitor-monitor.worker.ts`
- Modify: `workers/index.ts`

- [ ] **Step 1: Create the worker**

Create `lyra/workers/competitor-monitor.worker.ts`:

```typescript
import { Worker, Queue } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { scrapeCompetitor } from '@/services/competitors/competitor-scraper'
import { extractThemes } from '@/services/competitors/theme-extractor'
import { redis } from '@/lib/redis'

export const competitorMonitorQueue = new Queue('competitor-monitoring', { connection: redis })

export const competitorMonitorWorker = new Worker(
  'competitor-monitoring',
  async (job) => {
    const { workspaceId } = job.data as { workspaceId: string }

    const competitors = await prisma.competitor.findMany({
      where: { workspaceId },
    })

    for (const competitor of competitors) {
      try {
        const data = await scrapeCompetitor({
          websiteUrl: competitor.websiteUrl,
          twitterHandle: competitor.twitterHandle,
          facebookPageId: competitor.facebookPageId,
        })

        const excerpts = data.recentPosts.map((p) => p.excerpt)
        const themes = await extractThemes(excerpts)

        await prisma.competitorSnapshot.create({
          data: {
            competitorId: competitor.id,
            postsPerWeek: data.postsPerWeek,
            recentTopics: themes,
            engagementBenchmark: data.engagementBenchmark,
            recentPosts: data.recentPosts,
          },
        })

        console.log(`Competitor snapshot saved: ${competitor.name} (${themes.join(', ')})`)
      } catch (err) {
        console.error(`Failed to scrape competitor ${competitor.id}:`, err)
      }
    }
  },
  { connection: redis }
)
```

- [ ] **Step 2: Register the worker in workers/index.ts**

Read `lyra/workers/index.ts` and add the competitor monitor worker alongside the existing workers:

```typescript
import { competitorMonitorWorker } from './competitor-monitor.worker'
// Export alongside existing workers
export { competitorMonitorWorker }
```

Also add a daily scheduler call if workers/index.ts sets up repeating jobs — add:
```typescript
import { competitorMonitorQueue } from './competitor-monitor.worker'

// Schedule daily run (in the job scheduler setup section):
await competitorMonitorQueue.add(
  'daily-monitor',
  { workspaceId: 'all' }, // Worker fetches all PRO/AGENCY workspaces
  { repeat: { pattern: '0 4 * * *' } } // 4am daily
)
```

If `workers/index.ts` doesn't have a scheduler pattern, just export the worker — Railway will handle restarts.

- [ ] **Step 3: Update worker to handle 'all' workspaceId**

Modify the worker's processor to handle the 'all' case:

```typescript
async (job) => {
  const { workspaceId } = job.data as { workspaceId: string }

  const whereClause = workspaceId === 'all'
    ? { plan: { in: ['PRO', 'AGENCY'] as const } }
    : { id: workspaceId }

  const workspaces = await prisma.workspace.findMany({
    where: whereClause,
    select: { id: true },
  })

  for (const ws of workspaces) {
    const competitors = await prisma.competitor.findMany({ where: { workspaceId: ws.id } })
    // ... rest of loop (same as Step 1)
  }
}
```

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/workers/competitor-monitor.worker.ts" "LYRA/lyra/workers/index.ts"
git commit -m "feat: add competitor monitor BullMQ worker"
```

---

### Task 5: Competitor API endpoints

**Files:**
- Create: `app/api/competitors/route.ts`
- Create: `app/api/competitors/[id]/route.ts`

- [ ] **Step 1: Create GET + POST endpoint**

Create `lyra/app/api/competitors/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const competitors = await prisma.competitor.findMany({
      where: { workspaceId },
      include: {
        snapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(competitors)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { workspaceId, name, websiteUrl, twitterHandle, facebookPageId } = body

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, plan: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Competitor Intelligence requires PRO or AGENCY plan.' }, { status: 403 })
    }

    const count = await prisma.competitor.count({ where: { workspaceId } })
    if (count >= 10) {
      return NextResponse.json({ error: 'Maximum 10 competitors per workspace.' }, { status: 422 })
    }

    const competitor = await prisma.competitor.create({
      data: { workspaceId, name, websiteUrl: websiteUrl || null, twitterHandle: twitterHandle || null, facebookPageId: facebookPageId || null },
    })

    return NextResponse.json(competitor, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create DELETE endpoint**

Create `lyra/app/api/competitors/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const competitor = await prisma.competitor.findFirst({
      where: { id },
      include: { workspace: { include: { access: true } } },
    })
    if (!competitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasAccess = competitor.workspace.access.some((a) => a.userId === user.id)
    if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.competitor.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/api/competitors/route.ts" "LYRA/lyra/app/api/competitors/[id]/route.ts"
git commit -m "feat: add competitor CRUD API endpoints"
```

---

### Task 6: Competitor card component

**Files:**
- Create: `components/lyra/competitors/competitor-card.tsx`

- [ ] **Step 1: Create the card**

Create `lyra/components/lyra/competitors/competitor-card.tsx`:

```tsx
import { Trash2, Globe, ExternalLink } from 'lucide-react'

interface Snapshot {
  capturedAt: string
  postsPerWeek: number | null
  recentTopics: string[]
  recentPosts: { date: string; excerpt: string; url?: string; platform: string }[] | null
}

interface CompetitorCardProps {
  id: string
  name: string
  websiteUrl?: string | null
  twitterHandle?: string | null
  snapshots: Snapshot[]
  onRemove: (id: string) => void
}

export function CompetitorCard({ id, name, websiteUrl, twitterHandle, snapshots, onRemove }: CompetitorCardProps) {
  const latest = snapshots[0]
  const daysSinceScan = latest
    ? Math.floor((Date.now() - new Date(latest.capturedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const recentPosts = (latest?.recentPosts as { date: string; excerpt: string; url?: string; platform: string }[] | null) ?? []

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium font-sans text-text-primary">{name}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            {websiteUrl && (
              <span className="text-xs font-sans text-text-secondary flex items-center gap-1">
                <Globe className="h-3 w-3" strokeWidth={1.5} />
                {new URL(websiteUrl).hostname}
              </span>
            )}
            {twitterHandle && (
              <span className="text-xs font-sans text-text-secondary">@{twitterHandle}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRemove(id)}
          aria-label="Remove competitor"
          className="text-text-tertiary hover:text-status-error transition-colors"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {latest ? (
        <div className="space-y-3">
          <div className="flex gap-6">
            <div>
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Posts/week</p>
              <p className="font-mono text-lg text-text-primary mt-0.5">
                {latest.postsPerWeek != null ? `~${latest.postsPerWeek}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Last scanned</p>
              <p className="text-sm font-sans text-text-secondary mt-0.5">
                {daysSinceScan === 0 ? 'Today' : daysSinceScan === 1 ? 'Yesterday' : `${daysSinceScan} days ago`}
              </p>
            </div>
          </div>

          {latest.recentTopics.length > 0 && (
            <div>
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest mb-1.5">Themes</p>
              <div className="flex flex-wrap gap-1.5">
                {latest.recentTopics.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border text-xs font-sans text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {recentPosts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Recent posts</p>
              {recentPosts.slice(0, 3).map((post, i) => (
                <div key={i} className="flex items-start gap-2">
                  <p className="text-xs font-sans text-text-secondary flex-1 leading-relaxed">{post.excerpt}</p>
                  {post.url && (
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-text-tertiary hover:text-text-secondary shrink-0">
                      <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm font-sans text-text-tertiary">No data yet. First scan runs tonight.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/competitors/competitor-card.tsx"
git commit -m "feat: add CompetitorCard component"
```

---

### Task 7: Add competitor form + competitors page

**Files:**
- Create: `components/lyra/competitors/add-competitor-form.tsx`
- Create: `app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx`

- [ ] **Step 1: Create the add form**

Create `lyra/components/lyra/competitors/add-competitor-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface AddCompetitorFormProps {
  workspaceId: string
  onAdded: () => void
  disabled?: boolean
}

export function AddCompetitorForm({ workspaceId, onAdded, disabled }: AddCompetitorFormProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', websiteUrl: '', twitterHandle: '', facebookPageId: '' })
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...form }),
      })
      if (res.ok) {
        setForm({ name: '', websiteUrl: '', twitterHandle: '', facebookPageId: '' })
        setOpen(false)
        onAdded()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to add competitor.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-background-border text-sm font-medium font-sans text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors disabled:opacity-50"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} />
        Add competitor
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium font-sans text-text-primary">Add competitor</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close form">
          <X className="h-4 w-4 text-text-tertiary" strokeWidth={1.5} />
        </button>
      </div>
      {[
        { key: 'name', label: 'Name', placeholder: 'Acme Co', required: true },
        { key: 'websiteUrl', label: 'Website URL', placeholder: 'https://acme.com' },
        { key: 'twitterHandle', label: 'Twitter handle', placeholder: 'acmeco' },
        { key: 'facebookPageId', label: 'Facebook page ID', placeholder: '123456789' },
      ].map(({ key, label, placeholder, required }) => (
        <div key={key}>
          <label className="block text-xs font-medium font-sans text-text-secondary mb-1">{label}{required && ' *'}</label>
          <input
            value={form[key as keyof typeof form]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            required={required}
            className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-background-border text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid"
          />
        </div>
      ))}
      {error && <p className="text-xs text-status-error font-sans">{error}</p>}
      <button
        type="submit"
        disabled={saving || !form.name.trim()}
        className="w-full py-2 rounded-lg bg-accent-platinum text-background-primary text-sm font-medium font-sans hover:bg-accent-white transition-colors disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add competitor'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create competitors page**

Create `lyra/app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CompetitorCard } from '@/components/lyra/competitors/competitor-card'
import { AddCompetitorForm } from '@/components/lyra/competitors/add-competitor-form'
import { Crosshair } from 'lucide-react'

interface Competitor {
  id: string
  name: string
  websiteUrl: string | null
  twitterHandle: string | null
  snapshots: {
    capturedAt: string
    postsPerWeek: number | null
    recentTopics: string[]
    recentPosts: unknown
  }[]
}

export default function CompetitorsPage() {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCompetitors = useCallback(async () => {
    const res = await fetch(`/api/competitors?workspaceId=${workspaceId}`)
    if (res.ok) setCompetitors(await res.json())
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { fetchCompetitors() }, [fetchCompetitors])

  const handleRemove = async (id: string) => {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
    setCompetitors((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text-primary">Competitor Intelligence</h1>
        <AddCompetitorForm
          workspaceId={workspaceId}
          onAdded={fetchCompetitors}
          disabled={competitors.length >= 10}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
          ))}
        </div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Crosshair className="h-8 w-8 text-text-tertiary" strokeWidth={1.5} />
          <p className="text-sm font-sans text-text-secondary">No competitors added.</p>
          <p className="text-sm font-sans text-text-tertiary">Add a competitor to start tracking their content strategy.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              id={c.id}
              name={c.name}
              websiteUrl={c.websiteUrl}
              twitterHandle={c.twitterHandle}
              snapshots={c.snapshots}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/competitors/add-competitor-form.tsx" "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx"
git commit -m "feat: add competitors page and add-competitor form"
```

---

### Task 8: Add Competitors to sidebar

**Files:**
- Modify: `components/lyra/app-shell/sidebar.tsx`

- [ ] **Step 1: Read the sidebar**

Read `lyra/components/lyra/app-shell/sidebar.tsx` to understand how nav items are structured (there's likely an array of items with icon, label, href, and possibly a planGate field).

- [ ] **Step 2: Add Competitors nav item**

Find the workspace nav items array and add after the Brand item:

```typescript
import { Crosshair } from 'lucide-react'

// In the workspace nav items array, after the Brand entry:
{
  icon: Crosshair,
  label: 'Competitors',
  href: `/workspace/${workspaceId}/competitors`,
  gate: 'PRO', // shows lock icon on Starter, full access on PRO/AGENCY
}
```

Match the exact shape of existing nav items — if they don't have a `gate` field, look at how Brand Intelligence is gated and replicate the same pattern.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/app-shell/sidebar.tsx"
git commit -m "feat: add Competitors nav item to sidebar"
```

---

### Task 9: Push to GitHub

- [ ] **Step 1: Final type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Push from outer repo**

```bash
cd "c:/Users/Rich/OneDrive - Into The Wild Marketing"
git push origin main
```
