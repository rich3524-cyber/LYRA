# Phase 3: Testing & Documentation Review

**Date:** 2 Aug 2026 · **Scope:** Full LYRA codebase, as defined in `00-scope.md`

---

## Test Coverage Findings

**Counts: 4 Critical · 6 High · 5 Medium · 3 Low**

### Executive summary

LYRA has 7 test files, 37 tests, ~344 lines of test code against ~30,000 lines of application TypeScript (~1.1-1.4% of LOC), confirming the Phase 1 estimate. Every one of the 37 tests is a pure-function unit test with zero mocking — there is no integration test, no route-handler test, no database test, and no end-to-end test anywhere in the repository. The tests that exist are genuinely well-written (meaningful assertions, real edge cases like XSS escaping and CSV injection), which makes the gap worse, not better: this team clearly knows how to write a good test and simply hasn't reached for one on the code that matters most. Most damning: **`npm test` is never invoked anywhere in CI** — `.github/workflows/deploy.yml` runs lint, typecheck, and build only — so the 37 existing tests are currently decorative; a developer could delete `lib/oauth-state.ts` entirely and every CI check would still pass. Every file this review's own Phase 1/2 flagged as a live incident source or a Critical/High security or performance finding — the Stripe webhook, the post-publisher's double-publish/dead-retry fix, the CSRF-critical OAuth state signer, the SSRF-vulnerable scraper, the 4-of-66 role-gating files, the `sync-metrics` cron, and both flagged `Promise.all` batch sites — has exactly zero test coverage.

### CRITICAL

- **T1** — `npm test`/`vitest run` is not invoked anywhere in `.github/workflows/deploy.yml` (jobs: `lint-and-typecheck`, `build`, `deploy-workers`). The 37 existing tests provide no actual regression protection in the shipped pipeline. Fix: add a `test` job that `build` (and `deploy-workers`) depends on — a ~15-minute change with outsized leverage, since it converts every future test the team writes from aspirational to enforced.
- **T2** — `app/api/stripe/webhook/route.ts` (229 lines) has zero tests despite two documented live billing incidents in its own inline comments (a `trend_addon` subscription silently downgrading a paying agency to STARTER; a `checkout.session.completed` handler that updated `Agency.plan` but left workspaces untouched, plus silently created a duplicate workspace). The idempotency mechanism's own error-swallow (`.catch(() => {})` on the compensating rollback-delete) — flagged separately in Phase 2 Security — is also untested. Full mocked-Prisma/Stripe test suite provided in the source report covering the metadata-less-downgrade regression, the idempotency duplicate/error paths, and the workspace-sync-on-checkout regression.
- **T3** — `workers/post-publisher.worker.ts` (118 lines) has zero tests despite documented double-publish and dead-retry incidents fixed via a compare-and-swap claim + inline DB-update retry loop that must never throw. Requires extracting the processor out of the `new Worker(...)` closure into an exported, dependency-injectable function first (see T11) — that extraction is independently valuable for reviewability, not just testing.
- **T4** — `lib/oauth-state.ts` (46 lines), the sole CSRF defense for every social OAuth connect flow, has zero tests, while its structural twin `services/social/webhook-verify.ts` has 6 (covering exactly the edge cases — tampered value, wrong length, malformed input without throwing — that `oauth-state.ts` needs and lacks). `verifyState`'s expiry check (`MAX_AGE_MS`) is a code path with no equivalent precedent anywhere in the suite. Near-direct port of the sibling suite recommended, plus expiry-boundary cases.

### HIGH (6 total)

