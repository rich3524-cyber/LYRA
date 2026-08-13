# Review Scope

## Target

Full LYRA codebase re-review — same scope as the 2026-08-02 review, re-run fresh to reflect everything shipped since then (MCP gateway Phase 3, bulk import/CSV scheduling, self-approval deadlock fix, pre-beta security hardening pass, Railway cron migration, and the many smaller fixes recorded in LYRA-Handover.md between 2026-08-02 and 2026-08-13).

LYRA is a multi-tenant social media management SaaS: Next.js 16 (App Router) on Netlify, PostgreSQL via Supabase + Prisma, BullMQ workers on Railway (Redis-backed), Auth0 for auth, Stripe for billing, Zernio as the unified social-platform API, Anthropic Claude for AI features. A separate `lyra-mcp` service (not in this review's path scope) exposes an MCP gateway.

## Files

- `app/` — Next.js App Router: pages, layouts, and all `app/api/**/route.ts` API routes
- `components/` — React components (calendar, composer, dashboard, etc.)
- `services/` — business-logic layer (posts, social publishing, webhooks, bulk-import, etc.)
- `workers/` — BullMQ worker fleet (post-publisher, ai-responder, sync workers, etc.)
- `lib/` — shared utilities (auth, rate-limit, encrypt, jwt-verify, safe-fetch, anthropic, authz, etc.)
- `prisma/schema.prisma` — data model

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 16 (TypeScript, App Router)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report

## Prior review

A full review of this same scope was completed 2026-08-02 (212 findings, all Critical/High remediated same day per LYRA-Handover.md) — archived at `.full-review/archive-2026-08-02/`. This run is independent and re-assesses current state; it does not assume prior findings are still valid or still fixed.
