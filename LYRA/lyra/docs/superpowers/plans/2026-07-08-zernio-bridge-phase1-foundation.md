# Zernio Bridge — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested foundation for routing all social platforms through Zernio — the data model, the `SocialProvider` seam, the `ZernioClient`, and the pure payload mappers — without wiring any user-facing flow yet.

**Architecture:** A `SocialProvider` interface with a `getProvider(account)` factory that dispatches on a new `SocialAccount.provider` field. `zernioProvider` (built on a thin `ZernioClient` over Zernio's REST API) and `nativeProvider` (wraps existing `services/social/*.ts`). Pure Zernio↔Normalized mappers are unit-tested; the seam is proven before any route calls it. This is the disposable-bridge seam from the design spec (`docs/superpowers/specs/2026-07-08-zernio-bridge-design.md`).

**Tech Stack:** TypeScript, Next.js 16, Prisma 6 (Supabase Postgres), vitest (new), Zernio REST API (`https://zernio.com/api/v1`, bearer `ZERNIO_API_KEY`).

**Conventions to follow (existing codebase):**
- Path alias `@/` → `LYRA/lyra/` root.
- `encrypt` / `decrypt` from `@/lib/encrypt`; `prisma` from `@/lib/prisma`.
- **Schema changes are applied via the Supabase SQL Editor, NOT `prisma db push`** (project rule).
- New files under `LYRA/lyra/` require `git add -f` when committing from the OneDrive repo root (root `.gitignore` has `/LYRA`). Commit from `C:\Users\Rich\OneDrive - Into The Wild Marketing`.

---

## File Structure

**New files:**
- `vitest.config.ts` — test runner config with `@/` alias resolution.
- `services/social/provider/types.ts` — `SocialProvider` interface, `NormalizedComment`, `NormalizedReview`, `ProviderUnsupported` error.
- `services/social/zernio-client.ts` — thin REST wrapper (the only file that knows Zernio's HTTP shape).
- `services/social/provider/mappers.ts` — pure Zernio↔Normalized mapping functions.
- `services/social/provider/mappers.test.ts` — unit tests (TDD target).
- `services/social/provider/native.ts` — native implementation (wraps existing services; throws `ProviderUnsupported` for reviews).
- `services/social/provider/zernio.ts` — Zernio implementation (client + mappers).
- `services/social/provider/index.ts` — `getProvider(account)` factory.
- `services/social/provider/index.test.ts` — factory dispatch tests (TDD target).
- `prisma/migrations-sql/2026-07-08-zernio-foundation.sql` — the Supabase SQL to apply by hand (kept in-repo for the record).

**Modified files:**
- `package.json` — add `vitest` devDep + `test` script.
- `prisma/schema.prisma` — add `SocialProviderType` enum, `provider`/`zernioAccountId` on `SocialAccount`, make `accessToken` optional, `zernioProfileId` on `Workspace`, `Review` model.

**Not touched in Phase 1** (later phases): connect route, publish route, workers, webhook endpoint, Customer Voice UI.

---

## Task 1: Set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `services/social/provider/smoke.test.ts` (temporary, deleted at end of task)

- [ ] **Step 1: Install vitest + tsconfig path resolver**

Run (from `LYRA/lyra`):
```bash
npm install -D vitest vite-tsconfig-paths
```
Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
})
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a temporary smoke test**

Create `services/social/provider/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('vitest smoke', () => {
  it('resolves the @/ alias and runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it and confirm the runner works**

Run: `npm test`
Expected: PASS — 1 passed. Confirms vitest + tsconfig paths are wired.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm "LYRA/lyra/services/social/provider/smoke.test.ts"
```
Then from `C:\Users\Rich\OneDrive - Into The Wild Marketing`:
```bash
git add -f LYRA/lyra/package.json LYRA/lyra/package-lock.json LYRA/lyra/vitest.config.ts
git commit -m "chore(test): add vitest + tsconfig path resolution"
```

---

## Task 2: Data model — schema + Supabase SQL

No unit test (schema/DB task). Applied by hand in Supabase per project rule; the SQL is kept in-repo.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations-sql/2026-07-08-zernio-foundation.sql`

- [ ] **Step 1: Add the enum + `SocialAccount` fields in `schema.prisma`**

Add the enum near the other enums:
```prisma
enum SocialProviderType {
  NATIVE
  ZERNIO
}
```
In `model SocialAccount`, add these fields and make `accessToken` optional:
```prisma
  provider        SocialProviderType @default(ZERNIO)
  zernioAccountId String?
