# LYRA — Developer Quick Start Guide

## For the Developer Opening This Project

Welcome to LYRA. Before you write a single line of code, read these three files in order:

1. **`CLAUDE.md`** — The complete project intelligence file. Architecture, design system, coding standards, file structure, common patterns. This is law.

2. **`docs/specs/lyra-scope-document.md`** — What LYRA is, what it does, who it serves, and why.

3. **`docs/specs/lyra-implementation-plan.md`** — 15 tasks across 3 phases. Complete code for every step. Start at Task 1 and work through sequentially.

---

## For Claude Code — First Session Instructions

Copy and paste this into Claude Code to start your first session:

```
Read CLAUDE.md completely. Then read docs/specs/lyra-implementation-plan.md.

We are starting from scratch. Begin with Task 1: Project Initialisation & Design System.

Follow every step exactly as written. Use the exact commands, exact file paths, and exact code shown. Do not deviate from the design system in CLAUDE.md — it is non-negotiable.

After completing each task, confirm what was built, run the verification commands, and wait for approval before moving to the next task.
```

---

## For Subsequent Claude Code Sessions

Copy and paste this at the start of each new session:

```
Read CLAUDE.md. Then check docs/specs/lyra-implementation-plan.md and tell me which task we are currently on based on the checkboxes.

Continue from where we left off. Follow the implementation plan exactly.
```

---

## Setup Order (Do This First)

Before running any code, you need these accounts and services:

### Must Have for Task 1–4
- [ ] Node.js 20+ installed (`node --version`)
- [ ] PostgreSQL 15+ running locally
- [ ] Redis running locally (`redis-server`)
- [ ] Auth0 account — free tier works for dev (auth0.com)

### Must Have for Task 5 (Social OAuth)
- [ ] Facebook Developer account + app (developers.facebook.com)
- [ ] Google Cloud project + OAuth credentials (console.cloud.google.com)
- [ ] LinkedIn Developer app (developer.linkedin.com)

### Must Have for Task 8–10 (AI Features)
- [ ] Anthropic API key (console.anthropic.com)

### Must Have for Task 13 (Billing)
- [ ] Stripe account (stripe.com)
- [ ] Create 3 products: Starter, Pro, Agency
- [ ] Note the price IDs for .env.local

### Must Have for Full Deployment
- [ ] AWS account + S3 bucket named `lyra-assets` in ap-southeast-2
- [ ] Vercel account (vercel.com)
- [ ] Railway account (railway.app) for background workers

---

## Local Development Services

Start these before running `npm run dev`:

```bash
# PostgreSQL (if not running as a service)
pg_ctl start

# Redis
redis-server

# Next.js dev server
npm run dev

# Background workers (separate terminal, needed for Phase 3)
npx ts-node workers/post-publisher.worker.ts
```

---

## The Design System in 30 Seconds

Everything near-black. Everything platinum. No exceptions.

```
Background:  #080808  (ALL authenticated pages)
Text:        #e2e2e2  (primary)  #888  (secondary)  #555  (muted)
Borders:     #222  (subtle)  #333  (mid)
Fonts:       DM Sans (UI) / Instrument Serif (headings) / Geist Mono (data)
Icons:       Lucide ONLY
Animation:   200ms, cubic-bezier(0.16, 1, 0.3, 1)
```

If it looks like a generic SaaS dashboard, it's not ready.

---

## Questions?

The answers are almost certainly in `CLAUDE.md` or `docs/specs/lyra-implementation-plan.md`.

If not — open a Claude Code session and ask it. It has full project context.

---

*LYRA — Social, at signal strength.*
