# Smart Content Repurposing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Repurpose page to each workspace where users paste a blog URL or long-form text, select target platforms, and LYRA generates platform-native post versions. Output flows into the existing schedule review page via sessionStorage — no new review infrastructure needed.

**Architecture:** New page + form component. SSE streaming from a `POST /api/ai/repurpose` endpoint — one post per platform streamed as Claude generates them. URL mode fetches + extracts article text server-side via existing Cheerio scraper patterns. Same sessionStorage key and `PostEntry` shape as the schedule generator.

**Tech Stack:** Next.js App Router + SSE streaming, Anthropic Claude API, Cheerio (SSRF-protected), existing schedule review page at `/workspace/[id]/schedule/review`.

**Spec:** `docs/superpowers/specs/2026-05-25-smart-content-repurposing-design.md`

---

## File Map

| File | Action |
|---|---|
| `services/ai/content-repurposer.ts` | New — URL extraction + Claude generation |
| `app/api/ai/repurpose/route.ts` | New — POST endpoint, SSE streaming |
| `components/lyra/repurpose/repurpose-form.tsx` | New — full repurpose UI component |
| `app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx` | New — page server wrapper |
| `components/lyra/app-shell/sidebar.tsx` | Modified — add Repurpose nav item |

---

### Task 1: Content repurposer service

**Files:**
- Create: `services/ai/content-repurposer.ts`

- [ ] **Step 1: Create the service**

Create `lyra/services/ai/content-repurposer.ts`:

```typescript
import * as cheerio from 'cheerio'
import { anthropic } from '@/lib/anthropic'

// SSRF protection
function isPrivateAddress(hostname: string): boolean {
  const privatePatterns = [
    /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^::1$/, /^0\.0\.0\.0$/,
  ]
  return privatePatterns.some((p) => p.test(hostname))
}

export async function extractArticleText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }

  if (isPrivateAddress(parsed.hostname)) {
    throw new Error('URL not allowed')
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LYRABot/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  const $ = cheerio.load(html)

  // Remove nav, footer, ads
  $('nav, footer, script, style, aside, [class*="ad"], [id*="ad"]').remove()

  let text = ''
  const article = $('article').first()
  if (article.length) {
    text = article.text()
  } else {
    text = $('main p, .post p, .content p, article p, body p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t) => t.length > 50)
      .join('\n\n')
  }

  // Collapse whitespace and truncate
  text = text.replace(/\s+/g, ' ').trim().slice(0, 8000)
  if (text.length < 100) throw new Error('Could not extract article content')
  return text
}

const PLATFORM_GUIDE: Record<string, string> = {
  INSTAGRAM: 'visual hook first, 150–300 chars, 3–5 relevant hashtags at end',
  LINKEDIN: 'professional tone, no hashtags, 600–1200 chars, one insight per paragraph',
  TWITTER: 'punchy, under 280 chars, 1–2 hashtags max, hook in first 8 words',
  FACEBOOK: 'conversational, 80–500 chars, no hashtags needed',
  TIKTOK: 'hook-first teaser under 150 chars, curiosity gap, call to watch',
  GOOGLE_BUSINESS: 'professional, local business tone, 300–500 chars, include a CTA',
}

export type RepurposedPost = { platform: string; content: string }

export async function* repurposeContent(
  sourceText: string,
  platforms: string[]
): AsyncGenerator<RepurposedPost> {
  const platformGuides = platforms
    .map((p) => `${p}: ${PLATFORM_GUIDE[p] ?? '100–500 chars, professional tone'}`)
    .join('\n')

  const prompt = `You are a social media copywriter. Repurpose the following article into platform-native posts.
Write one post for each platform listed. Each post must be optimised for its platform's format, tone, and length.

For each post, output it in this exact format (including the delimiter line):
---PLATFORM: <PLATFORM_NAME>---
<post content>

Platforms and guidelines:
${platformGuides}

