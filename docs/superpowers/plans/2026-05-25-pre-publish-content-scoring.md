# Pre-Publish Content Scoring Implementation Plan

> **STATUS: ✅ COMPLETE — shipped in commit `49a5113` (26 May 2026)**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-out score panel to the post composer. As the user types, Claude scores their content on 6 dimensions (hook, clarity, CTA, length, hashtags, emotional resonance) and shows a score per dimension plus one actionable suggestion for anything below 7.

**Architecture:** A `POST /api/ai/score-content` endpoint calls a `content-scorer` service. The composer gets a Score toolbar button that opens a `ContentScorePanel` client component. A 1.5s debounce fires the API call on typing. Graceful degradation: panel hides on 503.

**Tech Stack:** Next.js App Router API route, Anthropic Claude API (JSON response), React client component, Framer Motion slide-in.

**Spec:** `docs/superpowers/specs/2026-05-25-pre-publish-content-scoring-design.md`

---

## File Map

| File | Action |
|---|---|
| `services/ai/content-scorer.ts` | New — Claude scoring call, returns `ScoringResult` |
| `app/api/ai/score-content/route.ts` | New — POST endpoint, no plan gate |
| `components/lyra/composer/content-score-panel.tsx` | New — slide-out score panel component |
| `components/lyra/composer/post-composer.tsx` | Modified — Score button + panel integration + debounce |

---

### Task 1: Content scorer service

**Files:**
- Create: `services/ai/content-scorer.ts`

- [ ] **Step 1: Define the shared type and create the service**

Create `lyra/services/ai/content-scorer.ts`:

```typescript
import { anthropic } from '@/lib/anthropic'

export type DimensionScore = {
  score: number
  suggestion: string | null
}

export type ScoringResult = {
  overallScore: number
  dimensions: {
    hook: DimensionScore
    clarity: DimensionScore
    cta: DimensionScore
    length: DimensionScore
    hashtags: DimensionScore
    emotionalResonance: DimensionScore
  }
}

const PLATFORM_LENGTH_GUIDE: Record<string, string> = {
  INSTAGRAM: '150–300 chars ideal',
  LINKEDIN: '600–1200 chars ideal',
  TWITTER: 'under 280 chars',
  FACEBOOK: '80–500 chars',
  TIKTOK: '100–150 chars',
  GOOGLE_BUSINESS: '300–500 chars',
}

export async function scoreContent(content: string, platform: string): Promise<ScoringResult> {
  const lengthGuide = PLATFORM_LENGTH_GUIDE[platform] ?? '100–500 chars'

  const prompt = `You are a social media content coach. Score this ${platform} post on 6 dimensions from 1–10.
For any dimension scoring below 7, provide ONE specific, actionable suggestion (1–2 sentences max).
For dimensions scoring 7 or above, set suggestion to null.

Platform length guidance: ${lengthGuide}
Current post length: ${content.length} characters

Return ONLY valid JSON matching this exact shape:
{
  "overallScore": <number 1-10, 1 decimal>,
  "dimensions": {
    "hook": { "score": <1-10>, "suggestion": <string or null> },
    "clarity": { "score": <1-10>, "suggestion": <string or null> },
    "cta": { "score": <1-10>, "suggestion": <string or null> },
    "length": { "score": <1-10>, "suggestion": <string or null> },
    "hashtags": { "score": <1-10>, "suggestion": <string or null> },
    "emotionalResonance": { "score": <1-10>, "suggestion": <string or null> }
  }
}

Scoring guide:
- hook: Does the opening line compel reading? First 10 words matter most.
- clarity: Is the message immediately understandable? No jargon, no ambiguity.
- cta: Is there a clear call to action? What should the reader do next?
- length: Is length appropriate for ${platform}? (${lengthGuide})
- hashtags: Relevant, correctly placed, not over-used? 0 hashtags can be fine on some platforms.
- emotionalResonance: Does it evoke a feeling or connection? Story, empathy, urgency, humour?

