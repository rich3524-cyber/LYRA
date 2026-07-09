# Zernio Bridge — Phase 4: Webhook Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/api/zernio/webhook` so inbound comments from Zernio-connected accounts flow into LYRA's existing Comment/AI-responder pipeline in near-real-time, and wire comment replies (manual + AI auto-reply) through the provider seam so they work for both native and Zernio-routed accounts.

**Architecture:** A new webhook route verifies Zernio's HMAC signature (timing-safe, mirroring the existing `CRON_SECRET` pattern), routes `comment.received` events to an idempotent `Comment` upsert (keyed on the existing `@@unique([socialAccountId, platformCommentId])` constraint — no separate event-log table needed) and enqueues the **existing** `ai-responding` BullMQ queue, and routes `account.disconnected` events to mark the matching `SocialAccount` inactive. Two real gaps get closed along the way: `nativeProvider.replyToComment` (a Phase 1 throwing stub) gets wired to the native reply functions that already exist per-platform, and the two places that currently reply to comments (the manual reply route, the AI auto-reply worker) get switched from hardcoded native-only logic to `getProvider(account).replyToComment(...)`.

**Bugs found during planning (fixed here, not scope creep):**
1. **Phase 1's `mappers.ts` used the wrong field for a comment's parent-post id.** `RawZernioComment.postId` was assumed to be the platform's post id, but the real `comment.received` webhook payload (confirmed live against docs.zernio.com 2026-07-09) has TWO separate post-id fields: `comment.postId` (Zernio's *internal* post id, null for posts not published through Zernio) and `comment.platformPostId` (the platform's actual post id — the one needed to reply). `NormalizedComment.postExternalId` must come from `platformPostId`, not `postId`. Fixed in Task 2.
2. **`Comment` has nowhere to store a platform post id**, so `zernioProvider.replyToComment(account, postExternalId, ...)` (which requires one — Zernio's reply endpoint is scoped to a post) has no way to reply to an ingested comment. Fixed by adding `Comment.platformPostId` in Task 1, populated at ingestion time (Task 5) from the corrected mapper field.
3. **`ai-responder.worker.ts`'s auto-reply path bypasses the provider seam entirely** — it hardcodes a direct call to `services/social/facebook.ts`'s `replyToComment` and only handles `FACEBOOK`/`INSTAGRAM`, falling back to a human-review draft for everything else (including LinkedIn, which already has native reply support elsewhere in the codebase, and any Zernio-routed account). Fixed in Task 7.

**Explicitly out of scope for this phase (do not build):**
- `review.new`/`review.updated` webhook events — Phase 5's job (GBP reviews + Customer Voice UI).
- `post.platform.published`/`post.platform.failed` webhook events — related to Phase 3's publish flow, not comments. Phase 3 already handles the synchronous common case (throws on failure/pending); async pending-completion via these events is a real but separate piece of work, deliberately deferred (same pattern as Phase 3's deferred worker-retry-semantics follow-up).
- Webhook *subscription registration* (calling Zernio's API to tell it where to send events) — still deferred from Phase 2, since it needs this endpoint to exist first. This phase builds the *receiving* endpoint; wiring up the subscription (one-time, via `zernioClient` or the Zernio dashboard) is a manual follow-up step, noted in the Definition of Done.
- Populating `Comment.postId` (the link to LYRA's own `Post` model) from webhook data. Zernio's `comment.postId` is Zernio's *own* internal post id — a different id space from LYRA's `Post.id` — so there's no clean way to resolve it back to a `Post` row from this field alone, and the existing native comment-monitor worker already leaves `Comment.postId` null too. Not a regression, just not attempted.
- Any UI changes. The existing Response Inbox already reads from `Comment`; this phase only changes how rows get into that table and how replies get sent.

**Tech Stack:** TypeScript, Next.js 16, Prisma 6, vitest, BullMQ, Node's built-in `crypto` (HMAC + timing-safe compare, same as the existing cron routes).

**Conventions to follow (existing codebase):**
- Path alias `@/` → `LYRA/lyra/` root.
- Webhook signature pattern mirrors `checkCronAuth` in e.g. `app/api/cron/sync-comments/route.ts`: length-check then `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` (throws on mismatched lengths otherwise).
- New/modified files under `LYRA/lyra/` require `git add -f` when committing from the OneDrive repo root (root `.gitignore` has `/LYRA`). Commit from `C:\Users\Rich\OneDrive - Into The Wild Marketing`.
- Use an isolated git worktree per `superpowers:using-git-worktrees`, same as Phases 1-3.
- This codebase's established convention (all three prior phases): pure logic gets TDD; Next.js route handlers and BullMQ workers that make live HTTP/DB calls do not get unit tests, and are instead verified via `tsc --noEmit`, `npm run build`, code review, and a manual E2E step.

---

## File Structure

**New files:**
- `prisma/migrations-sql/2026-07-09-zernio-phase4-comment-platform-post-id.sql` — additive schema change (kept in-repo, applied by hand in Supabase per project convention).
- `services/social/webhook-verify.ts` — pure HMAC signature verification function.
- `services/social/webhook-verify.test.ts` — unit tests (TDD target).
- `app/api/zernio/webhook/route.ts` — the webhook receiver.

**Modified files:**
- `prisma/schema.prisma` — add `Comment.platformPostId String?`.
- `services/social/provider/mappers.ts` — fix `RawZernioComment`/`toNormalizedComment` to read `platformPostId`, not `postId`.
- `services/social/provider/mappers.test.ts` — update the fixture/assertions for the corrected field.
- `services/social/provider/native.ts` — wire `replyToComment`.
- `app/api/comments/[id]/reply/route.ts` — route through `getProvider(account).replyToComment(...)`.
- `workers/ai-responder.worker.ts` — route auto-reply through `getProvider(account).replyToComment(...)`.

**Not touched in Phase 4:** `services/social/provider/zernio.ts` (already correctly implements `replyToComment`, from Phase 1 — no changes needed), `workers/comment-monitor.worker.ts` (native comment polling stays as-is; this phase adds a second, push-based ingestion path for Zernio accounts, it doesn't touch the existing pull-based one), `Review` model / GBP review webhooks (Phase 5), `/api/zernio/connect/callback` (Phase 2, done).

---

## Task 1: Schema — `Comment.platformPostId`

No unit test (schema/DB task). Applied by hand in Supabase per project convention.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations-sql/2026-07-09-zernio-phase4-comment-platform-post-id.sql`

- [ ] **Step 1: Add the field in `schema.prisma`**

In `model Comment`, add this field (anywhere sensible near `platformCommentId`, e.g. directly after it):
```prisma
  platformPostId    String?
```
So the top of the model reads (only the new line is added; don't reorder existing fields):
```prisma
model Comment {
  id                String        @id @default(cuid())
  workspaceId       String
  socialAccountId   String
  socialAccount     SocialAccount @relation(fields: [socialAccountId], references: [id])
  postId            String?
  post              Post?         @relation(fields: [postId], references: [id])
  platformCommentId String
  platformPostId    String?
  authorName        String
  ...
```

- [ ] **Step 2: Write the Supabase SQL file**

Create `prisma/migrations-sql/2026-07-09-zernio-phase4-comment-platform-post-id.sql`:
```sql
-- Zernio bridge Phase 4 — add Comment.platformPostId, needed so Zernio-routed
-- replyToComment (scoped to a post, not just a comment) has a post id to target.
-- Additive, idempotent.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "platformPostId" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run (from `LYRA/lyra`): `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Commit**

```bash
git add -f LYRA/lyra/prisma/schema.prisma LYRA/lyra/prisma/migrations-sql/2026-07-09-zernio-phase4-comment-platform-post-id.sql
git commit -m "feat(db): add Comment.platformPostId for Zernio-routed comment replies"
```

**Note for the controller (not the implementer):** this SQL gets applied to the live Supabase project by hand, same as every prior phase's schema change — with explicit user sign-off before running.

---

## Task 2: Fix the mapper's post-id field (TDD)

**Files:**
- Modify: `services/social/provider/mappers.ts`
- Modify: `services/social/provider/mappers.test.ts`

- [ ] **Step 1: Update the failing tests**

In `services/social/provider/mappers.test.ts`, find the `toNormalizedComment` describe block. Replace both `it` blocks' fixtures to use `platformPostId` instead of `postId` (this is a corrected fixture, not a new test — the assertions on `postExternalId` stay the same, only the raw input's field name changes):
```ts
describe('toNormalizedComment', () => {
  it('maps a Zernio inbox comment to the normalized shape', () => {
    const raw = {
      id: 'c_123',
      platformPostId: 'p_456',
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
    const raw = { id: 'c_1', platformPostId: 'p_1', text: 'hi', createdAt: '2026-07-08T10:00:00.000Z' }
    const out = toNormalizedComment(raw)
    expect(out.authorHandle).toBeUndefined()
    expect(out.authorName).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `LYRA/lyra`): `npm test -- mappers`
Expected: FAIL — `toNormalizedComment` reads `raw.postId` (now `undefined` since the fixture no longer has that key), so `postExternalId` comes out `undefined` instead of the expected `'p_456'`/`'p_1'`.

- [ ] **Step 3: Fix the mapper**

In `services/social/provider/mappers.ts`, update `RawZernioComment` and `toNormalizedComment`:
```ts
interface RawZernioComment {
  id: string
  platformPostId: string
  author?: { name?: string; username?: string }
  text?: string
  createdAt: string
}
```
```ts
export function toNormalizedComment(raw: RawZernioComment): NormalizedComment {
  return {
    externalId: raw.id,
    postExternalId: raw.platformPostId,
    authorName: raw.author?.name ?? '',
    authorHandle: raw.author?.username,
    text: raw.text ?? '',
    createdAt: new Date(raw.createdAt),
  }
}
```
(Only the `postId` → `platformPostId` rename, in both the interface and the function body. `toNormalizedReview` and everything else in this file is untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- mappers`
Expected: PASS — 4 passed (same count as before, these are corrected fixtures, not new tests).

- [ ] **Step 5: Check for other callers of the old field name**

Run: `grep -rn "raw.postId\|RawZernioComment" LYRA/lyra/services` (from the worktree root) — confirm no other file references the old `postId` field name on a raw Zernio comment object. `services/social/provider/zernio.ts`'s `fetchRecentComments` casts raw comment objects to `Parameters<typeof toNormalizedComment>[0]` and doesn't reference `.postId` directly, so it should need no change — but verify this yourself by reading that method.

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `provider/mappers.ts`.

```bash
git add -f LYRA/lyra/services/social/provider/mappers.ts LYRA/lyra/services/social/provider/mappers.test.ts
git commit -m "fix(provider): correct comment mapper to read platformPostId, not postId"
```

---

## Task 3: Webhook signature verification (TDD)

**Files:**
- Create: `services/social/webhook-verify.ts`
- Create: `services/social/webhook-verify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `services/social/webhook-verify.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyZernioSignature } from './webhook-verify'

const SECRET = 'test-webhook-secret'

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyZernioSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a body signed with the wrong secret', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, sign(body, 'wrong-secret'), SECRET)).toBe(false)
  })

  it('rejects a tampered body (signature no longer matches)', () => {
    const originalBody = JSON.stringify({ event: 'comment.received' })
    const signature = sign(originalBody)
    const tamperedBody = JSON.stringify({ event: 'comment.received', extra: 'injected' })
    expect(verifyZernioSignature(tamperedBody, signature, SECRET)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, null, SECRET)).toBe(false)
  })

  it('rejects a malformed (non-hex, wrong-length) signature without throwing', () => {
    const body = JSON.stringify({ event: 'comment.received' })
    expect(verifyZernioSignature(body, 'not-a-real-signature', SECRET)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- webhook-verify`
Expected: FAIL — "Cannot find module './webhook-verify'" (module not implemented).

- [ ] **Step 3: Write the verification function**

Create `services/social/webhook-verify.ts`:
```ts
import { createHmac, timingSafeEqual } from 'crypto'

// Zernio signs webhook deliveries with the lowercase hex HMAC-SHA256 of the raw
// request body, keyed by the configured webhook secret, sent in the
// X-Zernio-Signature header (X-Late-Signature is a legacy alias for the same
// value). timingSafeEqual requires equal-length buffers -- a malformed or
// wrong-length signature must be rejected before reaching it, not thrown from it.
export function verifyZernioSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

  const actualBuf = Buffer.from(signatureHeader)
  const expectedBuf = Buffer.from(expected)
  if (actualBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(actualBuf, expectedBuf)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- webhook-verify`
Expected: PASS — 5 passed.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `webhook-verify.ts`.

```bash
git add -f LYRA/lyra/services/social/webhook-verify.ts LYRA/lyra/services/social/webhook-verify.test.ts
git commit -m "feat(webhook): add TDD Zernio HMAC signature verification"
```

---

## Task 4: The webhook route

**Files:**
- Create: `app/api/zernio/webhook/route.ts`

No unit test — a Next.js route handler doing live DB writes and queue enqueues, per this codebase's established convention (see "Conventions to follow" above). Correctness is verified via `tsc --noEmit`, `npm run build`, code review, and the manual E2E step in the phase's Definition of Done.

**What Zernio sends (confirmed live against docs.zernio.com, 2026-07-09):**

`comment.received`:
```json
{
  "id": "evt_...",
  "event": "comment.received",
  "comment": {
    "id": "c_123",
    "postId": "internal_or_null",
    "platformPostId": "p_456",
    "platform": "facebook",
    "text": "...",
    "author": { "id": "...", "username": "...", "name": "...", "picture": "..." },
    "accountId": "acc_..."
  }
}
```
The exact placement of the account identifier was **not fully confirmed** by docs search during planning (the docs snippet truncated before showing every `comment` field). Handle this defensively: check `comment.accountId` first; if that field is ever absent in a real delivery, this will need adjusting — flag it with a `TODO(phase-4-live-verify)` comment, matching how Phase 2's connect callback handled a similar unconfirmed-field-name situation (dual-field defensive match).

`account.disconnected` (confirmed, from Phase 1 research):
```json
{
  "id": "evt_...",
  "event": "account.disconnected",
  "account": {
    "accountId": "acc_...",
    "profileId": "prof_...",
    "platform": "facebook",
    "username": "...",
    "displayName": "...",
    "disconnectionType": "intentional",
    "reason": "..."
  },
  "timestamp": "..."
}
```

- [ ] **Step 1: Write the route**

Create `app/api/zernio/webhook/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { verifyZernioSignature } from '@/services/social/webhook-verify'
import { toNormalizedComment } from '@/services/social/provider/mappers'

export const dynamic = 'force-dynamic'

const aiRespondQueue = new Queue('ai-responding', { connection: redis })

interface ZernioWebhookEvent {
  id: string
  event: string
  comment?: {
    id: string
    platformPostId: string
    accountId?: string
    author?: { name?: string; username?: string }
    text?: string
    createdAt?: string
  }
  account?: {
    accountId: string
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('X-Zernio-Signature') ?? req.headers.get('X-Late-Signature')
  const secret = process.env.ZERNIO_WEBHOOK_SECRET

  if (!secret) {
    console.error('ZERNIO_WEBHOOK_SECRET is not set — rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!verifyZernioSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: ZernioWebhookEvent
  try {
    payload = JSON.parse(rawBody) as ZernioWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    switch (payload.event) {
      case 'comment.received': {
        if (!payload.comment) break
        // TODO(phase-4-live-verify): comment.accountId's exact placement in the
        // real payload wasn't confirmed against a live delivery during planning
        // (docs snippet truncated). Adjust here if a real webhook shows it
        // living elsewhere (e.g. a top-level `account.accountId` block instead).
        const zernioAccountId = payload.comment.accountId
        if (!zernioAccountId) {
          console.error(`comment.received event ${payload.id} has no accountId — cannot route`)
          break
        }

        const account = await prisma.socialAccount.findFirst({
          where: { zernioAccountId },
          include: { workspace: true },
        })
        if (!account) {
          console.error(`comment.received event ${payload.id}: no SocialAccount for zernioAccountId ${zernioAccountId}`)
          break
        }

        const normalized = toNormalizedComment({
          id: payload.comment.id,
          platformPostId: payload.comment.platformPostId,
          author: payload.comment.author,
          text: payload.comment.text,
          createdAt: payload.comment.createdAt ?? new Date().toISOString(),
        })

        // Idempotent by construction: @@unique([socialAccountId, platformCommentId])
        // means a retried delivery for the same comment updates the same row rather
        // than creating a duplicate, and the BullMQ jobId below is deterministic
        // per comment id, so a duplicate enqueue is a no-op at the queue level too.
        const comment = await prisma.comment.upsert({
          where: {
            socialAccountId_platformCommentId: {
              socialAccountId: account.id,
              platformCommentId: normalized.externalId,
            },
          },
          create: {
            workspaceId: account.workspaceId,
            socialAccountId: account.id,
            platformCommentId: normalized.externalId,
            platformPostId: normalized.postExternalId,
            authorName: normalized.authorName || 'Unknown',
            authorHandle: normalized.authorHandle,
            content: normalized.text,
            platformCreatedAt: normalized.createdAt,
            status: 'PENDING',
          },
          update: {
            content: normalized.text,
          },
        })

        const mode = account.workspace.aiResponseMode
        if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
          await aiRespondQueue.add(
            'generate-response',
            { commentId: comment.id, autoPost: mode === 'FULL' },
            { jobId: `respond-${comment.id}` }
          )
        }
        break
      }

      case 'account.disconnected': {
        if (!payload.account?.accountId) break
        await prisma.socialAccount.updateMany({
          where: { zernioAccountId: payload.account.accountId },
          data: { isActive: false },
        })
        break
      }

      default:
        // Unhandled event type — ack it anyway so Zernio doesn't retry forever.
        break
    }
  } catch (error) {
    // Log but still return 200 -- Zernio's retry policy would otherwise keep
    // re-delivering an event that fails for a reason a retry can't fix (e.g. a
    // permanently missing SocialAccount), and idempotent upserts make a retry
    // safe if the cause WAS transient (e.g. a DB blip).
    console.error(`Zernio webhook processing error (event ${payload.id}, type ${payload.event}):`, error)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing this file.

- [ ] **Step 3: Full test suite + build**

Run: `npm test`
Expected: all pass (same count as end of Task 3 — this task adds no tests, it's a route).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add -f "LYRA/lyra/app/api/zernio/webhook/route.ts"
git commit -m "feat(webhook): add Zernio webhook receiver for comment.received and account.disconnected"
```

---

## Task 5: Wire native comment reply

**Files:**
- Modify: `services/social/provider/native.ts`

No new unit tests — same live-API-call convention as Task 4 and as Phase 3's `native.ts` publish wiring.

- [ ] **Step 1: Read the three existing native reply functions first**

Confirm these signatures are unchanged from planning (2026-07-09):
- `services/social/facebook.ts`: `replyToComment(platformCommentId: string, message: string, accessToken: string): Promise<void>`
- `services/social/instagram.ts`: `replyToComment(platformCommentId: string, text: string, accessToken: string): Promise<void>`
- `services/social/linkedin.ts`: `postCommentReply(accessToken: string, commentUrn: string, orgId: string, text: string): Promise<void>`

If any signature differs, adapt the call in Step 2 accordingly and note it in your report.

- [ ] **Step 2: Update `services/social/provider/native.ts`**

Add these three imports at the top (alongside the existing `publishPost as publishFacebookPost` import):
```ts
import { replyToComment as replyToFacebookComment } from '../facebook'
import { replyToComment as replyToInstagramComment } from '../instagram'
import { postCommentReply as replyToLinkedinComment } from '../linkedin'
```

Replace the `replyToComment` stub method (currently `async replyToComment(account) { throw new ProviderUnsupported('replyToComment', account.platform) }`) with:
```ts
  async replyToComment(account, _postExternalId, externalId, text) {
    const accessToken = requireAccessToken(account)
    switch (account.platform) {
      case 'FACEBOOK':
        return replyToFacebookComment(externalId, text, accessToken)
      case 'INSTAGRAM':
        return replyToInstagramComment(externalId, text, accessToken)
      case 'LINKEDIN':
        return replyToLinkedinComment(accessToken, externalId, account.platformId, text)
      default:
        throw new ProviderUnsupported('replyToComment', account.platform)
    }
  },
```
Note the `_postExternalId` parameter is intentionally unused (prefixed `_`) — native reply APIs only need the comment id, unlike Zernio's which is scoped to a post. Leave `publish`, `fetchRecentComments`, `fetchReviews`, `replyToReview` exactly as they are — this task only touches `replyToComment`.

- [ ] **Step 3: Type-check + full test suite**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `provider/native.ts`.

Run: `npm test`
Expected: all pass, same count as before this task.

- [ ] **Step 4: Commit**

```bash
git add -f LYRA/lyra/services/social/provider/native.ts
git commit -m "feat(provider): wire native replyToComment (FB/IG/LinkedIn)"
```

---

## Task 6: Rewire the manual comment reply route

**Files:**
- Modify: `app/api/comments/[id]/reply/route.ts`

**Before you start:** read the current file — it should hardcode FACEBOOK/INSTAGRAM/LINKEDIN-only replies with direct imports from `facebook.ts`/`instagram.ts`/`linkedin.ts`, an explicit `accessToken` null-check, and a `decrypt` import. If materially different, STOP and report NEEDS_CONTEXT.

- [ ] **Step 1: Replace the full contents**

```ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProvider, ProviderUnsupported } from '@/services/social/provider'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: commentId } = await params
    const { response } = await req.json() as { response: string }

    if (!response?.trim()) {
      return NextResponse.json({ error: 'Response text required' }, { status: 400 })
    }

    const comment = await prisma.comment.findUnique({
      where:   { id: commentId },
      include: { socialAccount: true },
    })
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId: comment.workspaceId, userId: user.id },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (comment.status === 'RESPONDED') {
      return NextResponse.json({ error: 'Already responded.' }, { status: 400 })
    }

    const resolvesToZernio =
      comment.socialAccount.provider === 'ZERNIO' && comment.socialAccount.zernioAccountId != null
    if (!resolvesToZernio && !comment.socialAccount.accessToken) {
      return NextResponse.json({ error: 'This account has no access token.' }, { status: 400 })
    }

    await getProvider(comment.socialAccount).replyToComment(
      comment.socialAccount,
      comment.platformPostId ?? '',
      comment.platformCommentId,
      response.trim()
    )

    await prisma.comment.update({
      where: { id: commentId },
      data:  {
        status:        'RESPONDED',
        finalResponse: response.trim(),
        respondedAt:   new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ProviderUnsupported) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/comments/[id]/reply error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send reply'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

Note what's gone: the `decrypt`/`facebookReply`/`instagramReply`/`linkedinReply` imports (that logic now lives in `provider/native.ts`, Task 5), and the `supportedPlatforms` allowlist (this route now supports whatever `getProvider().replyToComment()` supports — FB/IG/LinkedIn natively, plus any Zernio-routed platform). The `accessToken`/`ProviderUnsupported` error-mapping mirrors the pattern already established in Phase 3's publish route (`app/api/posts/[id]/publish/route.ts`) — read that file for reference if anything here is unclear, it follows the identical shape.

For a Zernio-routed comment, `comment.platformPostId` should always be set (populated at webhook-ingestion time in Task 4) — but guard with `?? ''` anyway since a comment created before this phase shipped (or via any future ingestion path that doesn't set it) would have `null` here, and passing an empty string is safer than passing `null` into a function typed to expect `string`.

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
git add -f "LYRA/lyra/app/api/comments/[id]/reply/route.ts"
git commit -m "feat(comments): route manual reply through getProvider(account).replyToComment"
```

---

## Task 7: Rewire the AI auto-reply worker

**Files:**
- Modify: `workers/ai-responder.worker.ts`

**Before you start:** read the current file — its auto-post branch should directly import and call `services/social/facebook.ts`'s `replyToComment`, gated on `account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM'`. If materially different, STOP and report NEEDS_CONTEXT.

- [ ] **Step 1: Replace the full contents**

```ts
import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { getProvider } from '@/services/social/provider'

const worker = new Worker(
  'ai-responding',
  async (job) => {
    const { commentId, autoPost } = job.data as { commentId: string; autoPost: boolean }

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.status === 'ESCALATED' || comment.status === 'RESPONDED') return

    const [brandProfile, guardrails] = await Promise.all([
      prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
      prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
    ])

    const result = await generateCommentResponse(comment, brandProfile, guardrails)

    if (result.shouldEscalate) {
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          status:           'ESCALATED',
          isEscalated:      true,
          escalationReason: result.escalationReason,
        },
      })
      return
    }

    if (autoPost && result.response) {
      try {
        const account = await prisma.socialAccount.findUnique({
          where: { id: comment.socialAccountId },
        })
        if (account) {
          await getProvider(account).replyToComment(
            account,
            comment.platformPostId ?? '',
            comment.platformCommentId,
            result.response
          )
          await prisma.comment.update({
            where: { id: commentId },
            data:  {
              status:        'RESPONDED',
              finalResponse: result.response,
              respondedAt:   new Date(),
            },
          })
        } else {
          await prisma.comment.update({
            where: { id: commentId },
            data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
          })
        }
      } catch (err) {
        console.error(`Auto-reply failed for comment ${commentId}:`, err)
        // Fall back to draft so it appears in Pending tab for manual approval
        await prisma.comment.update({
          where: { id: commentId },
          data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
        })
      }
    } else {
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'AI_DRAFTED', aiDraftResponse: result.response },
      })
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`AI responder failed for comment ${job?.data.commentId}:`, err)
})

export default worker
```

Note what changed vs. the original: the `account && (account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM') && account.accessToken` gate is replaced with a plain `if (account)` — `getProvider(account).replyToComment(...)` now handles platform support internally (throwing `ProviderUnsupported` for anything neither `nativeProvider` (Task 5: FB/IG/LinkedIn) nor `zernioProvider` supports, which the outer `catch` already handles by falling back to a draft — this is the CORRECT behavior preservation: an unsupported platform still degrades to "draft for human review" exactly as before, just via a thrown error instead of an `if` check). The `decrypt`/`replyToComment` imports are removed since that logic now lives behind the provider seam.

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
git add -f LYRA/lyra/workers/ai-responder.worker.ts
git commit -m "feat(comments): route AI auto-reply through getProvider(account).replyToComment"
```

---

## Phase 4 Done — Definition of Done

- `npm test` passes (19 tests: Phase 1-3's 14 + this phase's 4 mapper (corrected, not net-new) + 5 webhook-verify — note the mapper count doesn't change since Task 2 corrects existing fixtures rather than adding tests, so the net new count from this phase is the 5 webhook-verify tests: 14 + 5 = 19).
- `npx tsc --noEmit` shows no NEW errors from Phase 4 files.
- `npm run build` succeeds.
- **Schema change applied to the live Supabase project** (Task 1's SQL) — with explicit user sign-off, same as every prior phase.
- **`ZERNIO_WEBHOOK_SECRET` added to Netlify** (server-side env var, same category as `ZERNIO_API_KEY` from Phase 1) — manual step, not part of any task's automated checks.
- **Webhook subscription registered with Zernio** pointing at `https://lyraonline.ai/api/zernio/webhook` (via the Zernio dashboard, or a follow-up API call — whichever is faster; this phase builds the receiver, not the subscription-registration call) — manual step.
- **Manual E2E verification (Richard, ITWM's own test workspace only):** with a real Zernio-connected account (requires the Phase 2 connect-flow E2E test to have happened first, which is still outstanding as of this plan), trigger a real comment on a tracked post and confirm: the webhook fires, signature verifies, a `Comment` row appears with `platformPostId` set, and (depending on `aiResponseMode`) either a draft appears or an auto-reply is actually posted back to the platform via Zernio.
- Confirm the `TODO(phase-4-live-verify)` comment in `app/api/zernio/webhook/route.ts` gets resolved (or at least revisited) once a real `comment.received` delivery is observed and the `accountId` field's actual location is confirmed.

## Next phases (separate plans, written when reached)
- **Phase 5 — GBP reviews + Customer Voice UI:** `review.new`/`review.updated` webhook events → `Review` upsert → optional AI draft, plus a minimal review tab in the dashboard. `nativeProvider.fetchReviews`/`replyToReview` stay throwing stubs permanently (GBP native path was rejected per the design spec — Zernio is the intended permanent home for reviews, not a bridge-only measure like the rest of this project).