Article to repurpose:
"""
${sourceText}
"""
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  })

  let buffer = ''

  for await (const chunk of response) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      buffer += chunk.delta.text

      // Parse complete platform blocks as they stream in
      const blockRegex = /---PLATFORM:\s*(\w+)---\n([\s\S]*?)(?=---PLATFORM:|$)/g
      let match: RegExpExecArray | null
      let lastIndex = 0

      while ((match = blockRegex.exec(buffer)) !== null) {
        const [fullMatch, platform, content] = match
        const trimmed = content.trim()
        if (trimmed.length > 0 && platforms.includes(platform)) {
          yield { platform, content: trimmed }
        }
        lastIndex = match.index + fullMatch.length
      }

      // Keep only unparsed tail
      if (lastIndex > 0) buffer = buffer.slice(lastIndex)
    }
  }

  // Flush remaining buffer
  if (buffer.trim().length > 0) {
    const finalMatch = /---PLATFORM:\s*(\w+)---\n([\s\S]+)/.exec(buffer)
    if (finalMatch) {
      const [, platform, content] = finalMatch
      const trimmed = content.trim()
      if (trimmed.length > 0 && platforms.includes(platform)) {
        yield { platform, content: trimmed }
      }
    }
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/services/ai/content-repurposer.ts"
git commit -m "feat: add content repurposer service with URL extraction and Claude streaming"
```

---

### Task 2: Repurpose API endpoint

**Files:**
- Create: `app/api/ai/repurpose/route.ts`

- [ ] **Step 1: Create the SSE endpoint**

Create `lyra/app/api/ai/repurpose/route.ts`:

```typescript
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractArticleText, repurposeContent } from '@/services/ai/content-repurposer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, sourceType, source, platforms } = await req.json() as {
      workspaceId: string
      sourceType: 'url' | 'text'
      source: string
      platforms: string[]
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    if (!source || !platforms || platforms.length === 0) {
      return new Response(JSON.stringify({ error: 'source and platforms are required' }), { status: 422 })
    }

    let sourceText: string
    if (sourceType === 'url') {
      try {
        sourceText = await extractArticleText(source)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not fetch that URL.'
        return new Response(JSON.stringify({ error: msg }), { status: 422 })
      }
    } else {
      sourceText = source
    }

    if (sourceText.length < 50) {
      return new Response(JSON.stringify({ error: 'Content too short to repurpose.' }), { status: 422 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let count = 0
          for await (const post of repurposeContent(sourceText, platforms)) {
            const line = `data: ${JSON.stringify({ type: 'post', platform: post.platform, content: post.content })}\n\n`
            controller.enqueue(encoder.encode(line))
            count++
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', total: count })}\n\n`))
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Generation failed' })}\n\n`)
          )
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/api/ai/repurpose/route.ts"
git commit -m "feat: add repurpose API endpoint with SSE streaming"
```

---

### Task 3: Repurpose form component

**Files:**
- Create: `components/lyra/repurpose/repurpose-form.tsx`

- [ ] **Step 1: Create the form**

Create `lyra/components/lyra/repurpose/repurpose-form.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scissors } from 'lucide-react'

const PLATFORMS = ['INSTAGRAM', 'LINKEDIN', 'TWITTER', 'FACEBOOK', 'TIKTOK', 'GOOGLE_BUSINESS']
const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TWITTER: 'Twitter / X',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  GOOGLE_BUSINESS: 'Google Business',
}

interface PostEntry {
  id: string
  platform: string
  content: string
  scheduledAt: string
  weekNum: number
  mediaUrls: string[]
  uploadingMedia: boolean
}

interface RepurposeFormProps {
  workspaceId: string
}

export function RepurposeForm({ workspaceId }: RepurposeFormProps) {
  const router = useRouter()
  const [sourceType, setSourceType] = useState<'url' | 'text'>('url')
  const [source, setSource] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['INSTAGRAM', 'LINKEDIN'])
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<string[]>([]) // platform names as they come in
  const [error, setError] = useState<string | null>(null)

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  const handleGenerate = async () => {
    if (!source.trim() || selectedPlatforms.length === 0) return
    setGenerating(true)
    setError(null)
    setProgress([])

    const res = await fetch('/api/ai/repurpose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, sourceType, source, platforms: selectedPlatforms }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Repurposing failed.')
      setGenerating(false)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const accumulated: PostEntry[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'post') {
            accumulated.push({
              id: crypto.randomUUID(),
              platform: event.platform,
              content: event.content,
              scheduledAt: '',
              weekNum: 0,
              mediaUrls: [],
              uploadingMedia: false,
            })
            setProgress((prev) => [...prev, event.platform])
          } else if (event.type === 'error') {
            setError(event.message)
          } else if (event.type === 'done') {
            // Write to sessionStorage and navigate to review page
            sessionStorage.setItem(`lyra:schedule-review:${workspaceId}`, JSON.stringify(accumulated))
            router.push(`/workspace/${workspaceId}/schedule/review`)
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    setGenerating(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Source type toggle */}
      <div>
        <label className="block text-xs font-medium font-sans text-text-secondary mb-2 uppercase tracking-widest">Source</label>
        <div className="flex rounded-lg border border-background-border overflow-hidden mb-3">
          {(['url', 'text'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSourceType(t)}
              className={`flex-1 py-2 text-sm font-sans transition-colors ${
                sourceType === t
                  ? 'bg-accent-platinum text-background-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t === 'url' ? 'Blog URL' : 'Paste text'}
            </button>
          ))}
        </div>

        {sourceType === 'url' ? (
          <input
            type="url"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://yourblog.com/post-title"
            className="w-full px-3 py-2.5 rounded-lg bg-background-secondary border border-background-border text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid"
          />
        ) : (
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Paste your article or long-form content here…"
            rows={6}
            className="w-full px-3 py-2.5 rounded-lg bg-background-secondary border border-background-border text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid resize-none"
          />
        )}
      </div>

      {/* Platform toggles */}
      <div>
        <label className="block text-xs font-medium font-sans text-text-secondary mb-2 uppercase tracking-widest">Target platforms</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const active = selectedPlatforms.includes(p)
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 rounded-full text-sm font-sans transition-colors border ${
                  active
                    ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                    : 'border-background-border text-text-secondary hover:border-background-border-mid hover:text-text-primary'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Progress */}
      {generating && progress.length > 0 && (
        <div className="space-y-2">
          {progress.map((platform, i) => (
            <div key={i} className="h-16 rounded-xl bg-background-secondary border border-background-border flex items-center px-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-status-success" />
                <p className="text-sm font-sans text-text-secondary">{PLATFORM_LABELS[platform] ?? platform} generated</p>
              </div>
            </div>
          ))}
          {generating && (
            <div className="h-16 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
          )}
        </div>
      )}

      {error && <p className="text-sm text-status-error font-sans">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={generating || !source.trim() || selectedPlatforms.length === 0}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary text-sm font-medium font-sans hover:bg-accent-white transition-colors disabled:opacity-50"
      >
        {generating ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-background-primary/30 border-t-background-primary animate-spin" />
            Repurposing…
          </>
        ) : (
          <>
            <Scissors className="h-4 w-4" strokeWidth={1.5} />
            Repurpose content
          </>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/repurpose/repurpose-form.tsx"
git commit -m "feat: add RepurposeForm component with SSE streaming and platform toggles"
```

---

### Task 4: Repurpose page

**Files:**
- Create: `app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx`

- [ ] **Step 1: Create the page**

Create `lyra/app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RepurposeForm } from '@/components/lyra/repurpose/repurpose-form'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function RepurposePage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      access: { some: { userId: user.id } },
    },
    select: { id: true, name: true },
  })
  if (!workspace) notFound()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-3xl text-text-primary">Repurpose Content</h1>
      <p className="text-sm font-sans text-text-secondary">
        Paste a blog URL or long-form text. LYRA generates platform-native posts for each channel you select.
      </p>
      <RepurposeForm workspaceId={workspaceId} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx"
git commit -m "feat: add repurpose page"
```

---

### Task 5: Add Repurpose to sidebar

**Files:**
- Modify: `components/lyra/app-shell/sidebar.tsx`

- [ ] **Step 1: Read the sidebar**

Read `lyra/components/lyra/app-shell/sidebar.tsx` to confirm the nav items structure.

- [ ] **Step 2: Add the Repurpose nav item**

Add import:
```typescript
import { Scissors } from 'lucide-react'
```

Add to the workspace nav items array (after Competitors if it exists, otherwise after Brand):
```typescript
{
  icon: Scissors,
  label: 'Repurpose',
  href: `/workspace/${workspaceId}/repurpose`,
  // No plan gate — available on all plans
}
```

Match the exact shape used by existing nav items.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/app-shell/sidebar.tsx"
git commit -m "feat: add Repurpose nav item to sidebar"
```

---

### Task 6: Push to GitHub

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