Post to score:
"""
${content}
"""
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed: ScoringResult = JSON.parse(text)

  // Validate shape — throw on bad parse so API returns 503
  if (!parsed.dimensions?.hook || typeof parsed.overallScore !== 'number') {
    throw new Error('Invalid scoring response shape')
  }

  return parsed
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/services/ai/content-scorer.ts"
git commit -m "feat: add content scorer service for pre-publish scoring"
```

---

### Task 2: Score content API endpoint

**Files:**
- Create: `app/api/ai/score-content/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `lyra/app/api/ai/score-content/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scoreContent } from '@/services/ai/content-scorer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { content, platform, workspaceId } = await req.json()

    // Workspace access check
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!content || content.length < 10) {
      return NextResponse.json({ error: 'Content too short to score.' }, { status: 422 })
    }

    const result = await scoreContent(content, platform ?? 'INSTAGRAM')
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Content scoring error:', error)
    return NextResponse.json({ error: 'Scoring unavailable' }, { status: 503 })
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/api/ai/score-content/route.ts"
git commit -m "feat: add score-content API endpoint"
```

---

### Task 3: Content score panel component

**Files:**
- Create: `components/lyra/composer/content-score-panel.tsx`

- [ ] **Step 1: Create the panel**

Create `lyra/components/lyra/composer/content-score-panel.tsx`:

```tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { ScoringResult } from '@/services/ai/content-scorer'

interface ContentScorePanelProps {
  open: boolean
  scoring: boolean
  result: ScoringResult | null
}

const DIMENSION_LABELS: Record<string, string> = {
  hook: 'Hook',
  clarity: 'Clarity',
  cta: 'CTA',
  length: 'Length',
  hashtags: 'Hashtags',
  emotionalResonance: 'Emotional res.',
}

function ScoreColor(score: number): string {
  if (score >= 8) return 'text-status-success'
  if (score >= 6) return 'text-status-warning'
  return 'text-status-error'
}

function RingColor(score: number): string {
  if (score >= 8) return 'stroke-status-success'
  if (score >= 6) return 'stroke-status-warning'
  return 'stroke-status-error'
}

function DotBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < score
              ? score >= 8 ? 'bg-status-success' : score >= 6 ? 'bg-status-warning' : 'bg-status-error'
              : 'bg-background-border-mid'
          }`}
        />
      ))}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const fill = (score / 10) * circumference

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} strokeWidth="4" className="stroke-background-border" fill="none" />
        <circle
          cx="40" cy="40" r={radius} strokeWidth="4"
          className={RingColor(score)}
          fill="none"
          strokeDasharray={`${fill} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={`font-mono text-xl ${ScoreColor(score)}`}>{score.toFixed(1)}</span>
    </div>
  )
}

export function ContentScorePanel({ open, scoring, result }: ContentScorePanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-0 right-0 h-full w-72 bg-background-secondary border-l border-background-border overflow-y-auto z-10"
        >
          <div className="p-4 space-y-4">
            <p className="text-xs font-sans font-medium text-text-tertiary uppercase tracking-widest">Content score</p>

            {scoring && (
              <div className="space-y-3">
                <div className="h-20 w-20 rounded-full bg-background-tertiary animate-pulse mx-auto" />
                <p className="text-xs font-sans text-text-tertiary text-center">Scoring…</p>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-6 rounded bg-background-tertiary animate-pulse" />
                ))}
              </div>
            )}

            {!scoring && !result && (
              <p className="text-sm font-sans text-text-tertiary">Start typing to score your content.</p>
            )}

            {!scoring && result && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <ScoreRing score={result.overallScore} />
                </div>

                <div className="space-y-2.5">
                  {Object.entries(result.dimensions).map(([key, dim]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans text-text-secondary">{DIMENSION_LABELS[key]}</span>
                        <span className={`font-mono text-xs ${ScoreColor(dim.score)}`}>{dim.score}</span>
                      </div>
                      <DotBar score={dim.score} />
                    </div>
                  ))}
                </div>

                {/* Suggestions */}
                {Object.entries(result.dimensions).some(([, d]) => d.suggestion) && (
                  <div className="space-y-2 pt-2 border-t border-background-border">
                    {Object.entries(result.dimensions)
                      .filter(([, d]) => d.suggestion)
                      .map(([key, d]) => (
                        <div key={key}>
                          <p className="text-xs font-medium font-sans text-text-primary">{DIMENSION_LABELS[key]}</p>
                          <p className="text-xs font-sans text-text-secondary leading-relaxed mt-0.5">{d.suggestion}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/composer/content-score-panel.tsx"
git commit -m "feat: add ContentScorePanel slide-out component"
```

---

### Task 4: Integrate score panel into post composer

**Files:**
- Modify: `components/lyra/composer/post-composer.tsx`

- [ ] **Step 1: Read the post composer**

Read `lyra/components/lyra/composer/post-composer.tsx` to understand the current toolbar structure, content state variable name, and selected platform state.

- [ ] **Step 2: Add imports**

At the top of `post-composer.tsx`, add:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react'  // add if not present
import { Sparkles } from 'lucide-react'
import { ContentScorePanel } from './content-score-panel'
import type { ScoringResult } from '@/services/ai/content-scorer'
```

- [ ] **Step 3: Add score state and debounce effect**

Inside the composer component, after the existing state declarations, add:

```typescript
const [scoreOpen, setScoreOpen] = useState(false)
const [scoring, setScoring] = useState(false)
const [scoreResult, setScoreResult] = useState<ScoringResult | null>(null)
const scoreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// content is the existing post body state variable
// selectedPlatforms is the existing platforms state (use first entry)
// workspaceId comes from props

const triggerScore = useCallback(async (text: string, platform: string) => {
  if (text.length < 10) { setScoreResult(null); return }
  setScoring(true)
  try {
    const res = await fetch('/api/ai/score-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, platform, workspaceId }),
    })
    if (res.ok) setScoreResult(await res.json())
    // 503: ignore, keep previous result visible
  } finally {
    setScoring(false)
  }
}, [workspaceId])

