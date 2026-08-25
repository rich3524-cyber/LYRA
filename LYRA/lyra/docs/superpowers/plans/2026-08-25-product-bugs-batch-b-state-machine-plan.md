# Product Bugs — Batch B: State-Machine Decisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Migration note:** this repo's environment cannot reach Prisma's direct DB connection (`DIRECT_URL`) — `prisma migrate dev`/`db push` fail here (see `prisma/migrations/README.md`). Migration SQL must be generated DB-free via `prisma migrate diff` comparing schema snapshots, exactly like the existing `prisma/migrations/20260814141558_drop_review_model` migration was produced. The migration file gets committed but is **not applied** by this plan's executor — actually running it against the real database is a manual, reviewed step for Richard, same as that prior migration's commit explicitly noted.

**Goal:** Fix Bug 5 (remove dead `AWAITING_APPROVAL` comment status) and Bug 6 (gate Draft + Approve autonomy mode away from Starter workspaces).

**Architecture:** Bug 5 is a Prisma enum change (migration, DB-free-generated) plus cleanup of 4 confirmed dead-code read-sites. Bug 6 is a two-file gate extension (server + client) mirroring the existing Full Autonomy gate exactly. Independent of each other; independent of Batch A.

**Tech Stack:** Prisma/Postgres, Next.js Route Handlers, React, Vitest.

---

## Task 1: Verify zero live comments have `AWAITING_APPROVAL` status

**Files:**
- Create: `scripts/check-awaiting-approval-usage.ts`

Since no code path ever assigns `AWAITING_APPROVAL`, this is expected to find zero rows — but verify against production rather than assume, following this repo's established one-off-script convention (`scripts/check-legacy-social-accounts.ts` is the reference pattern: `dotenv`-loaded `.env.local`, a fresh `new PrismaClient()`, no `lib/prisma.ts` import, read-only).

- [ ] **Step 1: Write the script**

```ts
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Confirms zero live Comment rows have status AWAITING_APPROVAL before removing
// it from the CommentStatus enum -- no code path ever assigns this status (Draft
// + Approve mode writes AI_DRAFTED instead), so this is expected to return zero,
// but verify against production rather than assume. Read-only.
async function main() {
  const count = await prisma.comment.count({ where: { status: 'AWAITING_APPROVAL' } })
  console.log(`Comments with status AWAITING_APPROVAL: ${count}`)
  if (count > 0) {
    const sample = await prisma.comment.findMany({
      where: { status: 'AWAITING_APPROVAL' },
      select: { id: true, workspaceId: true, createdAt: true },
      take: 10,
    })
    console.log('Sample rows (up to 10):', sample)
    console.log('\n>>> Non-zero count found -- do NOT proceed with the enum-removal migration until this is investigated. <<<')
  } else {
    console.log('Confirmed: no live comment carries this status. Safe to remove from the enum.')
  }
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
```

- [ ] **Step 2: Run it against production**

Run: `npx tsx scripts/check-awaiting-approval-usage.ts`
Expected: `Comments with status AWAITING_APPROVAL: 0` and the "safe to remove" message. If the count is non-zero, STOP this task and the enum-removal work in Task 2 — escalate to the user with the sample rows found, since removing the enum value would then require a data migration decision (what status should those rows move to) that this plan doesn't cover.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-awaiting-approval-usage.ts
git commit -m "chore: add one-off script confirming AWAITING_APPROVAL has zero live usage"
```

---

## Task 2: Remove `AWAITING_APPROVAL` from the `CommentStatus` enum

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new migration under `prisma/migrations/`

**Prerequisite:** Task 1 confirmed zero live usage.

`prisma/schema.prisma` currently has (lines 370-378):

```prisma
enum CommentStatus {
  PENDING
  AI_DRAFTED
  AWAITING_APPROVAL
  APPROVED
  RESPONDED
  ESCALATED
  IGNORED
}
```

- [ ] **Step 1: Snapshot the current schema for the DB-free diff**

```bash
cp prisma/schema.prisma /tmp/schema-before-awaiting-approval-removal.prisma
```

(Or an equivalent temp location — the point is having a copy of the pre-change schema to diff against, matching how `20260814141558_drop_review_model` was produced per its commit message: "Migration SQL was generated via `prisma migrate diff` against the pre/post schema (DB-free)".)

- [ ] **Step 2: Edit the enum**

Change the `CommentStatus` enum in `prisma/schema.prisma` to:

```prisma
enum CommentStatus {
  PENDING
  AI_DRAFTED
  APPROVED
  RESPONDED
  ESCALATED
  IGNORED
}
```

- [ ] **Step 3: Generate the migration SQL (DB-free)**

```bash
mkdir -p prisma/migrations/20260825000000_drop_awaiting_approval_status
npx prisma migrate diff \
  --from-schema-datamodel=/tmp/schema-before-awaiting-approval-removal.prisma \
  --to-schema-datamodel=prisma/schema.prisma \
  --script > prisma/migrations/20260825000000_drop_awaiting_approval_status/migration.sql
