# Product Bugs — Batch A: Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Bug 1 (weekly brand-refresh cron silently erases pasted brand guidelines) and Bug 2 (dead `audience.languageLevel` UI field).

**Architecture:** Two small, independent, TDD fixes to existing files. No new files, no migration, no schema change.

**Tech Stack:** BullMQ worker, TypeScript, Vitest.

---

## Task 1: Preserve `userGuidelines` in the weekly brand-refresh cron

**Files:**
- Modify: `workers/brand-sync.worker.ts`
- Test: `workers/brand-sync.worker.test.ts` (check whether this file exists first — if not, create it)

### Current behavior (confirmed by reading the code)

`workers/brand-sync.worker.ts`'s weekly cron handler builds `postingPatterns` for its `brandProfile.upsert` call as:

```ts
postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
```

on both the `create` and `update` branches — this never reads or preserves an existing `userGuidelines` value, so any client's pasted brand guidelines are silently wiped on every weekly run. The manual build route, `app/api/brand-intelligence/build/route.ts`, does this correctly:

```ts
const savedUserGuidelines = (workspace.brandProfile?.postingPatterns as Record<string, unknown> | null)?.userGuidelines as string | undefined
const guidelinesText = (manualGuidelines as string | undefined)?.trim()
  || savedUserGuidelines
  || (workspace.brandProfile?.guidelineUrls?.length
      ? await parseWorkspaceGuidelines(workspace.brandProfile.guidelineUrls)
      : '')
// ...
postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights, userGuidelines: guidelinesText || undefined })),
```

- [ ] **Step 1: Check for an existing test file**

Run: `ls workers/brand-sync.worker.test.ts` (or check via your file tool). If it exists, read it in full before writing new tests, and follow its existing mocking patterns (how it mocks `prisma`, `scrapeWebsite`, `buildBrandProfile`, `parseWorkspaceGuidelines`, `analyzeSocialPosts`) rather than inventing a new style. If it doesn't exist, create it following the DI/mock patterns used in `workers/ai-responder.worker.test.ts` and `workers/comment-monitor.worker.ts`'s test file (mock `@/lib/prisma`, `@/services/brand-intelligence/scraper`, `@/services/brand-intelligence/profile-builder`, `@/services/brand-intelligence/document-parser`, `@/services/brand-intelligence/social-analyzer` via `vi.mock`).

- [ ] **Step 2: Write the failing test**

Add a test asserting that when a workspace's existing `BrandProfile.postingPatterns` already contains `userGuidelines: 'Always mention our 24/7 support.'`, running the weekly sync job preserves that value in the upsert call's `postingPatterns.userGuidelines`, rather than omitting it. Exact test shape depends on whichever mocking pattern Step 1 established — the assertion should inspect the mocked `prisma.brandProfile.upsert` call's `update.data.postingPatterns` (or `create.data.postingPatterns` for the create-branch case) and confirm `JSON.parse(...).userGuidelines === 'Always mention our 24/7 support.'`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run workers/brand-sync.worker.test.ts`
Expected: FAIL — the current upsert call has no `userGuidelines` key in `postingPatterns` at all.

- [ ] **Step 4: Implement the fix**

In `workers/brand-sync.worker.ts`, inside the `Worker('brand-sync', async (job) => { ... })` handler, after the existing `const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { brandProfile: true } })` line and before the `buildBrandProfile` call, add:

```ts
const savedUserGuidelines = (workspace.brandProfile?.postingPatterns as Record<string, unknown> | null)?.userGuidelines as string | undefined
```

Then update both the `create` and `update` branches of the `prisma.brandProfile.upsert` call's `postingPatterns` value to:

```ts
postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights, userGuidelines: savedUserGuidelines || undefined })),
```

