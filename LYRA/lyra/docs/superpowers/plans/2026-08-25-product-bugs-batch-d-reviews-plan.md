# Product Bugs — Batch D: Google Business Review Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Real dependency on Batch C, correcting the design doc's "independent" framing:** Task 4 below (review response generation) reuses Batch C's `{ sentiment, response }` JSON-output shape and extracted fencing logic. **Execute Batch C before this plan's Task 4.** Tasks 1-3 (schema, ingestion) have no dependency on Batch C or Batch B and can run first/in parallel.
>
> **Also depends on Batch B's migration having run** for Task 1's `Review.status` field, which reuses `CommentStatus` (now without `AWAITING_APPROVAL`, per Batch B Task 2). If Batch B hasn't been applied to the target database yet when this plan executes, Task 1's migration can still be written and committed, but do not attempt to apply it before Batch B's migration is applied first (same "manual, reviewed step" caveat as Batch B's migration note).
>
> **Historical note:** a `Review` Prisma model existed once and was deliberately dropped 11 days before this plan was written (migration `20260814141558_drop_review_model`, commit `467c5a4`) as confirmed dead code — its `fetchReviews`/`replyToReview` provider methods had zero callers and "the planned Phase 5 review-sync work that would have used it was never built." This plan is that Phase 5 work, finally being built. The old model's schema (reproduced in Task 1) is used as a direct reference.

