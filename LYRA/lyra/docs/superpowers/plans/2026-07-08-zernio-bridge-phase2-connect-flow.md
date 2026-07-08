# Zernio Bridge — Phase 2: Connect Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route new social-account connections through Zernio's hosted white-label OAuth page instead of each platform's native OAuth flow, for the platforms already exposed in workspace settings (Facebook, LinkedIn, Google Business, Twitter, TikTok, YouTube). This is a real, user-visible behavior change: clicking "Connect X" in workspace settings today sends the user to that platform's own consent screen; after this phase it sends them to Zernio's hosted page instead. This was decided in `docs/superpowers/specs/2026-07-08-zernio-bridge-design.md` ("Platforms via Zernio: **All** platforms during the bridge") and confirmed again during Phase 2 planning on 2026-07-08.

**Architecture:** `/api/social/connect/[platform]` stops branching per-platform to native `getAuthUrl()` calls and instead always lazy-creates a `Workspace.zernioProfileId` (once per workspace) and redirects to Zernio's hosted connect page via `zernioClient.getConnectUrl()`. A new `/api/zernio/connect/callback` route receives Zernio's redirect (which carries `connected`, `accountId`, `username` query params appended to our own `redirect_url`), verifies workspace access, and upserts a `SocialAccount` row with `provider=ZERNIO`. A small platform-slug mapping module translates between LYRA's route-param platform ids (`google`), Zernio's platform slugs (`googlebusiness`), and the Prisma `Platform` enum (`GOOGLE_BUSINESS`).

**Scope decision (confirmed with Richard 2026-07-08):** The existing "Facebook & Instagram" settings button stays wired to Facebook only. Zernio treats `facebook` and `instagram` as two separate connections; LYRA's UI currently has one combined button. Splitting that button, or auto-chaining a second Zernio connect for Instagram, is explicitly deferred to a later phase — do not build it here.

**Explicitly out of scope for this phase (do not build):**
- Webhook subscription registration ("ensure webhook subscription exists" from the design doc) — deferred to Phase 4, since the webhook *receiving* endpoint (`/api/zernio/webhook`) doesn't exist yet and there's no point registering a subscription with nowhere to deliver to.
- Fetching richer account details (`displayName`, `profilePicture`) via an extra Zernio API call. The callback's own redirect query params (`username`) are sufficient for `handle`/`name`; `avatarUrl` is left null for Zernio-connected accounts (native-connected accounts already populate it via their own APIs — this is a cosmetic gap only, not a functional one).
- Any change to `services/social/facebook.ts` / `linkedin.ts` / `google-business.ts` / `twitter.ts` / `tiktok.ts` / `youtube.ts`. These stay completely untouched — they're the intact native paths this bridge is designed to pivot back to per-platform later. This phase only changes which code path `/api/social/connect/[platform]` calls into.
- Instagram, Pinterest, Threads, Bluesky connect buttons — no UI exists for them today; not adding any.

**Tech Stack:** TypeScript, Next.js 16, Prisma 6, vitest. Builds directly on Phase 1's `ZernioClient` (`services/social/zernio-client.ts`) — no changes needed there; `createProfile` and `getConnectUrl` already exist and match the confirmed Zernio API shape.

