# Step 1A — Code Quality Analysis (raw agent output)

Five sub-reports from the `code-reviewer` agent, which split its own sweep into a top-level summary plus four layer-specific deep passes (workers/lib, components, API routes, services).

---

## 1. Top-level summary (main agent pass)

**Overall:** This is a well-above-average codebase. Concurrency handling (atomic `updateMany` claims, idempotency keys, dedupe keys) is genuinely sophisticated, the "why" commenting is exceptional, and there are zero `TODO`/`FIXME`/`@ts-ignore` markers. The problems are almost entirely **consistency and drift**: good patterns were built (`lib/validate.ts`, `lib/platform-labels.ts`, `rollbackToDraft`) but only partially adopted, leaving safer and less-safe copies of the same logic side by side.

### Baseline metrics

| Metric | Value | Assessment |
|---|---|---|
| API route files | 82 | — |
| Routes using the `parseBody` zod helper | 5 / 82 (6%) | Critical gap |
| Raw `await req.json()` sites | 35 | Critical gap |
| `error.message === 'Unauthorized'` string matches | 80 | High duplication |
| `'Internal server error'` literals | 71 | High duplication |
| Hand-rolled `fetch()` calls in components | 73 | High duplication |
| Route test files | 20 / 82 (24%) | Thin |
| Component test files | 2 / 104 (2%) | Very thin |
| Service test files | 14 / 54 (26%) | Thin |
| Worker test files | 5 / 8 (63%) | Acceptable |
| Direct `process.env.*` reads | 143, no central config | Medium |

### CRITICAL

**C1. Third copy of the safety-critical reply rollback is unhardened and drops the draft** — `app/api/mcp/respond-to-item/route.ts:269-272`. Two hardened copies exist with 3-attempt retry + backoff (`workers/ai-responder.worker.ts:66-90`, `app/api/comments/[id]/reply/route.ts:41-65`); this third copy has no retry and doesn't restore `aiDraftResponse`, so a failed write here can leave a comment permanently stuck `RESPONDED` with no reply sent. Fix: extract to `lib/comment-rollback.ts`, use in all three.

### HIGH

- **H1.** Only 5/82 routes use `lib/validate.ts`'s `parseBody` helper; 35 routes use raw `req.json() as T` with no runtime validation — malformed JSON becomes a 500 not 400, no bounds checking (e.g. reply text has no max length).
- **H2.** Auth failure signaled by matching the literal string `'Unauthorized'` in 80 places (`lib/auth.ts:93` throws `new Error('Unauthorized')`). Brittle — any unrelated error with that message is misclassified as a 401.
- **H3.** Six competing `PLATFORM_LABELS` maps; three are missing platforms (PINTEREST/THREADS/BLUESKY) and render raw enum values. `engagement-insights.tsx:84`'s derived labels produce wrong casing (`Linkedin` not `LinkedIn`).
- **H4.** Three cron routes (`check-approval-slas`, `sync-comments`, `sync-metrics`) have no try/catch; the SLA sweep aborts its whole batch mid-loop on one throw, silently orphaning already-claimed posts.
- **H5.** `app/api/posts/[id]/route.ts:153-220` — post status update and PostApproval upsert are separate unwrapped writes; failure between them leaves a post `PENDING_APPROVAL` with no approval row, invisible to the SLA sweep.
- **H6.** `content-calendar.tsx:143-157`'s `fetchPosts`/`fetchCampaigns` never check `res.ok`; a 401/403/500 with a JSON error body passes the `Array.isArray` guard as `[]`, showing a false "empty calendar."

### MEDIUM (M1–M9) and LOW (L1–L6)

Covers: unguarded `JSON.parse` on 4 of 5 LLM response sites (M1); triple source of truth for composer content, an editor-clear that doesn't clear parent state (M2); `getNextStatuses` reimplementing backend approval logic client-side (M3); client mutations discarding specific server error messages in favor of generic toasts (M4); report generation mutating array it returns via in-place `.sort()`, empty check placed after aggregation (M5); `PLATFORM_COLORS` duplicated with 4 divergent hex values (M6); `timeAgo` duplicated byte-for-byte (M7); ungaurded `sessionStorage` JSON.parse crashing schedule-review page (M8); 12 multi-write routes without `$transaction` (M9). Low: `post-detail-panel.tsx` at 671 lines/92 conditionals (L1); calendar auto-refresh timer resets on every drag (L2); repeated `JSON.parse(JSON.stringify(x))` Prisma-JSON coercion (L3); 143 scattered `process.env` reads, no startup validation (L4); unsafe non-null assertion outliving its filter (L5); 4 dead Trend feature-stub routes (L6).