- **T5** — The only 4 files in the codebase that implement the RBAC role checks Phase 2 found missing from 62 of 66 routes have no tests proving the checks work, and there is no mechanical guard against route #67 shipping without one. Recommends both per-file predicate tests and a repo-wide static test that fails CI if a new mutating route ships with no role-check reference.
- **T6** — SSRF-critical logic is untested: `lib/safe-fetch.ts` (built specifically to fix the SSRF gap) has no tests for its redirect-hop re-validation, and `services/brand-intelligence/scraper.ts`'s duplicate `assertSafeUrl()` check is untested despite being pure and deterministic.
- **T7** — `app/api/cron/sync-metrics/route.ts`'s ~200-sequential-call loop has untested per-item failure isolation and zernioPostId/platformPostId fallback logic; no load/timing test exists anywhere in the suite that would have caught the Phase 2 Critical finding (near-certain function-timeout ceiling breach) before production.
- **T8** — Both `Promise.all` (not `allSettled`) partial-batch-failure sites Phase 1/2 flagged (`comment-monitor.worker.ts`'s AI-response enqueue, `crisis-alert-email.ts`'s multi-recipient send) are untested. Notably, `crisis-alert-email.test.ts` already exists and is thorough for the pure HTML-building function — but stops just short of testing `sendCrisisAlertEmail` itself, the function containing the actual fan-out, creating false confidence that this file is well-covered.
- **T9** — `vitest.config.ts`'s `include: ['**/*.test.ts']` confirmed to exclude any future `.test.tsx` file, compounded by `environment: 'node'` (no jsdom) — meaning there is currently no way to write a passing component test in this repo without also reconfiguring the test environment. Zero `.test.tsx` files exist today so this hasn't yet caused a silent failure, but `components/` is large and untested.
- **T10** — No coverage tool is installed (`@vitest/coverage-v8` absent, no `coverage` script) — the "~1.1-1.4%" figure in this and the prior report is a manual estimate the team cannot see in CI, and there is no way to gate a PR on a coverage floor.

### MEDIUM (5 total)

Job processors in all 5 BullMQ workers are baked directly into `new Worker(...)` closures, making them structurally untestable without an extraction refactor (a prerequisite for T3/T8's recommended tests); BullMQ retry/backoff config values (`attempts: 5`, exponential backoff — load-bearing for the T3 dead-retry fix) have no test pinning them, so a future refactor could silently weaken retry behavior; all 7 existing tests target pure functions with zero I/O, meaning the team's testing instinct has never yet been applied past the "easy" boundary — the T2/T3 mocked-Prisma examples are offered as the template for that first step; the two auth-bypass gaps Phase 2 found by manual code reading (`seo/connect` discarding its own auth check, `upload/presign`'s conditional tenant check) have no test that would have caught them mechanically; `middleware.ts` itself has no tests.

### LOW (3 total)

No test-DB/integration-test scaffolding exists anywhere (no docker-compose, no `.env.test`), consistent with the 100%-pure-unit-test pattern above; no documented test file convention exists (fine at the current 7-file scale, worth revisiting as volume grows); the two provider mapper test files (`mappers.test.ts`, `platform-map.test.ts`) test well-formed and cleanly-missing-field inputs but not malformed third-party API data (e.g. a non-parseable date string), worth a couple of adversarial cases given these sit directly on the boundary with external data.

---

## Documentation Findings

**Counts: 4 Critical · 3 High · 3 Medium · 1 Low**

### Executive summary

Documentation here splits into two very different tiers of trustworthiness. `LYRA-Handover.md` — an internal, disciplined, dated changelog with commit-hash and file:line citations — is largely accurate; it correctly documents LYRA Trend as fully stubbed. By contrast, the two documents an actual prospect or paying customer would see — `docs/LYRA-Demo-Reference-Guide.html` and the in-app Help pages — contain fabricated feature descriptions that read like pre-implementation design specs rather than records of shipped code. The most serious: **LYRA Trend**, a paid billed add-on, is described in both documents in granular working detail (a two-stage Perplexity/Claude discovery pipeline, a scored Trend Hub, one-click composer integration) as a flagship differentiator, while every backend file behind it (`services/trends/trend-syncer.ts`, `workers/trend-sync.worker.ts`, all three `/api/trends/*` routes, `components/lyra/trends/trend-hub.tsx`) is an empty stub or returns HTTP 503 — meanwhile Stripe checkout and billing fulfillment for this add-on are fully live, so customers can be actively charged for a non-functional feature. A fifth instance of the fictional-feature class the prior week's manual audit found and fixed four of (client onboarding links, team invitations, per-event notification preferences, AI credit allowance) survived: a fabricated "Approval notifications" toggle in `section-10-settings.tsx` that directly contradicts an honest, correct statement in `section-06-compose.tsx` in the very same Help document. A related self-contradiction: the same settings file separately claims Crisis Aware email alerting is merely "planned" in one paragraph, while correctly describing it as shipped and live 70 lines later — a stale note never removed when the feature landed. Beyond accuracy: `README.md` is unmodified `create-next-app` boilerplate with zero project-specific content (no Auth0, no Prisma/Supabase, no BullMQ/Railway, no cron-job.org dependency, no env vars); the one API reference table that exists covers under half of the 66 real routes and omits the single most operationally critical one (`/api/cron/publish-due-posts`); there is no architecture documentation (no ADRs, no diagrams) and no real migration ledger — schema history lives only as prose inside a 300KB+ changelog.

### CRITICAL

- **C1** — `README.md` is 100% unmodified Next.js boilerplate. Zero mentions of Auth0, Prisma/Supabase, the cron-job.org dependency, Railway workers, BullMQ/Redis, or any required env var. Anyone landing here first — a new contributor, an auditor — gets nothing.
- **C2** — `docs/LYRA-Demo-Reference-Guide.html` (lines 412, 431, 434, 500-501, 662, 678-682, 801-802, 887-888) sells LYRA Trend as one of three reasons "LYRA exists," with a dedicated demo walkthrough, a feature card, and an objection-handling script — describing a working two-stage AI discovery/scoring pipeline. Every backend file is confirmed a stub or a 503 (cited above). Billing is real and live: a customer can be actively charged today for this non-functional add-on.
- **C3** — `components/lyra/help/section-13-trends.tsx` (full 142-line file) is the customer-facing version of C2 and arguably worse since it's in-app product documentation, not a sales aid: step-by-step activation instructions, a documented relevance-scoring rubric ("scores above 75 are strong fits"), dismiss/refresh mechanics with a stated rate limit — none of it real.
- **C4** — `section-10-settings.tsx:128-132` describes a fictional "Approval notifications" toggle with configurable reminder frequency; zero matches for any such field project-wide (`grep` confirmed, `Workspace` model has no such field), and it directly contradicts `section-06-compose.tsx:208-211`'s correct, honest statement that no such notification exists — two sections of the same Help document making mutually exclusive claims.

### HIGH (3 total)

- **H1** — `section-10-settings.tsx:94-98` claims Crisis Aware email alerting is merely "planned," directly contradicted by the same file's own correct description 70 lines later (174-181) and by the shipped, live `services/notifications/crisis-alert-email.ts` (built 23 Jul, verified working by live test this week). A stale note that was never removed when the feature shipped.
- **H2** — `LYRA-Handover.md`'s environment-variable reference table (lines 2141-2180) is missing `RESEND_API_KEY` (required by `lib/resend.ts`, used by the shipped Crisis Aware email alert) and both `STRIPE_CRISIS_AWARE_PRICE_ID`/`STRIPE_CRISIS_AWARE_ANNUAL_PRICE_ID` (required by `crisis-aware-checkout/route.ts`) — a fresh environment provisioned strictly from this table would throw on both features, despite the same document's own changelog narrative correctly recording both as shipped.
- **H3** — `LYRA-Handover.md` §6.8's API route table documents ~30 of the real 66 routes. Most notably absent: `/api/cron/publish-due-posts` — the single route that actually publishes scheduled content — compounding Phase 1's finding that this route has no trigger declared anywhere in the repo; it's now also invisible in the one document meant to enumerate what exists. All Crisis Aware, Trend, and several billing/email/comment routes are similarly undocumented.

### MEDIUM (3 total)

`docs/LYRA-Wishlist.md` — the one document explicitly designed to track shipped-vs-not status — has zero mention of LYRA Trend in either sense, a gap distinct from (and compounding) C2/C3's false-positive claims; no architecture documentation exists anywhere (no ADRs, no diagrams — the per-feature `docs/superpowers/specs/*.md` files are good practice but not a substitute for a system-level view, and the closest thing, `LYRA-Handover.md` §6.9's plain-text relationship list, is itself already slightly stale); no migration ledger exists — schema history lives only as freeform changelog prose, an explicit and self-aware tradeoff documented in at least one implementation plan, but one that makes "what changed and when" unreconstructable without grepping a 300KB+ narrative document.

### LOW (1 total)

Neither the Demo Guide nor the Help docs carry any freshness/provenance marker distinguishing a paragraph verified against shipped code from one carried over from a pre-implementation design spec (which is almost certainly how the Trend content in C2/C3 was produced) — `LYRA-Handover.md`'s consistent "confirmed live" + file:line citation discipline is exactly the practice that kept it accurate where the customer-facing docs weren't, and is recommended for adoption there too, at minimum for any paid or headline feature claim.

---

## Cross-reference notes

- Both 3A and 3B independently re-confirmed multiple Phase 1/2 carry-over claims directly against source rather than repeating them on faith (the 37-test/1.4%-LOC figure, the oauth-state/webhook-verify test-coverage asymmetry, the SSRF scraper's non-adoption of `safe-fetch`, the `sync-metrics` sequential-call pattern, and the LYRA Trend stub status all independently verified with fresh file reads).
- 3B's LYRA Trend finding (C2/C3) is the same underlying issue as Phase 1 Code Quality C1 / Architecture C2, now confirmed from the documentation-accuracy angle rather than the code-correctness angle — three independent reviewers across two phases have now separately found and flagged this, which is a strong confidence signal on both the severity and the fix priority.
- 3B's discovery of a fifth fictional-feature instance (C4, the "Approval notifications" toggle) means the "audit every Help doc claim against code" work done earlier this week was incomplete — Phase 4/5 should note this as a pattern (documentation drift recurring even after a dedicated cleanup pass) rather than a one-off.