**Goal:** Fix Bug 3 — ingest Google Business reviews to full read+reply parity with other platforms, finishing the already-half-built provider layer (`services/social/provider/zernio.ts`'s `fetchReviews`/`replyToReview`, already implemented and already unused).

**Architecture:** A new `Review` Prisma model, parallel to `Comment` (not merged). Ingestion extends the existing comment-monitor cron worker and manual-sync service. AI response generation extracts Batch C's shared fencing logic into a form both comments and reviews can use. The Inbox UI merges reviews into the same list as comments via a type discriminant, with a parallel `ReviewCard` component mirroring `CommentCard`'s proven race-condition-safe patterns rather than modifying that already-hardened, heavily-tested component directly.

**Tech Stack:** Prisma/Postgres, BullMQ workers, Next.js Route Handlers, React, Anthropic Claude API, Vitest.

---

## Task 1: `Review` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new migration under `prisma/migrations/`
- Create: `scripts/check-review-model-safety.ts` (pre-migration sanity check, if applicable — see Step 1)

### Reference: the old, deliberately-dropped `Review` model (from `git show 467c5a4`)

```prisma
model Review {
  id              String        @id @default(cuid())
  workspaceId     String
  workspace       Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  socialAccountId String
  socialAccount   SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  zernioReviewId  String
  rating          Int?
  text            String?
  authorName      String?
  status          String        @default("NEW") // NEW | REPLIED | SKIPPED
  replyText       String?
  createdAt       DateTime      @default(now())
  reviewedAt      DateTime?

  @@unique([socialAccountId, zernioReviewId])
  @@index([workspaceId, status])
}
```

Per the design doc's decision, this plan reuses `CommentStatus` (the real enum, post-Batch-B) instead of the old free-string status, and matches `Comment`'s own field naming (`finalResponse`/`respondedAt`/`aiDraftResponse`) instead of the old `replyText`/`reviewedAt`, for consistency with the parallel model it's designed to mirror.

- [ ] **Step 1: Read the current `Comment` model fresh**

Run: `sed -n '333,381p' prisma/schema.prisma` (or read the file directly) to confirm the CURRENT exact state of `Comment` and `CommentStatus` at implementation time — this plan was written assuming Batch B's migration (removing `AWAITING_APPROVAL`) has already been applied to `schema.prisma`. If it hasn't been applied yet, either apply Batch B first, or note the discrepancy and adjust `Review.status`'s type accordingly before proceeding.

- [ ] **Step 2: Add the `Review` model**

Add to `prisma/schema.prisma` (placed near `Comment`, following the file's existing organization):

```prisma
model Review {
  id                String        @id @default(cuid())
  workspaceId       String
  workspace         Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  socialAccountId   String
  socialAccount     SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  zernioReviewId    String
  rating            Int?
  authorName        String?
  text              String?
  sentiment         Sentiment?
  status            CommentStatus @default(PENDING)
  aiDraftResponse   String?
  finalResponse     String?
  respondedAt       DateTime?
  platformCreatedAt DateTime
  createdAt         DateTime      @default(now())

  @@unique([socialAccountId, zernioReviewId])
  @@index([workspaceId, createdAt])
  @@index([workspaceId, status])
}
```

Add the back-relation fields to `Workspace` and `SocialAccount`, matching how `Comment` is already related to both (find `comments Comment[]` on `SocialAccount` and the equivalent on `Workspace`, add `reviews Review[]` alongside each).

**Note:** `Review` deliberately does NOT reuse `CommentStatus`'s full lifecycle meaning literally — a review is never "IGNORED" or "APPROVED" the same way a comment is, but reusing the enum (rather than inventing a parallel `ReviewStatus`) avoids a second near-duplicate enum for what is, in practice, the same PENDING → AI_DRAFTED/ESCALATED → RESPONDED shape. If implementation reveals real semantic mismatches (e.g. a status value that makes no sense for a review), stop and flag this rather than silently forcing a fit — a separate `ReviewStatus` enum can be introduced instead if `CommentStatus` genuinely doesn't work.

- [ ] **Step 3: Generate the migration SQL (DB-free)**

Following the same DB-free approach as Batch B Task 2:

```bash
cp prisma/schema.prisma /tmp/schema-before-review-model.prisma
# (make the schema edit from Step 2 first if not already done)
mkdir -p prisma/migrations/20260825010000_add_review_model
npx prisma migrate diff \
  --from-schema-datamodel=/tmp/schema-before-review-model.prisma \
  --to-schema-datamodel=prisma/schema.prisma \
  --script > prisma/migrations/20260825010000_add_review_model/migration.sql
```

(Adjust the timestamp to actual current date/time. Read the generated SQL — it should be a straightforward `CREATE TABLE "Review"` plus its 2 foreign keys and the unique/index constraints, nothing destructive.)

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds, no errors. `prisma.review` is now a valid client accessor.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Review model, parallel to Comment, for Google Business review ingestion"
```

(Not applied to the real database by this plan's executor — manual, reviewed step for Richard, same as Batch B's migration.)

---

## Task 2: Extend ingestion to fetch and persist Google Business reviews

**Files:**
- Modify: `workers/comment-monitor.worker.ts`
- Modify: `workers/comment-monitor.worker.test.ts` (check if it exists first)
- Modify: `services/comments/sync.ts`
- Modify: `services/comments/sync.test.ts` (check if it exists first)

### Current behavior (confirmed by reading both files in full)

`workers/comment-monitor.worker.ts`'s cron-driven job (queued per-account by `app/api/cron/sync-comments/route.ts`, which already queues jobs for ALL active accounts including `GOOGLE_BUSINESS` — no platform filter there) has this Zernio branch:

```ts
    if (account.provider === 'ZERNIO' && account.zernioAccountId != null) {
      try {
        const normalized = await getProvider(account).fetchRecentComments(account)
        const selfName   = account.name?.toLowerCase()
        const selfHandle = account.handle?.toLowerCase()
        const incoming   = normalized.filter((c) => {
          if (selfName   && c.authorName?.toLowerCase()   === selfName)   return false
          if (selfHandle && c.authorHandle?.toLowerCase() === selfHandle) return false
          return true
        })
        normalizedRows = incoming.map((c) => ({
          platformCommentId: c.externalId,
          platformPostId:    c.postExternalId,
          authorName:        c.authorName || 'Unknown',
          content:           c.text,
          platformCreatedAt: c.createdAt,
        }))
      } catch (err) {
        if (err instanceof ZernioApiError && (err.body as { code?: string } | undefined)?.code === 'PLATFORM_NOT_SUPPORTED') {
          return
        }
        console.error(`Comment monitor: Zernio fetch failed for account ${socialAccountId}:`, err)
        return
      }
    } else {
      // ... native-path branch, comments only, unrelated to reviews
    }

    const createdComments = normalizedRows.length === 0 ? [] : await prisma.comment.createManyAndReturn({ ... })
    const savedComments = createdComments.map((c) => ({ id: c.id, content: c.content }))

    const mode = account.workspace.aiResponseMode
    if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
      await enqueueAiResponses(createdComments, mode === 'FULL')
    }

    if (savedComments.length > 0) {
      await checkAndTriggerCrisis(account.workspaceId, savedComments)
    }
```

`services/comments/sync.ts`'s manual-sync path has a directly analogous `syncAccountComments` function, and `syncWorkspaceComments` currently queries:

```ts
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true, platform: { in: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'] } },
  })