```
Change `accessToken  String` to:
```prisma
  accessToken  String?
```

- [ ] **Step 2: Add `zernioProfileId` to `Workspace`**

In `model Workspace`, add:
```prisma
  zernioProfileId String?
```

- [ ] **Step 3: Add the `Review` model**

```prisma
model Review {
  id              String    @id @default(cuid())
  workspaceId     String
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id])
  zernioReviewId  String
  rating          Int?
  text            String?
  authorName      String?
  status          String    @default("NEW") // NEW | REPLIED | SKIPPED
  replyText       String?
  createdAt       DateTime  @default(now())
  reviewedAt      DateTime?

  @@unique([socialAccountId, zernioReviewId])
  @@index([workspaceId, status])
}
```
Add the back-relations: in `model Workspace` add `reviews Review[]`; in `model SocialAccount` add `reviews Review[]`.

- [ ] **Step 4: Write the Supabase SQL file**

Create `prisma/migrations-sql/2026-07-08-zernio-foundation.sql`:
```sql
-- Zernio bridge foundation — apply in Supabase SQL Editor (do NOT use prisma db push)
DO $$ BEGIN
  CREATE TYPE "SocialProviderType" AS ENUM ('NATIVE', 'ZERNIO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "provider" "SocialProviderType" NOT NULL DEFAULT 'ZERNIO';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "zernioAccountId" TEXT;
ALTER TABLE "SocialAccount" ALTER COLUMN "accessToken" DROP NOT NULL;

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "zernioProfileId" TEXT;

CREATE TABLE IF NOT EXISTS "Review" (
  "id"              TEXT PRIMARY KEY,
  "workspaceId"     TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "socialAccountId" TEXT NOT NULL REFERENCES "SocialAccount"("id") ON DELETE CASCADE,
  "zernioReviewId"  TEXT NOT NULL,
  "rating"          INTEGER,
  "text"            TEXT,
  "authorName"      TEXT,
  "status"          TEXT NOT NULL DEFAULT 'NEW',
  "replyText"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"      TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Review_socialAccountId_zernioReviewId_key" ON "Review"("socialAccountId","zernioReviewId");
CREATE INDEX IF NOT EXISTS "Review_workspaceId_status_idx" ON "Review"("workspaceId","status");
```

- [ ] **Step 5: Apply the SQL in Supabase**

Paste the SQL into the Supabase SQL Editor and run it. Verify with:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'SocialAccount' AND column_name IN ('provider','zernioAccountId');
```
Expected: both rows returned.

- [ ] **Step 6: Regenerate the Prisma client locally**

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 7: Commit**

From the OneDrive root:
```bash
git add -f LYRA/lyra/prisma/schema.prisma LYRA/lyra/prisma/migrations-sql/2026-07-08-zernio-foundation.sql
git commit -m "feat(db): add provider fields, zernioProfileId, and Review model"
```

---

## Task 3: Provider interface + Normalized types

Pure type definitions — no test needed (types are checked by `tsc`/vitest compile).

**Files:**
- Create: `services/social/provider/types.ts`

- [ ] **Step 1: Write the types file**

```ts
import type { SocialAccount } from '@prisma/client'

export interface NormalizedComment {
  externalId: string      // provider's comment id (stored in Comment.platformCommentId)
  postExternalId: string  // parent post id on the platform
  authorName: string
  authorHandle?: string
  text: string
  createdAt: Date
}

export interface NormalizedReview {
  externalId: string      // provider's review id (stored in Review.zernioReviewId)
  rating: number | null
  text: string | null
  authorName: string | null
  createdAt: Date
}

export interface PublishInput {
  content: string
  mediaUrls?: string[]
}

export interface SocialProvider {
  publish(account: SocialAccount, input: PublishInput): Promise<{ platformPostId: string }>
  fetchRecentComments(account: SocialAccount): Promise<NormalizedComment[]>
  replyToComment(account: SocialAccount, externalId: string, text: string): Promise<void>
  fetchReviews(account: SocialAccount): Promise<NormalizedReview[]>
  replyToReview(account: SocialAccount, externalId: string, text: string): Promise<void>
}

export class ProviderUnsupported extends Error {
  constructor(operation: string, platform: string) {
    super(`Provider does not support ${operation} for ${platform}`)
    this.name = 'ProviderUnsupported'
  }
}
```

- [ ] **Step 2: Type-check compiles**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `provider/types.ts` (pre-existing `timezone`/Prisma errors from the handover may remain; ignore those).

- [ ] **Step 3: Commit**

```bash
git add -f LYRA/lyra/services/social/provider/types.ts
git commit -m "feat(provider): add SocialProvider interface and normalized types"
```

---

## Task 4: ZernioClient (thin REST wrapper)

**Files:**
- Create: `services/social/zernio-client.ts`

> **Implementation note:** verify each endpoint path/shape against `https://docs.zernio.com` while building (the MCP `docs_search` tool is the fastest reference). The base URL (`https://zernio.com/api/v1`) and bearer auth are confirmed. The methods below use the shapes seen in the docs; adjust field names to match if the docs differ — the mappers (Task 5) are what the rest of the app depends on, so keep this file's return values raw.

- [ ] **Step 1: Write the client**

```ts
const BASE = 'https://zernio.com/api/v1'

function key(): string {
  const k = process.env.ZERNIO_API_KEY
  if (!k) throw new Error('ZERNIO_API_KEY is not set')
  return k
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 429) throw new Error('Zernio rate limited (429)')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string }).message ?? `Zernio ${method} ${path} failed (${res.status})`
    throw new Error(msg)
  }
  return data as T
}

export const zernioClient = {
  createProfile: (name: string) =>
    req<{ profile: { _id: string } }>('POST', '/profiles', { name }),

  getConnectUrl: (platform: string, profileId: string, redirectUrl: string) =>
    req<{ authUrl: string }>('GET',
      `/connect/${platform}?profileId=${encodeURIComponent(profileId)}&redirect_url=${encodeURIComponent(redirectUrl)}`),

  publishNow: (accountId: string, platform: string, content: string, mediaUrls?: string[]) =>
    req<{ post: { platformPostId?: string; id?: string } }>('POST', '/posts', {
      content,
      platforms: [{ platform, accountId, ...(mediaUrls?.length ? { mediaUrls } : {}) }],
      publishNow: true,
    }),

  listInboxComments: (accountId: string) =>
    req<{ comments: unknown[] }>('GET', `/inbox/comments?accountId=${encodeURIComponent(accountId)}`),

  replyToComment: (commentExternalId: string, text: string) =>
    req<unknown>('POST', `/inbox/comments/${encodeURIComponent(commentExternalId)}/reply`, { message: text }),

  getGoogleBusinessReviews: (accountId: string) =>
    req<{ reviews: unknown[] }>('GET', `/accounts/${encodeURIComponent(accountId)}/google-business/reviews`),

  replyToGoogleBusinessReview: (accountId: string, reviewExternalId: string, text: string) =>
    req<unknown>('POST',
      `/accounts/${encodeURIComponent(accountId)}/google-business/reviews/${encodeURIComponent(reviewExternalId)}/reply`,
      { comment: text }),
}

export type ZernioClient = typeof zernioClient
```

- [ ] **Step 2: Type-check compiles**

Run: `npx tsc --noEmit`
Expected: no new errors in `zernio-client.ts`.

- [ ] **Step 3: Commit**

```bash
git add -f LYRA/lyra/services/social/zernio-client.ts
git commit -m "feat(zernio): add thin REST client wrapper"
```

---

## Task 5: Mappers (TDD — pure logic)

Convert raw Zernio payloads into the app's Normalized types. These are the risky pure functions, so test-first.

**Files:**
- Create: `services/social/provider/mappers.ts`
- Test: `services/social/provider/mappers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { toNormalizedComment, toNormalizedReview } from './mappers'

describe('toNormalizedComment', () => {
  it('maps a Zernio inbox comment to the normalized shape', () => {
    const raw = {
      id: 'c_123',
      postId: 'p_456',
      author: { name: 'Jane Doe', username: 'janed' },
      text: 'Love this!',
      createdAt: '2026-07-08T10:00:00.000Z',
    }
    expect(toNormalizedComment(raw)).toEqual({
      externalId: 'c_123',
      postExternalId: 'p_456',
      authorName: 'Jane Doe',
      authorHandle: 'janed',
      text: 'Love this!',
      createdAt: new Date('2026-07-08T10:00:00.000Z'),
    })
  })

  it('falls back to empty author handle and blank name when missing', () => {
    const raw = { id: 'c_1', postId: 'p_1', text: 'hi', createdAt: '2026-07-08T10:00:00.000Z' }
    const out = toNormalizedComment(raw)
    expect(out.authorHandle).toBeUndefined()
    expect(out.authorName).toBe('')
  })
})

describe('toNormalizedReview', () => {
  it('maps a Zernio GBP review to the normalized shape', () => {
    const raw = {
      reviewId: 'r_789',
      starRating: 4,
      comment: 'Good service',
      reviewer: { displayName: 'Bob' },
      createTime: '2026-07-08T09:00:00.000Z',
    }
    expect(toNormalizedReview(raw)).toEqual({
      externalId: 'r_789',
      rating: 4,
      text: 'Good service',
      authorName: 'Bob',
      createdAt: new Date('2026-07-08T09:00:00.000Z'),
    })
  })

  it('maps a rating-less review (open-ended) to rating null', () => {
    const raw = { reviewId: 'r_1', comment: 'text only', reviewer: {}, createTime: '2026-07-08T09:00:00.000Z' }
    const out = toNormalizedReview(raw)
    expect(out.rating).toBeNull()
    expect(out.authorName).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- mappers`
Expected: FAIL — "toNormalizedComment is not a function" (module not implemented).

- [ ] **Step 3: Write the mappers**

```ts
import type { NormalizedComment, NormalizedReview } from './types'

interface RawZernioComment {
  id: string
  postId: string
  author?: { name?: string; username?: string }
  text?: string
  createdAt: string
}

interface RawZernioReview {
  reviewId: string
  starRating?: number
  comment?: string
  reviewer?: { displayName?: string }
  createTime: string
}

export function toNormalizedComment(raw: RawZernioComment): NormalizedComment {
  return {
    externalId: raw.id,
    postExternalId: raw.postId,
    authorName: raw.author?.name ?? '',
    authorHandle: raw.author?.username,
    text: raw.text ?? '',
    createdAt: new Date(raw.createdAt),
  }
}

export function toNormalizedReview(raw: RawZernioReview): NormalizedReview {
  return {
    externalId: raw.reviewId,
    rating: typeof raw.starRating === 'number' ? raw.starRating : null,
    text: raw.comment ?? null,
    authorName: raw.reviewer?.displayName ?? null,
    createdAt: new Date(raw.createTime),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- mappers`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add -f LYRA/lyra/services/social/provider/mappers.ts LYRA/lyra/services/social/provider/mappers.test.ts
git commit -m "feat(provider): add tested Zernio->Normalized mappers"
```

---

## Task 6: Provider implementations + factory (TDD dispatch)

**Files:**
- Create: `services/social/provider/zernio.ts`
- Create: `services/social/provider/native.ts`
- Create: `services/social/provider/index.ts`
- Test: `services/social/provider/index.test.ts`

- [ ] **Step 1: Write the zernio implementation**

```ts
import type { SocialAccount } from '@prisma/client'
import { zernioClient } from '@/services/social/zernio-client'
import { toNormalizedComment, toNormalizedReview } from './mappers'
import type { SocialProvider, PublishInput } from './types'

function requireZernioId(account: SocialAccount): string {
  if (!account.zernioAccountId) throw new Error(`SocialAccount ${account.id} has no zernioAccountId`)
  return account.zernioAccountId
}

export const zernioProvider: SocialProvider = {
  async publish(account, input: PublishInput) {
    const platform = account.platform.toLowerCase()
    const res = await zernioClient.publishNow(requireZernioId(account), platform, input.content, input.mediaUrls)
    return { platformPostId: res.post.platformPostId ?? res.post.id ?? '' }
  },
  async fetchRecentComments(account) {
    const res = await zernioClient.listInboxComments(requireZernioId(account))
    return (res.comments as Parameters<typeof toNormalizedComment>[0][]).map(toNormalizedComment)
  },
  async replyToComment(_account, externalId, text) {
    await zernioClient.replyToComment(externalId, text)
  },
  async fetchReviews(account) {
    const res = await zernioClient.getGoogleBusinessReviews(requireZernioId(account))
    return (res.reviews as Parameters<typeof toNormalizedReview>[0][]).map(toNormalizedReview)
  },
  async replyToReview(account, externalId, text) {
    await zernioClient.replyToGoogleBusinessReview(requireZernioId(account), externalId, text)
  },
}
```

- [ ] **Step 2: Write the native implementation (skeleton — wired in later phases)**

```ts
import type { SocialProvider } from './types'
import { ProviderUnsupported } from './types'

// Native path stays intact for per-platform pivot-back. Publishing/comments are
// wired to the existing services/social/*.ts in a later phase; reviews are
// unsupported natively (GBP native path was rejected — see the design spec).
export const nativeProvider: SocialProvider = {
  async publish(account) { throw new ProviderUnsupported('publish', account.platform) },
  async fetchRecentComments(account) { throw new ProviderUnsupported('fetchRecentComments', account.platform) },
  async replyToComment(account) { throw new ProviderUnsupported('replyToComment', account.platform) },
  async fetchReviews(account) { throw new ProviderUnsupported('fetchReviews', account.platform) },
  async replyToReview(account) { throw new ProviderUnsupported('replyToReview', account.platform) },
}
```

- [ ] **Step 3: Write the factory**

```ts
import type { SocialAccount } from '@prisma/client'
import type { SocialProvider } from './types'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

export function getProvider(account: Pick<SocialAccount, 'provider'>): SocialProvider {
  return account.provider === 'ZERNIO' ? zernioProvider : nativeProvider
}

export type { SocialProvider } from './types'
```

- [ ] **Step 4: Write the failing factory-dispatch test**

```ts
import { describe, it, expect } from 'vitest'
import { getProvider } from './index'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

describe('getProvider', () => {
  it('returns the Zernio provider for ZERNIO accounts', () => {
    expect(getProvider({ provider: 'ZERNIO' })).toBe(zernioProvider)
  })
  it('returns the native provider for NATIVE accounts', () => {
    expect(getProvider({ provider: 'NATIVE' })).toBe(nativeProvider)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npm test -- provider/index`
Expected: PASS — 2 passed.

- [ ] **Step 6: Full test + type-check gate**

Run: `npm test`
Expected: all tests pass (mappers + factory).
Run: `npx tsc --noEmit`
Expected: no new errors in the `provider/` files.

- [ ] **Step 7: Commit**

```bash
git add -f LYRA/lyra/services/social/provider/zernio.ts LYRA/lyra/services/social/provider/native.ts LYRA/lyra/services/social/provider/index.ts LYRA/lyra/services/social/provider/index.test.ts
git commit -m "feat(provider): add zernio/native implementations + tested getProvider factory"
```

---

## Task 7: Env var + deploy note (no code)

- [ ] **Step 1: Add `ZERNIO_API_KEY` to Netlify and Railway**

In Netlify (`lyra-online-app`) → Environment variables, and Railway (worker service) → Variables, add `ZERNIO_API_KEY` = the Zernio API key. Server-side only; never expose to the client.

- [ ] **Step 2: Verify the build is unaffected**

Push the branch and confirm the Netlify deploy goes green and the Railway worker still starts (`[workers] All workers started`). No runtime code calls Zernio yet, so this is a safety check that the new files compile in CI.

---

## Phase 1 Done — Definition of Done
- `npm test` passes (mappers + factory).
- `npx tsc --noEmit` shows no NEW errors from Phase 1 files.
- Schema applied in Supabase; `SocialAccount.provider`, `zernioAccountId`, `Workspace.zernioProfileId`, and `Review` exist.
- Netlify + Railway green with `ZERNIO_API_KEY` set.
- Nothing user-facing changed — the seam exists and is tested, ready for Phase 2 (connect flow).

## Next phases (separate plans, written when reached)
- **Phase 2 — Connect flow:** `zernioProfileId` lazy-create, `/api/social/connect/[platform]` → Zernio connect URL, `/api/zernio/connect/callback` upsert.
- **Phase 3 — Publish:** route + post-publisher worker call `getProvider(account).publish(...)`.
- **Phase 4 — Webhook ingestion:** `/api/zernio/webhook` (signature verify + idempotency, both TDD) → Comment upsert → AI responder.
- **Phase 5 — GBP reviews + Customer Voice UI:** Review ingestion + minimal review tab.
