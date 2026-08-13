# Phase 4: Best Practices & Standards

Full raw agent output preserved at `04a-framework-raw.md` and `04b-devops-raw.md`.

## Framework & Language Findings

**Overall: clean, modern TypeScript with no legacy-React or Pages-Router residue.** Two real gaps stand out against an otherwise idiomatic codebase.

### High
- **The App Router's core request-lifecycle primitives are entirely unused**: zero `error.tsx`, zero `loading.tsx`, zero `not-found.tsx`, zero `<Suspense>` boundaries anywhere across 28 pages and dozens of route segments. A thrown Server Component error currently crashes the whole route to Next's default unstyled screen instead of a scoped boundary; nothing streams progressively, so routes doing multiple sequential Prisma calls block the full page paint.

### Medium
- 16 components/pages — including full page-level components like the competitors page — fetch data client-side via `useEffect` despite the settings and brand pages in the same codebase already correctly being async Server Components reading Prisma directly; the inconsistency costs an extra round trip, a hand-rolled loading skeleton, and duplicated auth/scoping logic per instance.
- Several dependencies are materially behind latest, most notably `@anthropic-ai/sdk` (21 minor versions behind — the SDK the product's core AI features run on) and `@auth0/nextjs-auth0` (6 minors behind, security-relevant given this same session's MCP OAuth findings). Prisma and BullMQ each have a major-version gap worth planning for as infrastructure, not urgent patches.

### Low
A deprecated `unstable_noStore` call sits alongside two redundant dynamic-opt-out mechanisms in one route (harmless, just noise); React 19's `useTransition`/`useActionState` are available but unused, with ~9 components hand-rolling the equivalent loading-state boilerplate instead (cosmetic); no `viewport` export in the root layout (omission, not a defect).

### What's already correct — worth preserving
All dynamic API routes correctly use the async `params: Promise<{...}>` model with zero stragglers on the old signature; the Auth0 SDK usage is the modern v4 class-based API, not legacy v3; Tailwind v4 is fully migrated to the CSS-first config with no leftover config file; zero `any` in production code; `lib/safe-fetch.ts` correctly uses `undici`'s custom-DNS `Agent` rather than a stale fetch polyfill; no deprecated Zod v4 API usage anywhere.

## CI/CD & DevOps Findings

**This pass converged, independently, on the same root-cause pattern the architecture review (Phase 1) named for the codebase itself — except here it's operational, not code: the thing that's actually true in production lives in a vendor dashboard or a human's memory, not in a file Git can diff and CI can check.**

### Critical
- **CI does not gate what deploys to production — confirmed for the third time this session by a third independent reviewer, this time with concrete remediation steps.** Netlify and Railway both auto-deploy via native GitHub integration in parallel with (not after) the Actions test/build pipeline; a commit that fails type-check, tests, or build is live in production regardless. The fix doesn't need new CI jobs — it needs branch protection on `main` requiring the existing checks to pass before merge, since that's the actual lever available given both platforms deploy on push rather than waiting for a CI signal.

### High
- **Config drift is a systemic pattern across the deployment surface, not four separate issues**: Railway dashboard settings vs. `railway.toml` (the exact mechanism behind this session's own production incident); the 5 new cron-trigger services existing nowhere in version control at all; `Dockerfile.worker` silently not describing the real deploy mechanism; the Prisma migration ledger vs. the live database schema. In every case, authoritative state lives somewhere Git can't diff it, and nothing automated checks for divergence. Recommends one fix class (move settings into version control where possible; add a scheduled drift-check job where it can't) rather than fixing each instance separately.
- **This session's own production incident, analyzed directly against what monitoring/process exists today**: the only thing that caught the 15-minute worker-fleet crash-loop was a human noticing. Confirmed via the codebase's own comments (not speculation) that there is no liveness monitoring on the worker fleet, no staging environment to rehearse dashboard changes against (deploy previews are deliberately disabled because they'd share production secrets), and no review gate on dashboard-only infrastructure changes. The single highest-leverage fix identified: add the minimal HTTP health listener the worker-side code already flags as missing, and point an external uptime monitor with real alerting at it — would have cut the incident from "15 minutes, caught by luck" to "caught within a few minutes, with an active alert."

### Medium
No dependency or secret scanning anywhere in CI (no Dependabot, no `npm audit` step, no gitleaks) despite handling customer PII, OAuth tokens, and billing; rollback is entirely manual and undocumented as a runbook, with no automated trigger to invoke it in the first place given the monitoring gap above.

### Low
A dead `vercel.json` plus a discovery that up to 3 separate trigger mechanisms (Railway, GitHub Actions schedule, cron-job.org) may currently be live simultaneously for some cron routes during this session's migration comparison window — not a correctness risk given the routes are idempotent, but worth cleaning up once the comparison window closes; lint has run non-blocking in CI with an honest "fix this later" comment and no tracking mechanism, the common way a temporary exception becomes permanent.

### What's already working
The team's own code comments are unusually candid about known operational gaps (the Dockerfile's unused-status header, the staging-environment note in `netlify.toml`, the health-check route's admission of its own blind spot) — the gap isn't awareness, it's that none of these documented issues have been closed with automation yet.
