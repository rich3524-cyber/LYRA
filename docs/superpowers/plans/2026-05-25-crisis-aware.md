# Crisis Aware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Crisis Aware — a sentiment/keyword monitor that auto-pauses scheduled posts when a comment crisis is detected, with a persistent in-app banner and resolve flow.

**Architecture:** Extend the existing comment-monitor worker with a crisis detector service. New DB fields on Workspace track crisis state. API endpoints expose resolve and status. A banner component renders at workspace layout level when crisis is active.

**Tech Stack:** Prisma schema extension, BullMQ worker modification, Next.js App Router API routes, React client components, Anthropic Claude API for batch sentiment scoring.

**Spec:** `docs/superpowers/specs/2026-05-25-crisis-aware-design.md`

---

## File Map

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `crisisAware`, `crisisActive`, `crisisTriggeredAt` to Workspace; add `CrisisEvent` model |
| `services/ai/crisis-detector.ts` | New — detectCrisis(), keyword check + Claude batch sentiment |
| `workers/comment-monitor.worker.ts` | Modified — call detectCrisis after saving comments |
| `workers/post-publisher.worker.ts` | Modified — skip publish when workspace.crisisActive |
| `app/api/crisis/resolve/route.ts` | New — POST, resolves active crisis |
| `app/api/crisis/status/route.ts` | New — GET, returns crisis state |
| `app/api/workspaces/[id]/route.ts` | Modified — allow PATCH crisisAware field |
| `components/lyra/crisis/crisis-banner.tsx` | New — red persistent banner with Resolve button |
| `app/(dashboard)/workspace/[workspaceId]/layout.tsx` | Modified — render crisis banner |

---

### Task 1: Schema changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to Workspace model**

Find the Workspace model in `prisma/schema.prisma` and add these three fields after the existing fields (before the closing brace):

```prisma
  crisisAware       Boolean   @default(false)
  crisisActive      Boolean   @default(false)
  crisisTriggeredAt DateTime?
```

- [ ] **Step 2: Add CrisisEvent model**

Add this new model at the end of the schema file (before the last closing line):

```prisma
model CrisisEvent {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  triggeredAt DateTime  @default(now())
  resolvedAt  DateTime?
  triggerType String    // "SENTIMENT_SPIKE" | "KEYWORD_MATCH"
  commentIds  String[]
}
```

Also add `crisisEvents CrisisEvent[]` to the Workspace model's relation fields list.

- [ ] **Step 3: Push schema to DB**

Run from `lyra/` directory:
```bash
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 4: Verify with Prisma Studio**

```bash
npx prisma studio
```

Open localhost:5555 — confirm Workspace table has new columns, CrisisEvent table exists.

- [ ] **Step 5: Commit**

```bash
git add LYRA/lyra/prisma/schema.prisma
git commit -m "feat: add crisis aware schema — Workspace fields + CrisisEvent model"
```

---

### Task 2: Crisis detector service

**Files:**
- Create: `services/ai/crisis-detector.ts`

- [ ] **Step 1: Create the file**

Create `lyra/services/ai/crisis-detector.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { anthropic } from '@/lib/anthropic'

type Comment = { id: string; content: string }

type DetectResult =
  | { triggered: false }
  | { triggered: true; type: 'KEYWORD_MATCH' | 'SENTIMENT_SPIKE'; commentIds: string[] }

