# Autonomy Settings Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings-page control letting a workspace owner choose the AI comment-reply autonomy level (`No reply` / `Post with approval` / `Full Automatic`), backed by the already-existing `Workspace.aiResponseMode` field.

**Architecture:** Pure UI addition. `Workspace.aiResponseMode` (the `Autonomy` enum), `PATCH /api/workspaces/[id]`, and the worker/webhook code that reads the setting at response time all already exist and need no changes beyond one new plan-gate check. This plan adds: a plan-gate check on the existing PATCH handler, a new `AutonomySelector` client component (three-option radio-style card with a confirm dialog on the highest-autonomy option), and wiring it into the Settings page.

**Tech Stack:** Next.js App Router server component (`settings/page.tsx`), React client component, existing `AlertDialog` (base-ui) primitive, Prisma (no schema changes — `aiResponseMode` and its enum already exist).

**Spec:** `docs/superpowers/specs/2026-07-09-autonomy-settings-control-design.md`

**Note on testing:** No route handler in this codebase has a unit test file (`app/api/**/*.test.ts` returns zero matches) — the established convention is manual verification for routes, TDD only for pure service-layer logic. The plan-gate check added in Task 1 is a single conditional inside an existing route handler, so it follows that same convention (manually verified in Task 4) rather than introducing a one-off test pattern not used anywhere else in the codebase.

---

## File Map

| File | Action |
|---|---|
| `app/api/workspaces/[id]/route.ts` | Modified — add plan-gate check for `aiResponseMode: 'FULL'` on STARTER plan |
| `components/lyra/settings/autonomy-selector.tsx` | New — three-option radio card + confirm dialog on Full Automatic |
| `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` | Modified — select `aiResponseMode`, render new "Automation" section |

---

### Task 1: Server-side plan gate on the PATCH handler

**Files:**
- Modify: `app/api/workspaces/[id]/route.ts:55-73`

- [ ] **Step 1: Add the gate check**

In `app/api/workspaces/[id]/route.ts`, find the existing `crisisAware` plan-gate check inside the `PATCH` handler:

```typescript
    const body = await req.json()
    const { name, industry, websiteUrl, clientAccessLevel, aiResponseMode, crisisAware, timezone } = body

    // Plan gate: Starter users cannot enable crisisAware
    if (crisisAware === true && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Crisis Aware requires Pro or Agency plan.' }, { status: 403 })
    }
```

Add a second gate directly below it, before the `prisma.workspace.update` call:

```typescript
    const body = await req.json()
    const { name, industry, websiteUrl, clientAccessLevel, aiResponseMode, crisisAware, timezone } = body

    // Plan gate: Starter users cannot enable crisisAware
    if (crisisAware === true && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Crisis Aware requires Pro or Agency plan.' }, { status: 403 })
    }

    // Plan gate: Starter users cannot enable Full Automatic AI replies
    if (aiResponseMode === 'FULL' && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Full Automatic requires Pro or Agency plan.' }, { status: 403 })
    }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/workspaces/[id]/route.ts"
git commit -m "feat(settings): gate Full Automatic AI replies to Pro/Agency plans"
```

---

### Task 2: `AutonomySelector` component

**Files:**
- Create: `components/lyra/settings/autonomy-selector.tsx`

- [ ] **Step 1: Write the component**

