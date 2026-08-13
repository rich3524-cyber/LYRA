# Step 3B — Documentation & API Review (raw agent output)

# LYRA Documentation Review — Full Re-Review (2026-08-13)

## Scope & Method

Read and cross-checked against the live file tree: `CLAUDE.md`, `AGENTS.md`, `README.md`, `middleware.ts`, `vercel.json`, `railway.toml`, `Dockerfile.worker`, `prisma/schema.sql`, `prisma/schema.prisma`, `prisma/migrations/README.md`, `prisma/migrations-sql/*.sql`, `LYRA-Handover.md` (both copies), `app/api/**/route.ts` (82 routes), `services/**`, `docs/**`, and git history. All prior-phase claims independently re-verified by reading the actual files.

---

## Critical

### C1. `prisma/schema.sql` is a live production-data-loss hazard, unreferenced anywhere
First line is `DROP TABLE IF EXISTS "OnboardingToken" CASCADE;`, followed by drops of every other table. Last modified 2026-05-27 — 78 days stale relative to today, badly out of sync with `prisma/schema.prisma` (missing `NotificationChannel`, Zernio fields, crisis-keyword tables, and more). Repo-wide grep found **zero references** to this file anywhere. It sits in the same directory as the real, current schema files with a filename that reads as authoritative. Anyone told to "apply the schema via the Supabase SQL editor" who finds this file first would paste in a full `DROP ... CASCADE` against production.

**Recommendation:** Delete, or rename unambiguously with a "DO NOT RUN AGAINST PRODUCTION" banner as the literal first line.

### C2. Two live, diverging `LYRA-Handover.md` files — the one inside the actual project directory is the stale one
`LYRA/LYRA-Handover.md` (outer, modified today via commit `190a253`) correctly documents the Railway cron migration. `LYRA/lyra/LYRA-Handover.md` (inner — inside the actual project directory this review is scoped to) was **not updated by that commit** and still says "All four cron-job.org jobs are live and returning green 200 responses," instructs readers to "configure these as HTTP cron jobs on cron-job.org," and states "Netlify scheduled functions are not suitable here" — none of which mentions Railway or `trigger.mjs`. A session opening the project at `LYRA/lyra/` (the directory CLAUDE.md calls "You are here") and consulting the in-directory handover doc would be told an outdated, now-incorrect story about how scheduling works.

**Recommendation:** Pick one canonical `LYRA-Handover.md` location. Given the project root is `LYRA/lyra/` per README's own note, the canonical file should live there. At minimum, add a one-line pointer at the top of the stale copy.

### C3. `README.md` — the doc most likely to be read first — was never updated for the Railway cron migration either
Last commit predates both cron-migration commits. Still states `publish-due-posts` is "primarily triggered by an external cron-job.org account (every 1 minute, outside version control)" with no mention of `scripts/cron/trigger.mjs` or Railway's native Cron Schedule feature — the newest and most operationally significant infrastructure change of the day is invisible in the one file a new contributor is told to start with.

**Recommendation:** Update README's cron section to describe the Railway-trigger mechanism as primary, with cron-job.org (if still running in parallel per the safety-comparison note) described as a temporary fallback being retired.

---

## High

### H1. `CLAUDE.md` contains multiple confirmed, load-bearing inaccuracies — all 5 prior claims verified true
`CLAUDE.md` explicitly frames itself as "the single source of truth... Never contradict or deviate from these standards without explicit user instruction" — which makes every inaccuracy below higher-stakes than an ordinary stale doc.

| Claim in CLAUDE.md | Reality |
|---|---|
| `middleware.ts` does "Auth + workspace access control" | Verified false — the actual file only sets an `x-pathname` header. No session check, no auth redirect, no workspace check anywhere in it. Auth is enforced per-route via `requireAuth()` calls. **The single most dangerous inaccuracy in the file** — a session trusting this line could reasonably skip adding `requireAuth()` to a new route. |
| `types/index.ts` documented as "Shared TypeScript types" | Does not exist anywhere in the repo. |
| `services/scheduler/sync-queue.ts` documented as "Background sync jobs" | Does not exist — `services/scheduler/` contains only `post-queue.ts`. |
| `app/(auth)/` route group with login/signup/onboard pages | Does not exist. The real `app/auth/` directory (no parens, not a route group) contains exactly one file: Auth0's own callback handler. No custom login/signup pages exist (consistent with Auth0 hosted Universal Login, but the documented file structure describes an app that was never built this way). |
| "Framework: Next.js 15" | `package.json` has `^16.3.0`. README correctly says 16 — CLAUDE.md is the one doc still on 15. |
| Cron routes: only 3 documented (`sync-comments`, `sync-metrics`, `brand-refresh`) | There are 9 real cron route directories. CLAUDE.md omits `publish-due-posts` — the single most business-critical cron route in the product — entirely, along with 5 others. |

The whole "File Structure" section reads as the original planning scaffold rather than current reality; the "Implementation Order" section describes a phased build the codebase has clearly moved past (crisis-aware guardrails, Zernio bridge, MCP gateway, bulk CSV import — none appear in that roadmap, all are built).

**Recommendation:** Either regenerate the File Structure/Tech Stack sections from the actual tree, or split the file — keep the design-system rules (still accurate) as the stable part, replace the architecture sections with a pointer to README's more current "Architecture at a glance."

