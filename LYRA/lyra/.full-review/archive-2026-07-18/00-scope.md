# Review Scope

## Target

Full LYRA codebase review — LYRA is a production Next.js 16 (TypeScript, App Router) SaaS social media management platform for agencies, freelancers, and SMBs. It schedules/publishes social posts (via a Zernio unified social API bridge, with legacy native per-platform code retained), generates AI captions and comment responses (Anthropic Claude), tracks SEO (Google Search Console), and tracks competitors. Background work runs via BullMQ/Redis workers on Railway, triggered partly by externally-scheduled cron hitting authenticated API routes. Data lives in Supabase-hosted PostgreSQL via Prisma 6. Hosted on Netlify (app) + Railway (workers).

The app is currently in an internal testing phase (started 14 Jul 2026) — core workflows are built and live, and a significant number of real production bugs were found and fixed in the days immediately preceding this review (see `docs/LYRA-Testing-Checklist.md` and `LYRA-Handover.md` for details). This review should treat those as historical context, not assume the areas already fixed are risk-free — re-verify rather than skip.

## Files

Full source tree, included:
- `app/` — 63 API routes (`app/api/**/route.ts`), 26 pages (`app/**/page.tsx`), plus layouts and shared app-level code
- `components/` — 104 component files (`components/lyra/**/*.tsx`, `components/ui/**/*.tsx`)
- `services/` — 42 files: social platform clients (native + Zernio), AI (caption/response generation, content scoring), brand intelligence, competitors, SEO, scheduler
- `workers/` — 7 BullMQ background workers (post-publisher, comment-monitor, ai-responder, brand-sync, competitor-monitor, plus index and any others present)
- `lib/` — shared utilities (auth, prisma client, redis, s3/upload, encrypt, stripe, anthropic client, utils)
- `prisma/schema.prisma` — full database schema

Explicitly excluded:
- `node_modules/`, `.next/`, build artifacts
- `LYRA/lyra/LYRA/` — a known dead nested duplicate directory from an accidental cross-repo merge (see `.gitignore` and project history); not part of the live app
- `docs/`, `.superpowers/`, `.claude/` — planning/working documents, not shipped code
- Generated Prisma client output

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 16 (TypeScript, App Router), auto-detected

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
