# Zernio Bridge — Phase 3: Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the direct publish route and the BullMQ post-publisher worker call `getProvider(account).publish(...)` instead of hardcoded native platform calls, so publishing works uniformly for both native and Zernio-routed accounts.

**Architecture:** `getProvider()` (built in Phase 1) already dispatches between `zernioProvider` and `nativeProvider` — but `nativeProvider.publish()` is currently a dormant stub that just throws (Phase 1 deliberately left it unwired, "later phase"). This phase wires it to the platform-publish logic that currently lives duplicated and inline in the route and worker (Facebook, Instagram, LinkedIn, Twitter), consolidating it into one place. It also fixes two bugs discovered while re-reading the Phase 1/2 code during planning (see "Bugs found during planning" below) and corrects a real data problem: **every one of the 13 production `SocialAccount` rows is currently mislabeled `provider='ZERNIO'` despite being native accounts** (confirmed live against Supabase 2026-07-08) — a side effect of Phase 1's schema migration defaulting the column. Left unfixed, merging this phase would make `getProvider()` route every real publish to Zernio, where it would throw on every single one.

**Bugs found during planning (fixed here, not scope creep — see task notes):**
1. **Data:** all 13 `SocialAccount` rows have `provider='ZERNIO'`, `zernioAccountId IS NULL`, `accessToken IS NOT NULL` — i.e. every one is really native. Must be corrected before this phase's dispatch logic goes live (Task 1).
2. **`getProvider()` only checks `account.provider`, not whether a `zernioAccountId` actually exists.** Even after Task 1's one-time backfill, this is the same class of bug recurring forever unless the factory itself is hardened — e.g. a future double-click race in the connect flow, or any other path that sets `provider='ZERNIO'` before `zernioAccountId` is persisted. Fixed in Task 2, per the standing recommendation logged in Phase 1's final review ("gate on `zernioAccountId != null`, not just `provider === 'ZERNIO'`").
3. **`zernioProvider.publish()` builds the Zernio platform slug via `account.platform.toLowerCase()`**, which is wrong for Google Business: `'GOOGLE_BUSINESS'.toLowerCase()` is `'google_business'` (underscore), but Zernio's real slug is `'googlebusiness'` (no underscore) — the exact bug Phase 2's `platform-map.ts` module exists to prevent, just never applied here. Fixed in Task 2 by adding a proper enum→slug function to that module and using it in Task 3.
4. **`zernioProvider.publish()` silently returns `{ platformPostId: '' }` on a pending/failed platform target** instead of throwing — flagged with an explicit `TODO(phase-2/3)` comment in Phase 1 specifically waiting for this wiring moment. Fixed in Task 3.

**Tech Stack:** TypeScript, Next.js 16, Prisma 6, vitest, BullMQ. Builds on the Phase 1 provider seam and Phase 2's `platform-map.ts` — no new external dependencies.

**Conventions to follow (existing codebase):**
- Path alias `@/` → `LYRA/lyra/` root.
- `decrypt` from `@/lib/encrypt`; `prisma` from `@/lib/prisma`; `redis` from `@/lib/redis`.
- New/modified files under `LYRA/lyra/` require `git add -f` when committing from the OneDrive repo root (root `.gitignore` has `/LYRA`). Commit from `C:\Users\Rich\OneDrive - Into The Wild Marketing`.
- Use an isolated git worktree per `superpowers:using-git-worktrees`, same as Phase 1 and Phase 2.

---

## File Structure