**Recommended sequencing:** Before beta — C1, H4, H5, H6. Next sprint — H1, H2, H3, M9. Backlog — M1-M8, L1-L6.

---

## 2. Workers & lib deep pass

**Scope:** 9 worker files, 33 `lib/` files. 7 live BullMQ workers, 7 Queue instances across 3 files.

### CRITICAL

**C1 — No `unhandledRejection`/`uncaughtException` handler; Railway gives up after 3 crashes.** `workers/index.ts:45-46` only registers SIGTERM/SIGINT. Combined with `railway.toml`'s `restartPolicyMaxRetries = 3`, an unhandled rejection anywhere in the 7-worker fleet can permanently stop the entire fleet — no publishing, no AI responses, no sync — until a human notices. At least two live paths (H1, M1 below) can produce exactly this.

### HIGH

- **H1.** `post-publisher.worker.ts:161-206`'s `failed` event listener is `async` and unawaited by BullMQ — if its own DB write throws (likely, since DB issues are the probable cause of the original failure), it's an unhandled rejection that crashes the fleet per C1. The only async listener of the 7; the other 6 are safe synchronous logs.
- **H2.** `metrics-sync.worker.ts:63-78` catches everything and returns `{status:'failed'}` as a **completed** job — configured retries (`attempts: 2`) never fire, and a genuine poison message is indistinguishable from a transient error, silently absorbed forever.
- **H3.** `sync-metrics` cron route uses a stable `jobId: metrics-sync-${post.id}` with no `removeOnComplete: true` (queue default is count-based retention) — BullMQ's dedup-by-jobId means re-enqueuing a post already in the completed set (for any tenant under ~200 posts) is a silent no-op forever. Every other producer in the codebase gets this right except this one route.
- **H4.** `comment-monitor.worker.ts:95-105,153-156` catches fetch failures and `return`s (job completes successfully) — a transient API blip means that ingestion cycle's comments are simply never processed, no retry.
- **H5.** `comment-monitor.worker.ts:172-195` is not idempotent: a retry's `createManyAndReturn({skipDuplicates:true})` returns zero rows for already-written comments, so AI response enqueue and crisis detection are silently skipped on retry — **retrying actively loses work** rather than redoing it. Worst finding in the fleet.
- **H6.** `brand-sync.worker.ts:48-89` — a swallowed scrape failure (`catch {}`, unbound error) still proceeds to call Claude with empty input and **unconditionally overwrites** the workspace's real, previously-good brand profile with a hallucinated one from nothing.
- **H7.** `comment-monitor.worker.ts:119-141` — raw `fetch` to Graph API with no `res.ok` check (a 400 error body silently becomes "zero comments") and no timeout anywhere in the entire worker fleet (no `lockDuration` configured on any of the 7 workers) — a hung request can hold a concurrency slot indefinitely.

### MEDIUM (M1–M8)

