# LYRA — Comprehensive Code Review: Final Report

**Date:** 18 July 2026
**Scope:** Full codebase (`app/`, `components/`, `services/`, `workers/`, `lib/`, `prisma/schema.prisma`) — 63 API routes, 26 pages, 104 components, 42 service files, 7 workers.
**Method:** Two full phases completed (Code Quality & Architecture; Security & Performance), each run by multiple specialized reviewer agents with independent verification. Phases 3 (Testing & Documentation) and 4 (Best Practices & CI/CD) were **not run** — cut short given review time, per explicit direction to move to fixing. The findings below are the highest-value, most-verified portion of a full review; they are not exhaustive of every file.

**One correction to the record:** the security review's report states LYRA deploys on Vercel. That's wrong — confirmed directly and repeatedly this week via live Netlify env var management and deploys — LYRA runs on **Netlify** (app) + Railway (workers). The agent likely found a stale, unused `vercel.json`. Findings themselves are unaffected by this mistake, just the one factual aside in that report.

---

## Critical (fix now)

### C1 — `/api/upload/presign` has no workspace access check (IDOR)
**File:** `app/api/upload/presign/route.ts`
Any authenticated user of any tenant can generate a valid S3 upload URL into another tenant's media folder — the two sibling upload routes both check `WorkspaceAccess` first, this one doesn't.

### C2 — Four leftover debug routes allow cross-tenant account takeover
**Files:** `app/api/ig-test/route.ts`, `app/api/instagram/test-publish/route.ts`, `app/api/ig-permissions-test/route.ts`, `app/api/fb-subscribe-test/route.ts`
Each authenticates the caller but then grabs `prisma.socialAccount.findFirst({ where: { platform: 'INSTAGRAM', isActive: true } })` — the first matching row in the **entire database**, across all tenants — decrypts its token, and in most cases performs a real publish. Any authenticated user (any tenant) can trigger a live Instagram/Facebook post on behalf of whichever tenant happens to own the first matching account.

### C3 — SSRF with response exfiltration in the SEO on-page analyzer
**File:** `services/seo/on-page-analyzer.ts` (input from `app/api/seo/pages/route.ts`, which only does syntactic `new URL()` validation)
The analyzer fetches a user-supplied URL with zero host/scheme/IP validation, and the fetched page's title/meta/H1 are returned to the client. A workspace member can add a tracked page with `url = http://169.254.169.254/latest/meta-data/...` (cloud metadata) or an internal service address, and read the response back through the analyze API — real credential/internal-service disclosure risk.

### C4 — Non-atomic publish status transition can double-publish
**File:** `workers/post-publisher.worker.ts`
Check-then-act (`findUnique` status check, then a separate `update` to `PUBLISHING`) instead of an atomic compare-and-swap. If the same post is processed by two overlapping jobs, both can pass the check and both publish. Currently only latent (the `post-${postId}` jobId happens to prevent duplicate enqueues), but not defended at the code level.

### C5 — BullMQ Queue/Worker instances don't share a Redis connection
**File:** `lib/redis.ts` (`export const redis = getRedisConnection()`)
This exports a plain options object, not a shared `ioredis` instance — BullMQ's own instance check fails on it, so **every** `new Queue(...)`/`new Worker(...)` call across the codebase (8+ call sites) opens its own independent Redis TCP connection instead of reusing one. In the single Railway worker container this multiplies connections unnecessarily and works against the deliberate `connection_limit=1` set for the Postgres side (see H-13 below) — the app is fighting its own connection-pooling discipline in two different places at once.

---

## High (fix soon)

### H1 — Workspace delete/settings gated on membership, not role
**File:** `app/api/workspaces/[id]/route.ts`
Any workspace member — including a read-only `CLIENT_VIEW` — can `DELETE` the entire workspace or `PATCH` its settings. Three independent reviewers flagged this.

### H2 — Account deletion destroys every *shared* workspace the user belongs to
**File:** `app/api/account/route.ts`
Deletes every workspace the user has *access* to, not just ones they own. A team member or client-viewer deleting their own account destroys the whole shared workspace for everyone else on it.

### H3 — SSRF via weak regex host checks in two more scrapers
**Files:** `services/ai/content-repurposer.ts`, `services/competitors/competitor-scraper.ts`
Both use hostname-regex denylists that don't block `169.254.0.0/16` (cloud metadata), don't resolve DNS (rebinding bypass), and don't catch decimal/octal/hex IP encodings. A fourth scraper (`services/brand-intelligence/scraper.ts`) does this correctly (DNS-resolves, checks CIDR ranges) — that's the pattern to copy everywhere, including C3 above.