useEffect(() => {
  if (!scoreOpen) return
  if (scoreDebounceRef.current) clearTimeout(scoreDebounceRef.current)
  scoreDebounceRef.current = setTimeout(() => {
    // content is the existing variable holding post body text
    // selectedPlatforms[0] gives the primary platform — adjust to match actual variable name
    triggerScore(content, selectedPlatforms[0] ?? 'INSTAGRAM')
  }, 1500)
  return () => { if (scoreDebounceRef.current) clearTimeout(scoreDebounceRef.current) }
}, [content, scoreOpen, selectedPlatforms, triggerScore])
```

Replace `content`, `selectedPlatforms`, and `workspaceId` with the actual variable names used in the composer.

- [ ] **Step 4: Add Score button to toolbar**

In the composer toolbar JSX, add the Score button alongside existing toolbar buttons:

```tsx
<button
  type="button"
  onClick={() => setScoreOpen((o) => !o)}
  aria-label="Score content"
  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium font-sans transition-colors ${
    scoreOpen
      ? 'bg-accent-platinum text-background-primary'
      : 'text-text-secondary hover:text-text-primary border border-background-border'
  }`}
>
  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
  Score
</button>
```

- [ ] **Step 5: Render the score panel**

The composer's outermost container needs `position: relative` and `overflow: hidden` (or use a sibling container pattern). Inside that container, after the main composer form, render:

```tsx
<ContentScorePanel open={scoreOpen} scoring={scoring} result={scoreResult} />
```

The panel uses `absolute top-0 right-0 h-full` positioning — ensure the composer wrapper has `relative` and a defined height or `min-h-0` for this to work. If the composer is in a flex column layout, add `relative overflow-hidden` to the enclosing div.

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/composer/post-composer.tsx"
git commit -m "feat: integrate content score panel into post composer"
```

---

### Task 5: Push to GitHub

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
