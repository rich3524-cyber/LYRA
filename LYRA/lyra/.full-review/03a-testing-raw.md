# Step 3A — Test Coverage & Quality Analysis (raw agent output)

# Test Coverage & Strategy Review — LYRA Codebase (2026-08-13)

## Methodology

Verified directly against the repository rather than assumed: full inventory of `*.test.ts` files, `vitest run` execution (49 files / 457 tests, all passing, 2.6s), line-by-line reads of every file named in the prior-phase findings and its corresponding test file (or absence thereof), and a route/component/service/worker coverage sweep by diffing implementation files against their `*.test.ts` siblings.

**Test stack**: Vitest only (`environment: 'node'`, no jsdom/happy-dom). No `@testing-library/react`, no Playwright, no Cypress, no coverage reporter (`@vitest/coverage-*` absent from `package.json`, `npm test` = `vitest run` with no `--coverage` flag). **This means the suite is structurally incapable of rendering a React component** — there is no DOM environment configured at all.

---

## Section A — Verification of Prior-Phase Findings

### 1. Billing/entitlement bypass — CONFIRMED, and worse than framed

`app/onboard/page.tsx` has **no test file at all**. Reading the code confirms the exact mismatch: line 25 resolves `priceId` via the fallback-to-Pro logic (defends the *charge*), but line 55 sets Stripe metadata to the raw unvalidated param, not the resolved key. Critically: **`route.test.ts` for the Stripe webhook has zero tests for `checkout.session.completed`** — a grep for `checkout.session` in the test file returns no matches; every existing test exercises `customer.subscription.updated`/`.deleted` only. The handler containing the actual bug (~40% of the switch statement) has 0% test coverage of any branch, not just the unresolvable-plan one.

**Severity: Critical.** Two independent, complete coverage gaps (no `onboard/page` test, no `checkout.session.completed` test) both needed to exist simultaneously for this to ship, and both do.

### 2. MCP OAuth account-takeover chain — CONFIRMED across all three components

- `app/api/oauth/register/route.ts`: strong test suite (13 cases) but no test (and no code) restricting registration to a known host allowlist.
- `lib/jwt-verify.ts`: excellent adversarial coverage, but **no test asserts anything about the `scope` claim** — consistent with the underlying code doing no such check.
- `lib/auth.ts` `getCurrentUser()`: the test suite explicitly proves, by design, that a bearer token authenticates on every route calling `getCurrentUser()`, not an MCP-scoped subset — the architectural exposure is confirmed by a passing test, not hypothetical.

**Severity: Critical.** No test anywhere in the suite would fail if scope enforcement were added or removed — a regression (or a fix) here is currently invisible to CI either way.

### 3. Prompt-injection gap in `voiceSummary` — CONFIRMED

`services/ai/response-generator.test.ts` contains exactly two describe blocks, both pure text-matching helpers. **There is no test at all for the prompt-construction function** that interpolates `voiceSummary` alongside comment content/author. Reading the source confirms the exact asymmetry: comment content/author both pass through `neutralizeFenceCloser`; `voiceSummary` doesn't. `voiceSummary` is writable via the unauthenticated `PATCH /api/onboarding` route, which also has zero test coverage — the two gaps compound.

**Severity: High**, confirmed. No test — positive or negative — exercises the prompt-building function.

### 4. Unbounded media re-hosting in bulk-import commit — CONFIRMED

The commit route's test suite (17 tests) has decent branch coverage of business logic but every media test uses a 4-byte mock body with fully-mocked `safeFetch` — none exercises a large body, a slow/hanging response, or concurrency behavior. Confirmed the underlying implementation genuinely lacks a timeout (`safeFetch` has no `AbortSignal`) and a byte-size cap — these aren't just untested, the controls don't exist to test.

**Severity: High/Critical**, confirmed. Two missing controls (size cap, concurrency/timeout), neither exercised anywhere.

### 5. Zero-test security primitives — CONFIRMED for all four

No test file exists for `lib/authz.ts` (canWrite, APPROVER_ROLES), `lib/plan-access.ts` (hasCrisisAwareAccess), or `lib/encrypt.ts` (AES-256-GCM round-trip/tamper-detection/key-validation). `checkCronAuth` in `lib/auth.ts` has no dedicated coverage — `lib/auth.test.ts` exists and is well-written but never imports or references it.

**Fresh extension of this finding**: all 6 cron route files also have no test files of their own — so the missing-coverage chain is `checkCronAuth` (untested) → every route consuming it (also untested) → nothing in the suite would catch either a broken timing-safe comparison or a route that forgot to call it at all.

**Severity: Critical**, confirmed and broadened.

### 6. CI does not gate production deploys — CONFIRMED

`.github/workflows/deploy.yml`'s own trailing comment confirms it directly: both Netlify and Railway auto-deploy via their own native GitHub integrations, independent of the `test`/`build` jobs in the workflow, and a redundant Railway-CLI deploy step was previously removed specifically because it always lost the race to the native integration. Also worth noting: `lint` in the same workflow already runs with `continue-on-error: true` (762 pre-existing lint errors), so lint failures are non-blocking by design on top of the deploy-gating gap.

**Severity: High**, confirmed. Every finding above — however well or poorly tested — has no automated backstop preventing it from reaching production even if a regression test existed and failed.