Create `components/lyra/settings/autonomy-selector.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

type AutonomyMode = 'OFF' | 'DRAFT_APPROVE' | 'FULL'

interface AutonomyOption {
  mode: AutonomyMode
  title: string
  description: string
}

const OPTIONS: AutonomyOption[] = [
  {
    mode: 'OFF',
    title: 'No reply',
    description: "Comments aren't answered automatically. Review and respond manually in the Inbox.",
  },
  {
    mode: 'DRAFT_APPROVE',
    title: 'Post with approval',
    description: 'AI drafts a reply for each comment. Nothing goes live until you approve it in the Inbox.',
  },
  {
    mode: 'FULL',
    title: 'Full Automatic',
    description: 'AI replies to comments instantly with no review.',
  },
]

interface AutonomySelectorProps {
  workspaceId: string
  currentMode: AutonomyMode
  isPro: boolean
}

export function AutonomySelector({ workspaceId, currentMode, isPro }: AutonomySelectorProps) {
  const [mode, setMode] = useState(currentMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function applyMode(nextMode: AutonomyMode) {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiResponseMode: nextMode }),
      })
      if (res.ok) {
        setMode(nextMode)
      } else {
        setError('Failed to update. Try again.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleSelect(nextMode: AutonomyMode) {
    if (nextMode === mode || saving) return
    if (nextMode === 'FULL') {
      setConfirmOpen(true)
      return
    }
    void applyMode(nextMode)
  }

  function handleConfirmFull() {
    setConfirmOpen(false)
    void applyMode('FULL')
  }

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
      <div className="flex gap-3">
        <Bot className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium font-sans text-text-primary">AI Response Mode</p>
          <p className="text-sm font-sans text-text-secondary mt-1">
            Controls how LYRA&apos;s AI responds to comments on your connected accounts.
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        {OPTIONS.map((option) => {
          const selected = option.mode === mode
          const disabled = option.mode === 'FULL' && !isPro

          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => handleSelect(option.mode)}
              disabled={disabled || saving}
              className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                selected
                  ? 'border-accent-silver bg-background-tertiary'
                  : 'border-background-border-mid hover:border-accent-silver'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span
                className={`mt-0.5 h-4 w-4 rounded-full border shrink-0 flex items-center justify-center ${
                  selected ? 'border-accent-silver' : 'border-background-border-mid'
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-accent-silver" />}
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium font-sans text-text-primary">
                  {option.title}
                </span>
                <span className="block text-xs font-sans text-text-tertiary leading-relaxed">
                  {option.description}
                </span>
                {option.mode === 'FULL' && !isPro && (
                  <span className="block text-xs font-sans text-text-tertiary mt-1">
                    Requires Pro or Agency plan.
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs font-sans text-status-error">{error}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-background-secondary border border-background-border-mid rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans text-base font-medium text-text-primary">
              Switch to Full Automatic?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm text-text-secondary leading-relaxed">
              AI will reply to comments publicly with no review. You can switch back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans text-sm">
              Cancel
            </AlertDialogCancel>
            <button
              onClick={handleConfirmFull}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-sans text-sm bg-status-success text-background-primary hover:opacity-90 transition-opacity"
            >
              Enable Full Automatic
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "components/lyra/settings/autonomy-selector.tsx"
git commit -m "feat(settings): add AutonomySelector component for AI reply mode"
```

---

### Task 3: Wire into the Settings page

**Files:**
- Modify: `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`, alongside the other component imports:

```typescript
import { CrisisAwareToggle } from '@/components/lyra/settings/crisis-aware-toggle'
```

add:

```typescript
import { AutonomySelector } from '@/components/lyra/settings/autonomy-selector'
```

- [ ] **Step 2: Select `aiResponseMode` on the workspace query**

Find:

```typescript
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true, crisisAware: true, plan: true, timezone: true },
  })
```

Change to:

```typescript
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true, crisisAware: true, plan: true, timezone: true, aiResponseMode: true },
  })
```

- [ ] **Step 3: Add the Automation section**

Find the Timezone section's closing `</section>` and the Add-ons section that follows it:

```typescript
      {/* Timezone */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Timezone
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-1">
          <p className="font-sans text-xs text-text-tertiary leading-relaxed mb-3">
            Post scheduling uses this timezone. Set it to match your audience or client location.
          </p>
          <TimezoneSelector
            workspaceId={workspace.id}
            currentTimezone={workspace.timezone}
          />
        </div>
      </section>

      {/* Add-ons */}
```

Insert a new "Automation" section between them:

```typescript
      {/* Timezone */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Timezone
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-1">
          <p className="font-sans text-xs text-text-tertiary leading-relaxed mb-3">
            Post scheduling uses this timezone. Set it to match your audience or client location.
          </p>
          <TimezoneSelector
            workspaceId={workspace.id}
            currentTimezone={workspace.timezone}
          />
        </div>
      </section>

      {/* Automation */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Automation
        </p>
        <AutonomySelector
          workspaceId={workspace.id}
          currentMode={workspace.aiResponseMode}
          isPro={workspace.plan === 'PRO' || workspace.plan === 'AGENCY'}
        />
      </section>

      {/* Add-ons */}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/workspace/[workspaceId]/settings/page.tsx"
git commit -m "feat(settings): render AutonomySelector in a new Automation section"
```

---

### Task 4: Manual verification

No automated test coverage exists for Settings page UI (matches the codebase's existing convention — see the note at the top of this plan). Verify by hand against a real workspace:

- [ ] **Step 1: Verify initial render**

Load `/workspace/{workspaceId}/settings` for a workspace with `aiResponseMode: 'OFF'` (the schema default). Confirm all three Automation rows render, "No reply" shows as selected, and (if the workspace is on the STARTER plan) "Full Automatic" renders disabled with the "Requires Pro or Agency plan" note.

- [ ] **Step 2: Verify instant switches**

Click "Post with approval". Confirm no dialog appears, the row becomes selected immediately, and reloading the page still shows "Post with approval" selected (confirms the PATCH persisted). Click back to "No reply" and confirm the same.

- [ ] **Step 3: Verify Full Automatic confirmation flow (Pro/Agency workspace)**

On a PRO or AGENCY workspace, click "Full Automatic". Confirm the dialog appears with the warning text. Click Cancel — confirm the selection reverts to whatever was previously selected (no PATCH fired). Click "Full Automatic" again and click "Enable Full Automatic" — confirm it becomes selected and persists on reload.

- [ ] **Step 4: Verify server-side gate**

Using a STARTER-plan workspace, attempt `PATCH /api/workspaces/{id}` directly with `{ "aiResponseMode": "FULL" }` (e.g. via browser devtools or curl with an authenticated session cookie). Confirm it returns `403` with the "Full Automatic requires Pro or Agency plan." message, and the workspace's `aiResponseMode` in the database is unchanged.

- [ ] **Step 5: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix(settings): address issues found during Automation section verification"
```
(Skip this step if no fixes were needed.)