**Modified files:**
- `services/social/provider/platform-map.ts` — add `platformEnumToZernioSlug(platform: Platform): string`.
- `services/social/provider/platform-map.test.ts` — tests for the new function.
- `services/social/provider/index.ts` — harden `getProvider()` dispatch.
- `services/social/provider/index.test.ts` — tests for the hardened dispatch.
- `services/social/provider/native.ts` — wire `publish()` to real native platform calls (Facebook/Instagram/LinkedIn/Twitter); other four methods stay throwing stubs (comments/reviews are Phase 4/5, not this phase).
- `services/social/provider/zernio.ts` — fix the platform-slug bug and the pending/failed status TODO in `publish()`.
- `app/api/posts/[id]/publish/route.ts` — call `getProvider(account).publish(...)` instead of hardcoded Facebook/Instagram-only logic.
- `workers/post-publisher.worker.ts` — call `getProvider(account).publish(...)` instead of the inline per-platform switch; remove the now-incorrect blanket "no accessToken → FAIL" guard (wrong for Zernio accounts, which legitimately have no `accessToken`).

**New files:**
- `prisma/migrations-sql/2026-07-08-zernio-phase3-provider-backfill.sql` — the one-time data-correction SQL (kept in-repo for the record, applied by hand in the Supabase SQL Editor per project convention).

