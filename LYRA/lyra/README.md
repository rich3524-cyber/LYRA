# LYRA

LYRA is a social-media-management SaaS: content scheduling, an AI content composer, an AI-scored Crisis Aware guardrail system, a unified social inbox, analytics/PDF reporting, and Stripe billing.

**Stack:** Next.js 16 (App Router, TypeScript), Prisma 6 / Postgres (Supabase), BullMQ workers on Railway, Netlify hosting, Auth0, Stripe, Resend.

## Architecture at a glance

- **App** (`app/`, `components/`, `services/`, `lib/`) — deployed to Netlify. Auto-deploys on push to `main` via Netlify's GitHub integration; there is no deploy step for this in `.github/workflows/deploy.yml`.
- **Workers** (`workers/`) — 6 BullMQ workers (post publisher, comment monitor, AI responder, brand sync, competitor monitor, metrics sync) running as a single long-lived process (`workers/index.ts`) on Railway. Railway deploys automatically via its own GitHub integration on push to `main` — there is no deploy step for this in `.github/workflows/deploy.yml` (a redundant `railway up` CLI step used to exist there and was removed 2 Aug 2026 after it started failing fast against Railway's own already-completed deploy).
- **Database** — Postgres via Supabase, accessed through Prisma. A `prisma/migrations/20260802000000_baseline` migration exists, but has real known drift from the live database (see `prisma/migrations/README.md`) — several schema changes since have been hand-applied as idempotent SQL instead (see `prisma/migrations-sql/`, or via the Supabase SQL editor / MCP tool), then documented in `LYRA-Handover.md`. Do **not** run `prisma migrate dev` or `prisma db push` — both hang against Supabase's connection pooler.
- **Scheduled jobs** — `app/api/cron/*` routes are triggered by 5 Railway services (`cron-brand-refresh`, `cron-check-approval-slas`, `cron-publish-due-posts`, `cron-sync-comments`, `cron-sync-metrics`), each running `scripts/cron/trigger.mjs` on a per-service Cron Schedule set in the Railway dashboard (migrated from cron-job.org on 2026-08-13 — see `LYRA-Handover.md`'s "Cron jobs migrated from cron-job.org to Railway" entry). These 5 services' Start Command/Cron Schedule are **dashboard-only config, not declared in `railway.toml` or any other file** — if you're setting up a new environment, you need to recreate them by hand. `.github/workflows/crons.yml` remains as a GitHub Actions backstop for 3 of the 6 routes.
- **Repo layout gotcha:** the git repository root is one level above this directory (`LYRA/lyra/`) — CI config (`.github/workflows/`) and `netlify.toml` live at the repo root, not here.

## Local setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment variables** — copy `.env.local` from another developer or provision your own (see table below), then:
   ```bash
   npx prisma generate
   ```

3. **Run the dev server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

4. **Run workers locally** (only needed if you're working on scheduling/publishing/inbox/AI-response logic):
   ```bash
   npx tsx workers/index.ts
   ```
   Requires a reachable `REDIS_URL`.

5. **Run tests:**
   ```bash
   npm test        # single run
   npm run test:watch
   ```

## Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Supabase Postgres — pooled and direct connections |
| `REDIS_URL` | BullMQ queues (app + workers) |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` | Auth0 session/auth |
| `AUTH0_MCP_AUDIENCE` | Identifier of the "LYRA MCP API" Auth0 Resource Server — the OAuth audience MCP access tokens are issued for |
| `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET` | Dedicated Auth0 M2M application, scoped only to `create:clients`/`read:clients` on the Management API — used solely by the Dynamic Client Registration shim (`app/api/oauth/register`) |
| `APP_BASE_URL` | Canonical app URL — used in auth redirects, email links, OAuth callbacks |
| `ANTHROPIC_API_KEY` | Claude API (composer, crisis detection, schedule generation, etc.) |
| `ENCRYPTION_KEY` | Encrypts stored social/SEO OAuth tokens (`lib/encrypt.ts`) |
| `RESEND_API_KEY` | Transactional email — currently only the Crisis Aware alert |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `STRIPE_{STARTER,PRO,AGENCY}_PRICE_ID` + `_ANNUAL_PRICE_ID` variants | Plan checkout |
| `STRIPE_CRISIS_AWARE_PRICE_ID`, `STRIPE_CRISIS_AWARE_ANNUAL_PRICE_ID` | Crisis Aware add-on checkout |
| `STRIPE_TREND_PRICE_ID`, `STRIPE_TREND_ANNUAL_PRICE_ID` | LYRA Trend add-on — **checkout is currently disabled** (`app/api/stripe/trend-checkout/route.ts`), Trend has no functional backend yet |
| `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | Media uploads. Uses `S3_*` names, not `AWS_*` — see the comment in `lib/s3.ts`: Netlify's Lambda runtime reserves the `AWS_*` names and silently injects its own (wrong) credentials if you use them |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_LOGIN_CONFIG_ID` | Facebook/Instagram OAuth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Search Console OAuth |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok OAuth |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | X/Twitter OAuth |
| `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` | Zernio — unified social publishing/inbox API |
| `CRON_SECRET` | Bearer-auth for `/api/cron/*` routes (set in GitHub Actions secrets + your external cron trigger, not needed locally) |

See `.env.local` (gitignored, not committed) for a working reference set of values — ask another developer for a copy, or provision your own accounts for each service above.

## Deployment

- **App:** push to `main` → Netlify builds and deploys automatically (`base = "LYRA/lyra"` in the root `netlify.toml`). PR previews and branch deploys are currently disabled (`netlify.toml`'s `[context.deploy-preview]`/`[context.branch-deploy]` blocks) because no staging database/Stripe/Auth0 environment exists yet — enabling them today would mean every preview build runs against production data.
- **Workers:** push to `main` → Railway's own GitHub integration deploys automatically (not via GitHub Actions). Railway builds via its Nixpacks builder using `railway.toml`'s `buildCommand`/`startCommand` — the repo's `Dockerfile.worker` is **not** currently wired into the deploy and should not be assumed to reflect the real worker environment.
- **CI:** `.github/workflows/deploy.yml` runs lint (non-blocking — see the 762-error backlog note in the workflow file), typecheck, `npm test`, then build, scoped to changes under `LYRA/lyra/**`.
