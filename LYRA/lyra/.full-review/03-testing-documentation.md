# Phase 3: Testing & Documentation Review

Full raw agent output preserved at `03a-testing-raw.md` and `03b-documentation-raw.md`. This file is the consolidated, severity-ranked summary.

## Test Coverage Findings

**Suite health is genuinely good where it exists**: 457 tests across 49 files, all passing, deterministic, 2.6s, no flaky-test indicators, consistent mocking discipline, tests that assert behavior over implementation. The problem throughout is coverage, not quality — this looks like scope/time pressure on new/security-critical work shipping without a paired test task, not a team that doesn't know how to test.

### Critical
- **The exact code path containing the Critical billing bug from Phase 2 has 0% test coverage on both ends** — `app/onboard/page.tsx` has no test file at all, and the Stripe webhook's `checkout.session.completed` handler (the branch containing the actual defect, ~40% of that file's switch statement) has zero tests of any kind, only its sibling subscription-update/delete handlers are tested.
- **All 4 security-critical primitives Phase 1 flagged as untested are confirmed to have zero test files**: `lib/authz.ts`, `lib/plan-access.ts`, `lib/encrypt.ts`, and `checkCronAuth`. This extends further than Phase 1 knew: all 6 cron routes that depend on `checkCronAuth` are themselves also untested, so the entire chain protecting the product's public cron surface has no automated backstop at any layer.
- **No test anywhere would fail if OAuth scope enforcement were added or removed** — confirmed for all three components of the Phase 2 MCP account-takeover chain individually. One existing, passing test in `lib/auth.test.ts` actually documents and proves the exact behavior that makes the vulnerability possible (a bearer token authenticates on every route, not an MCP-scoped subset) — i.e. the test suite is currently pinning the vulnerable behavior in place as correct.
- **CI does not gate what deploys to production**, confirmed by reading the actual workflow file: Netlify and Railway both auto-deploy via native GitHub integration in parallel with, not after, the test job, and a prior redundant deploy step was removed specifically because it always lost that race. Every finding in this entire review — regardless of whether a test exists for it — currently has no automated backstop preventing it from shipping.

### High
- Route-level test coverage is ~25% (21 of 85 route files), concentrated away from the highest-risk category: the entire cron surface (0%), the unauthenticated onboarding PATCH that's the entry point for the Phase 2 prompt-injection finding (0%), 2 more billing-adjacent checkout routes beyond the one already flagged, and nearly every OAuth/webhook callback route except one.
- The component/UI layer has no rendering tests at all, and the current tooling is structurally incapable of producing one — no `@testing-library/react`, and Vitest is configured with a Node environment with no DOM. The 2 "component tests" that exist only test colocated pure helper functions, never the components themselves. The interactive calendar, composer, and approval-workflow UI — the core of the product — have zero regression protection beyond manual QA.
- Confirmed unbounded bulk-import media path (Phase 2 Critical/High) has a well-tested surrounding route but zero coverage of large/slow/concurrent media specifically, because the controls that would need testing (size cap, timeout) don't exist in the implementation to test in the first place.
- The prompt-construction function at the center of the Phase 2 prompt-injection finding has zero test coverage of its own — no test, positive or negative, exercises how any field gets interpolated into the AI responder's prompt.

### Medium
Services/workers coverage is partial (~26% and ~44% respectively) with a notable gap in the worker that actually dequeues and delivers notifications, despite the upstream notification-building logic being comparatively well tested; no E2E or real-database integration layer exists at all (one well-scoped exception: a genuine integration test verifying `safe-fetch`'s DNS pinning against a real local server, which is the right model to extend); no coverage measurement or threshold enforcement exists anywhere, so the coverage gaps above are invisible to anyone who doesn't manually compute them, as this review did.

## Documentation Findings

**A genuine, load-bearing discovery from this pass**: there are two actively-diverging `LYRA-Handover.md` files — the one this session has been updating all along (`LYRA/LYRA-Handover.md`, one directory above the actual project root) is current, but a second copy inside the project directory itself (`LYRA/lyra/LYRA-Handover.md`) was not touched by today's cron-migration commit and still describes cron-job.org as the live scheduling mechanism. This is worth flagging to Richard directly, separate from the rest of this report, since it affects which file future sessions should trust.

### Critical
- **`prisma/schema.sql` is a live production-data-loss hazard**: a 78-day-stale file whose first executable line is `DROP TABLE ... CASCADE`, sitting unreferenced (zero code/doc/CI references anywhere) in the same directory as the real schema files, under a filename that reads as authoritative. Anyone told to "apply the schema via the Supabase SQL editor" who opens this file first would paste in a full destructive reset against production. This matches and confirms Phase 1's architecture-pass finding independently.
- **Two diverging `LYRA-Handover.md` files**, detailed above — the in-project copy gives materially wrong operational instructions (telling a reader to configure cron-job.org, which this session just finished retiring).
- **README.md — the most likely first document a new session or contributor reads — was never updated for today's Railway cron migration**, still describing `publish-due-posts` as triggered by an external cron-job.org account with no mention of `scripts/cron/trigger.mjs` or Railway's Cron Schedule feature.

### High
- **CLAUDE.md — which explicitly frames itself as "the single source of truth... never contradict without explicit user instruction" — contains 5 confirmed, verified-false-or-stale claims**, the most dangerous of which is that `middleware.ts` handles "Auth + workspace access control," when the real file only sets a header and does no such thing; a future session trusting this line could reasonably skip adding `requireAuth()` to a new route. Also confirmed false/stale: references to 3 files that don't exist anywhere in the repo, the Next.js version (documented as 15, actually 16), and the cron-route list (documents 3 of 9 real cron routes, omitting `publish-due-posts` — the single most business-critical one — entirely).
- The migration ledger's own "known drift" documentation undersells the actual drift — it names one hand-applied SQL file but omits a newer, larger one (a whole new table, enum, and 4 columns across 2 models) that isn't mentioned anywhere.
- No API documentation exists for the 82-route surface — no OpenAPI spec, no per-endpoint reference, notable given LYRA also exposes an MCP gateway meant for external/AI-agent consumption where undocumented contracts are a bigger liability.

### Medium
The fully-written, correct CSP nonce migration plan that Phase 2's security review called the single highest-value remaining hardening item exists only inside one code comment in `middleware.ts`, cross-referenced nowhere else in any doc — confirming Phase 2's suspicion about discoverability; no ADRs, no CHANGELOG, no system-level architecture document exist anywhere (partially offset by ~30 genuinely good feature-level design docs in `docs/superpowers/`, a real asset most projects this size lack); `vercel.json` is dead configuration for a deployment target this app doesn't use, and unlike its sibling `Dockerfile.worker` (which correctly self-documents as unused in two places), nothing marks it as dead.

### Positive findings worth preserving
`Dockerfile.worker`'s "unused" status, flagged as a possible concern going into this phase, turned out to already be accurately and consistently documented in two places — no action needed. Inline documentation of non-obvious business logic in the newer AI/service-layer code is genuinely good, explaining real "why" including race-condition reasoning tied to specific downstream UI behavior — a positive counter-example to CLAUDE.md's staleness elsewhere. `AGENTS.md` is correctly identified as Next.js-generated framework metadata, not a stale duplicate of CLAUDE.md needing reconciliation.

## Note for the final report

Both sub-reviews in this phase independently converged on the same underlying pattern Phase 1's architecture review named as the root cause of its own findings: **things get built well once, then drift, because nothing keeps the second and third copy in sync with the first.** Here that's playing out as documentation (CLAUDE.md, the migration README, the duplicate Handover file) rather than code, but it's the identical failure mode.