**Conventions to follow (existing codebase):**
- Path alias `@/` → `LYRA/lyra/` root.
- `prisma` from `@/lib/prisma`; `requireAuth` from `@/lib/auth` (throws an `Error` with message `'Unauthorized'` when there's no session).
- New files under `LYRA/lyra/` require `git add -f` when committing from the OneDrive repo root (root `.gitignore` has `/LYRA`). Commit from `C:\Users\Rich\OneDrive - Into The Wild Marketing`.
- This repo currently has a git worktree workflow for feature branches (see `superpowers:using-git-worktrees`) — use it the same way Phase 1 did.

---

## File Structure

**New files:**
- `services/social/provider/platform-map.ts` — bidirectional mapping: connect-route platform id ↔ Zernio platform slug ↔ Prisma `Platform` enum.
- `services/social/provider/platform-map.test.ts` — unit tests (TDD target).
- `app/api/zernio/connect/callback/route.ts` — receives Zernio's post-connect redirect, upserts `SocialAccount`.

**Modified files:**
- `app/api/social/connect/[platform]/route.ts` — replace the native per-platform switch with a uniform Zernio dispatch.
- `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — add one entry to the existing `CONNECT_ERRORS` lookup table (one line; the error-banner rendering logic already exists and needs no other change).

**Not touched in Phase 2:** `services/social/{facebook,linkedin,google-business,twitter,tiktok,youtube}.ts` (native — stay intact, dormant for this route only), `services/social/zernio-client.ts` (already complete from Phase 1), `services/social/provider/{types,zernio,native,index,mappers}.ts` (already complete from Phase 1), publish/comment/review routes (Phase 3/4/5), `/api/zernio/webhook` (Phase 4).

---

## Task 1: Platform slug mapping (TDD)

**Files:**
- Create: `services/social/provider/platform-map.ts`
- Test: `services/social/provider/platform-map.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `services/social/provider/platform-map.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toZernioPlatform, fromZernioPlatform } from './platform-map'

describe('toZernioPlatform', () => {
  it('maps known connect-route platform ids to Zernio platform slugs', () => {
    expect(toZernioPlatform('facebook')).toBe('facebook')
    expect(toZernioPlatform('google')).toBe('googlebusiness')
    expect(toZernioPlatform('linkedin')).toBe('linkedin')
    expect(toZernioPlatform('twitter')).toBe('twitter')
    expect(toZernioPlatform('tiktok')).toBe('tiktok')
    expect(toZernioPlatform('youtube')).toBe('youtube')
  })

  it('returns null for an unknown route id', () => {
    expect(toZernioPlatform('myspace')).toBeNull()
  })
})

describe('fromZernioPlatform', () => {
  it('maps known Zernio platform slugs to Prisma Platform enum values', () => {
    expect(fromZernioPlatform('facebook')).toBe('FACEBOOK')
    expect(fromZernioPlatform('googlebusiness')).toBe('GOOGLE_BUSINESS')
    expect(fromZernioPlatform('linkedin')).toBe('LINKEDIN')
    expect(fromZernioPlatform('twitter')).toBe('TWITTER')
    expect(fromZernioPlatform('tiktok')).toBe('TIKTOK')
    expect(fromZernioPlatform('youtube')).toBe('YOUTUBE')
    expect(fromZernioPlatform('instagram')).toBe('INSTAGRAM')
    expect(fromZernioPlatform('bluesky')).toBe('BLUESKY')
  })

  it('returns null for an unknown Zernio platform slug', () => {
    expect(fromZernioPlatform('myspace')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `LYRA/lyra`): `npm test -- platform-map`
Expected: FAIL — "Cannot find module './platform-map'" (module not implemented).

- [ ] **Step 3: Write the mapping module**

Create `services/social/provider/platform-map.ts`:
```ts
import type { Platform } from '@prisma/client'

// Route param (as used in /api/social/connect/[platform]) -> Zernio's platform slug.
// Zernio's `googlebusiness` has no underscore (unlike our route id `google` and
// unlike Ayrshare's old `gmb`) -- confirmed against docs.zernio.com 2026-07-08.
const ROUTE_TO_ZERNIO: Record<string, string> = {
  facebook: 'facebook',
  linkedin: 'linkedin',
  google: 'googlebusiness',
  twitter: 'twitter',
  tiktok: 'tiktok',
  youtube: 'youtube',
}

// Zernio's platform slug (as returned in the connect-callback `connected` query
// param) -> our Prisma Platform enum. Includes platforms with no connect button
// yet (instagram, pinterest, threads, bluesky) so an unexpected callback still
// maps cleanly instead of silently failing.
const ZERNIO_TO_PLATFORM: Record<string, Platform> = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  linkedin: 'LINKEDIN',
  googlebusiness: 'GOOGLE_BUSINESS',
  twitter: 'TWITTER',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
  pinterest: 'PINTEREST',
  threads: 'THREADS',
  bluesky: 'BLUESKY',
}

export function toZernioPlatform(routeId: string): string | null {
  return ROUTE_TO_ZERNIO[routeId] ?? null
}