### H2. `prisma/migrations/README.md` undersells actual schema drift — confirmed
Names exactly one drifted file (`2026-08-05-mcp-audit-log.sql`) in its "Known drift" section, but `prisma/migrations-sql/` also contains a newer, larger `2026-08-11-slack-notifications-approval-sla.sql` (adds a whole new enum + table + 4 columns across 2 models + an index + a backfill) that isn't mentioned anywhere in the README. Anyone treating that list as the complete record of "what's changed since the baseline" would miss a materially larger change than the one that is listed.

**Recommendation:** Add the Aug 11 migration to the "Known drift" section, or fold both pending files into the migration ledger now.

### H3. No API documentation for an 82-route surface
No OpenAPI/Swagger spec anywhere in the repo, no `docs/api.md`, no per-endpoint request/response schema reference. Zod validation exists inline in most routes (good practice) but isn't documentation — not discoverable without opening each route file. Matters more than usual since LYRA also exposes an MCP gateway intended for external/AI-agent consumption, where undocumented endpoint contracts are a bigger liability.

**Recommendation:** At minimum generate a lightweight route inventory (path, method, auth requirement, purpose); README already has a small hand-maintained table for the 4 cron routes it knows about — extend that pattern to the full API surface.

---

## Medium

### M1. `middleware.ts`'s CSP nonce migration plan is fully specified but exists only as a code comment
A complete, well-reasoned, dated migration plan for removing `'unsafe-inline'` from CSP (independently flagged by the security review as the single highest-value remaining hardening item) exists only in a `middleware.ts` comment block. A repo-wide grep across every `.md` file in both the project and parent directory found no other mention of it — not in any Wishlist doc, either handover file, or `docs/`.

**Recommendation:** Add a one-line pointer in the Handover doc's "Known issues"/"Next steps" section referencing `middleware.ts:4-38`.

### M2. No architecture-level documentation, ADRs, or system diagrams
No ADR directory, no `CHANGELOG.md`, no architecture/system diagram file anywhere. Partially offset by a genuine strength: `docs/superpowers/plans/` and `docs/superpowers/specs/` contain ~30 well-structured, dated, per-feature design docs that do capture rationale at the feature level — a real asset most projects this size lack. What's missing is anything that stitches these into a current system-level picture.

**Recommendation:** Not urgent given the feature-doc coverage; a single short `docs/ARCHITECTURE.md` would meaningfully reduce onboarding time and give CLAUDE.md's architecture sections something accurate to defer to.

### M3. `vercel.json` is dead configuration for a platform this app doesn't deploy to
Declares 3 cron jobs targeting Vercel; the app deploys to Netlify/Railway per README (accurate). These crons cannot fire, and unlike `Dockerfile.worker`, nothing documents that this file is dead.

**Recommendation:** Delete, or add the same kind of self-documenting header comment `Dockerfile.worker` already has.

---

## Low / Positive Findings

### L1. `Dockerfile.worker` is already well-documented as unused — prior concern doesn't hold up
Contrary to how this was framed going into this pass, `Dockerfile.worker` opens with an explicit, accurate 6-line comment stating Railway doesn't build via Docker and naming the actual mechanism. README independently confirms the same fact in the same terms. Documentation is accurate and consistent across two locations — no action needed here; the file's continued *presence* despite being unused is a housekeeping question, not a documentation gap.

### L2. Inline documentation of non-obvious business logic is genuinely good in the AI/service layer
Spot-checked `crisis-detector.ts`, `response-generator.ts`, `app/api/ai/respond/route.ts` — comment density well above repo average, explaining real "why" (e.g. a multi-line comment explaining exactly why a race-condition edge case can't be silently swallowed, referencing the specific downstream UI component that would show a misleading state). Newer AI-feature code is a positive counter-example to CLAUDE.md's staleness elsewhere. Comment density is noticeably thinner in older/simpler files, though these are also lower-complexity files where the gap matters less.

### L3. `AGENTS.md` is not a stale duplicate — it's framework-generated and unrelated to CLAUDE.md's content
Auto-generated by `next dev` itself per its own header, a Next.js meta-notice about framework version, not a second copy of project standards. No accuracy issue; flagged only because its name invites the (incorrect) assumption it should be reconciled with CLAUDE.md.

---

## Summary Table

| ID | Severity | Issue |
|---|---|---|
| C1 | Critical | `prisma/schema.sql` — stale `DROP TABLE CASCADE` script, unreferenced |
| C2 | Critical | Two diverging `LYRA-Handover.md` files; in-project one still describes cron-job.org as live |
| C3 | Critical | README not updated for the Railway cron migration despite being the primary onboarding doc |
| H1 | High | CLAUDE.md — 5/5 prior claims confirmed false/stale, including a dangerous auth-location misdescription |
| H2 | High | Migration README's "known drift" list omits the larger, more recent Aug 11 migration |
| H3 | High | No API documentation for 82 routes |
| M1 | Medium | CSP nonce migration plan exists only in a code comment, not cross-referenced anywhere |
| M2 | Medium | No ADRs, no CHANGELOG, no system-level architecture doc (feature-level docs are a genuine strength) |
| M3 | Medium | `vercel.json` dead config, undocumented as such (unlike its sibling `Dockerfile.worker`) |
| L1 | Low (resolved) | `Dockerfile.worker`'s unused status is already correctly documented — no action needed |
| L2 | Low (positive) | AI-service-layer inline comments are genuinely good |
| L3 | Low (informational) | `AGENTS.md` is Next.js-generated, unrelated to CLAUDE.md — no reconciliation needed |