```

— **`GOOGLE_BUSINESS` is currently excluded from the manual sync path entirely.**

- [ ] **Step 1: Write the failing test for `comment-monitor.worker.ts`**

Check whether `workers/comment-monitor.worker.test.ts` exists. If yes, read it in full and follow its exact mocking pattern (likely mocks `@/lib/prisma`, `@/services/social/provider`, `@/lib/redis`, `bullmq`, matching `workers/ai-responder.worker.test.ts`'s established DI-mock style). Add a test case: for a `GOOGLE_BUSINESS` account on the Zernio path, the worker calls `getProvider(account).fetchReviews(account)` and persists the results into `prisma.review.createManyAndReturn` (or equivalent) with the correct field mapping (`zernioReviewId: <externalId>`, `rating`, `authorName`, `text`, `platformCreatedAt`). If the test file doesn't exist, create one following this same DI-mock convention, covering at minimum: a `GOOGLE_BUSINESS` Zernio account triggers a `fetchReviews` call and persists new `Review` rows; a non-`GOOGLE_BUSINESS` Zernio account does NOT call `fetchReviews`; new reviews get enqueued for AI response generation the same way new comments do, gated on the same `aiResponseMode` check.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run workers/comment-monitor.worker.test.ts`
Expected: FAIL — the worker currently never calls `fetchReviews` for any account.

- [ ] **Step 3: Implement the ingestion branch**

Inside the existing `if (account.provider === 'ZERNIO' && account.zernioAccountId != null) { ... }` block in `workers/comment-monitor.worker.ts`, after the existing comment-fetching `try { ... } catch { ... }`, add a parallel review-fetching branch specifically for `GOOGLE_BUSINESS`:

```ts
    let normalizedReviews: Array<{ externalId: string; rating: number | null; text: string | null; authorName: string | null; createdAt: Date }> = []
    if (account.provider === 'ZERNIO' && account.zernioAccountId != null && account.platform === 'GOOGLE_BUSINESS') {
      try {
        normalizedReviews = await getProvider(account).fetchReviews(account)
      } catch (err) {
        if (err instanceof ZernioApiError && (err.body as { code?: string } | undefined)?.code === 'PLATFORM_NOT_SUPPORTED') {
          // fall through -- comments (if any) may still have been fetched above
        } else {
          console.error(`Comment monitor: Zernio review fetch failed for account ${socialAccountId}:`, err)
        }
      }
    }
```

(Placed as an independent `try`/`catch` from the comment-fetching one above it, so a review-fetch failure doesn't prevent comments from still being persisted for the same account, and vice versa — matching this worker's existing per-concern error isolation.)

After the existing `const createdComments = ...` block, add the parallel review persistence:

```ts
    const createdReviews = normalizedReviews.length === 0 ? [] : await prisma.review.createManyAndReturn({
      data: normalizedReviews.map((r) => ({
        workspaceId:       account.workspaceId,
        socialAccountId:   account.id,
        zernioReviewId:    r.externalId,
        rating:            r.rating,
        authorName:        r.authorName,
        text:              r.text,
        platformCreatedAt: r.createdAt,
        status:            'PENDING' as const,
      })),
      skipDuplicates: true,
    })
```

Extend the AI-enqueue block to also cover reviews (the exact shape of this depends on Task 4's `generateReviewResponse` wiring — for THIS task, just enqueue via a review-specific queue job, e.g. `aiRespondQueue.add('generate-review-response', { reviewId: r.id, autoPost: mode === 'FULL' }, { jobId: \`respond-review-${r.id}\` })`, mirroring `enqueueAiResponses`'s existing shape but for reviews; if a shared `enqueueAiResponses`-equivalent function makes sense once Task 4's worker exists, that's Task 4's concern to wire up — this task's job is only to enqueue with a distinguishable job name/payload, not to process it):