export function fromZernioPlatform(zernioSlug: string): Platform | null {
  return ZERNIO_TO_PLATFORM[zernioSlug] ?? null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- platform-map`
Expected: PASS — 4 passed (2 describe blocks, 2 tests each).

- [ ] **Step 5: Commit**

```bash
git add -f LYRA/lyra/services/social/provider/platform-map.ts LYRA/lyra/services/social/provider/platform-map.test.ts
git commit -m "feat(provider): add platform slug mapping between routes, Zernio, and Prisma enum"
```

---

## Task 2: Rewrite the connect route for uniform Zernio dispatch

**Files:**
- Modify: `app/api/social/connect/[platform]/route.ts`

**Current behavior (for reference — this is what gets replaced):** the route takes `?workspaceId=`, requires auth, then `switch (platform)` calls one of six native `services/social/*.getAuthUrl(workspaceId, ...)` functions and redirects to the result. No workspace-access check currently exists in this route (only `requireAuth()` — the access check happens later, in the callback).

- [ ] **Step 1: Replace the route body**

Replace the full contents of `app/api/social/connect/[platform]/route.ts` with:
```ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { zernioClient } from '@/services/social/zernio-client'
import { toZernioPlatform } from '@/services/social/provider/platform-map'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const user = await requireAuth()
    const { platform } = await params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const zernioPlatform = toZernioPlatform(platform)
    if (!zernioPlatform) {
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
    }

    // Cross-tenant guard: the connect route now mutates Workspace.zernioProfileId,
    // so (unlike the old native-only version) it needs an access check up front
    // rather than relying solely on the callback's check.
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Lazy-create the Zernio profile for this workspace on first connect of any
    // platform. One profile per workspace, per the design (Profiles group
    // accounts the same way a LYRA Workspace does).
    let zernioProfileId = workspace.zernioProfileId
    if (!zernioProfileId) {
      const { profile } = await zernioClient.createProfile(workspace.name)
      zernioProfileId = profile._id
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { zernioProfileId },
      })
    }

    const redirectUrl = `${BASE_URL}/api/zernio/connect/callback?workspaceId=${encodeURIComponent(workspaceId)}`
    const { authUrl } = await zernioClient.getConnectUrl(zernioPlatform, zernioProfileId, redirectUrl)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error(`GET /api/social/connect/[platform] error:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

Note what's intentionally gone: the imports of `services/social/{facebook,linkedin,google-business,twitter,tiktok,youtube}` and the per-platform switch. Those service files are untouched on disk — only this route stops calling into them. This is the "uniform dispatch" decision from the design doc, not an oversight.

- [ ] **Step 2: Type-check compiles**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `app/api/social/connect/[platform]/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add -f "LYRA/lyra/app/api/social/connect/[platform]/route.ts"
git commit -m "feat(connect): route all platform connects through Zernio's hosted flow"
```

---

## Task 3: Zernio connect callback + settings error copy

**Files:**
- Create: `app/api/zernio/connect/callback/route.ts`
- Modify: `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`

**What Zernio sends back:** per `docs.zernio.com`, standard (non-headless) mode appends `?connected={platform}&profileId=X&accountId=Y&username=Z` to whatever `redirect_url` we passed to `getConnectUrl` (confirmed 2026-07-08). Our `redirect_url` from Task 2 is `${BASE_URL}/api/zernio/connect/callback?workspaceId=...`, so this route receives all five query params together: `workspaceId` (ours), `connected`, `profileId`, `accountId`, `username` (Zernio's).

- [ ] **Step 1: Write the callback route**

Create `app/api/zernio/connect/callback/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fromZernioPlatform } from '@/services/social/provider/platform-map'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const connectedSlug = searchParams.get('connected')
  const zernioAccountId = searchParams.get('accountId')
  const username = searchParams.get('username') ?? ''

  if (!workspaceId) {
    return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
  }

  try {
    const user = await requireAuth()

    // Verify the authenticated user actually has access to the target workspace.
    // Same cross-tenant protection as /api/social/callback/[platform] -- without
    // this, a forged workspaceId in the redirect could inject a Zernio account
    // into another tenant's workspace.
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }

    if (!connectedSlug || !zernioAccountId) {
      // User cancelled on Zernio's hosted page, or the flow didn't complete.
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    const platform = fromZernioPlatform(connectedSlug)
    if (!platform) {
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    // platformId stores the Zernio account id for ZERNIO-provider accounts (there
    // is no native platform id available here) -- same uniqueness guarantee as
    // native accounts, different source. zernioAccountId is stored again on its
    // own column so provider code doesn't need to know this convention.
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform_platformId: { workspaceId, platform, platformId: zernioAccountId },
      },
      create: {
        workspaceId,
        platform,
        platformId: zernioAccountId,
        handle: username,
        name: username,
        accessToken: null,
        provider: 'ZERNIO',
        zernioAccountId,
      },
      update: {
        handle: username,
        name: username,
        provider: 'ZERNIO',
        zernioAccountId,
        isActive: true,
      },
    })

    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?connected=${connectedSlug}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/zernio/connect/callback error:', error)
    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
  }
}
```

- [ ] **Step 2: Add the error copy to the settings page**

In `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`, find the `CONNECT_ERRORS` lookup table:
```ts
  const CONNECT_ERRORS: Record<string, string> = {
    linkedin_no_orgs:
      'No LinkedIn company pages found. You must be an admin of at least one LinkedIn Page to connect. LYRA connects company pages, not personal profiles.',
    oauth_failed: 'The connection could not be completed. Try again.',
  }
```
Add one entry so `zernio_connect_failed` gets a specific message instead of falling back to the generic one:
```ts
  const CONNECT_ERRORS: Record<string, string> = {
    linkedin_no_orgs:
      'No LinkedIn company pages found. You must be an admin of at least one LinkedIn Page to connect. LYRA connects company pages, not personal profiles.',
    oauth_failed: 'The connection could not be completed. Try again.',
    zernio_connect_failed: 'The connection could not be completed via Zernio. Try again.',
  }
```
No other change needed on this page — the error-banner rendering and the `connected=` success banner already handle arbitrary platform/error strings generically (confirmed by reading the file: `connectedPlatformLabel` and `connectErrorMessage` both fall back gracefully for unrecognized values).

- [ ] **Step 3: Type-check compiles**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `app/api/zernio/connect/callback/route.ts` or the settings page.

- [ ] **Step 4: Full test suite + build**

Run: `npm test`
Expected: all pass (4 mapper + 2 factory-dispatch from Phase 1, + 4 new platform-map tests = 10 passed).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add -f "LYRA/lyra/app/api/zernio/connect/callback/route.ts" "LYRA/lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx"
git commit -m "feat(connect): add Zernio connect callback route, upsert SocialAccount"
```

---

## Phase 2 Done — Definition of Done

- `npm test` passes (10 tests: Phase 1's 6 + this phase's 4).
- `npx tsc --noEmit` shows no NEW errors from Phase 2 files.
- `npm run build` succeeds.
- **Manual E2E verification (Richard, on ITWM's own test workspace only — no client data, per the design doc's testing guardrail):** click "Connect Facebook" in workspace settings → land on Zernio's hosted white-label page → authorize → land back on `settings?connected=facebook` with a success banner → confirm a new `SocialAccount` row exists with `provider=ZERNIO`, `zernioAccountId` set, `platform=FACEBOOK`, `accessToken=null`. This can't be automated in this plan (needs a live browser OAuth round-trip against the real Zernio API) — it's the acceptance gate before calling Phase 2 complete, same as Phase 1's env-var step was manual.
- Confirm `Workspace.zernioProfileId` was populated on first connect and reused (not re-created) on a second platform connect for the same workspace.

## Next phases (separate plans, written when reached)
- **Phase 3 — Publish:** route + post-publisher worker call `getProvider(account).publish(...)` instead of native services directly. This is also where the Phase 1 review's flagged risk (`provider` defaults every existing account to `ZERNIO`) becomes load-bearing — must gate real dispatch on `zernioAccountId != null`, not just `provider === 'ZERNIO'`, so an unmigrated native account fails loudly via `requireZernioId` instead of silently misrouting.
- **Phase 4 — Webhook ingestion:** `/api/zernio/webhook` (signature verify + idempotency, both TDD) → Comment upsert → AI responder. This is also where webhook subscription registration (deferred from this phase) gets built.
- **Phase 5 — GBP reviews + Customer Voice UI:** Review ingestion + minimal review tab.
- **Follow-up (small, whenever):** Instagram connect entry point — either split the settings "Facebook & Instagram" button into two, or chain a second Zernio connect call after Facebook's callback completes. Deferred per the Phase 2 scope decision above.