(Deliberately not passing `manualGuidelines` into `buildBrandProfile`'s `guidelinesText` argument the way the manual route does — the cron has no manual-override input, so leave the `buildBrandProfile(websiteData, guidelinesText, socialPosts)` call's `guidelinesText` argument as whatever it currently resolves to; only the upsert's persisted `userGuidelines` field is the fix here. Confirm at implementation time whether the cron currently passes an empty string or something else as `guidelinesText` into `buildBrandProfile`, and leave that call's argument unchanged — this fix is scoped to preventing data loss on write, not changing what feeds into this run's profile generation.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run workers/brand-sync.worker.test.ts`
Expected: PASS

- [ ] **Step 6: Also add a regression test for the create branch (no prior guidelines)**

Add a second test case: a workspace with no existing `brandProfile` (or an existing one with no `userGuidelines` key) should NOT have a `userGuidelines` key forced into the upsert — `savedUserGuidelines || undefined` should resolve to `undefined`, and `JSON.parse(JSON.stringify({...}))` drops `undefined` values, so the resulting object should have no `userGuidelines` key at all (not `userGuidelines: undefined` serialized as a string, and not `userGuidelines: ''`).

Run: `npx vitest run workers/brand-sync.worker.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add workers/brand-sync.worker.ts workers/brand-sync.worker.test.ts
git commit -m "fix: preserve pasted brand guidelines through the weekly brand-refresh cron"
```

---

## Task 2: Rename `audience.language` to `audience.languageLevel`

**Files:**
- Modify: `services/brand-intelligence/profile-builder.ts`
- Modify: `services/ai/prompt-builder.ts`
- Test: `services/brand-intelligence/profile-builder.test.ts` (create — confirmed not to exist yet)
- Test: `services/ai/prompt-builder.test.ts` (check whether this exists first)

### Current behavior (confirmed by reading the code)

`services/brand-intelligence/profile-builder.ts` currently has, at line 8-13:

```ts
export interface BrandProfileData {
  voiceSummary:   string
  toneAttributes: string[]
  contentThemes:  string[]
  audienceProfile: {
    demographics: string
    interests:    string[]
    painPoints:   string[]
    language:     string
  }
  postingGuidelines: string
}
```

and within the prompt template (around line 63-68):

```ts
  "audienceProfile": {
    "demographics": "description of target audience",
    "interests": ["array", "of", "interests"],
    "painPoints": ["array", "of", "pain", "points"],
    "language": "formal|casual|technical|conversational"
  },
```

and in the validation block (around line 90):

```ts
    typeof parsed.audienceProfile?.language !== 'string' ||
```

`services/ai/prompt-builder.ts:16` currently reads:

```ts
    ? `Demographics: ${audienceProfile.demographics ?? 'Unknown'}. Language style: ${audienceProfile.language ?? 'conversational'}.`
```

The value this field actually holds (`"formal|casual|technical|conversational"`) is a register/tone descriptor, not a language name — `languageLevel` (the name the Brand AI page, `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx:25,268,271`, already reads and expects) is the more accurate name. This fix renames the writer to match the already-correct reader, not the other way around.

- [ ] **Step 1: Confirm no other consumer of `audienceProfile.language` exists**

Run: `grep -rn "audienceProfile\.language\b" --include="*.ts" --include="*.tsx" services/ app/ components/ workers/`
Expected: exactly 2 matches — `services/brand-intelligence/profile-builder.ts` (the validation check) and `services/ai/prompt-builder.ts:16`. If more matches appear (something changed since this plan was written), read each new one and include it in this task's fix instead of assuming this list is exhaustive.

- [ ] **Step 2: Write/extend failing tests**

Check if `services/brand-intelligence/profile-builder.test.ts` exists (confirmed not to, as of plan-writing time — verify again in case something changed). Create it with a test that mocks `@/lib/anthropic`'s `anthropic.messages.create` (following the exact mocking pattern already used in `services/ai/response-generator.test.ts` — `vi.mock('@/lib/anthropic', ...)` re-exporting `actual` with `anthropic.messages.create` replaced by `vi.fn()`) to return a JSON response containing `"languageLevel": "casual"` inside `audienceProfile`, and asserts `buildBrandProfile(...)`'s returned `audienceProfile.languageLevel === 'casual'`.

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/anthropic', async () => {
  const actual = await vi.importActual<typeof import('@/lib/anthropic')>('@/lib/anthropic')
  return { ...actual, anthropic: { messages: { create: vi.fn() } } }
})

import { anthropic } from '@/lib/anthropic'
import { buildBrandProfile } from './profile-builder'