```ts
    if (createdReviews.length > 0 && (mode === 'FULL' || mode === 'DRAFT_APPROVE')) {
      await Promise.allSettled(
        createdReviews.map((r) =>
          aiRespondQueue.add(
            'generate-review-response',
            { reviewId: r.id, autoPost: mode === 'FULL' },
            { jobId: `respond-review-${r.id}` }
          )
        )
      )
    }
```

(Import `aiRespondQueue` from `@/lib/queues` if not already imported in this file — check the existing imports first.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run workers/comment-monitor.worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `services/comments/sync.ts`**

Read `services/comments/sync.test.ts` if it exists (check first) and follow its patterns. Add a test: `syncWorkspaceComments` now includes `GOOGLE_BUSINESS` in its account query, and a new `syncAccountReviews` function (parallel to `syncAccountComments`) fetches and persists reviews for a Google Business Zernio account.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run services/comments/sync.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement the manual-sync-path changes**

In `services/comments/sync.ts`, update `syncWorkspaceComments`'s account query:

```ts
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true, platform: { in: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_BUSINESS'] } },
  })
```

Add a new exported function, `syncAccountReviews`, parallel to `syncAccountComments`:

```ts
/**
 * Syncs one connected Google Business account's reviews into the DB and
 * returns how many new rows were created. Only meaningful for
 * GOOGLE_BUSINESS accounts on the Zernio path -- reviews have no native
 * (non-Zernio) fetch path, unlike comments.
 */
export async function syncAccountReviews(account: SocialAccount, workspaceId: string): Promise<number> {
  if (account.platform !== 'GOOGLE_BUSINESS' || account.provider !== 'ZERNIO' || account.zernioAccountId == null) {
    return 0
  }

  let normalized: Awaited<ReturnType<ReturnType<typeof getProvider>['fetchReviews']>>
  try {
    normalized = await getProvider(account).fetchReviews(account)
  } catch (err) {
    console.error(`Zernio review sync failed for account ${account.id}:`, err)
    return 0
  }
  if (normalized.length === 0) return 0

  const created = await prisma.review.createManyAndReturn({
    data: normalized.map((r) => ({
      workspaceId,
      socialAccountId:   account.id,
      zernioReviewId:    r.externalId,
      rating:            r.rating,
      authorName:        r.authorName,
      text:              r.text,
      platformCreatedAt: r.createdAt,
      status:            'PENDING' as const,
    })),
    skipDuplicates: true,
  })
  return created.length
}
```

Update `syncWorkspaceComments` to also call `syncAccountReviews` per account and fold its count into the total:

```ts
export async function syncWorkspaceComments(workspaceId: string): Promise<number> {
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true, platform: { in: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_BUSINESS'] } },
  })

  let newCount = 0
  for (const account of accounts) {
    newCount += await syncAccountComments(account, workspaceId)
    newCount += await syncAccountReviews(account, workspaceId)
  }
  return newCount
}
```

(`syncAccountComments` itself needs no change — it already only handles comment-shaped platforms; for a `GOOGLE_BUSINESS` account it will fall through to whatever its existing Zernio branch does for comments, which per the ingestion pattern should be a no-op or empty result since Google Business reviews aren't comments — verify this doesn't error at implementation time; if `fetchRecentComments` throws for `GOOGLE_BUSINESS` accounts, catch it the same way the existing `PLATFORM_NOT_SUPPORTED` case is handled elsewhere in this codebase.)

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run services/comments/sync.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full test suite and `tsc`**

Run: `npx vitest run && npx tsc --noEmit`
Expected: no failures, no errors.

- [ ] **Step 10: Commit**

```bash
git add workers/comment-monitor.worker.ts services/comments/sync.ts workers/comment-monitor.worker.test.ts services/comments/sync.test.ts
git commit -m "feat: ingest Google Business reviews via the existing comment-sync cron and manual sync paths"
```

---

## Task 3: Merge reviews into `GET /api/comments`

**Files:**
- Modify: `app/api/comments/route.ts`
- Modify: `app/api/comments/route.test.ts` (check if it exists first)

### Current behavior (confirmed by reading the file in full)

```ts
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const comments = await prisma.comment.findMany({
      where:   { workspaceId },
      include: { socialAccount: { select: { platform: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take:    100,
    })

    return NextResponse.json(comments)
  } catch (error) { ... }
}
```

- [ ] **Step 1: Write the failing test**

Check whether `app/api/comments/route.test.ts` exists (read it if so, following its patterns). Add a test: the response includes both comments and reviews for the workspace, each tagged with a `type` discriminant (`'comment'` or `'review'`), sorted together by `createdAt` descending, capped at a combined 100 rows.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/comments/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the merge**

```ts
    const [comments, reviews] = await Promise.all([
      prisma.comment.findMany({
        where:   { workspaceId },
        include: { socialAccount: { select: { platform: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    100,
      }),
      prisma.review.findMany({
        where:   { workspaceId },
        include: { socialAccount: { select: { platform: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    100,
      }),
    ])

    const merged = [
      ...comments.map((c) => ({ ...c, type: 'comment' as const })),
      ...reviews.map((r) => ({ ...r, type: 'review' as const })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 100)

    return NextResponse.json(merged)
```

(Each query independently caps at 100 before the merge, then the combined+sorted result caps at 100 again — this means in a workspace with >100 comments AND >100 reviews, the merge could theoretically under-represent one type if the other dominates recent activity. Accept this for now, matching the existing `take: 100` cap's already-accepted limitation — not a new problem this task introduces, just inherited. Flag in a code comment rather than solving here, since a genuinely correct combined-pagination approach is a bigger change than this fix warrants.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/comments/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/comments/route.ts app/api/comments/route.test.ts
git commit -m "feat: merge reviews into GET /api/comments alongside comments"
```

---

## Task 4: Review response generation (depends on Batch C being done first)

**Files:**
- Modify: `services/ai/response-generator.ts`
- Modify: `services/ai/response-generator.test.ts`

**Prerequisite:** Batch C's Task 1 (the `{ sentiment, response }` JSON-output change to `generateCommentResponse`) must already be merged/applied before this task, since this task extracts and reuses that same prompt-fencing/guardrail-check logic rather than duplicating it.

- [ ] **Step 1: Read the current (post-Batch-C) `response-generator.ts` fresh**

Confirm the exact current shape of `generateCommentResponse` after Batch C's changes before extracting shared logic — this plan was written against Batch C's planned output, not a final implementation, so re-verify at execution time.

- [ ] **Step 2: Extract the shared fencing/guardrail-check logic**

Identify what's genuinely shared between a comment-response prompt and a review-response prompt: the `<brand_voice>` fencing of `brandProfile.voiceSummary`, the guardrail rule formatting (`neverDiscuss`/`neverUse`/`approvedAnswers`), the STRICT RULES block, the JSON-output instruction and parsing, and the post-generation `checkGuardrailViolation` re-check. What's NOT shared: the `<untrusted_comment>` vs. a review-specific fencing tag, and the review prompt needs to additionally include the star rating (a 1-star review needs different handling than a 5-star one — explicitly instruct Claude to weight tone accordingly, e.g. more apologetic/action-oriented for 1-2 stars, appreciative for 4-5 stars).

Extract a shared helper, e.g. `buildResponsePrompt(voiceSummary, toneAttributes, approvedAnswers, neverDiscuss, neverUse, contentSection)` where `contentSection` is the caller-supplied fenced block (comment content, or review content + rating) — exact extraction shape is an implementation decision at this point, not fully prescribed here; the goal is DRY without forcing an awkward abstraction. If a clean shared helper doesn't emerge naturally, two similar-but-independent functions with a shared code comment cross-referencing each other is an acceptable fallback — don't force a bad abstraction to satisfy DRY.

- [ ] **Step 3: Write the failing test for `generateReviewResponse`**

Add tests to `services/ai/response-generator.test.ts` (or a new `services/ai/review-response-generator.test.ts` if the extraction results in a new file — decide based on Step 2's outcome) mirroring the structure of Batch C's `generateCommentResponse` tests: a normal review gets a classified sentiment + response; a 1-star review's prompt includes rating context; the guardrail re-check still applies to review responses; escalation (`response: null`) works the same way.

```ts
describe('generateReviewResponse', () => {
  it('includes the star rating in the prompt so tone can be calibrated', async () => {
    mockClaudeJson({ sentiment: 'NEGATIVE', response: "We're sorry to hear this -- please reach out so we can make it right." })
    const brandProfile = { voiceSummary: 'Friendly', toneAttributes: ['friendly'] } as BrandProfile
    const review = { text: 'Terrible experience, would not recommend.', authorName: 'Guest', rating: 1 } as Review

    await generateReviewResponse(review, brandProfile, [])

    const call = vi.mocked(anthropic.messages.create).mock.calls[0][0]
    const prompt = (call.messages[0] as { content: string }).content
    expect(prompt).toContain('1')
  })

  it('returns a classified sentiment and response for a positive review', async () => {
    mockClaudeJson({ sentiment: 'POSITIVE', response: 'Thank you so much for the kind words!' })
    const brandProfile = { voiceSummary: 'Friendly', toneAttributes: ['friendly'] } as BrandProfile
    const review = { text: 'Amazing service!', authorName: 'Guest', rating: 5 } as Review

    const result = await generateReviewResponse(review, brandProfile, [])

    expect(result).toEqual({ sentiment: 'POSITIVE', response: 'Thank you so much for the kind words!', shouldEscalate: false })
  })
})
```

(Exact assertion on rating-in-prompt is a placeholder shape — adjust to whatever the real prompt text looks like once Step 2's extraction is implemented; the point of this test is confirming the rating reaches the prompt at all, not asserting exact wording.)

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run services/ai/response-generator.test.ts`
Expected: FAIL — `generateReviewResponse` doesn't exist yet.

- [ ] **Step 5: Implement `generateReviewResponse`**

Using the shared extraction from Step 2, implement `generateReviewResponse(review: Review, brandProfile: BrandProfile | null, guardrails: Guardrail[])` returning the same `{ sentiment: Sentiment | null; response: string | null; shouldEscalate: boolean; escalationReason?: string }` shape as `generateCommentResponse`, with a review-specific prompt section including the star rating and review text (fenced the same way comment content is fenced — untrusted, public, user-submitted).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run services/ai/response-generator.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/ai/response-generator.ts services/ai/response-generator.test.ts
git commit -m "feat: add generateReviewResponse, reusing generateCommentResponse's fencing/guardrail logic"
```

---

## Task 5: Review response worker + reply wiring

**Files:**
- Create: `workers/ai-review-responder.worker.ts` (or extend `workers/ai-responder.worker.ts` — decide at Step 1)
- Create: `workers/ai-review-responder.worker.test.ts`
- Create: `app/api/ai/respond-review/route.ts` (parallel to `app/api/ai/respond/route.ts`)
- Create: `app/api/ai/respond-review/route.test.ts`
- Create: `app/api/reviews/[id]/reply/route.ts` (parallel to `app/api/comments/[id]/reply/route.ts` — read that file first as a reference, it wasn't read during this plan's writing)
- Create: `app/api/reviews/[id]/reply/route.test.ts`

**Why a new worker file rather than extending `ai-responder.worker.ts` directly:** `ai-responder.worker.ts`'s `processAiResponseJob` has extensive, carefully-commented race-condition/rollback/atomic-claim logic (`rollbackCommentClaim`, the `notIn: ['RESPONDED', 'ESCALATED']` claim pattern) that is Comment-specific in its exact status semantics. Rather than threading a content-type branch through that already-intricate function (risking a subtle bug in a security/correctness-critical file), this task creates a parallel `processAiReviewResponseJob` that mirrors the same proven patterns for `Review` rows. Reassess this decision at implementation time once Task 4's `generateReviewResponse` exists — if the two functions turn out to be near-identical modulo the Prisma model they write to, consider whether a shared generic helper parameterized by model is cleaner; don't force it if it isn't.

- [ ] **Step 1: Read the reference files this task mirrors**

Read `workers/ai-responder.worker.ts` (already read in full for Batch C), `app/api/ai/respond/route.ts` (already read in full for Batch C), and `app/api/comments/[id]/reply/route.ts` (referenced but not yet read in this planning session — read it now) in full before writing any new code, since this task's job is to closely mirror their proven patterns for `Review`, not invent new ones.

- [ ] **Step 2: Write failing tests for `workers/ai-review-responder.worker.ts`**

Following `workers/ai-responder.worker.test.ts`'s exact DI-mock structure (mocked `prisma.review` instead of `prisma.comment`, mocked `generateReviewResponse` instead of `generateCommentResponse`, same `getProvider` mock), write tests covering the same scenarios that file covers for comments: draft-only path, auto-post path (calling `replyToReview` instead of `replyToComment`), escalation path, the atomic claim/rollback behavior on a losing race, and the account-not-found rollback case.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run workers/ai-review-responder.worker.test.ts`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 4: Implement `workers/ai-review-responder.worker.ts`**

Mirror `workers/ai-responder.worker.ts`'s `processAiResponseJob` structure exactly, substituting: `prisma.review` for `prisma.comment`, `generateReviewResponse` for `generateCommentResponse`, `getProvider(account).replyToReview(account, externalId, text)` for `getProvider(account).replyToComment(...)` (note `replyToReview`'s signature is `(account, externalId, text)` — 3 args, not 4, since reviews have no `platformPostId` concept the way comments do; adjust the call site accordingly, don't pass a 4th argument), and a `rollbackReviewClaim`-equivalent to `rollbackCommentClaim` (check `lib/comment-rollback.ts`'s exact implementation and either generalize it to accept a Prisma delegate parameter, or create a parallel `lib/review-rollback.ts` — prefer generalizing `comment-rollback.ts` if its logic is genuinely content-type-agnostic, since duplicating a rollback-safety function is exactly the kind of copy that tends to drift out of sync; read `lib/comment-rollback.ts` first to decide).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run workers/ai-review-responder.worker.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing tests and implement `app/api/ai/respond-review/route.ts`**

Mirror `app/api/ai/respond/route.ts` exactly, substituting `Review`/`generateReviewResponse` for `Comment`/`generateCommentResponse`. Same rate-limit pattern (`checkRateLimit`), same authorization scoping pattern (adjust the `workspaceAccess` join path for `Review`'s relations), same `alreadyResolvedResponse`-equivalent re-read-on-race-loss behavior.

- [ ] **Step 7: Write failing tests and implement `app/api/reviews/[id]/reply/route.ts`**

Mirror `app/api/comments/[id]/reply/route.ts` (read in Step 1) exactly, substituting `Review` for `Comment` and `replyToReview` for `replyToComment`.

- [ ] **Step 8: Run the full test suite and `tsc`**

Run: `npx vitest run && npx tsc --noEmit`
Expected: no failures, no errors.

- [ ] **Step 9: Commit**

```bash
git add workers/ai-review-responder.worker.ts workers/ai-review-responder.worker.test.ts app/api/ai/respond-review/ app/api/reviews/
git commit -m "feat: wire up review response generation, auto-post, and manual reply, mirroring the comment pipeline"
```

---

## Task 6: Inbox UI — `ReviewCard` and merged list rendering

**Files:**
- Create: `components/lyra/inbox/review-card.tsx` (parallel to `components/lyra/inbox/comment-card.tsx`)
- Modify: `components/lyra/inbox/response-inbox.tsx`

### Current `CommentCard` structure (confirmed by reading the file in full — 297 lines)

Key elements to mirror: the `CommentData` interface shape, the `SENTIMENT_COLOURS`/`SENTIMENT_LABELS` maps (can be imported/shared rather than duplicated — consider extracting to `components/lyra/inbox/sentiment.ts` if that's cleaner than copy-pasting 2 small `Record` constants, decide at implementation time), the `canReply`/`isEscalated`/`showAiControls` derived booleans, `handleGenerate`/`handleSend`/`handleEscalate`/`handleIgnore` (pointing at the new review endpoints from Task 5 instead of the comment endpoints), and the same card layout with author/content/actions.

**New addition for reviews specifically:** a star-rating badge, rendered alongside (or instead of) the platform badge in the header — e.g. `{'★'.repeat(review.rating ?? 0)}{'☆'.repeat(5 - (review.rating ?? 0))}` or an icon-based star row, styled consistently with the rest of the card. Exact visual treatment is a UI-design decision to make at implementation time, not prescribed here — keep it simple and consistent with the existing card's visual language (check `components/lyra/help/primitives.tsx` or similar shared UI primitives for any existing star-rating pattern elsewhere in the codebase before inventing a new one).

- [ ] **Step 1: Create `review-card.tsx`**

Copy `comment-card.tsx`'s structure as a starting point, then: rename `CommentData` to `ReviewData` (add `rating: number | null`, remove comment-only fields that don't apply — check field-by-field against the `Review` model from Task 1), point `handleGenerate` at `POST /api/ai/respond-review` (body: `{ reviewId: review.id }` instead of `{ commentId: comment.id }`), point `handleSend` at `POST /api/reviews/${review.id}/reply`, point `handleEscalate`/`handleIgnore` at the review-equivalent PATCH endpoint (check whether `app/api/comments/[id]/route.ts`'s PATCH handler needs a review-equivalent `app/api/reviews/[id]/route.ts` — if Task 5 didn't already create this, add it here, mirroring the comment version's escalate/ignore status-update logic), add the star-rating badge to the header.

- [ ] **Step 2: Update `response-inbox.tsx` to render a merged list**

The `CommentData` interface (lines 21-33) needs a `type: 'comment' | 'review'` field added, matching Task 3's API response shape. The `pending`/`escalated`/`responded` derivations (lines 133-135, already updated by Batch B Task 3 to drop `AWAITING_APPROVAL`) stay the same — status-based filtering works identically for both content types since `Review.status` reuses `CommentStatus`. In each `TabsContent`'s `.map()` block (currently always rendering `<CommentCard comment={c} ... />`), branch on `c.type`: render `<CommentCard comment={c} ... />` for `'comment'`, `<ReviewCard review={c} ... />` for `'review'`.

- [ ] **Step 3: Manual verification (component tests not established for this directory per prior investigation)**

Since `components/lyra/inbox/*` doesn't appear to have established component-test coverage (confirm this at implementation time — check for any `.test.tsx` in that directory first), verify by hand: open a workspace with a connected Google Business account and at least one ingested review, confirm it renders in the Pending tab with a star-rating badge, confirm Generate/Send/Escalate/Ignore all work end-to-end against the new review endpoints, confirm a mixed list of comments and reviews sorts correctly by recency and both card types render without visual breakage.

- [ ] **Step 4: Run `tsc` and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/lyra/inbox/review-card.tsx components/lyra/inbox/response-inbox.tsx
git commit -m "feat: render Google Business reviews in the Inbox, alongside comments"
```

---

## Task 7: Follow-up note (not part of this plan's execution — flag only)

Once this batch ships, `components/lyra/help/section-03-social-connections.tsx` and `components/lyra/help/section-07-inbox.tsx` (both corrected during the Help-docs fix pass to say Google Business reviews aren't ingested) need a follow-up doc correction. This is explicitly out of scope for this plan's execution — surface it to the user as a reminder once Task 6 is verified working, rather than doing it as part of this plan.

---

## Self-review notes (already applied above)

- **Spec coverage:** Tasks 1-6 cover every element the design doc's Batch D section named (new model, ingestion, AI generation, reply wiring, UI). Task 7 explicitly flags the one follow-up the design doc named as deliberately out of scope.
- **Type consistency:** `Review`'s fields (Task 1) are referenced identically across ingestion (Task 2), the API merge (Task 3), generation (Task 4), the worker/routes (Task 5), and the UI (Task 6) — `zernioReviewId`, `rating`, `authorName`, `text`, `sentiment`, `status`, `aiDraftResponse`, `finalResponse`, `respondedAt`, `platformCreatedAt` used consistently throughout.
- **Real dependency flagged prominently:** Task 4 depends on Batch C — called out at the top of this plan, correcting the design doc's looser "independent" framing now that code-level investigation surfaced the actual coupling (the shared `{sentiment, response}` JSON shape).
- **Where this plan intentionally under-specifies:** Task 5 and Task 6 give a clear mirroring instruction against real, fully-read reference files rather than reproducing ~300-600 lines of near-duplicate code inline — this is the biggest, most novel batch, and the design doc itself flagged it as likely needing extra review rounds; the plan's job here is giving an implementer unambiguous "mirror THIS exact file's proven pattern" instructions, not pre-writing every line, which would risk transcription drift from the real reference files anyway.
