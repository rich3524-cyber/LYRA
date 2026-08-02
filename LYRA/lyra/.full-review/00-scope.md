# Review Scope

## Target

Full LYRA codebase re-review. LYRA is a social-media-management SaaS (Next.js 16 App Router, TypeScript, Prisma/Postgres, BullMQ workers on Railway, Netlify hosting). A prior full review ran 18 Jul 2026 (all Critical/High findings fixed, archived to `.full-review/archive-2026-07-18/`). Since then a large amount of new work has shipped: two Crisis Aware features (AI-suggested keywords, email alerts), Stripe billing going live end-to-end (with a real webhook bug found+fixed), per-platform media customisation in Compose, AI Schedule Generator fixes (timeout/scaling + Awaiting Media gate), and a full 48-item alpha testing pass. This review covers the whole codebase again, not just the delta, per user direction.

## Files

- `app/` — Next.js App Router pages and API routes
- `components/` — React components (dashboard UI, composer, calendar, inbox, settings, help docs)
- `services/` — domain logic (AI, social platform providers, brand intelligence, notifications, schedule generation, SEO, analytics)
- `workers/` — BullMQ background workers (post publisher, comment monitor, AI responder, brand sync, competitor monitor)
- `lib/` — shared infrastructure (Prisma client, Stripe/Resend/Anthropic clients, auth, S3, Redis, rate limiting, encryption)
- `prisma/schema.prisma` — full data model

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