describe('buildBrandProfile', () => {
  it('returns audienceProfile.languageLevel from the Claude response', async () => {
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          voiceSummary: 'Friendly and direct.',
          toneAttributes: ['friendly', 'direct'],
          contentThemes: ['product updates', 'customer stories'],
          audienceProfile: {
            demographics: 'Small business owners',
            interests: ['efficiency'],
            painPoints: ['too many tools'],
            languageLevel: 'casual',
          },
          postingGuidelines: 'Keep it short.',
        }),
      }],
    } as never)

    const websiteData = { title: '', description: '', bodyText: '', headings: [], metaKeywords: [] }
    const result = await buildBrandProfile(websiteData, '', [])

    expect(result.audienceProfile.languageLevel).toBe('casual')
  })
})
```

Also check if `services/ai/prompt-builder.test.ts` exists. If so, read it and extend/update its assertions for the renamed field; if not, this is lower priority (skip creating one unless a quick smoke test is trivial to add given the existing file's structure — check at implementation time).

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run services/brand-intelligence/profile-builder.test.ts`
Expected: FAIL — `result.audienceProfile.languageLevel` is `undefined` because the interface/validation still expect `language`, and the mocked response's `languageLevel` key doesn't match the `language` key the current validation checks for, so `buildBrandProfile` throws `Invalid brand profile response shape` instead of returning.

- [ ] **Step 4: Implement the rename in `profile-builder.ts`**

Change the interface (line 8-13):

```ts
export interface BrandProfileData {
  voiceSummary:   string
  toneAttributes: string[]
  contentThemes:  string[]
  audienceProfile: {
    demographics: string
    interests:    string[]
    painPoints:   string[]
    languageLevel: string
  }
  postingGuidelines: string
}
```

Change the prompt template's JSON schema (around line 63-68):

```ts
  "audienceProfile": {
    "demographics": "description of target audience",
    "interests": ["array", "of", "interests"],
    "painPoints": ["array", "of", "pain", "points"],
    "languageLevel": "formal|casual|technical|conversational"
  },
```

Change the validation block (around line 90):

```ts
    typeof parsed.audienceProfile?.languageLevel !== 'string' ||
```

- [ ] **Step 5: Update `services/ai/prompt-builder.ts`**

Change line 16 from:

```ts
    ? `Demographics: ${audienceProfile.demographics ?? 'Unknown'}. Language style: ${audienceProfile.language ?? 'conversational'}.`
```

to:

```ts
    ? `Demographics: ${audienceProfile.demographics ?? 'Unknown'}. Language style: ${audienceProfile.languageLevel ?? 'conversational'}.`
```

- [ ] **Step 6: Run `tsc` to catch any other reference the grep in Step 1 might have missed**

Run: `npx tsc --noEmit`
Expected: no new errors. If a new error surfaces referencing `.language` on an `audienceProfile`-shaped object anywhere, that's a consumer Step 1's grep missed — read it and fix it as part of this task before proceeding.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run services/brand-intelligence/profile-builder.test.ts`
Expected: PASS

- [ ] **Step 8: Confirm the Brand AI page needs no change**

Read `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` around lines 25, 268, 271 and confirm it already reads `audience.languageLevel` (not `.language`) — no change needed here. If it turns out to read something different than expected, update it to read `languageLevel` as part of this task.

- [ ] **Step 9: Run the full test suite to catch any other breakage**

Run: `npx vitest run`
Expected: all tests pass (no other file should have been relying on the old `language` key).

- [ ] **Step 10: Commit**

```bash
git add services/brand-intelligence/profile-builder.ts services/ai/prompt-builder.ts services/brand-intelligence/profile-builder.test.ts
git commit -m "fix: rename audienceProfile.language to languageLevel so the Brand AI page's Audience field actually populates"
```

---

## Self-review notes (already applied above)

- **Spec coverage:** Task 1 covers Bug 1 exactly as scoped in the design doc (preserve `userGuidelines`, deliberately not widening scrape scope or social signal). Task 2 covers Bug 2 exactly as scoped (rename write side, confirm read side already correct).
- **Type consistency:** `BrandProfileData.audienceProfile.languageLevel` (Task 2) is used consistently across the interface, the prompt schema, the validation check, and `prompt-builder.ts`'s consumer — no stale `.language` references left anywhere per Step 1's grep and Step 6's `tsc` check.
- **No placeholders:** every step shows real code, not a description of what to write.