```

(Adjust the timestamp prefix `20260825000000` to the actual date/time this task runs, following the `YYYYMMDDHHMMSS_description` convention visible in `prisma/migrations/` — e.g. via `date +%Y%m%d%H%M%S`. Removing a value from a Postgres enum isn't a single trivial `ALTER TYPE` — inspect the generated SQL before committing; Prisma typically handles this by creating a new enum type, migrating the column over, and dropping the old type. Read the generated file and confirm it looks correct — no data-loss operations beyond the enum value itself, since Task 1 already confirmed zero rows use it.)

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds, no errors. This updates the generated TypeScript types so `AWAITING_APPROVAL` is no longer a valid `CommentStatus` value anywhere in the codebase's type-checked code.

- [ ] **Step 5: Run `tsc` to find every remaining reference**

Run: `npx tsc --noEmit`
Expected: compile errors at every location still referencing the now-removed `AWAITING_APPROVAL` value. This should surface the 4 known locations from Task 3 below (plus any others this plan's investigation missed) as literal-type errors. Use this as a completeness cross-check, not a replacement for Task 3's explicit list — a value inside a plain `string[]` array-literal membership check (`.includes('AWAITING_APPROVAL')`) may NOT be caught by `tsc` if the array's inferred type is `string[]` rather than `CommentStatus[]`, so don't rely on this step alone.

- [ ] **Step 6: Commit the schema + migration**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "fix: remove dead AWAITING_APPROVAL from CommentStatus enum"
```

(Do not run `npx prisma migrate deploy` or attempt to apply this migration against the real database — per this plan's header note, that's a manual step for Richard from an environment that can reach `DIRECT_URL`.)

---

