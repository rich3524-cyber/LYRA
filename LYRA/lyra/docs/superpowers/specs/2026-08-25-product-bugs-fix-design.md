# Product Bugs Fix — 4 Batches (Design)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into implementation plans — ONE PLAN PER BATCH, not a single combined plan. Batch A and Batch B are independent of each other and of Batches C/D, and can be planned/implemented in either order. Batch C (sentiment) and Batch D (reviews) are also independent of each other, but both depend on Batch B's `AWAITING_APPROVAL` removal being done first if their implementation touches `CommentStatus` handling in the same files (verify at plan-writing time; if no actual overlap exists, they can proceed independently too). This is real application code — TDD applies to every batch.

**Goal:** Fix the 6 real product bugs surfaced as a side effect of the Help-docs accuracy audit (`docs/investigations/2026-08-24-help-docs-audit-findings.md`, "Headline" section), each of which is real, currently-shipped broken behavior — not documentation.

**Architecture:** Four independent batches, each its own design section below and its own future implementation plan:
- **Batch A** (Bugs 1+2): two small, low-risk mechanical fixes.
- **Batch B** (Bugs 5+6): comment/autonomy state-machine changes driven by product decisions already made during brainstorming.
- **Batch C** (Bug 4): sentiment classification folded into the existing AI response-generation call.
- **Batch D** (Bug 3): Google Business review ingestion — the biggest batch, but building on an already-half-built provider layer.

**Tech Stack:** Next.js Route Handlers, Prisma/Postgres, BullMQ workers (Railway), Anthropic Claude API, Vitest.

---

## Batch A — Quick fixes (Bugs 1 + 2)

### Bug 1: weekly brand-refresh cron erases pasted brand guidelines

**Why:** `workers/brand-sync.worker.ts`'s weekly cron job upserts `BrandProfile.postingPatterns` with an object that only ever contains `{ guidelines, socialInsights }` — it never reads or preserves `userGuidelines`, the field that holds a client's pasted brand guidelines text. Every weekly run silently wipes it. The manual "Build brand profile" route (`app/api/brand-intelligence/build/route.ts`) does this correctly: it reads `savedUserGuidelines` off the existing profile (`(workspace.brandProfile?.postingPatterns as Record<string, unknown> | null)?.userGuidelines`) before building the new profile, and folds it back into `postingPatterns` on the upsert (`{ guidelines, socialInsights, userGuidelines: guidelinesText || undefined }`).

**What:** Mirror the manual route's exact pattern in the cron worker: before calling `buildBrandProfile`, look up the workspace's existing `BrandProfile.postingPatterns.userGuidelines` (the worker already fetches `workspace` with `include: { brandProfile: true }`, so this is just reading an existing field, no new query). Pass it into the `guidelinesText` used for the build call (the same way `manualGuidelines` is prioritized in the manual route — but the cron has no manual override input, so it's just `savedUserGuidelines || ''`). Include `userGuidelines: savedUserGuidelines || undefined` in both the `create` and `update` branches of the upsert's `postingPatterns` JSON.

**Deliberately out of scope:** the cron's homepage-only scrape (`scrapeWebsite`, vs. the manual route's 3-page `scrapeMultiplePages`) and its hardcoded-empty social-signal array. These are "worse than optimal" defaults for a background job that runs weekly across every workspace, not the destructive silent-data-loss bug this fix targets — widening scrape/social-signal scope would add real scraping and LLM cost to every workspace's weekly run, which is a separate decision to make deliberately later, not bundle into this fix.

**Files:** Modify `workers/brand-sync.worker.ts`.

### Bug 2: dead `audience.languageLevel` field

**Why:** `services/brand-intelligence/profile-builder.ts`'s `BrandProfileData.audienceProfile` interface, its Claude prompt's JSON schema, and its validation all use the key `language`, whose actual value is a register descriptor (`"formal|casual|technical|conversational"` per the prompt), not a language name. The Brand AI page (`app/(dashboard)/workspace/[workspaceId]/brand/page.tsx`) reads `audience.languageLevel` instead — a property-name mismatch, so the field is always `undefined` and the "Audience" UI panel silently omits it. `languageLevel` is the more accurate name for what this value actually represents, so the writer gets renamed to match the reader, not the other way around.

