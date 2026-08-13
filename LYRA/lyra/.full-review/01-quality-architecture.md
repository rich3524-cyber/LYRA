# Phase 1: Code Quality & Architecture Review

Full raw agent output preserved at `01a-code-quality-raw.md` (5 reports: top-level + workers/lib + components + API routes + services) and `01b-architecture-raw.md` (2 reports: top-level architecture + data-model/cross-cutting). This file is the consolidated, severity-ranked summary the orchestrator spec calls for.

## Code Quality Findings

**Overall assessment:** well-above-average codebase. Sophisticated concurrency handling (atomic claims, idempotency keys, dedupe keys), exceptional "why"-focused commenting, zero `TODO`/`FIXME`/`@ts-ignore`, zero `as any` in production code, clean `tsc --noEmit`. The dominant failure mode is **consistency and drift**: correct abstractions get built (`lib/validate.ts`, `lib/platform-labels.ts`, `lib/plan-access.ts`, rollback helpers) and then adopted by only 5-20% of the call sites that should use them, leaving safe and unsafe copies of the same logic side by side.

### Critical
- **Third copy of the safety-critical comment-reply rollback is unhardened** (`app/api/mcp/respond-to-item/route.ts:269-272`) — the other two copies (worker, reply route) have a 3-attempt retry + draft preservation; this one has neither, and a failed write here can leave a comment permanently stuck `RESPONDED` with no reply sent.
- **No `unhandledRejection`/`uncaughtException` handler on the worker fleet** (`workers/index.ts`) — combined with Railway's `restartPolicyMaxRetries = 3`, one unhandled rejection anywhere across the 7 workers can permanently kill the entire fleet (publishing, AI responses, all sync) until a human notices. At least 2 identified live code paths can trigger this today.

### High (selected — full list in raw files)
- Only 5/82 routes use the existing `parseBody` zod helper; 35 use unguarded `req.json() as T`, turning malformed input into 500s instead of 400s with no bounds checking.
- Auth failures are signaled by matching the literal string `'Unauthorized'` in 80 places — brittle, any unrelated error with that message is misclassified as a 401.
- 6 competing `PLATFORM_LABELS` maps; 3 are missing platforms and render raw enum values to customers (e.g. `"YOUTUBE"` shown literally in the inbox).
- `metrics-sync` worker swallows all errors into a "completed" job — configured retries never fire; a stable-jobId bug independently means metrics silently stop syncing per-post for any tenant under ~200 posts, for days or forever.
- `comment-monitor` worker is not idempotent — a retry after a partial failure actively **destroys** unprocessed work (AI response + crisis detection both silently skipped) rather than resuming it.
- `brand-sync` worker can overwrite a good, previously-built brand profile with a hallucinated one from empty input on a swallowed scrape failure.
- A streaming caption-generation parser (`content-repurposer.ts`) silently truncates every generated caption at the first chunk boundary — reproduced directly, hides well because the *count* of generated posts is correct, only the content is cut short.
- 3 parallel per-platform AI capability maps, all missing the same 4 platforms, all with silent fallback to generic advice.
- 3 cron routes have no try/catch at all; the approval-SLA sweep aborts its whole batch mid-loop on one throw, silently orphaning already-claimed posts.
- Post status update and its `PostApproval` row are separate unwrapped writes — failure between them leaves a post `PENDING_APPROVAL` with no approval row, invisible to the SLA sweep (this is the same class of bug fixed once already on 2026-08-12, per Handover).
- Calendar never checks `res.ok` on its posts/campaigns fetch — a 401/403/500 renders as a false "empty calendar," not an error.
- The MIME-type-allowlist prototype-pollution fix (`Object.hasOwn`, closing a `"constructor"` bypass) reached only 1 of 3 duplicate copies of that allowlist.
- Workspace timezone is documented as governing calendar/composer display and isn't implemented anywhere except one bulk-import table — every other display site uses browser-local time, which can misfile a post to the wrong calendar day entirely for cross-timezone agency/client pairs.
- `post-detail-panel.tsx` is 671 lines carrying 4 unrelated responsibilities including a full paid ad-boost purchase flow.

### Medium / Low
Extensive — see raw files. Recurring theme: duplicated status/color/label maps, `sessionStorage`/LLM-JSON parsing without guards in ~8 places, double-submit-capable handlers with no in-flight guard, multi-write routes without `$transaction` (12 routes), magic numbers with no shared vocabulary in the worker fleet, dead code (4 Trend feature stubs, an unused `Review` model end-to-end including its own test).