## Task 3: Remove dead `AWAITING_APPROVAL` read-sites

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/api/analytics/route.ts`
- Modify: `app/api/comments/unread-count/route.ts`
- Modify: `components/lyra/inbox/response-inbox.tsx`

Confirmed complete list via `grep -rln "AWAITING_APPROVAL" --include="*.ts" --include="*.tsx" .` (excluding `node_modules`) at plan-writing time — re-run this grep at the start of this task in case something changed since, and treat any new match the same way as the 4 below.

All 4 are simple array-literal membership checks — the fix is removing the string from each array, not restructuring any logic around it.

- [ ] **Step 1: Re-confirm the list is still complete**

Run: `grep -rln "AWAITING_APPROVAL" --include="*.ts" --include="*.tsx" . | grep -v node_modules`
Expected: exactly the 4 files below. If more appear, read each and apply the same fix pattern before continuing.

- [ ] **Step 2: Fix `app/(dashboard)/layout.tsx:66`**

Current: `status: { in: ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL', 'ESCALATED'] },`
Change to: `status: { in: ['PENDING', 'AI_DRAFTED', 'ESCALATED'] },`

- [ ] **Step 3: Fix `app/api/analytics/route.ts:72`**

Current: `where: { workspaceId, createdAt: { gte: since }, status: { in: ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL', 'ESCALATED'] } },`
Change to: `where: { workspaceId, createdAt: { gte: since }, status: { in: ['PENDING', 'AI_DRAFTED', 'ESCALATED'] } },`

- [ ] **Step 4: Fix `app/api/comments/unread-count/route.ts:22`**

Current: `status: { in: ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL', 'ESCALATED'] },`
Change to: `status: { in: ['PENDING', 'AI_DRAFTED', 'ESCALATED'] },`

- [ ] **Step 5: Fix `components/lyra/inbox/response-inbox.tsx:133`**

Current: `const pending   = filtered.filter(c => ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL'].includes(c.status))`
Change to: `const pending   = filtered.filter(c => ['PENDING', 'AI_DRAFTED'].includes(c.status))`

- [ ] **Step 6: Run existing tests for each touched file**

Run: `npx vitest run app/api/analytics/route.test.ts app/api/comments/unread-count/route.test.ts` (check whether test files exist for these two routes and `app/(dashboard)/layout.tsx` first — if any don't have test coverage, note this rather than skip silently; adding new coverage for a one-line array change isn't required, but confirm nothing existing breaks).
Expected: all pass.

- [ ] **Step 7: Manually verify `response-inbox.tsx`'s Pending tab logic still makes sense**

Read the surrounding code once more (the `pending`/`escalated`/`responded` derivation block) to confirm removing `AWAITING_APPROVAL` from the `pending` filter doesn't leave any comment permanently unreachable from any tab — since no comment could ever have had this status (confirmed by Task 1), there's no existing data this could strand, but confirm the logic still reads correctly.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/layout.tsx" app/api/analytics/route.ts app/api/comments/unread-count/route.ts components/lyra/inbox/response-inbox.tsx
git commit -m "fix: remove dead AWAITING_APPROVAL read-sites now that the status is gone"
```

---

## Task 4: Gate Draft + Approve autonomy mode away from Starter (server-side)

**Files:**
- Modify: `app/api/workspaces/[id]/route.ts`
- Test: `app/api/workspaces/[id]/route.test.ts`

### Current behavior (confirmed by reading the code)

`app/api/workspaces/[id]/route.ts:116-117` currently:

```ts
    if (aiResponseMode === 'FULL' && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Full Automatic requires Pro or Agency plan.' }, { status: 403 })
    }
```

The existing test file (`app/api/workspaces/[id]/route.test.ts`) has this pattern already established for the sibling `crisisAware` gate (lines 50-55):

```ts
  it('returns 403 when enabling crisisAware on a STARTER plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ crisisAware: true }), ctx('ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })
```

using the file's `req()`/`ctx()` helpers (lines 14-24) and `beforeEach` default mock of `prisma.workspace.findFirst` returning `plan: 'PRO'` (line 30).

- [ ] **Step 1: Write the failing test**

Add to `app/api/workspaces/[id]/route.test.ts`, in the same `describe('PATCH /api/workspaces/[id]', ...)` block:

```ts
  it('returns 403 when enabling Draft + Approve on a STARTER plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ aiResponseMode: 'DRAFT_APPROVE' }), ctx('ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('still returns 403 when enabling Full Automatic on a STARTER plan (regression)', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ aiResponseMode: 'FULL' }), ctx('ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('allows Draft + Approve on a PRO plan', async () => {
    const res = await PATCH(req({ aiResponseMode: 'DRAFT_APPROVE' }), ctx('ws-1'))
    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'ws-1' },
      data: { aiResponseMode: 'DRAFT_APPROVE' },
    })
  })

  it('allows Draft + Approve on an AGENCY plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'AGENCY' } as any)
    const res = await PATCH(req({ aiResponseMode: 'DRAFT_APPROVE' }), ctx('ws-1'))
    expect(res.status).toBe(200)
  })

  it('still allows OFF on a STARTER plan (regression)', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ aiResponseMode: 'OFF' }), ctx('ws-1'))
    expect(res.status).toBe(200)
  })
```

(The `'allows Draft + Approve on a PRO plan'` test relies on `beforeEach`'s default `plan: 'PRO'` mock already established at line 30 — no override needed.)

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run app/api/workspaces/\[id\]/route.test.ts`
Expected: `'returns 403 when enabling Draft + Approve on a STARTER plan'` FAILS (current code has no gate on `DRAFT_APPROVE`, so this returns 200, not 403). The other new tests should already pass (they test currently-correct behavior) — if any of those also fail, investigate before proceeding to Step 3.

- [ ] **Step 3: Implement the gate**

Change lines 116-117 from:

```ts
    if (aiResponseMode === 'FULL' && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Full Automatic requires Pro or Agency plan.' }, { status: 403 })
    }
```

to:

```ts
    if ((aiResponseMode === 'FULL' || aiResponseMode === 'DRAFT_APPROVE') && existing.plan === 'STARTER') {
      const modeLabel = aiResponseMode === 'FULL' ? 'Full Automatic' : 'Draft + Approve'
      return NextResponse.json({ error: `${modeLabel} requires Pro or Agency plan.` }, { status: 403 })
    }
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npx vitest run app/api/workspaces/\[id\]/route.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add "app/api/workspaces/[id]/route.ts" "app/api/workspaces/[id]/route.test.ts"
git commit -m "fix: block Draft + Approve autonomy mode on Starter workspaces, matching Full Automatic's existing gate"
```

---

## Task 5: Gate Draft + Approve autonomy mode away from Starter (client-side)

**Files:**
- Modify: `components/lyra/settings/autonomy-selector.tsx`

### Current behavior (confirmed by reading the code)

`components/lyra/settings/autonomy-selector.tsx` currently has (relevant excerpts):

```ts
type AutonomyMode = 'OFF' | 'DRAFT_APPROVE' | 'FULL'
```
```tsx
          const disabled = option.mode === 'FULL' && !isPro
```
(line 103, inside the `.map((option) => { ... })` block)
```tsx
                {option.mode === 'FULL' && !isPro && (
                  <span className="block text-xs font-sans text-text-tertiary mt-1">
                    Requires Pro or Agency plan.
                  </span>
                )}
```
(lines 131-135)

- [ ] **Step 1: Update the `disabled` condition**

Change line 103 from:

```tsx
          const disabled = option.mode === 'FULL' && !isPro
```

to:

```tsx
          const disabled = (option.mode === 'FULL' || option.mode === 'DRAFT_APPROVE') && !isPro
```

- [ ] **Step 2: Update the "Requires Pro or Agency plan." note condition**

Change lines 131-135 from:

```tsx
                {option.mode === 'FULL' && !isPro && (
                  <span className="block text-xs font-sans text-text-tertiary mt-1">
                    Requires Pro or Agency plan.
                  </span>
                )}
```

to:

```tsx
                {(option.mode === 'FULL' || option.mode === 'DRAFT_APPROVE') && !isPro && (
                  <span className="block text-xs font-sans text-text-tertiary mt-1">
                    Requires Pro or Agency plan.
                  </span>
                )}
```

- [ ] **Step 3: Check for an existing component test**

Run: `ls components/lyra/settings/autonomy-selector.test.tsx` (or check via your file tool). If it exists, read it, follow its existing patterns, and add cases confirming the Draft + Approve option is disabled with the note shown when `isPro={false}`, and enabled with no note when `isPro={true}`. If no test file exists for this component, check whether other `components/lyra/settings/*.tsx` components have test coverage (e.g. `crisis-aware-toggle.tsx`) to see if component-level testing is an established pattern in this directory — if it is, add one following that pattern; if component tests aren't established for this directory, a manual verification note is acceptable instead (document exactly what to check by hand: open the Settings page as a Starter-plan workspace, confirm both Full Automatic and Draft + Approve show as disabled/locked with the plan-requirement note, and neither can be selected).

- [ ] **Step 4: Run `tsc` and the test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/lyra/settings/autonomy-selector.tsx
git commit -m "fix: disable Draft + Approve option in the autonomy selector for Starter workspaces"
```

(If Step 3 added a test file, include it in this commit too.)

---

## Self-review notes (already applied above)

- **Spec coverage:** Task 1-3 cover Bug 5 exactly as scoped (verify zero usage, remove from enum via a DB-free-generated migration, clean up all 4 confirmed dead read-sites). Tasks 4-5 cover Bug 6 exactly as scoped (server gate mirrors the existing Full Autonomy pattern precisely, client gate mirrors the existing disabled/note pattern precisely).
- **Type consistency:** `CommentStatus` (Task 2) drops `AWAITING_APPROVAL` consistently in the schema and every read-site (Task 3); `aiResponseMode`/`AutonomyMode` values (`'OFF' | 'DRAFT_APPROVE' | 'FULL'`) are used identically across Tasks 4 and 5's server/client gates.
- **Sequencing:** Task 1 must complete (and confirm zero usage) before Task 2's migration is written. Task 2 should complete before Task 3 strictly for logical ordering (schema change before removing the now-truly-dead reads), though Task 3's changes would compile fine either order since they're plain array-literal edits, not type-dependent. Tasks 4-5 have no dependency on Tasks 1-3 and can run in parallel with them.
- **No placeholders:** every step shows real code, not a description of what to write.