### H4 — `checkCronAuth` triplicated, and the "shared" version is the broken one
**File:** `lib/auth.ts` (dead, timing-unsafe) vs. 4 local copies in `app/api/cron/*/route.ts` (correct, timing-safe, but copy-pasted)
The shared library function nobody actually imports is the insecure one. A future maintainer reaching for "the shared helper" gets the wrong implementation.

### H5 — Stripe webhook has no error handling or idempotency guard
**File:** `app/api/stripe/webhook/route.ts`
No try/catch around DB writes inside the event switch; no `event.id` dedup, so Stripe's at-least-once redelivery can double-apply non-idempotent handlers.

### H6 — LYRA Trend add-on checkout silently downgrades paying customers
**Files:** `app/api/stripe/trend-checkout/route.ts`, `app/api/stripe/webhook/route.ts`
The trend subscription's metadata has no `plan` key. The webhook's plan-resolution (`toPlan(sub.metadata.plan)`) defaults missing metadata to `'STARTER'` — so a Pro/Agency customer buying the Trend add-on gets their **entire agency and all its workspaces downgraded to Starter**, while receiving no actual Trend functionality (it's unbuilt — see the Scope Document). This is a live, real billing-integrity bug, not just an incomplete feature.

### H7 — No security headers anywhere
**Files:** `next.config.ts`, `middleware.ts`
No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy on any response. No clickjacking defense on a multi-tenant dashboard.

### H8 — Prompt injection risk in the AI auto-reply pipeline
**File:** `services/ai/response-generator.ts`
Public comment content (fully attacker-controlled) is concatenated directly alongside the brand guardrails in one prompt, with no separation and no post-generation validation. In `FULL` autonomy mode, the result auto-posts publicly with no human check. A crafted comment could attempt to override the system instructions.

### H9 — Dead scheduler module with a broken cancel function
**File:** `services/scheduler/post-queue.ts`
`schedulePost()`/`cancelPost()` are never called anywhere — the real mechanism is the cron poller. `cancelPost` also has a latent id-mismatch bug (looks up `postId` where jobs are keyed `post-${postId}`) that would make it a silent no-op if it were ever wired up.

### H10 — Worker's Docker deploy path likely can't resolve `@/` path aliases at runtime
**Files:** `Dockerfile.worker`, `railway.toml`
Two declared deploy paths for the same worker aren't equivalent — the `tsc`-compiled Docker path doesn't rewrite `@/*` aliases, so compiled output likely can't `require()` its own imports; only the Railway `tsx` path (which honors tsconfig paths) actually works. One of these is a broken, unused artifact.

### H11 — Six of eight native social API clients have no request timeout
**Files:** `services/social/{linkedin,twitter,tiktok,youtube,google-business,meta-ads}.ts`, plus `services/seo/gsc-client.ts` and `lib/anthropic.ts`
A hung upstream platform holds a serverless function or worker slot open indefinitely. `zernio-client.ts` is the correct pattern (20s `AbortSignal.timeout`) — none of the native clients follow it.

### H12 — N+1 query pattern in comment ingestion, on a route polled every 1-5 minutes
**Files:** `workers/comment-monitor.worker.ts`, `app/api/comments/sync/route.ts`
Per-comment `findFirst` (dedup check) then `create`, instead of one batched `createMany({ skipDuplicates: true })` — despite a unique index already existing that makes the batched version trivial. Same pattern also has an unhandled-race variant: two overlapping jobs for the same account can both pass the dedup check and then throw an unhandled unique-constraint error.

### H13 — Serverless app and always-on worker share one `connection_limit=1` database connection
**File:** `lib/prisma.ts` / shared `DATABASE_URL`
The `connection_limit=1` setting is correct for Netlify's many short-lived serverless instances sharing a pooler — but the same URL is used by the single long-running Railway worker container, which runs 4+ BullMQ workers at combined concurrency of 20+. All of that concurrency is serialized onto one database connection, meaning the configured worker concurrency is mostly theoretical.

### H14 — Unbounded, unindexed query in the tightest cron loop
**File:** `app/api/cron/publish-due-posts/route.ts`
No `workspaceId` filter and no `take` cap on the due-posts query; neither existing index (`[workspaceId, scheduledAt]`, `[workspaceId, status]`) is usable without a `workspaceId` prefix. Runs every 1-5 minutes; degrades toward a full scan as post history grows.

### H15 — No rate limiting anywhere on the API surface
Confirmed by both the security and performance reviews independently. Every AI-generation route, the Puppeteer PDF endpoint, and the onboarding-token endpoints are reachable at unlimited frequency.

### H16 — Zero code-splitting and zero memoization across the entire frontend
**Files:** `components/lyra/analytics/*`, `components/lyra/seo/*`, all 104 components
`recharts` loads eagerly on the Analytics and SEO pages before any data is ready; no `next/dynamic` usage anywhere in the codebase; zero `React.memo` usage across all 104 components, so list-row components (comment cards, post cards) re-render on every unrelated state change.

---

## Medium and Low — summarized (full detail in source agent reports, not reproduced here)

- Unauthenticated Puppeteer PDF endpoint (`app/api/help/pdf/route.ts`) — real DoS/cost exposure, should require auth and be cached instead of regenerated on every hit
- OAuth `state` parameter isn't a real CSRF nonce (forgeable, though cross-tenant injection is separately defended)
- Post approval has no reviewer-role check — any member can self-approve their own draft
- Workspace-delete cascade gap: deleting a workspace with SEO data throws a foreign-key error because several child models aren't set to `onDelete: Cascade` and the manual delete-transaction's hand-written list has drifted out of sync with the schema
- Competitor-monitor worker is architecturally a single sequential mega-job across every tenant — adding worker replicas gives it zero speedup
- No `defaultJobOptions` on most BullMQ queues — unbounded Redis job retention over time
- Verbose/raw error messages returned to clients in several routes (mostly the same debug routes flagged in C2)
- Inconsistent 403-vs-404 convention for the same "no access" condition across ~46 call sites of two different authorization idioms
- No shared input-validation layer (no Zod or equivalent) — malformed JSON bodies throw generic 500s instead of clean 400s
- Missing pagination on `app/api/posts` and `app/api/seo/pages` GETs — unbounded historical data returned
- Raw `<img>` tags for post-media thumbnails instead of `next/image` (one has its lint warning explicitly silenced rather than fixed)
- PII (subscriber emails) logged in full in `lib/klaviyo.ts`
- A temporary debug table (`ZernioConnectDebugLog`) persists OAuth query data indefinitely; the code's own comment says to remove it once stable
- Onboarding tokens use `cuid()` rather than a cryptographically random value, with no rate limiting on the guess surface

---

## What's Already Good (don't touch / use as the reference pattern)

- The `NATIVE` vs `ZERNIO` provider seam (`services/social/provider/`) is a genuinely well-designed abstraction, consistently applied at all four intended publish/reply call sites
- `services/social/zernio-client.ts` — correct timeout, typed errors, the pattern every other HTTP client in the codebase should copy
- `app/api/zernio/webhook/route.ts` — signature verification, idempotent upsert, deliberate ack-vs-retry distinction; the reference pattern for the Stripe webhook to follow
- Cryptography (`lib/encrypt.ts`) — correct AES-256-GCM implementation, random IV per message, fails loudly rather than falling back on a missing key
- Tenancy checks are correct on the large majority of routes (~48 of ~61) — the problems are concentrated in a small, identifiable set of outliers, not systemic
- No SQL injection, no mass-assignment, no XSS sinks found anywhere
- Database indexing is generally thoughtful; idempotency-by-construction on webhook-ingested `Comment`/`Review` records via unique constraints

---

## Recommended Fix Order

Given the volume, fixing literally everything in one sitting isn't realistic. Recommended grouping:

**Group 1 — Critical, fix now (small, isolated changes, high impact):** C1, C2, C3, C4, C5
**Group 2 — High, security/billing-integrity (isolated changes):** H1, H2, H4, H6, H7
**Group 3 — High, reliability (slightly larger changes):** H5, H9, H11, H12, H13, H14, H15
**Group 4 — High, frontend/deploy (larger, more invasive):** H3, H8, H10, H16
**Group 5 — Medium/Low:** as time allows, lower urgency

I'd suggest fixing Groups 1-2 now in this pass (they're the highest-severity, most contained changes), and treating Groups 3-4 as a follow-up pass given their larger scope — but happy to take a different cut if you'd rather.