---

## Section B — Fresh Findings

### B1. Route-level test coverage is ~25%, with the highest-risk category (cron) at 0%
**Severity: High.** 85 route.ts files, 21 have a test sibling (~25%). Untested and concerning: all 6 cron endpoints; `app/api/onboarding/route.ts`'s PATCH (the entry point for finding #3, zero tests of any kind); `crisis-aware-checkout`/`trend-checkout` (two more billing-adjacent routes, alongside the main checkout flow already flagged); all of `notification-channels/**`; every social-platform OAuth/webhook callback except `social/connect/[platform]`; `upload/route.ts` and `upload/presign/route.ts` (only their two closest siblings are tested).

### B2. Component/UI layer: no rendering tests exist, and the tooling can't produce one
**Severity: High.** 104 `.tsx` files under `components/`; only 2 have any associated test, and both are `.test.ts` (not `.tsx`) testing pure exported helper functions colocated with the component, never the component itself. No `@testing-library/react` dependency, and `vitest.config.ts` sets `environment: 'node'` (no jsdom/happy-dom) — `render()` on any component would fail outright today; the infrastructure to write one doesn't exist. The drag-and-drop calendar, composer, and approval-workflow UI have zero regression protection beyond manual QA.

### B3. Services and workers: meaningful but partial coverage, gaps in scheduled/background jobs
**Severity: Medium.** `services/`: 54 files, 14 tested (~26%). `workers/`: 9 files, 4 tested — untested includes `brand-sync.worker.ts`, `competitor-monitor.worker.ts`, `notification.worker.ts` (notable since `services/notifications/*` is comparatively well tested, but the worker that actually dequeues and dispatches those notifications has no coverage of its own retry/failure semantics), `trend-sync.worker.ts`.

### B4. No E2E/integration-against-real-stack layer at all
**Severity: Medium.** Unit-only plus one genuine integration test (`lib/safe-fetch.integration.test.ts`, spinning up a real local HTTP server to verify undici's DNS pinning is actually honored — a well-justified, narrowly-scoped exception worth replicating elsewhere). No Playwright/Cypress, no test hitting a real Postgres via Prisma, no test exercising the full HTTP cycle through Next.js routing. Multi-tenancy isolation is asserted only at the unit level via mocked Prisma calls — no test would catch a syntactically-present-but-semantically-wrong `where` clause against a real schema.

### B5. No coverage measurement or threshold enforcement
**Severity: Medium.** No `--coverage` flag, no coverage dependency, no threshold gate anywhere. The ~25% route / ~2% component / ~26% service figures above are invisible to anyone unless manually computed (as done for this review) — coverage can silently erode further with no signal.

---

## Section C — Test Quality Assessment (where tests exist)

**Where tests exist, they are unusually good** — this is the genuinely positive counterpoint to the coverage gaps. Tests consistently assert on observable outcomes rather than internals, with comments explaining *why* a case matters. `lib/safe-fetch.test.ts` is exemplary (23 adversarial cases covering every private/reserved IP bypass vector, DNS-rebinding TOCTOU, per-hop redirect re-validation) — its blind spot (no timeout/size cap tests) is a code gap, not a test-writing gap. `app/api/oauth/register/route.test.ts` / `lib/jwt-verify.test.ts` have strong edge-case discipline. `app/api/stripe/webhook/route.test.ts` has good idempotency/compensating-failure coverage — the gap there is pure scope (one whole event type untested), not quality. Mocking discipline is consistent (module-boundary `vi.mock`, uniform `beforeEach` clearing, no shared-state leakage). No flaky-test indicators — 457 tests, deterministic, 2.6s, no skipped/`.only` left in the tree.

**The pattern across every gap in Section A is not "badly tested" — it's "not tested at all."** This looks like scope/time pressure (new features and security-critical primitives shipping without a corresponding test task) rather than a team that doesn't know how to test — an easier problem to fix than a team-wide quality issue would be.

---

## Priority Punch List

| # | Finding | Severity | Effort |
|---|---|---|---|
| 1 | `checkout.session.completed` webhook handler: 0% coverage, contains the live billing bug | Critical | Small |
| 2 | `lib/authz.ts`, `lib/plan-access.ts`, `lib/encrypt.ts`, `checkCronAuth`: zero tests | Critical | Small |
| 3 | All 6 cron routes untested; only gate is the untested `checkCronAuth` | Critical | Medium |
| 4 | No test asserts JWT `scope` claim enforcement (because no code enforces it) | Critical | Blocked on security fix |
| 5 | `app/onboard/page.tsx` and onboarding PATCH: no tests at all | High | Small-Medium |
| 6 | Bulk-import media re-hosting: no size/timeout/concurrency test (no such controls exist) | High | Blocked on safe-fetch fix |
| 7 | Response-generator prompt builder: zero coverage of interpolation/fencing itself | High | Small |
| 8 | Component layer: no rendering tests possible with current tooling | High | Medium (one-time setup) |
| 9 | CI test job doesn't gate Netlify/Railway auto-deploy | High | Medium (outside repo) |
| 10 | No coverage measurement/thresholds | Medium | Small |
| 11 | 4 of 9 workers untested, notably `notification.worker.ts` | Medium | Medium |
| 12 | No E2E layer | Medium | Large, strategic |