## Architecture Findings

**Overall assessment:** Good component-level design exists (`services/social/provider/` is a textbook Strategy pattern, `services/notifications/` a clean vertical slice) but the system-level structure has one dominant defect: **`services/` is not the domain layer it's named as** — 113 of 130 Prisma imports live in `app/` (route handlers and pages), so business rules live in HTTP handlers where the only way to reuse one is to copy it. This is the root cause of most Critical/High findings below.

### Critical
- **The post-lifecycle state machine has 4 independent implementations, no owner.** Each has its own code comments recording real divergences already found and fixed post-shipping (the self-approval deadlock fix had to land in 2 files; a missing-`PostApproval`-row bug was independently fixed twice in two sessions because the second copy wasn't known about).
- **Multi-tenant authorization has no shared primitive.** Two incompatible idioms across 65 routes + 16 pages — the identical authorization failure returns 403 in 25 files and 404 in 40. Role policy has 4 separate vocabularies including `OWNER_ROLES` redeclared 6 times with 2 different type signatures. **36 of ~72 mutating routes apply no role check at all**, including ad-spend and public-reply routes. A live gap: `app/api/seo/connect/route.ts` performs zero tenancy check before starting an OAuth flow naming an arbitrary workspace — contained today only by the callback route re-checking.
- **`services/` is not the domain layer; `app/` is.** 8 named routes each carry 60+ lines of business logic (161-299 LOC) with no unit test that isn't an HTTP-mocked-Prisma test.
- **`Agency.plan` defaults to the most expensive tier (`AGENCY`)** while `Workspace.plan` correctly defaults to the cheapest (`STARTER`) — opposite fail directions on the two entitlement columns.
- **Live, traced, verified billing defect:** `/onboard?plan=<anything-unrecognized>` charges the Pro price but writes the *unresolved* raw param into Stripe metadata; the webhook correctly no-ops on the unrecognized value, leaving the agency on its default plan — which, per the finding above, is the most expensive tier. **Net effect: customer pays Pro price, receives Agency-tier entitlements**, with only an unlogged-by-default trace. The param is user-editable in the URL.
- **The test suite does not gate deployment.** Netlify and Railway both auto-deploy via their own GitHub integrations, in parallel with (not after) the CI test job — a red test currently has zero effect on what ships to production. No branch protection exists. (Zero-code fix: enable it.)
- **`checkCronAuth`, the sole protection on all 6 public cron endpoints, is completely untested** — including its fail-closed and timing-safe-comparison branches.

### High (selected — full list in raw files)
- Entitlement layer remains bypassable: `lib/plan-access.ts`'s `hasCrisisAwareAccess()` exists and is correctly used in 2 routes — but not in the one route that actually flips the paid `crisisAware` flag, which still hand-checks `plan === 'STARTER'`. Same bug the 2026-08-02 review already reported; the fix built in response was never wired into the route that needed it.
- The one manual "Publish now" route has no atomic claim (unlike the worker and MCP paths), enabling a race with the cron that can double-publish.
- Schema/database drift is real and already verified by direct SQL audit, not speculative: `NotificationChannel`'s relation has no `onDelete` in the schema file (defaults to Restrict) while the live hand-applied migration used `CASCADE` — workspace deletion works today only by accident of a constraint the schema file doesn't know about.
- Only 11/30 relations declare `onDelete`; the resulting hand-written cascade-delete chains are missing 9 tables. `Comment.workspaceId` — the most security-critical column in the schema — has no foreign key at all. Zero Postgres RLS anywhere; isolation is 100% application-level.
- `SocialProvider` abstraction covers half its domain; OAuth has no interface at all (6 near-identical copies force a 7x `import *` fan-out in the callback route).
- No error taxonomy, no dead-letter queue, no alerting anywhere in the codebase — a revoked platform token retries identically to a transient error, indefinitely.
- No reconciler for posts stranded in `PUBLISHING` status (a crash, shutdown-timeout, or exhausted-retries can each produce this; one has occurred in production).
- Analytics is computed twice from different metric fields in two different routes and can show different numbers to the same customer for the same period.
- No validated config module: 64 non-null env assertions, 21 unguarded template-literal interpolations that render literally as `"undefined"` and return HTTP 200. **Confirmed currently occurring**: Klaviyo credentials are undocumented and unset, so every paying signup is silently dropped from the marketing list today.
- No canonical workspace-access guard — the identical Prisma predicate is hand-copied ~30 times; `lib/authz.ts`'s own header comment already documents the exact prior incident this duplication pattern caused, and the pattern itself was never fixed.
- Comment ingestion and the reply-rollback state machine each exist independently 2-3 times and have **already, verifiably diverged with real consequences** — one divergence caused a live confirmed incident (2026-07-22) where the AI drafted a reply to its own reply; a second means the newest of the 3 rollback copies (MCP route) silently reopens a double-post risk the mechanism exists to prevent.
- The entire billing state machine (26 Prisma ops, 4 nested transactions) lives inside the Stripe webhook route with no `services/billing/` module; a founding-member-slot allocation inside it is not actually race-safe under Postgres's default isolation.
- `prisma/schema.sql` is a 3-month-stale, 13-of-28-table file whose first line is `DROP TABLE ... CASCADE`, sitting in the repo with an instruction comment to run it in the Supabase SQL Editor.
- Account deletion 500s for any user who authored a post in a workspace they don't own, due to a `RESTRICT` FK the deletion route's scope doesn't account for — breaks the GDPR delete-my-account path for the common multi-person-workspace case.
- Missing indexes on the hottest query shapes, including one that causes a full cross-tenant table scan on the crisis-alert-email path specifically.
- Three competing/stale scheduler declarations (`vercel.json`, `Dockerfile.worker`) describing a deployment model that is no longer true, now that this session's own Railway cron migration has landed.

### Medium / Low
Extensive — see raw files. Recurring themes: 5 incompatible API error-response shapes; zod adopted at only ~6 of 50 body handlers; no shared frontend API client (67 raw `fetch()` calls); `Json` columns with no shared types (`postingPatterns` alone has 5 sites assuming 4 different shapes); a fully-built, fully-tested, zero-caller `Review` feature; ESLint is accidentally linting the `.netlify/` build directory, inflating a reported "762 pre-existing errors, non-blocking" CI carve-out to a number that doesn't reflect the real ~8-in-source backlog (worth revisiting — the actual gate may be nearly free to turn on).

## What has genuinely improved since the 2026-08-02 review

Recorded because it demonstrates the extraction pattern works when followed through: a real migration baseline now exists with honest documentation; `platform-labels.ts` consolidated ~9 duplicate files (though since re-forked 3 times by newer code — see above); workspace plan limits are now enforced; `checkCronAuth` was consolidated and made timing-safe; the publish worker gained a genuine compare-and-swap claim; graceful worker shutdown was added; 4 new `Post` indexes landed; rate limiting went from 3 routes to 23; `EmailIntegration.apiKey` is now encrypted. `services/notifications/` and `services/posts/bulk-import.ts` — both built recently — are cited repeatedly by both reviewing agents as the internal model of what "done right" looks like here.

## Critical Issues for Phase 2 Context

Flagging explicitly for the Security & Performance review, since these were found by the quality/architecture pass but are squarely security- or performance-relevant:

- **Live billing defect** (`/onboard?plan=`) — pricing/entitlement mismatch, user-controlled query param, real revenue impact. Security review should independently verify and assess exploitability/blast radius.
- **Multi-tenant authorization gaps** — 36 of ~72 mutating routes with no role check; a route with zero tenancy check at all (`seo/connect`); 403-vs-404 inconsistency across the tenancy check itself. This is the single most security-critical finding in this phase and warrants independent adversarial verification in Phase 2, not just architectural note-taking.
- **`Comment.workspaceId` has no FK** and 4 tables have no tenant column at all, reachable only by join — worth Phase 2 checking whether any current or near-future query pattern could actually cross tenant boundaries as a result, even though this pass found today's write paths keep it safe in practice.
- **No config validation** — confirmed-live silent data loss (Klaviyo signups) is a symptom; Phase 2 should check whether any of the 64 unguarded env reads gate something security-relevant (e.g. encryption key, webhook secrets) rather than just correctness.
- **Missing indexes causing a full-table cross-tenant scan** on the crisis-alert path — directly relevant to Phase 2's performance pass.
- **Test suite doesn't gate deployment**, and the primitives with zero tests are exactly the security-critical ones (`checkCronAuth`, `authz.ts`, `plan-access.ts`, `encrypt.ts`) — Phase 2's security pass should treat "untested" as elevated risk for these specific modules regardless of whether the code itself looks correct on read.