**Not touched in Phase 3:** `services/social/facebook.ts` (its `publishPost` is reused as-is, not modified), `services/social/{instagram,linkedin,twitter}.ts` (still no publish functions added there — the consolidated native publish logic lives in `provider/native.ts` directly, matching where the worker's current inline logic already sits, rather than inventing new service-layer functions not otherwise needed), comment/review methods on `nativeProvider` (still throw — Phase 4/5), `/api/zernio/webhook` (Phase 4), Customer Voice UI (Phase 5).

---

## Task 1: Data fix — correct mislabeled `provider` column

No unit test (data-correction task, not application code). Applied by hand in Supabase per project convention.

**Files:**
- Create: `prisma/migrations-sql/2026-07-08-zernio-phase3-provider-backfill.sql`

- [ ] **Step 1: Write the correction SQL**

Create `prisma/migrations-sql/2026-07-08-zernio-phase3-provider-backfill.sql`:
```sql
-- Zernio bridge Phase 3 — correct mislabeled provider column.
-- Phase 1's schema migration defaulted every existing SocialAccount row to
-- provider='ZERNIO' (a DB-level DEFAULT applied retroactively to already-native
-- accounts). Confirmed 2026-07-08: all 13 production rows have provider='ZERNIO',
-- zernioAccountId IS NULL, accessToken IS NOT NULL -- i.e. every one is actually
-- native. Correct them before Phase 3 wires up getProvider() dispatch for real
-- publishing, or every existing publish would misroute to Zernio and throw.
-- Idempotent: safe to run more than once (WHERE clause only matches unfixed rows).
UPDATE "SocialAccount"
SET "provider" = 'NATIVE'
WHERE "provider" = 'ZERNIO' AND "zernioAccountId" IS NULL;
```

- [ ] **Step 2: Commit**

```bash
git add -f LYRA/lyra/prisma/migrations-sql/2026-07-08-zernio-phase3-provider-backfill.sql
git commit -m "docs(db): add Phase 3 provider-column backfill SQL"
```

**Note for the controller (not the implementer):** this SQL gets applied to the live Supabase project by hand, same as Phase 1's schema SQL and Phase 2's migration — with explicit user sign-off before running, since it's a production data change. Do not apply it automatically as part of task execution.

---

## Task 2: Harden provider dispatch + fix the Zernio platform-slug bug (TDD)

**Files:**
- Modify: `services/social/provider/platform-map.ts`
- Modify: `services/social/provider/platform-map.test.ts`
- Modify: `services/social/provider/index.ts`
- Modify: `services/social/provider/index.test.ts`

### Part A — `platformEnumToZernioSlug`

- [ ] **Step 1: Write the failing test**

In `services/social/provider/platform-map.test.ts`, add a new `describe` block (keep the existing two describe blocks unchanged, just add this one — the file currently has `toZernioPlatform`/`fromZernioPlatform` tests only):
```ts
describe('platformEnumToZernioSlug', () => {
  it('maps known Prisma Platform enum values to Zernio platform slugs', () => {
    expect(platformEnumToZernioSlug('FACEBOOK')).toBe('facebook')
    expect(platformEnumToZernioSlug('GOOGLE_BUSINESS')).toBe('googlebusiness')
    expect(platformEnumToZernioSlug('LINKEDIN')).toBe('linkedin')
    expect(platformEnumToZernioSlug('TWITTER')).toBe('twitter')
    expect(platformEnumToZernioSlug('TIKTOK')).toBe('tiktok')
    expect(platformEnumToZernioSlug('YOUTUBE')).toBe('youtube')
    expect(platformEnumToZernioSlug('INSTAGRAM')).toBe('instagram')
    expect(platformEnumToZernioSlug('PINTEREST')).toBe('pinterest')
    expect(platformEnumToZernioSlug('THREADS')).toBe('threads')
    expect(platformEnumToZernioSlug('BLUESKY')).toBe('bluesky')
  })
})
```
Also update the import line at the top of the test file to include the new function:
```ts
import { toZernioPlatform, fromZernioPlatform, platformEnumToZernioSlug } from './platform-map'
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `LYRA/lyra`): `npm test -- platform-map`
Expected: FAIL — `platformEnumToZernioSlug is not a function` (or a TS error if it doesn't exist as a named export at all — either is an acceptable RED for this step).

- [ ] **Step 3: Add the function**

In `services/social/provider/platform-map.ts`, add this after the existing `ZERNIO_TO_PLATFORM` table and before `toZernioPlatform`:
```ts
// Inverse of ZERNIO_TO_PLATFORM -- derived, not hand-duplicated, so the two tables
// can't drift out of sync. Every Platform enum value has exactly one Zernio slug
// here since ZERNIO_TO_PLATFORM already covers all 10 enum values.
const PLATFORM_TO_ZERNIO = Object.fromEntries(
  Object.entries(ZERNIO_TO_PLATFORM).map(([slug, platform]) => [platform, slug])
) as Record<Platform, string>
```
Then add the exported function alongside the other two exports (order doesn't matter, but put it after `fromZernioPlatform` for readability):
```ts
export function platformEnumToZernioSlug(platform: Platform): string {
  return PLATFORM_TO_ZERNIO[platform]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- platform-map`
Expected: PASS — 5 (existing 4 + this new describe block's 1, which has 10 assertions in one `it`).

### Part B — hardened `getProvider()` dispatch

- [ ] **Step 5: Write the failing tests**

Replace the full contents of `services/social/provider/index.test.ts` with:
```ts
import { describe, it, expect } from 'vitest'
import { getProvider } from './index'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

describe('getProvider', () => {
  it('returns the Zernio provider for ZERNIO accounts with a zernioAccountId', () => {
    expect(getProvider({ provider: 'ZERNIO', zernioAccountId: 'zac_123' })).toBe(zernioProvider)
  })
  it('returns the native provider for NATIVE accounts', () => {
    expect(getProvider({ provider: 'NATIVE', zernioAccountId: null })).toBe(nativeProvider)
  })
  it('returns the native provider for ZERNIO-labeled accounts with no zernioAccountId (mislabeled/unmigrated)', () => {
    expect(getProvider({ provider: 'ZERNIO', zernioAccountId: null })).toBe(nativeProvider)
  })
})
```

- [ ] **Step 6: Run tests to verify the new case fails**

Run: `npm test -- provider/index`
Expected: FAIL on the third test ("mislabeled/unmigrated") — current `getProvider()` only checks `account.provider === 'ZERNIO'`, so it would return `zernioProvider` for that case, not `nativeProvider`. The other two tests still pass (their behavior isn't changing). This is the RED step — one new failing assertion, not a totally broken suite.

- [ ] **Step 7: Harden the factory**

Replace the full contents of `services/social/provider/index.ts` with:
```ts
import type { SocialAccount } from '@prisma/client'
import type { SocialProvider } from './types'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

// Dispatch requires BOTH provider === 'ZERNIO' AND a real zernioAccountId, not
// provider alone. Phase 1's schema migration defaulted every existing account to
// provider='ZERNIO' regardless of whether it actually went through Zernio's
// connect flow -- an account with that label but no zernioAccountId is really a
// native account whose provider column hasn't been corrected (see Phase 3's
// one-time backfill), and routing it to zernioProvider would throw on every call
// (requireZernioId) instead of using the native credentials it actually has.
export function getProvider(account: Pick<SocialAccount, 'provider' | 'zernioAccountId'>): SocialProvider {
  return account.provider === 'ZERNIO' && account.zernioAccountId != null ? zernioProvider : nativeProvider
}

export type { SocialProvider } from './types'
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- provider/index`
Expected: PASS — 3 passed.

Run: `npm test`
Expected: all pass (Phase 1's 6 + Phase 2's 4 platform-map + this task's 1 new platform-map + 3 provider/index = 14 total; exact count isn't load-bearing, just confirm no failures).

- [ ] **Step 9: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `provider/platform-map.ts` or `provider/index.ts`.

```bash
git add -f LYRA/lyra/services/social/provider/platform-map.ts LYRA/lyra/services/social/provider/platform-map.test.ts LYRA/lyra/services/social/provider/index.ts LYRA/lyra/services/social/provider/index.test.ts
git commit -m "feat(provider): add platformEnumToZernioSlug, harden getProvider dispatch on zernioAccountId"
```

---

## Task 3: Wire native publish + fix Zernio publish bugs

**Files:**
- Modify: `services/social/provider/native.ts`
- Modify: `services/social/provider/zernio.ts`

No new unit tests for this task — these are integration points calling real external APIs (Facebook Graph API, LinkedIn, Twitter, Zernio), following this codebase's existing convention of not unit-testing the route/worker/provider layers that make live HTTP calls (the worker and routes being replaced here have never had unit tests either). Correctness is verified via `tsc --noEmit` + the manual E2E step in this phase's Definition of Done.

### Part A — `services/social/provider/native.ts`

- [ ] **Step 1: Read `services/social/facebook.ts`'s `publishPost` signature first**

Confirm it's still `publishPost(pageId: string, message: string, accessToken: string, scheduledPublishTime?: Date): Promise<string>` (returns the platform post id directly, throws on error) — this was true as of Phase 3 planning (2026-07-08). If it's changed, adapt the call in Step 3 accordingly and note it in your report.

- [ ] **Step 2: Replace the full contents of `services/social/provider/native.ts`**

```ts
import type { SocialAccount } from '@prisma/client'
import { decrypt } from '@/lib/encrypt'
import { publishPost as publishFacebookPost } from '../facebook'
import type { PublishInput, SocialProvider } from './types'
import { ProviderUnsupported } from './types'

function requireAccessToken(account: SocialAccount): string {
  if (!account.accessToken) {
    throw new Error(`SocialAccount ${account.id} has no accessToken set`)
  }
  return decrypt(account.accessToken)
}

async function publishToInstagram(igId: string, content: string, accessToken: string): Promise<string> {
  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption: content, access_token: accessToken }),
    signal: AbortSignal.timeout(15_000),
  })
  const createData = (await createRes.json()) as { id?: string; error?: { message: string } }
  if (!createRes.ok || createData.error || !createData.id) {
    throw new Error(createData.error?.message ?? `Instagram container error: ${createRes.status}`)
  }

  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: accessToken }),
    signal: AbortSignal.timeout(15_000),
  })
  const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } }
  if (!publishRes.ok || publishData.error || !publishData.id) {
    throw new Error(publishData.error?.message ?? `Instagram publish error: ${publishRes.status}`)
  }
  return publishData.id
}