**What:** Rename `language` → `languageLevel` in three places in `profile-builder.ts`: the `BrandProfileData.audienceProfile` interface, the prompt's JSON schema key (`"language": "formal|casual|..."` → `"languageLevel": "formal|casual|..."`), and the validation check (`typeof parsed.audienceProfile?.language !== 'string'` → `.languageLevel`). Update the one other consumer, `services/ai/prompt-builder.ts:16` (`audienceProfile.language` → `audienceProfile.languageLevel`). No UI changes needed — the Brand AI page already reads the correct name.

**Files:** Modify `services/brand-intelligence/profile-builder.ts`, `services/ai/prompt-builder.ts`.

### Testing approach (Batch A)

Both are small, mechanical, TDD-friendly fixes:
- Bug 1: extend or add a test for `workers/brand-sync.worker.ts` confirming a workspace with existing `userGuidelines` in `postingPatterns` retains that value after a weekly-sync run (mock the Claude call, assert the Prisma upsert's `postingPatterns` argument contains the preserved `userGuidelines`).
- Bug 2: update `services/brand-intelligence/profile-builder.test.ts` (if it exists — check) or add coverage confirming `buildBrandProfile`'s returned `audienceProfile.languageLevel` is populated from the Claude response, and that `prompt-builder.ts`'s prompt-building test reflects the renamed field.

---

## Batch B — State-machine decisions (Bugs 5 + 6)

### Bug 5: remove dead `AWAITING_APPROVAL` comment status

**Why:** `CommentStatus` (Prisma enum) includes `AWAITING_APPROVAL`, and several UI locations read/filter on it, but no code path ever assigns it — Draft + Approve mode writes `AI_DRAFTED` instead, which the UI already treats as the real "needs your review" state. Per the brainstorming decision, `AI_DRAFTED` is correct as-is; `AWAITING_APPROVAL` is the dead one.

**What:**
1. Prisma migration: remove `AWAITING_APPROVAL` from the `CommentStatus` enum in `prisma/schema.prisma`. Confirm no live `Comment` row anywhere has this status before writing the migration (a quick one-off script, following this repo's established convention, run against production first) — if any do (shouldn't, since nothing ever writes it, but verify rather than assume), decide a migration-safe fallback status before dropping the enum value.
2. Grep every reference to `AWAITING_APPROVAL` across the app (`components/lyra/inbox/*`, any status-filter dropdowns, any `Sentiment`-adjacent status-badge color maps) and remove the dead branches cleanly — not just deleting the enum value and letting TypeScript compilation catch the fallout, but reviewing each site for whether removing the branch leaves the surrounding logic correct (e.g. a switch statement's fallback case, a filter dropdown's option list).

**Files:** Modify `prisma/schema.prisma` (+ migration), and every file grep turns up referencing `AWAITING_APPROVAL` (expect `components/lyra/inbox/comment-card.tsx`, `components/lyra/inbox/response-inbox.tsx`, possibly others — enumerate exactly during plan-writing by grepping the current codebase, don't guess the list here).

### Bug 6: gate Draft + Approve away from Starter

**Why:** Starter workspaces can currently set `aiResponseMode: 'DRAFT_APPROVE'` with no server-side block — this generates real, billed AI drafts — but `components/lyra/inbox/comment-card.tsx`'s `showAiControls` gate (`plan !== 'STARTER'`) hides the UI that would let a Starter user see, edit, or send those drafts. A reachable, billable, unusable combination. Per the brainstorming decision, this gets fixed by blocking Draft + Approve on Starter entirely — the same treatment Full Autonomy already gets — not by unlocking the approval UI for Starter.

**What:** Two changes mirroring the existing Full Autonomy gate exactly:

1. **Server-side** (`app/api/workspaces/[id]/route.ts`): the existing check
   ```ts
   if (aiResponseMode === 'FULL' && existing.plan === 'STARTER') {
     return NextResponse.json({ error: 'Full Automatic requires Pro or Agency plan.' }, { status: 403 })
   }
   ```
   becomes
   ```ts
   if ((aiResponseMode === 'FULL' || aiResponseMode === 'DRAFT_APPROVE') && existing.plan === 'STARTER') {
     return NextResponse.json({ error: `${aiResponseMode === 'FULL' ? 'Full Automatic' : 'Draft + Approve'} requires Pro or Agency plan.` }, { status: 403 })
   }
   ```
   (exact error-message wording to be finalized at plan-writing time — the point is a per-mode message, not a generic one).

2. **Client-side** (`components/lyra/settings/autonomy-selector.tsx`): the existing `disabled = option.mode === 'FULL' && !isPro` (line 103) becomes `disabled = (option.mode === 'FULL' || option.mode === 'DRAFT_APPROVE') && !isPro`, and the "Requires Pro or Agency plan." note (currently only rendered for `option.mode === 'FULL' && !isPro`, lines 131-135) gets the same condition extended to also cover `DRAFT_APPROVE`.

**No migration needed.** No change to existing Full Autonomy behavior — this only adds a new restriction, doesn't touch the existing one.

**Files:** Modify `app/api/workspaces/[id]/route.ts`, `components/lyra/settings/autonomy-selector.tsx`.

### Testing approach (Batch B)

- Bug 5: after the migration, `npx prisma generate` and a full `tsc --noEmit` will surface every remaining TypeScript reference to the removed enum value as a compile error — use this as a completeness check in addition to the initial grep, not instead of it (a dynamically-constructed string comparison wouldn't be caught by the type checker).
- Bug 6: extend `app/api/workspaces/[id]/route.test.ts` (or create if it doesn't exist) with cases mirroring the existing Full Autonomy test: a Starter workspace PATCHing `aiResponseMode: 'DRAFT_APPROVE'` gets a 403; a Pro/Agency workspace doing the same succeeds. Component test (if the test setup supports it) or a manual verification note for `autonomy-selector.tsx`'s disabled/note rendering on a Starter workspace.

---

## Batch C — Sentiment classification (Bug 4)

**Why:** `Comment.sentiment` (Prisma `Sentiment?` enum: POSITIVE/NEUTRAL/NEGATIVE/URGENT) is read and rendered throughout the Inbox UI (filter options, status labels in `comment-card.tsx`/`response-inbox.tsx`) but no code path anywhere ever writes it — every comment's sentiment is permanently `null`. Per the brainstorming decision, classification gets folded into the existing AI response-generation call rather than adding a separate classification call for every comment.

**What:** `services/ai/response-generator.ts`'s `generateCommentResponse()` currently asks Claude for plain text (`"Write only the response — no explanation."`) and detects escalation via a literal `text === 'ESCALATE'` sentinel string comparison. Change the prompt to ask for structured JSON instead, matching the pattern already used elsewhere in this codebase (`services/brand-intelligence/profile-builder.ts`, `services/brand-intelligence/crisis-keyword-suggester.ts`):

```json
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "URGENT",
  "response": "the response text, or null if escalation is needed"
}
```

- Replace the `ESCALATE` sentinel with `response === null` as the escalation signal (functionally equivalent, cleaner as structured data).
- `generateCommentResponse`'s return type gains a `sentiment: Sentiment` field alongside the existing `response`/`shouldEscalate`/`escalationReason`.
- All prompt-injection defenses already in this function (the `<untrusted_comment>`/`<brand_voice>` fencing, the neutralize-fence-closer calls, the post-generation guardrail re-check against the model's *output*) apply unchanged — only the requested output *format* changes, not the security posture. The guardrail re-check (`checkGuardrailViolation`) needs to run against the parsed `response` field, not the raw JSON text.
- **3 real call sites** need updating to write `comment.sentiment` from the result and adapt to the new return shape: `workers/ai-responder.worker.ts`, `app/api/ai/respond/route.ts`, `app/api/mcp/respond-to-item/route.ts`. Each has existing test coverage (including prompt-injection and race-condition-specific tests) that mocks `generateCommentResponse`'s return value — every mock in `response-generator.test.ts`, `ai-responder.worker.test.ts`, `app/api/ai/respond/route.test.ts`, and `app/api/mcp/respond-to-item/route.test.ts` needs its mocked return shape updated to include `sentiment` and to stop asserting the old `ESCALATE` string behavior.

**Scope boundary (per the brainstorming decision):** comments that never reach `generateCommentResponse` at all stay unclassified (`sentiment: null`) — this includes autonomy Off (no AI call happens at all) and any comment that gets escalated pre-call via `checkAlwaysEscalate` (an `ALWAYS_ESCALATE` guardrail match short-circuits before the Claude call, so there's no AI-provided sentiment for it — leave `sentiment: null` in this case too, don't add a second classification path just to cover this one pre-escalation case). The Inbox UI's sentiment filter needs a real "unclassified" state (comments where `sentiment IS NULL`) rather than treating null as an error/incomplete-data condition — check `components/lyra/inbox/response-inbox.tsx`'s filter UI at plan-writing time for how to represent this cleanly.

**Files:** Modify `services/ai/response-generator.ts`, `workers/ai-responder.worker.ts`, `app/api/ai/respond/route.ts`, `app/api/mcp/respond-to-item/route.ts`, plus their four test files, plus `components/lyra/inbox/response-inbox.tsx` (sentiment filter UI) and `components/lyra/inbox/comment-card.tsx` (if it needs the "unclassified" display state).

### Testing approach (Batch C)

TDD throughout, following this function's existing test rigor (the current `response-generator.test.ts` has dedicated prompt-injection tests — these must keep passing unchanged, since the security fencing isn't changing, only the output format). New/updated tests needed: `generateCommentResponse` returns a valid `sentiment` value parsed from a mocked Claude JSON response; `response === null` triggers `shouldEscalate: true` the same way the old `ESCALATE` sentinel did; a malformed/non-JSON Claude response is handled explicitly (decide: throw, or fail closed to escalation — check what the current code does on an unparseable response and preserve that failure mode). Each of the 3 callers' tests updated to assert `comment.sentiment` gets written on the successful path.

---

## Batch D — Google Business review ingestion (Bug 3)

**Why:** Google Business reviews are documented (in the now-corrected Help docs, and in the product's own copy) as fully supported for reading and reply, but no `Review` Prisma model exists at all, and the Zernio provider's `fetchReviews`/`replyToReview` methods (`services/social/provider/zernio.ts`) have zero call sites anywhere in the app. This turns out to be a partially-built, never-finished feature: `services/social/provider/types.ts` already declares `NormalizedReview` and both methods on the `SocialProvider` interface; `services/social/provider/mappers.ts` already has a working `toNormalizedReview`; `services/social/zernio-client.ts` already implements the underlying `getGoogleBusinessReviews`/`replyToGoogleBusinessReview` calls; a stray code comment in `mappers.ts` even references a not-yet-existing `Review.zernioReviewId` field. Per the brainstorming decision, this gets built out to full read+reply parity with other platforms — not a read-only-first slice.

### New Prisma model

`Review`, parallel to `Comment` (not merged into it — avoids a risky migration touching Comment's live data and extensive existing test coverage, and keeps review-specific fields like star rating out of the Comment schema):

```prisma
model Review {
  id                String        @id @default(cuid())
  workspaceId       String
  socialAccountId   String
  socialAccount     SocialAccount @relation(fields: [socialAccountId], references: [id])
  zernioReviewId    String        // matches NormalizedReview.externalId; the field mappers.ts already anticipates
  rating            Int?          // 1-5, per NormalizedReview.rating
  authorName        String?
  text              String?
  status            CommentStatus @default(PENDING)  // reuse the (now AWAITING_APPROVAL-free, per Batch B) enum -- same lifecycle shape as Comment
  aiDraftResponse   String?
  finalResponse     String?
  sentiment         Sentiment?    // same classification approach as Batch C, once this exists
  respondedAt       DateTime?
  platformCreatedAt DateTime
  createdAt         DateTime      @default(now())

  @@unique([socialAccountId, zernioReviewId])
  @@index([workspaceId, createdAt])
  @@index([workspaceId, status])
}
```
(Field list and exact types to be finalized at plan-writing time against the real `Comment` model's current shape — this reproduces its structure closely on purpose, for consistency.)

### Ingestion

Extend `workers/comment-monitor.worker.ts`'s per-account job: when `account.platform === 'GOOGLE_BUSINESS'` (and `account.provider === 'ZERNIO'`, matching the existing Zernio-only branch pattern), also call `getProvider(account).fetchReviews(account)`, apply the same self-authored-content filtering the worker already does for comments (adapted for reviews — a business doesn't "reply to its own review," but a duplicate-ingestion guard via the `@@unique([socialAccountId, zernioReviewId])` constraint handles re-fetch idempotency), and upsert into `Review`. Extend `services/comments/sync.ts` (the manual "Sync" button path) with the equivalent addition. New reviews get enqueued for AI generation the same way new comments do (extend `enqueueAiResponses`-equivalent logic, or a parallel `enqueueAiReviewResponses`, to be decided at plan-writing time based on how much the two can cleanly share).

### AI response generation

Extract the shared, security-fenced prompt-construction logic in `services/ai/response-generator.ts` into a form both `generateCommentResponse` and a new `generateReviewResponse` can call, rather than duplicating the prompt-injection defenses. The review variant's prompt additionally includes the star rating (a 1-star review needs materially different tone/handling than a 5-star one) and produces the same `{ sentiment, response }` JSON shape established in Batch C. Same guardrail/escalation checks apply unchanged.

### Reply wiring

`replyToReview(account, externalId, text)` gets called from the same approve/send action already used for comments in the Inbox UI (`workers/ai-responder.worker.ts`'s auto-post path for Full Autonomy, and the manual approve action for Draft + Approve / manual mode), parameterized by content type (comment vs. review) so the correct provider method is invoked.

### UI

Reviews render in the same unified Inbox list as comments — not a separate tab — distinguished by a star-rating badge on review rows. The existing autonomy-mode, guardrail, and approval-flow UI applies identically to both content types, matching the "full parity" decision. This requires the Inbox's data-fetching route to return a merged, normalized list of comments and reviews (or the client to merge two separate fetches) — exact approach to be decided at plan-writing time by reading `response-inbox.tsx`'s current data-fetching shape.

### Files

Create: new Prisma migration for the `Review` model. Modify: `workers/comment-monitor.worker.ts`, `services/comments/sync.ts`, `services/ai/response-generator.ts` (shared extraction + new `generateReviewResponse`), `workers/ai-responder.worker.ts` (or an equivalent review-response worker path), the Inbox reply/approve action route(s), `components/lyra/inbox/response-inbox.tsx`, `components/lyra/inbox/comment-card.tsx` (or a new `review-card.tsx` sharing most of its structure — decide at plan-writing time whether a shared component or a variant makes more sense once the exact merged-list shape is known).

### Follow-up (not part of this batch, flagged for later)

Once this ships, `components/lyra/help/section-03-social-connections.tsx` and `components/lyra/help/section-07-inbox.tsx` — both corrected during the just-merged Help-docs fix pass to honestly say Google Business reviews aren't ingested — need a follow-up correction to describe the new real behavior. Not scoped here; a quick two-file doc fix once this batch ships.

### Testing approach (Batch D)

TDD per the shared codebase convention. New model needs migration + a Prisma-level smoke test if the repo has a pattern for that (check). `generateReviewResponse` needs the same test rigor as `generateCommentResponse` (prompt-injection coverage, guardrail re-check coverage) rather than assuming the extracted shared logic is automatically covered — write review-specific test cases even where the underlying function is shared. Worker/ingestion tests following `workers/comment-monitor.worker.ts`'s existing test patterns (there's an existing `.test.ts` for it — extend rather than duplicate its setup). This is the batch most likely to need extra review rounds given its size — plan for it explicitly rather than assuming one implementer pass covers it.

---

## What this design deliberately does not do

- Does not widen the weekly brand-sync cron's scrape scope or add real social-signal analysis to it (Bug 1) — a separate future decision, not bundled into the guidelines-preservation fix.
- Does not address `CommentStatus.APPROVED`, which a prior accuracy review during the Help-docs pass also found to be dead code (never written by any path) — this wasn't one of the original 6 headline bugs and is explicitly out of scope here; flagged for a possible future bug 7 if the user wants it addressed.
- Does not unify `Comment` and `Review` into a single Prisma model — kept parallel and independent, per Batch D's reasoning, to avoid risking Comment's existing data/tests and to let Review carry its own review-specific fields.
- Does not add sentiment classification to Batch D's `Review` model as a separate initial step — it reuses Batch C's `{ sentiment, response }` shape once both batches exist, but Batch D can ship before Batch C if sequenced that way (Review.sentiment just stays null until Batch C's pattern is available, same as Comment.sentiment does today).
- Does not decide implementation order across the 4 batches — each is independent enough to be planned and shipped in any order; sequencing is a future decision, not part of this design.