export async function detectCrisis(
  workspaceId: string,
  comments: Comment[]
): Promise<DetectResult> {
  if (comments.length === 0) return { triggered: false }

  // 1. Keyword check — no Claude call needed
  const guardrails = await prisma.guardrail.findMany({
    where: { workspaceId, type: 'ALWAYS_ESCALATE' },
    select: { value: true },
  })

  const keywords = guardrails.map((g) => g.value.toLowerCase())
  const keywordHits = comments.filter((c) =>
    keywords.some((kw) => c.content.toLowerCase().includes(kw))
  )

  if (keywordHits.length > 0) {
    return { triggered: true, type: 'KEYWORD_MATCH', commentIds: keywordHits.map((c) => c.id) }
  }

  // 2. Sentiment check via Claude
  const prompt = `Score each comment's sentiment from -1 (very negative) to +1 (very positive).
Return ONLY valid JSON: an array of objects with "id" and "score" keys.
Comments:
${JSON.stringify(comments.map((c) => ({ id: c.id, content: c.content })))}
`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  let scores: { id: string; score: number }[] = []
  try {
    scores = JSON.parse(text)
  } catch {
    // If Claude returns malformed JSON, don't trigger — fail open
    return { triggered: false }
  }

  const negativeHits = scores.filter((s) => s.score < -0.6)

  if (negativeHits.length >= 3) {
    return {
      triggered: true,
      type: 'SENTIMENT_SPIKE',
      commentIds: negativeHits.map((s) => s.id),
    }
  }

  return { triggered: false }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add LYRA/lyra/services/ai/crisis-detector.ts
git commit -m "feat: add crisis detector service — keyword + Claude sentiment batch"
```

---

### Task 3: Crisis API endpoints

**Files:**
- Create: `app/api/crisis/resolve/route.ts`
- Create: `app/api/crisis/status/route.ts`

- [ ] **Step 1: Create resolve endpoint**

Create `lyra/app/api/crisis/resolve/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.$transaction([
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { crisisActive: false, crisisTriggeredAt: null },
      }),
      prisma.crisisEvent.updateMany({
        where: { workspaceId, resolvedAt: null },
        data: { resolvedAt: new Date() },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Crisis resolve error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create status endpoint**

Create `lyra/app/api/crisis/status/route.ts`:

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
      select: { crisisActive: true, crisisTriggeredAt: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      crisisActive: workspace.crisisActive,
      crisisTriggeredAt: workspace.crisisTriggeredAt?.toISOString() ?? null,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Crisis status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "LYRA/lyra/app/api/crisis/resolve/route.ts" "LYRA/lyra/app/api/crisis/status/route.ts"
git commit -m "feat: add crisis resolve and status API endpoints"
```

---

### Task 4: Allow PATCH crisisAware on workspace

**Files:**
- Modify: `app/api/workspaces/[id]/route.ts`

- [ ] **Step 1: Read the current PATCH handler**

Read `lyra/app/api/workspaces/[id]/route.ts` and find the PATCH handler. Look for the list of fields it allows to be updated (likely `name`, `aiResponseMode`, etc.).

- [ ] **Step 2: Add crisisAware to the allowed PATCH fields**

In the PATCH handler's data object, add `crisisAware` alongside the existing updateable fields:

```typescript
// Find where data is built for prisma.workspace.update — add this field:
...(body.crisisAware !== undefined && { crisisAware: Boolean(body.crisisAware) }),
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/api/workspaces/[id]/route.ts"
git commit -m "feat: allow PATCH crisisAware on workspace"
```

---

### Task 5: Crisis banner component

**Files:**
- Create: `components/lyra/crisis/crisis-banner.tsx`

- [ ] **Step 1: Create the banner**

Create `lyra/components/lyra/crisis/crisis-banner.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface CrisisBannerProps {
  workspaceId: string
  triggeredAt: string | null
}

export function CrisisBanner({ workspaceId, triggeredAt }: CrisisBannerProps) {
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState(false)

  if (resolved) return null

  const handleResolve = async () => {
    setResolving(true)
    try {
      const res = await fetch('/api/crisis/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (res.ok) {
        setResolved(true)
        // Reload to refresh server data (workspace layout re-fetches on navigation)
        window.location.reload()
      }
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-background-secondary border-b border-status-error/30">
      <AlertTriangle className="h-4 w-4 text-status-error shrink-0" strokeWidth={1.5} />
      <p className="text-sm text-status-error font-sans font-medium flex-1">
        Crisis detected — scheduled posts paused.
        {triggeredAt && (
          <span className="text-text-secondary font-normal ml-2">
            Triggered {new Date(triggeredAt).toLocaleString()}
          </span>
        )}
      </p>
      <button
        onClick={handleResolve}
        disabled={resolving}
        className="text-sm font-medium font-sans text-text-primary hover:text-accent-platinum transition-colors disabled:opacity-50 shrink-0"
      >
        {resolving ? 'Resolving…' : 'Resolve'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/crisis/crisis-banner.tsx"
git commit -m "feat: add CrisisBanner component"
```

---

### Task 6: Render crisis banner in workspace layout

**Files:**
- Modify: `app/(dashboard)/workspace/[workspaceId]/layout.tsx`

- [ ] **Step 1: Read the workspace layout**

Read `lyra/app/(dashboard)/workspace/[workspaceId]/layout.tsx` to understand the current structure.

- [ ] **Step 2: Add crisis check and banner**

In the server component, after verifying the workspace, query crisis state and conditionally render the banner:

```typescript
// Add this import at the top:
import { CrisisBanner } from '@/components/lyra/crisis/crisis-banner'

// Inside the layout, after workspace auth check, add:
const crisisData = await prisma.workspace.findFirst({
  where: { id: workspaceId },
  select: { crisisActive: true, crisisTriggeredAt: true },
})

// In the JSX, above {children}, add:
{crisisData?.crisisActive && (
  <CrisisBanner
    workspaceId={workspaceId}
    triggeredAt={crisisData.crisisTriggeredAt?.toISOString() ?? null}
  />
)}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/layout.tsx"
git commit -m "feat: render crisis banner in workspace layout when crisis active"
```

---

### Task 7: Integrate crisis detection into comment monitor worker

**Files:**
- Modify: `workers/comment-monitor.worker.ts`

- [ ] **Step 1: Read the current comment monitor worker**

Read `lyra/workers/comment-monitor.worker.ts` to understand where comments are saved and how the workspace is referenced.

- [ ] **Step 2: Add crisis detection after comment save**

After the block that saves new comments (likely a `prisma.comment.createMany` or similar), add:

```typescript
import { detectCrisis } from '@/services/ai/crisis-detector'

// After saving new comments:
const workspace = await prisma.workspace.findUnique({
  where: { id: workspaceId },
  select: { crisisAware: true, crisisActive: true },
})

if (workspace?.crisisAware && !workspace.crisisActive && newComments.length > 0) {
  const result = await detectCrisis(workspaceId, newComments.map((c) => ({ id: c.id, content: c.content })))

  if (result.triggered) {
    await prisma.$transaction([
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { crisisActive: true, crisisTriggeredAt: new Date() },
      }),
      prisma.crisisEvent.create({
        data: {
          workspaceId,
          triggerType: result.type,
          commentIds: result.commentIds,
        },
      }),
    ])
    console.log(`Crisis triggered for workspace ${workspaceId}: ${result.type}`)
    // Email alert: console.log is sufficient for now per spec
  }
}
```

`newComments` should be the array of comments saved in this batch. Adjust variable name to match what already exists in the worker.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/workers/comment-monitor.worker.ts" "LYRA/lyra/services/ai/crisis-detector.ts"
git commit -m "feat: integrate crisis detection into comment monitor worker"
```

---

### Task 8: Skip publishing when crisis is active

**Files:**
- Modify: `workers/post-publisher.worker.ts`

- [ ] **Step 1: Read the post publisher worker**

Read `lyra/workers/post-publisher.worker.ts` — find where it fetches the workspace and the block just before it publishes.

- [ ] **Step 2: Add crisis active check**

Before the platform-specific publish call, add:

```typescript
// After fetching workspace (or add workspace fetch if not present):
const workspaceMeta = await prisma.workspace.findUnique({
  where: { id: post.workspaceId },
  select: { crisisActive: true },
})

if (workspaceMeta?.crisisActive) {
  console.log(`Skipping post ${post.id} — crisis active for workspace ${post.workspaceId}`)
  // Post stays SCHEDULED — do not set FAILED
  return
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/workers/post-publisher.worker.ts"
git commit -m "feat: skip post publishing when workspace crisis is active"
```

---

### Task 9: Settings toggle for Crisis Aware

**Files:**
- Create: `components/lyra/settings/crisis-aware-toggle.tsx`
- Modify: `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`

- [ ] **Step 1: Create the toggle component**

Create `lyra/components/lyra/settings/crisis-aware-toggle.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Shield } from 'lucide-react'

interface CrisisAwareToggleProps {
  workspaceId: string
  enabled: boolean
  isPro: boolean
}

export function CrisisAwareToggle({ workspaceId, enabled, isPro }: CrisisAwareToggleProps) {
  const [active, setActive] = useState(enabled)
  const [saving, setSaving] = useState(false)

  const handleToggle = async () => {
    if (!isPro) return
    setSaving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crisisAware: !active }),
      })
      if (res.ok) setActive(!active)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 p-5 rounded-xl bg-background-secondary border border-background-border">
      <div className="flex gap-3">
        <Shield className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium font-sans text-text-primary">Crisis Aware</p>
          <p className="text-sm font-sans text-text-secondary mt-1">
            Monitors comments for sentiment crises. Auto-pauses scheduled posts and alerts you when triggered.
          </p>
          {!isPro && (
            <p className="text-xs font-sans text-text-tertiary mt-1">Requires PRO or AGENCY plan.</p>
          )}
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={!isPro || saving}
        aria-label={active ? 'Disable Crisis Aware' : 'Enable Crisis Aware'}
        className={`relative h-6 w-11 rounded-full transition-colors shrink-0 mt-0.5 disabled:opacity-40 ${
          active ? 'bg-status-success' : 'bg-background-border-mid'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-text-primary transition-transform ${
            active ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add to settings page**

Read `lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`. Find where the workspace data is fetched and add `crisisAware: true` and `plan: true` to the select. Then, in the JSX, add a new "Add-ons" section (below the existing sections) that renders `<CrisisAwareToggle>`:

```tsx
import { CrisisAwareToggle } from '@/components/lyra/settings/crisis-aware-toggle'

// In the JSX (below existing settings sections):
<section className="space-y-4">
  <h2 className="text-lg font-medium font-sans text-text-primary">Add-ons</h2>
  <CrisisAwareToggle
    workspaceId={workspace.id}
    enabled={workspace.crisisAware}
    isPro={workspace.plan === 'PRO' || workspace.plan === 'AGENCY'}
  />
</section>
```

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add "LYRA/lyra/components/lyra/settings/crisis-aware-toggle.tsx" "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx"
git commit -m "feat: add Crisis Aware toggle to workspace settings"
```

---

### Task 10: Push to GitHub

- [ ] **Step 1: Run final type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Push from outer repo**

```bash
cd "c:/Users/Rich/OneDrive - Into The Wild Marketing"
git push origin main
```

Expected: "main -> main" push confirmation.