async function publishToLinkedin(orgId: string, content: string, accessToken: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: `urn:li:organization:${orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const platformPostId = res.headers.get('x-restli-id')
  if (!res.ok || !platformPostId) {
    throw new Error(`LinkedIn publish error: ${res.status}`)
  }
  return platformPostId
}

async function publishToTwitter(content: string, accessToken: string): Promise<string> {
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: content }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json()) as { data?: { id?: string }; detail?: string }
  if (!res.ok || !data.data?.id) {
    throw new Error(data.detail ?? `Twitter publish error: ${res.status}`)
  }
  return data.data.id
}

// Native path stays intact for per-platform pivot-back. Comments/reviews are
// wired to the existing services/social/*.ts in a later phase; reviews are
// unsupported natively (GBP native path was rejected — see the design spec).
export const nativeProvider: SocialProvider = {
  async publish(account, input: PublishInput) {
    const accessToken = requireAccessToken(account)
    switch (account.platform) {
      case 'FACEBOOK':
        return { platformPostId: await publishFacebookPost(account.platformId, input.content, accessToken) }
      case 'INSTAGRAM':
        return { platformPostId: await publishToInstagram(account.platformId, input.content, accessToken) }
      case 'LINKEDIN':
        return { platformPostId: await publishToLinkedin(account.platformId, input.content, accessToken) }
      case 'TWITTER':
        return { platformPostId: await publishToTwitter(input.content, accessToken) }
      default:
        throw new ProviderUnsupported('publish', account.platform)
    }
  },
  async fetchRecentComments(account) {
    throw new ProviderUnsupported('fetchRecentComments', account.platform)
  },
  async replyToComment(account) {
    throw new ProviderUnsupported('replyToComment', account.platform)
  },
  async fetchReviews(account) {
    throw new ProviderUnsupported('fetchReviews', account.platform)
  },
  async replyToReview(account) {
    throw new ProviderUnsupported('replyToReview', account.platform)
  },
}
```

This is a direct, careful port of the Instagram/LinkedIn/Twitter logic that currently lives inline in `workers/post-publisher.worker.ts` (Task 5 will delete it from there) — same request shapes, same headers, same error handling intent, just each extracted into a named function with explicit thrown errors instead of silently producing `platformPostId: undefined`. Facebook reuses the existing `services/social/facebook.ts` `publishPost` function rather than duplicating it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `provider/native.ts`.

### Part B — `services/social/provider/zernio.ts`

- [ ] **Step 4: Fix the platform-slug bug and the pending/failed status TODO**

In `services/social/provider/zernio.ts`, change the import line to add `platformEnumToZernioSlug`:
```ts
import { toNormalizedComment, toNormalizedReview } from './mappers'
import { platformEnumToZernioSlug } from './platform-map'
import type { NormalizedComment, PublishInput, SocialProvider } from './types'
```
Then replace the `publish` method with:
```ts
  async publish(account, input: PublishInput) {
    const zernioAccountId = requireZernioId(account)
    const res = await zernioClient.publishNow(
      zernioAccountId,
      platformEnumToZernioSlug(account.platform),
      input.content,
      input.mediaUrls
    )
    // Safe because publishNow always sends exactly one platform entry, so platforms[0]
    // is the intended target even on an accountId-echo mismatch. Would need revisiting
    // if a future change starts publishing multiple platforms in one call.
    const target =
      res.post.platforms.find((p) => p.accountId === zernioAccountId) ?? res.post.platforms[0]
    if (!target || !target.platformPostId) {
      throw new Error(
        target?.error ?? `Zernio publish failed for account ${zernioAccountId} (status: ${target?.status ?? 'unknown'})`
      )
    }
    return { platformPostId: target.platformPostId }
  },
```
This replaces both `account.platform.toLowerCase()` (wrong for Google Business — see "Bugs found during planning" above) and the old `return { platformPostId: target?.platformPostId ?? '' }` (which silently produced an empty string on failure instead of throwing).

- [ ] **Step 5: Type-check + full test suite**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `provider/zernio.ts`.

Run: `npm test`
Expected: all pass (same count as end of Task 2 — this task doesn't add tests, both changed functions call live external APIs).

- [ ] **Step 6: Commit**

```bash
git add -f LYRA/lyra/services/social/provider/native.ts LYRA/lyra/services/social/provider/zernio.ts
git commit -m "feat(provider): wire native publish (FB/IG/LinkedIn/Twitter), fix Zernio platform-slug bug and silent publish failure"
```

---

## Task 4: Rewire the direct publish route

**Files:**
- Modify: `app/api/posts/[id]/publish/route.ts`

**Before you start:** read the current file — it should still match what's quoted in this plan's "Bugs found during planning" context (hardcoded Facebook/Instagram-only, inline `publishToInstagram` helper, explicit `accessToken` null-check, `decrypt`/`publishPost` imports). If it's materially different, STOP and report NEEDS_CONTEXT rather than guessing.

- [ ] **Step 1: Replace the full contents**

```ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/services/social/provider'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: postId } = await params

    const post = await prisma.post.findUnique({
      where:   { id: postId },
      include: { socialAccount: true },
    })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: post.workspaceId, userId: user.id },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (post.status === 'PUBLISHED') {
      return NextResponse.json({ error: 'Post already published.' }, { status: 400 })
    }

    const { platformPostId } = await getProvider(post.socialAccount).publish(post.socialAccount, {
      content: post.content,
      mediaUrls: post.mediaUrls,
    })

    await prisma.post.update({
      where: { id: postId },
      data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId },
    })

    return NextResponse.json({ ok: true, platformPostId })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/posts/[id]/publish error:', error)
    const message = error instanceof Error ? error.message : 'Failed to publish post'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

Note what's intentionally gone: the `decrypt`/`publishPost` imports, the local `publishToInstagram` helper (its logic now lives in `provider/native.ts`, Task 3), the `platform !== 'FACEBOOK' && platform !== 'INSTAGRAM'` gate (this route now supports whatever `getProvider().publish()` supports — Facebook/Instagram/LinkedIn/Twitter natively, plus any platform connected via Zernio), and the explicit `accessToken` null-check (now handled internally, correctly per-provider, by `nativeProvider`/`zernioProvider`).

**Check `post.mediaUrls`'s exact Prisma type** before finalizing — if it's `string[]` (non-nullable array, Prisma's default for list fields) this passes straight through to `PublishInput.mediaUrls?: string[]` with no conversion needed. If it turns out to be nullable, adapt with `post.mediaUrls ?? undefined`. Confirm via `prisma/schema.prisma`'s `Post` model or just let `tsc` tell you.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 3: Full test suite + build**

Run: `npm test`
Expected: all pass, same count as Task 2/3.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add -f "LYRA/lyra/app/api/posts/[id]/publish/route.ts"
git commit -m "feat(publish): route direct publish through getProvider(account).publish"
```

---

## Task 5: Rewire the BullMQ post-publisher worker

**Files:**
- Modify: `workers/post-publisher.worker.ts`

**Before you start:** read the current file — it should still match what's quoted in this plan's "Bugs found during planning" context (per-platform switch for FACEBOOK/INSTAGRAM/LINKEDIN/TWITTER, a blanket `if (!post.socialAccount.accessToken)` guard that marks the post FAILED, `decrypt` import). If it's materially different, STOP and report NEEDS_CONTEXT rather than guessing.

- [ ] **Step 1: Replace the full contents**

```ts
import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/services/social/provider'

const worker = new Worker(
  'post-publishing',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await prisma.post.findUnique({
      where:   { id: postId },
      include: { socialAccount: true },
    })
    if (!post || post.status !== 'SCHEDULED') return

    // Crisis check — skip publishing but keep post SCHEDULED so it retries once crisis resolves
    try {
      const workspaceMeta = await prisma.workspace.findUnique({
        where:  { id: post.workspaceId },
        select: { crisisActive: true },
      })
      if (workspaceMeta?.crisisActive) {
        console.log(`Skipping post ${post.id} — crisis active for workspace ${post.workspaceId}`)
        return
      }
    } catch (err) {
      console.error(`Crisis check failed for post ${post.id}:`, err)
      return  // Let BullMQ retry this job
    }

    await prisma.post.update({ where: { id: postId }, data: { status: 'PUBLISHING' } })

    try {
      const { platformPostId } = await getProvider(post.socialAccount).publish(post.socialAccount, {
        content: post.content,
        mediaUrls: post.mediaUrls,
      })
      await prisma.post.update({
        where: { id: postId },
        data:  { status: 'PUBLISHED', publishedAt: new Date(), platformPostId },
      })
    } catch (err) {
      await prisma.post.update({ where: { id: postId }, data: { status: 'FAILED' } })
      throw err
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`Post ${job?.data.postId} failed:`, err)
})

export default worker
```

Note what's intentionally gone: the `decrypt` import, the entire per-platform `switch` block (its FACEBOOK/INSTAGRAM/LINKEDIN/TWITTER logic now lives in `provider/native.ts`, Task 3 — this was a direct extraction, not a rewrite, so behavior for native accounts should be identical), and — **important** — the blanket `if (!post.socialAccount.accessToken) { ...FAILED... return }` guard from Phase 1. That guard was a correct stopgap when nothing actually used Zernio accounts yet, but it is now WRONG: a legitimately Zernio-routed account has no `accessToken` by design (Phase 1's schema decision), and this guard would fail it before `getProvider()` ever gets a chance to dispatch it correctly to `zernioProvider`. Removing it is required, not optional, for this task to be correct.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 3: Full test suite + build**

Run: `npm test`
Expected: all pass.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add -f LYRA/lyra/workers/post-publisher.worker.ts
git commit -m "feat(publish): route BullMQ worker publish through getProvider(account).publish"
```

---

## Phase 3 Done — Definition of Done

- `npm test` passes (14 tests: Phase 1's 6 + Phase 2's 4 + this phase's 1 platform-map + 3 provider/index).
- `npx tsc --noEmit` shows no NEW errors from Phase 3 files.
- `npm run build` succeeds.
- **Data fix applied to the live Supabase project** (Task 1's SQL) — with explicit user sign-off before running, since it corrects production data. Verify afterward: `SELECT provider, COUNT(*) FROM "SocialAccount" GROUP BY provider;` should show all 13 (or however many exist by then) as `NATIVE` unless any have genuinely been Zernio-connected since Phase 2 shipped.
- **Manual E2E verification (Richard, on ITWM's own test workspace/posts only):** publish a post via the direct `/api/posts/[id]/publish` route (or however the UI triggers it) for a native Facebook/Instagram/LinkedIn/Twitter account and confirm it actually posts and the `Post` row updates to `PUBLISHED` with a `platformPostId`. This can't be automated in this plan (needs live platform credentials and a real post) — same category as Phase 1's env-var step and Phase 2's connect-flow E2E test, both still outstanding themselves.
- Confirm a BullMQ-scheduled post still publishes correctly end-to-end (schedule a post a minute out, watch it flip `SCHEDULED → PUBLISHING → PUBLISHED` on Railway).

## Next phases (separate plans, written when reached)
- **Phase 4 — Webhook ingestion:** `/api/zernio/webhook` (signature verify + idempotency, both TDD) → Comment upsert → AI responder. `nativeProvider.fetchRecentComments`/`replyToComment` likely get wired here too (native comment-reply logic currently lives in `app/api/comments/[id]/reply/route.ts`, not yet consolidated into the provider seam).
- **Phase 5 — GBP reviews + Customer Voice UI:** Review ingestion + minimal review tab. `nativeProvider.fetchReviews`/`replyToReview` stay throwing (GBP native path was rejected per the design spec — Zernio is the permanent home for reviews).