Shutdown drain uses `Promise.all` (aborts other workers' close() on first rejection) and rejects into a `void` call, itself an unhandled-rejection risk (M1); queue definitions scattered across 3 files including one registered as an import side-effect inside a worker file (M2); a zero-caller `queueBrandSync` export carrying the same landmines if ever used (M3); `brand-sync` handler does two unrelated jobs dispatched on `job.name` (M4); no dead-letter queue anywhere — failed jobs are silently evicted by count-based `removeOnFail` (M5); unbounded fan-out in 3 places (M6); magic numbers (concurrency/backoff/attempts/retention) with no shared vocabulary across 7 files (M7); the 3-attempt retry loop copy-pasted 3 times (M8).

### Idempotency Matrix (full fleet reviewed)

post-publisher: ✅ best in fleet (atomic CAS claim before external call). ai-responder: ✅ with one accepted/documented risk (post-send timeout could double-post via manual retry). notification: ✅ (stable request-id dedup upstream). metrics-sync: ✅ but moot (never retries, per H2). competitor-monitor (scrape): ⚠️ mostly (bare `create` not `upsert`, a stall-triggered retry could double-insert a snapshot). brand-sync (sync-brand): ❌ retry overwrites good data with nothing (H6). comment-monitor: ❌ worst in fleet — retry destroys remaining work (H5).

### Explicitly clean

`lib/safe-fetch.ts` (strongest file in the review — DNS-pinned, redirect-revalidated, fail-closed). `lib/encrypt.ts`, `jwt-verify.ts`, `oauth-state.ts`, `authz.ts`, `plan-access.ts`, `validate.ts`, `platform-labels.ts` all small/correct/single-purpose. `app/api/cron/publish-due-posts/route.ts` correctly handles the stale-jobId trap. `channel-notifier.ts` genuinely fail-open as documented. Worker comment quality is exceptional throughout, citing real incident dates.

### Recommended order

1. C1 (2-line fix, prevents total outage) → 2. H1 (wrap async failed-listener) → 3. H3 (one-line `removeOnComplete`) → 4. H2/H4 (stop swallowing into success) → 5. H6 (stop overwriting good brand data) → 6. H5 (needs testability refactor first) → 7. H7 (res.ok + timeouts + fleet-wide lockDuration) → 8. shared `createWorker` factory / `queue-config.ts` / `retry.ts`.

---

## 3. Components deep pass

**Scope:** 104 `.tsx` files under `components/`, targeted reads of pages.

**Headline:** unusually well-commented; error handling above average for the layer (37/40 fetch-bearing files check `res.ok`); zero `any` types found; no Critical findings.

### HIGH

- **H-1.** `schedule-review.tsx:43-50` — ungaurded `JSON.parse(sessionStorage...)`, no try/catch on the corrupt-data path (only the absent-data path is handled) — crashes the page after a ~60s wait for schedule generation.
- **H-2.** Workspace timezone is documented (`section-10-settings.tsx:35-37`) as governing calendar/composer display, but is not implemented anywhere except `bulk-import-review-table.tsx`'s own local helper — every other display site uses browser-local time via `date-fns`. Can misfile a post to the wrong calendar day entirely for cross-timezone agency/client pairs. `date-fns-tz` isn't even a dependency.
- **H-3.** `post-detail-panel.tsx` — 671 lines, 4 unrelated responsibilities (auth logic, 4 mutation handlers, a full ad-boost purchase flow, panel chrome). The boost feature (~250 lines) is cleanly separable into `PostBoostPanel`.

### MEDIUM (M-1–M-7)

Six components hand-roll platform maps despite `lib/platform-labels.ts` existing as canonical source — includes a genuine **name collision**: `post-preview-card.tsx` exports its own `PLATFORM_LABELS` with different values than the lib one, both imported elsewhere with no type error (M-1); two pairs of byte-identical interfaces declared twice, one pair communicating only via `sessionStorage` with the contract duplicated at both ends (M-2); post status badge logic (awaiting-media → overdue → status precedence) written twice with divergent wording, one map missing a `PUBLISHING` key (M-3); composer holds duplicate state in parent+child, reachable desync on mobile viewport where toggling a platform in the preview strip doesn't propagate to the parent that actually submits (M-4); `res.json()` called before `res.ok`, converting auth/rate-limit failures into false "empty" UI states in 2 places (M-5); two action handlers (`handleEscalate`/`handleIgnore`) have no in-flight guard and can double-submit, unlike every sibling handler in the same file; a third handler (`handleSync`) has neither `res.ok` nor `.catch` (M-6); sidebar mounts its full nav tree twice when the mobile drawer is open, double-fetching workspace list (M-7).

### LOW (L-1–L-6)

The only `eslint-disable react-hooks/exhaustive-deps` in the codebase, masking a real stale-closure risk (L-1); calendar auto-refresh interval resets on every drag due to a redundant dependency (L-2); per-tab filter counts recomputed every render, uncached (L-3); platform character limits hardcoded in 5 places with no shared constant (L-4); composer discards specific server error text in favor of generic message (L-5); 3 billing/upgrade components branch on payload shape instead of checking `res.ok` (L-6).

### Explicitly clean

Zero `any` in components. Strong `res.ok` discipline (37/40). AbortController hygiene correct across all reviewed async-effect components. Optimistic-update rollback in `notifications-section.tsx` is textbook. `CommentCard` is properly `memo`'d with a documented rationale. Server components correctly avoid client-fetch confusion, batch queries with `Promise.all` + per-query fallback. `getNextStatuses`'s duplication with the backend is deliberate and well-documented, not accidental drift — explicitly left as-is.

---

## 4. API routes deep pass

**Scope:** 82 `app/api/**/route.ts` (7,312 LOC), 28 pages, 6 layouts, middleware.

### Quantified duplication

79 sites match `error.message === 'Unauthorized'` string sentinel across 67 files; 70 identical `'Internal server error'` 500 literals; 28 routes repeat the workspace-membership `findFirst` preamble; 30 inline `role: {not:'CLIENT_VIEW'}` predicates exist in parallel with the `canWrite()` helper (used in only 16 files); `OWNER_ROLES` redeclared 6 times including once inline in a page; 34 files parse body with a raw `as` cast (28 of those fully unguarded) vs. 5 using the `parseBody` Zod helper; 3 divergent copies of the media MIME allowlist; only 20/82 routes (24%) have tests.

### HIGH

- **H1.** Same `'Unauthorized'` string-sentinel issue found independently by the top-level pass — 79 sites, `lib/auth.ts:95`.
- **H2.** 28 unguarded raw-JSON-parse routes; concretely, `workspaces/[id]/route.ts:62-66` passes `clientAccessLevel`/`aiResponseMode`/`name` straight to Prisma with no validation — a bad enum value becomes an opaque 500 instead of a 400 naming the field.
- **H3.** The MIME-type allowlist security fix (`Object.hasOwn` instead of plain lookup, closing a `"constructor"` prototype-pollution bypass) reached only 1 of 3 copies — `upload/presign/route.ts` still has the unfixed plain-lookup version, and a third copy in `bulk-import/commit` has independently drifted to allow an extra MIME type the other two don't.
- **H4.** `comments/sync/route.ts:96-141` abandons its own provider abstraction for 3 of 4 platform branches, hand-rolling raw Graph API fetches with **no `res.ok` check** — an expired token returns the identical response shape as "no new comments," with nothing logged.

### MEDIUM (M1–M10)

`PATCH /api/posts/[id]`'s final-status resolution is a 7-line nested ternary encoding the single most consequential business rule in the file (M1); 5 near-identical OAuth-callback upsert blocks with the token-encryption call duplicated twice per platform (M2); server-side dashboard queries swallow DB failures into fabricated `0` counts with nothing logged, indistinguishable from a genuinely quiet week (M3); dashboard KPI strip and Quick Actions links point at two different workspaces when workspace ordering doesn't match plan-priority ordering (M4); `OWNER_ROLES` declared 6 times (M5); `canWrite()` and 30 inline copies of the same Prisma predicate coexist, only 16/44 sites use the named helper (M6); `POST /api/reports/generate` is 115 lines mixing transport/auth/aggregation/rendering, `.sort()` mutates the array it returns, and the empty-input guard runs after aggregation, not before (M7); 12 workspace pages re-run a membership query their shared layout already performed (M8); `ai/repurpose` route is the only 500-returning site in 82 files with no `console.error`, and the only route using `new Response(JSON.stringify())` instead of `NextResponse.json` (wrong Content-Type header) (M9); boost/cancel routes misattribute unrelated DB/decrypt failures as "the platform rejected it," and the dashboard's own auth-failure fallback tells end users to check Netlify function logs (M10).

### LOW (L1–L5)

Dead unused `commentCount` query plus serial-not-parallel counts in analytics route (L1); variable shadowing + a per-render-rebuilt constant in settings page (L2); `export const dynamic` present on 58/82 routes with no discernible rule (L3); inconsistent error-message strings for the same condition across routes, no machine-readable `code` field anywhere (L4); test coverage concentrated away from the 5 highest-complexity handlers, including the untested `comments/sync` route that itself contains H4 (L5).

### Top 5 complexity hotspots (approximate cyclomatic complexity)

1. `comments/sync POST` (~46) — 4 platform branches, 3 nested loops, contains H4.
2. `posts/[id] PATCH` (~44) — 5 sequential gates + the M1 nested-ternary status resolution.
3. `mcp/respond-to-item POST` (~30) — 4 separate optimistic-concurrency claims, well-documented but all in one function.
4. `stripe/webhook POST` (~29) — 3-case switch, each case doing 2-3 unrelated jobs.
5. `analytics GET` (~29) — a full reporting module living inside a route handler, contains the dead `commentCount` query.

### Explicitly clean

`middleware.ts` — 12 lines doing one thing well. Error logging is consistent (81/82 500-returning routes log first). `lib/authz.ts`/`lib/plan-access.ts` correctly document why two similar predicates are deliberately kept separate (fail-closed vs fail-open). `lib/validate.ts` is the right abstraction, just under-adopted. Concurrency/claim patterns applied consistently and well-reasoned. `zernio/webhook/route.ts` correctly distinguishes skip-and-ack from genuine failure despite high complexity score. Workspace layout is minimal and correct.

---

## 5. Services deep pass

**Scope:** 68 files under `services/` (56 non-test, ~4,900 LOC).

**Headline:** well-above-average; several modules (`notifications/*`, `social/provider/*`, `posts/bulk-import.ts`) are genuinely exemplary.

### HIGH

- **1.** `content-repurposer.ts:92-107`'s streaming block parser silently truncates every generated caption — the regex's `$` lookahead matches end-of-buffer (not end-of-stream), so a still-incomplete body on an early chunk gets yielded and discarded before the rest arrives. Reproduced directly: 2 posts emitted, both truncated at the first token boundary. Hides well because the *count* of posts is correct, only the content is truncated.
- **2.** Three parallel per-platform capability maps in `services/ai/` (`schedule-generator.ts`, `content-repurposer.ts`, `content-scorer.ts`) — all keyed by the same 6 platform names, all missing the same 4 (YOUTUBE/PINTEREST/THREADS/BLUESKY), all with a silent `??` fallback to generic advice with no compile-time signal. The codebase already has the correct exhaustive-`Record<Platform,…>` pattern elsewhere (`lib/platform-labels.ts`, `provider/platform-map.ts`) — just not applied here.

### MEDIUM (3–12)

8 separate Claude-JSON-parse sites with 5 different failure behaviors and 3 fully unguarded blind casts (`profile-builder.ts`, `content-generator.ts` — no try/catch, no shape validation at all) (3); `theme-extractor.ts` has the only fully-silent `catch{}` in `services/`, hiding a real fence-stripping bug behind it (4); non-exhaustive email-provider switch defaults to an empty array with no `default` case — adding a provider compiles clean and silently syncs nothing (5); LinkedIn and Google Business org/location lookups loop sequentially with no `res.ok` check, pushing `id:"undefined"` records into the account picker on any single failure (6); `meta-ads.ts`'s `metaPost` never checks `res.ok` — unlike its sibling `facebook.ts` — risking ad spend against `campaign_id: undefined` (7); bulk-import media validation fires up to 500 concurrent outbound HEAD requests with no concurrency cap (8); Claude model id hardcoded at 5 of 11 call sites instead of using the existing `CLAUDE_MODEL` export — a future model upgrade silently leaves 5 services behind (9); the 3-attempt retry loop duplicated a 3rd/4th time within the services-adjacent worker/route layer (10); 7 near-duplicate OAuth authorize/token-exchange implementations, two of which differ by exactly one line (`youtube.ts` vs `google-business.ts`) (11); the highest-risk untested modules are `social/provider/zernio.ts` (the actual publish path, with 3 documented past-incident recovery branches and zero tests) and 4 others (12).

### LOW (13–18)

2 fetches with no timeout despite a `TIMEOUT_MS` constant existing right next to one of them (13); default (string) `.sort()` on numeric timestamps, correct today only by digit-count coincidence (14); a second hand-rolled S3 client duplicating `lib/s3.ts`'s existing helper (15); 106 lines of `React.createElement` because a file is `.ts` not `.tsx` (16); crisis detection fails open in two places with inconsistent/absent logging on a safety-critical, product-marketed feature (17); two fields hardwired to always-empty with no comment distinguishing "not implemented" from "no data found" (18).

### Explicitly clean

`services/notifications/*` called out as "best code in the layer" — genuine Open/Closed design. `services/social/provider/*` correct Strategy pattern with compile-enforced exhaustive maps. `services/posts/bulk-import.ts` well-factored, DI-friendly, thorough tests, correctly handles Feb-30 rollover. The Slack/email HTML-escaping "duplication" is flagged as explicitly correct, not a defect (different platforms decode entities differently). Prompt-injection hygiene via `neutralizeFenceCloser` is consistent and complete across all 9 services touching untrusted text, with distinct tags per section. Idempotency handling (stable request IDs, stable BullMQ jobIds, reply keys derived from id+text) is called out as unusually rigorous.

### Suggested order

1. Finding 1 (repurposer truncation, active data loss) → 2. Finding 7 (`metaPost` res.ok, guards real ad spend) → 3. Finding 5 + 13 (one-liners) → 4. `provider/zernio.test.ts` before any refactor of the publish path → 5. Findings 2+3+9 (consolidate AI platform maps, JSON parsing, model constant) → 6. Findings 6, 8, 11 → 7. remaining LOW cleanup.
