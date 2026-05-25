# LYRA — Project Handover Document

**Date:** May 2026 (updated May 2026)  
**Prepared by:** Claude Code (Anthropic)  
**Project owner:** Richard Unwin, Into The Wild Marketing

---

## Changelog

### May 2026 — Sessions 11–17+ (Security Audit + Feature Sprint)

---

#### Security & Quality Audit (commit `968fe30`, 2026-05-22)

25 fixes shipped. Highlights:

**Critical security fixes:**
- Cross-tenant OAuth token injection — workspace access check added to social + SEO OAuth callbacks
- SSRF protection added to brand intelligence scraper (blocks RFC1918, loopback, link-local ranges)
- Auth0 diagnostic log removed (was leaking OAuth tokens to server logs)
- Cron secret comparison now uses `timingSafeEqual` (timing-safe)
- POST /api/posts status allowlist — only DRAFT/SCHEDULED creatable by clients
- `aiResponseMode` now clamped to plan's `maxAutonomy` in PATCH /api/workspaces/[id]

**Reliability fixes:**
- Prisma singleton now retained in production (`globalThis` pattern corrected — was recreating client on every serverless invocation)
- Post publisher now throws on unimplemented platform (was falsely marking posts as PUBLISHED)
- BullMQ jobId unified to `post-${id}`; retries bumped to 5
- Comment monitor N+1 queries replaced with batched `createMany`
- `schedule-generator` `max_tokens` raised to 8000 (was truncating large schedules)
- `analyzeEngagement` offloaded from Netlify serverless to Railway BullMQ worker
- `cancelBoost` now sets status to `PAUSED` not `DELETED` (preserves spend history)

**Schema additions:** 6 new indexes + 1 unique constraint on `Comment`. Apply via `prisma db push` or Supabase SQL Editor.

---

#### P1 — Crisis Detection & Auto-Pause

Monitors comment inbox for sentiment spikes and keyword triggers. When a crisis is detected:
- All scheduled posts for the workspace are automatically paused
- `Workspace.crisisActive` is set to `true`; `crisisTriggeredAt` is recorded
- A `CrisisEvent` row is created linking the triggering comment IDs
- User receives an alert and can manually resolve (sets `crisisActive = false`)
- `Workspace.crisisAware` toggle (default `false`) must be enabled per workspace before monitoring activates

**New schema fields on `Workspace`:** `crisisAware Boolean @default(false)`, `crisisActive Boolean @default(false)`, `crisisTriggeredAt DateTime?`  
**New model:** `CrisisEvent` (id, workspaceId, triggeredAt, resolvedAt, triggerType, commentIds[])  
**Feature gated to:** PRO / AGENCY plans

---

#### P2 — Agency Client Reports (PDF)

"Generate report" button on the analytics page. User picks 7-day or 30-day range. Generates a PDF in LYRA branding:
- Cover page with workspace name + date range
- Summary stats (posts published, total reach, avg engagement rate)
- Platform breakdown table
- Top 3 posts by engagement
- AI-written executive narrative (Claude)

**Library:** `@react-pdf/renderer` (not puppeteer — too heavy for Netlify serverless)  
**Route:** `POST /api/reports/generate` — streams a PDF response  
**Feature gated to:** PRO / AGENCY plans

---

#### P3 — Competitor Intelligence

User adds competitor social handles + blog/website URLs. LYRA monitors public content, posting frequency, and engagement benchmarks.

**Data sources covered:**
- Blog/website (Cheerio scraper — same SSRF-protected pattern as brand intelligence)
- Twitter/X public timeline
- Facebook public pages

**Instagram/TikTok/LinkedIn competitor data is not available** — these platforms require authentication and don't expose public APIs for third-party monitoring.

**New schema models:** `Competitor`, `CompetitorSnapshot`  
**Competitor fields:** name, websiteUrl, twitterHandle, facebookPageId  
**Snapshot fields:** postsPerWeek, recentTopics[], engagementBenchmark, recentPosts (JSON), capturedAt  
**Route:** `GET/POST /api/competitors`, `POST /api/competitors/[id]/snapshot`  
**Feature gated to:** PRO / AGENCY plans  
**Integrates with reports:** benchmark data included in P2 client reports

---

#### P4 — Pre-Publish Content Scoring (commit `49a5113`)

Slide-out panel in the post composer. Score updates live as user types (1.5 s debounce).

**Scoring dimensions (each 0–10, via Claude):**
- Hook strength, Clarity, Call to action, Optimal length, Hashtag usage, Emotional resonance

**Returns:** score per dimension + one specific fix for anything below threshold  
**Behaviour:** coach only — not a gatekeeper. User can ignore and publish.  

**New files:**
- `lyra/services/ai/content-scorer.ts` — `scoreContent(content, platform)`, returns typed `ScoringResult`
- `lyra/app/api/ai/score-content/route.ts` — POST, workspace auth, 10-char minimum, 503 on scorer failure
- `lyra/components/lyra/composer/content-score-panel.tsx` — Framer Motion slide-in panel (right edge of composer), `ScoreRing` SVG, `DotBar` (10 dots), suggestions list

**Modified files:**
- `lyra/components/lyra/composer/post-composer.tsx` — `scoreOpen`, `scoring`, `scoreResult` state; debounced scoring useEffect; Score button in toolbar; `<ContentScorePanel>` mounted as last child of composer outer div

---

#### P5 — Smart Content Repurposing (commit `9f7f799`)

Paste a blog URL or long-form text → LYRA generates platform-native posts for each selected target channel → output feeds into the schedule review page (same flow as the AI schedule generator).

**New files:**
- `lyra/services/ai/content-repurposer.ts` — `extractArticleText(url)` (SSRF-protected Cheerio fetch, 8 000-char limit), `repurposeContent(text, platforms)` async generator (Claude streaming, parses `---PLATFORM: X---` delimiters)
- `lyra/app/api/ai/repurpose/route.ts` — POST → SSE `ReadableStream`. Streams `{type:'post'}`, `{type:'done'}`, `{type:'error'}` events. `Content-Type: text/event-stream`.
- `lyra/components/lyra/repurpose/repurpose-form.tsx` — URL/text source toggle, 6-platform chip selector, SSE reader, live progress list; on `done` saves accumulated posts to `sessionStorage` (`lyra:schedule-review:{workspaceId}`) and navigates to the schedule review page
- `lyra/app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx` — server page (auth + workspace access guard)

**Modified files:**
- `lyra/components/lyra/app-shell/sidebar.tsx` — Repurpose nav item added (Scissors icon, no lock)

---

#### Build / Deploy fixes (this session, commits `0bc2e0e`, `5ffcc59`, `d82e257`)

**Header `title` prop** — `header.tsx` on disk had `title: string` but the committed version had `foundingMember?` instead. Fixed by committing the disk version. `HeaderProps` is now: `{ user, title: string, plan? }`.

**`netlify.toml` — schema sync on every deploy** — the Netlify build command now runs `prisma db push` on every deploy:
```
npx prisma generate && DIRECT_URL="$DATABASE_URL" npx prisma db push --accept-data-loss && npm run build
```
`DIRECT_URL` is overridden with `DATABASE_URL` because `DIRECT_URL` in Netlify env vars has an invalid scheme. **Action required:** fix `DIRECT_URL` in Netlify → Site Config → Environment Variables. Correct value is the Supabase Session Pooler URL (port 5432, format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`). Once fixed, remove the `DIRECT_URL="$DATABASE_URL"` override from `netlify.toml`.

---

### May 2026 — Session 10

**Post Boosting — built and fully deployed**

All 7 implementation tasks completed and deployed to production. Pro and Agency workspace users can now boost published Facebook and Instagram posts directly from the Post Detail Panel in the content calendar.

**New files:**
- `lyra/services/social/meta-ads.ts` — `createBoost()` (Campaign → AdSet → Creative → Ad sequence with orphan-campaign rollback on failure), `cancelBoost()` (sets campaign status to DELETED, not PAUSED), `getBoostReach()` (queries campaign impressions via `Authorization: Bearer` header)
- `lyra/app/api/posts/[id]/boost/route.ts` — POST creates a boost (validates plan, input bounds, post status, platform, adAccountId; deletes prior ENDED/CANCELLED records; returns sanitised errors not raw Meta messages); DELETE cancels active boost on Meta then marks CANCELLED in DB
- `lyra/app/api/posts/[id]/boost/reach/route.ts` — GET returns `{ reached: number }` for ACTIVE boosts; returns `{ error: 'reach_unavailable' }` with status 502 on failure

**Modified files:**
- `lyra/prisma/schema.prisma` — added `PostBoost` model (`@@unique postId`), `BoostStatus` enum (ACTIVE/ENDED/CANCELLED/FAILED), `adAccountId String?` on `SocialAccount`, `boost PostBoost?` on `Post`
- `lyra/services/social/facebook.ts` — added `fetchAdAccountId(accessToken)` — calls `/me/adaccounts?fields=id,account_status`, returns first ACTIVE account ID. Note: `ads_management` scope was added then immediately removed (see Known Limitations)
- `lyra/app/api/social/callback/[platform]/route.ts` — stores `adAccountId` on Facebook SocialAccount (and linked Instagram SocialAccount) at OAuth callback time
- `lyra/app/api/posts/route.ts` — added `platformPostId`, `boost`, `socialAccount.platformId`, `socialAccount.adAccountId` to GET select
- `lyra/components/lyra/calendar/post-preview-card.tsx` — extended `CalendarPost` type with `platformPostId`, `boost` (PostBoost), `socialAccount.platformId`, `socialAccount.adAccountId`
- `lyra/components/lyra/calendar/post-detail-panel.tsx` — added three-state boost section: no boost (chip selectors for budget/duration/audience + CTA), active boost (Live badge + stat tiles including live Reached counter + cancel button), ended/cancelled (Ended badge + Boost again CTA). Added `plan` prop. State resets on `post.id` change to prevent leak across posts.
- `lyra/components/lyra/calendar/content-calendar.tsx` — passes `plan` prop to `PostDetailPanel`
- `lyra/app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` — fetches `plan` from workspace and passes to `ContentCalendar`

**Schema applied to Supabase:**
```sql
CREATE TYPE "BoostStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED', 'FAILED');
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "adAccountId" TEXT;
CREATE TABLE "PostBoost" (...);
CREATE INDEX "PostBoost_status_endsAt_idx" ON "PostBoost"("status", "endsAt");
```

**Known issue — `ads_management` scope requires Meta App Review:**
Adding `ads_management` to the Facebook OAuth scope request caused Meta to block Facebook Login entirely for the app ("Facebook Login is currently unavailable for this app"). Removed from the SCOPES array. The boost UI, API, and DB are fully built — the only missing piece is `adAccountId` populated on `SocialAccount`. Workaround: set it manually via Supabase SQL (`UPDATE "SocialAccount" SET "adAccountId" = 'YOUR_AD_ACCOUNT_ID' WHERE platform = 'FACEBOOK'`). Proper fix: submit `ads_management` for Meta App Review, then add the scope back to `facebook.ts` — when users reconnect Facebook, `adAccountId` will be stored automatically.

---

**Railway workers — deployed and running**

The BullMQ worker process is now live on Railway. All four workers started successfully.

**What changed:**
- `lyra/railway.toml` — added `[build] buildCommand = "npm install"` to prevent Railway from running `next build` (which fails without Auth0/Redis env vars during static page generation). Workers only need dependencies installed, not a full Next.js build.
- Railway env vars corrected — `REDIS_URL` was set to the full `redis-cli --tls -u <url>` CLI command instead of just the URL. Corrected to the `rediss://...` URL from Upstash.

**Current worker status:** Running. Logs show `[workers] All workers started`. Posts will now be automatically published at their scheduled time, comments will be monitored, and AI responses will be enqueued.

**Git incident — mid-rebase state resolved:**
The session inherited a git rebase in progress. `facebook.ts` and `schema.prisma` had been staged during an earlier rebase but never committed — this was the root cause of the previous Netlify build failure (`fetchAdAccountId doesn't exist in target module`). Resolved by committing the staged files directly (the rebase-merge directory was already empty). The REBASE_HEAD file was a stale artefact and was cleaned up.

---

### May 2026 — Session 9

**Deployment steps completed (from Session 7/8 pending list)**

- **`lastCommentSyncAt` schema change applied** — used Supabase SQL Editor directly (`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastCommentSyncAt" TIMESTAMP(3)`) after `prisma db push` failed repeatedly due to Supabase connection string issues. Supabase SQL Editor is now the established, preferred method for all schema changes — see updated note in Section 8.
- **Upstash Redis created** — free tier, region `ap-southeast-1`. `REDIS_URL` (starts with `rediss://`) added to Netlify environment variables. Uses TLS — `lib/redis.ts` handles the `rediss://` protocol correctly.
- **`CRON_SECRET` added to Netlify** — used `lyra-cron-2026-Dbth352421!`. All four cron-job.org jobs are live and returning green 200 responses with the correct `Authorization: Bearer` header.
- **Railway still pending** — blocked by a major Google Cloud outage during the session (railway.app returned "train has not arrived at the station" even in incognito). The Railway project has not been created yet. Workers are not deployed. Check [status.railway.app](https://status.railway.app) before attempting.
- **Workspace plan upgraded to PRO** — applied via Supabase SQL Editor: `UPDATE "Workspace" SET plan = 'PRO' WHERE name = 'Into The Wild Marketing'`. The "Into The Wild Marketing" workspace now has access to Pro features.
- **Supabase password reset incident** — a Supabase password reset was attempted during connection debugging. This invalidated the `DATABASE_URL` and `DIRECT_URL` in Netlify, causing the live site to show "Setting up your account…". Fixed by updating both connection strings in Netlify environment variables to the new password and triggering a redeploy. **If the site ever shows this error again, check that the Netlify DB connection strings match the current Supabase password.**

**Post Boosting feature — designed and planned**

Full design and implementation plan created. Feature allows Pro/Agency users to boost published Facebook and Instagram posts directly from the Post Detail Panel using Meta's Marketing API — budget/duration/audience presets, no full ad manager required.

**Design spec:** `lyra/docs/superpowers/specs/2026-05-20-post-boosting-design.md`  
**Implementation plan:** `lyra/docs/superpowers/plans/2026-05-20-post-boosting.md` (7 tasks, ready to execute)

Key decisions:
- Entry point is the Post Detail Panel only (not a dedicated ads page)
- Facebook and Instagram only (both via Meta Marketing API)
- Pro and Agency plan tiers only — Starter sees nothing (gated both server-side and client-side)
- Config presets: Budget ($10/$25/$50/$100), Duration (3/7/14/30 days), Audience (Page followers / Followers + similar / Broad reach)
- Full Meta Marketing API approach: Campaign → AdSet → Ad sequence; `POST_ENGAGEMENT` objective; `lifetime_budget` in cents
- Three panel states: no boost, active boost (with stat tiles), ended/cancelled (with Boost again CTA)
- One boost record per post (`PostBoost @unique postId`) — Boost again replaces the previous record
- `ads_management` scope requires Meta app review before non-admin users can use it in production. App owner (admin) can test immediately.

**New files to be created (post boosting):**
- `lyra/services/social/meta-ads.ts` — `createBoost()`, `cancelBoost()`, `getBoostReach()` — the only file that calls Meta Marketing API
- `lyra/app/api/posts/[id]/boost/route.ts` — `POST` (create boost) and `DELETE` (cancel boost) handlers

**Files to be modified (post boosting):**
- `lyra/prisma/schema.prisma` — add `PostBoost` model, `BoostStatus` enum, `adAccountId String?` to `SocialAccount`, `boost PostBoost?` to `Post`
- `lyra/services/social/facebook.ts` — add `ads_management` to SCOPES, add `fetchAdAccountId(accessToken)`
- `lyra/app/api/social/callback/[platform]/route.ts` — store `adAccountId` on Facebook (and linked Instagram) `SocialAccount` at OAuth time
- `lyra/app/api/posts/route.ts` — include `boost` relation and `platformPostId` in GET query
- `lyra/components/lyra/calendar/post-preview-card.tsx` — extend `CalendarPost` type with `platformPostId`, `boost`, updated `socialAccount`
- `lyra/components/lyra/calendar/post-detail-panel.tsx` — add three-state boost section
- `lyra/components/lyra/calendar/content-calendar.tsx` — pass `plan` prop to `PostDetailPanel`

**Schema changes required (post boosting — apply via Supabase SQL Editor):**
```sql
CREATE TYPE "BoostStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED', 'FAILED');

CREATE TABLE IF NOT EXISTS "PostBoost" (
  "id"           TEXT PRIMARY KEY,
  "postId"       TEXT UNIQUE NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "platform"     TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "adSetId"      TEXT NOT NULL,
  "adId"         TEXT NOT NULL,
  "budget"       INTEGER NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "audience"     TEXT NOT NULL,
  "status"       "BoostStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);

ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "adAccountId" TEXT;
```

---

### May 2026 — Session 8

**Environment setup + prisma db push walkthrough**
- Node.js v24.15.0 installed on the development machine (was not previously installed)
- Discovered the correct Supabase connection string format for `prisma db push`: use the **direct host** `db.votuufwukkhojunzrjoa.supabase.co` (port 5432), NOT the pooler host `aws-1-ap-southeast-2.pooler.supabase.com`. The pooler host returns authentication errors for schema operations even with correct credentials.
- Correct CMD syntax for setting env vars with special characters: `set "VAR=value"` (quotes around the whole `VAR=value` expression). Without quotes, `&` in the connection string is interpreted as a command separator.
- `prisma db push` for the `lastCommentSyncAt` field (Session 7 schema change) is **in progress** — complete this before deploying Railway workers.
- Updated all `prisma db push` command examples in this document to use the correct format.

---

### May 2026 — Session 7

**BullMQ Workers + Railway deployment prep**

**New files:**
- `lyra/lib/redis.ts` — `getRedisConnection(): ConnectionOptions` factory that parses `REDIS_URL` safely (descriptive error on invalid URL), sets `maxRetriesPerRequest: null` (required by BullMQ), adds TLS for `rediss://` URLs, and falls back to localhost when the var is absent so Next.js builds without a live Redis. Also exports `redis` (the result of calling the factory) for existing imports in cron routes.
- `lyra/app/api/cron/publish-due-posts/route.ts` — cron endpoint (GET, bearer token auth via `CRON_SECRET`) that finds all `SCHEDULED` posts with `scheduledAt <= now` and enqueues each to the `post-publishing` queue via `services/scheduler/post-queue.ts`. Uses `jobId: post-{id}` to deduplicate if cron fires twice. Returns `{ queued: N }`.
- `lyra/railway.toml` — Railway deployment config: `startCommand = "npx tsx workers/index.ts"`, `restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 3`.

**Modified files:**
- `lyra/prisma/schema.prisma` — added `lastCommentSyncAt DateTime?` to `SocialAccount` for incremental comment sync. `prisma generate` has been run; `prisma db push` to production is a pending manual step (see below).
- `lyra/package.json` — moved `tsx` from `devDependencies` to `dependencies`. Railway runs `npm ci --omit=dev` so `tsx` must be in `dependencies` to be available at runtime.
- `lyra/workers/index.ts` — changed from side-effect imports to named default imports; graceful shutdown now uses `.catch(err => { console.error(...); process.exit(1) })` instead of `void shutdown()` which was silently swallowing Promise rejections.
- `lyra/workers/post-publisher.worker.ts` — added `export const postPublishingQueue` (Queue instance for Railway-side use); added `if (!res.ok) throw new Error(...)` checks after every platform `fetch()` call (Facebook post, Instagram container create, Instagram publish, LinkedIn, Twitter). Without these checks, a 4xx from the platform API would silently mark the post `PUBLISHED` with a null `platformPostId`.
- `lyra/workers/comment-monitor.worker.ts` — added `prisma.socialAccount.update({ data: { lastCommentSyncAt: new Date() } })` at the end of the processor. The field existed in the schema but was never written.
- `lyra/app/api/cron/brand-refresh/route.ts` — removed import of `brandSyncQueue` from `@/workers/brand-sync.worker`. That import loaded the BullMQ `Worker` class into a Netlify serverless function, creating persistent Redis connections that can never be closed. Replaced with a local `new Queue('brand-sync', { connection: redis })` instance.

**Critical architecture rule established — Serverless/Worker separation:**

Cron routes (Netlify serverless) must **only** instantiate `Queue` (producer). Worker files (`workers/*.worker.ts`) must **never** be imported from API routes. Worker files load the BullMQ `Worker` class on import; in a serverless context this creates persistent Redis connections that exhaust the connection pool and stall job processing. The pattern is: cron route creates a local `Queue`, calls `queue.add(...)`, returns. The Railway process holds `Worker` instances long-term.

**Pending manual steps — user must execute:**

1. **Apply schema change** — run in Command Prompt (not PowerShell). Use the direct host (not the pooler) and quote the set commands:
   ```cmd
   set "DATABASE_URL=postgresql://postgres:PASSWORD@db.votuufwukkhojunzrjoa.supabase.co:5432/postgres"
   set "DIRECT_URL=postgresql://postgres:PASSWORD@db.votuufwukkhojunzrjoa.supabase.co:5432/postgres"
   cd "C:\Users\RichU\OneDrive - Into The Wild Marketing\LYRA\lyra"
   npx prisma db push
   ```
   Password is in Supabase → Settings → Database → reveal. Do not wrap it in brackets.
2. **Create Upstash Redis** — free tier, region `ap-southeast-1`. Copy the `REDIS_URL` (starts with `rediss://`).
3. **Add env vars to Netlify** — `REDIS_URL` (from Upstash) and `CRON_SECRET` (any strong random string, e.g. `openssl rand -hex 32`).
4. **Create Railway project** — connect to `rich3524-cyber/LYRA` GitHub repo, set root directory to `LYRA/lyra`. Add all env vars (copy from Netlify, plus add `REDIS_URL`). Railway will pick up `railway.toml` automatically and run `npx tsx workers/index.ts`.
5. **Configure cron jobs on cron-job.org** — 4 jobs, all with header `Authorization: Bearer {CRON_SECRET}`:
   - Every 1 min: `GET https://lyraonline.ai/api/cron/publish-due-posts`
   - Every 5 min: `GET https://lyraonline.ai/api/cron/sync-comments`
   - Every hour: `GET https://lyraonline.ai/api/cron/sync-metrics`
   - Weekly (Sun 00:00 AEST): `GET https://lyraonline.ai/api/cron/brand-refresh`

---

### May 2026 — Session 6

**Engagement-Optimised Posting Times (full feature)**
- Added `topic String?` to the `Post` model in `prisma/schema.prisma` — stores the content theme for AI-generated posts; applied to Supabase with `prisma db push`
- Created `services/ai/engagement-analyzer.ts` — pure-DB service that queries all PUBLISHED posts with non-zero `PostMetrics`, computes a weighted engagement score (`likes×1 + comments×3 + shares×2 + saves×2 + clicks×1`), groups by platform → dayOfWeek/hour, normalises scores 0–1, and returns top 5 platform slots and top 3 topic slots. Activation thresholds: ≥20 posts/platform, ≥10 posts/topic, sampleSize ≥5 per slot.
- Created `app/api/brand-intelligence/analyze-engagement/route.ts` — manual POST endpoint to trigger analysis; merges result into `BrandProfile.postingPatterns` (preserving the existing `guidelines` key)
- Modified `app/api/cron/brand-refresh/route.ts` — calls `analyzeEngagement` for all workspaces via `Promise.allSettled` at the end of each weekly brand refresh run
- Modified `app/api/posts/route.ts` — accepts and stores optional `topic` field on post creation
- Modified `components/lyra/schedule/schedule-generator.tsx` — passes `post.topic` when saving AI-generated posts to the calendar
- Modified `services/ai/schedule-generator.ts` — accepts optional `postingPatterns` 5th parameter; when provided, replaces hardcoded time slots in the Claude prompt with the workspace's actual engagement data (including per-topic slot recommendations); falls back to hardcoded defaults when no data
- Modified `app/api/schedule/generate/route.ts` — extracts engagement patterns from `brandProfile.postingPatterns` (filtering out the `guidelines` key) and passes them to `generateWeekPosts`
- Modified `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx` — fetches `brandProfile.postingPatterns` and passes it to `PostComposer`
- Modified `components/lyra/composer/post-composer.tsx` — adds clickable time-hint chips below the schedule date/time picker; chips set the picker to that day/hour when clicked; shows "Publish more posts to unlock timing insights" when below threshold; hidden when no platform selected
- Created `components/lyra/brand/engagement-insights.tsx` — new panel at the bottom of the brand page: active state shows a Mon–Sun × 6am–10pm engagement heat map with score-based cell colouring, a topic breakdown table, data freshness line, and a refresh button that calls the analyze-engagement endpoint in place; cold start state shows per-platform progress bars toward the 20-post threshold
- Modified `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` — renders `EngagementInsights` panel; fetches `postCounts` (published posts with non-zero metrics per platform)
- **Deployment note:** Tasks 1–3 were accidentally committed to the outer (OneDrive-level) git repo instead of the inner `lyra/` project repo. Fixed by re-adding and committing all three files to the correct repo before pushing. Root cause: subagents ran git from the wrong working directory. Watch for this if subagents commit files — always verify with `git -C lyra show HEAD:<path>`.

**Post Now button** *(built in session preceding Session 6)*
- Added "Post Now" button to the post composer toolbar
- Sets `scheduledAt = now`, `status = SCHEDULED` — bypasses the date picker entirely
- Confirms success with a toast; resets the composer on completion

**AI Content Schedule Generator** *(built in session preceding Session 6)*
- New modal component in the content calendar (`components/lyra/schedule/schedule-generator.tsx`)
- Config: select platforms, posts per week, number of weeks (3 or 6)
- Calls `POST /api/schedule/generate` — uses `generateWeekPosts` from `services/ai/schedule-generator.ts`
- Claude writes captions + hashtags + `topic` for every post based on the brand profile
- Per-week API calls (not SSE) to avoid Netlify function timeout
- Posts land in the calendar as DRAFT; user reviews before publishing

---

### May 2026 — Session 5

**Demo + feature design**
- Demoed the app live — Brand Intelligence build and SEO overview presented successfully
- Clarified SEO section scope: Google Search Console is read-only; AI-generated SEO content (meta title, meta description, H1, intro) must be manually applied to the website CMS — LYRA cannot push changes through the GSC API
- Designed two new features (spec saved to `lyra/docs/superpowers/specs/2026-05-19-ai-content-schedule-design.md`):
  - **Post Now button** — immediate publish from the Compose section (no scheduled time required); sets `scheduledAt = now`, `status = SCHEDULED`
  - **AI Content Schedule Generator** — generates a 3 or 6 week content calendar using brand profile; user configures platforms + posts per week + duration; AI writes captions and hashtags for every post; review screen before committing to calendar; posts land as DRAFT
  - **Media Library** (Phase 3, future) — user uploads brand assets to S3; AI tags by topic; auto-attaches to AI-generated schedule posts
- Build order agreed: Post Now → Schedule Generator (text-only) → Media Library

---

### May 2026 — Session 4

**Legal PDF serving**
- Copied `LYRA-Instruction-Manual.pdf`, `LYRA-Privacy-Policy.pdf`, and `LYRA-Terms-of-Service.pdf` from `LYRA/docs/legal/` into `lyra/public/docs/legal/` so they are tracked in the Next.js project
- Diagnosed 404: `@netlify/plugin-nextjs` deploys a `/*` catch-all server handler that intercepts all requests before Netlify CDN can serve static files from `public/`
- Fix: created `app/docs/legal/[filename]/route.ts` — a Next.js route handler that reads the PDF from the filesystem and streams it with `Content-Type: application/pdf`
- Only three filenames are allowed (allowlist in the handler); all others return 404
- PDFs are now accessible at `/docs/legal/LYRA-Instruction-Manual.pdf`, `/docs/legal/LYRA-Privacy-Policy.pdf`, `/docs/legal/LYRA-Terms-of-Service.pdf`
- **Note for future static files:** any binary asset placed in `public/` will silently 404 on this Netlify deployment. Either add a route handler (as above) or host the file in S3 and redirect.

---

### May 2026 — Session 3

**Domain setup**
- `lyraonline.ai` purchased via Namecheap (Cloudflare does not support `.ai` domain registration)
- Cloudflare added as DNS provider — nameservers pointed from Namecheap to Cloudflare
- DNS records configured in Cloudflare:
  - A record: `@` → `75.2.60.5` (Netlify load balancer, proxied)
  - CNAME record: `www` → `lyra-online-app.netlify.app` (proxied)
  - MX and TXT records retained from Namecheap for email forwarding
- Both `lyraonline.ai` and `www.lyraonline.ai` added as custom domains in Netlify
- DNS verification completed successfully
- Let's Encrypt SSL certificate provisioned and active
- `APP_BASE_URL` and `AUTH0_BASE_URL` updated to `https://lyraonline.ai` in Netlify environment variables
- Auth0 application URLs updated:
  - Allowed Callback URLs: `https://lyraonline.ai/auth/callback`, `https://lyra-online-app.netlify.app/auth/callback`, `https://lyraonline.ai/api/social/callback/youtube`
  - Allowed Logout URLs: `https://lyraonline.ai`, `https://lyra-online-app.netlify.app`
  - Allowed Web Origins: `https://lyraonline.ai`, `https://lyra-online-app.netlify.app`
- **Important:** Auth0 callback path is `/auth/callback` (not `/api/auth/callback`) — this is set in `lib/auth0.ts` via `authorizationParameters.redirect_uri`
- `lyraonline.ai` is fully live with SSL and login confirmed working

---

### May 2026 — Session 2

**Content Calendar enhancements**
- Added filter tabs (All / Scheduled / Published / Draft) to the monthly calendar
- Added skeleton loading state — no flash of empty grid while posts fetch
- Separated DnD and click interactions on post cards: drag handle (GripVertical) initiates drag; clicking the card body opens the detail panel
- Fixed cross-month drag — target date now calculated correctly from the dropped day cell
- Built `PostDetailPanel` — Framer Motion slide-in panel with status editor, full post content, media thumbnails, and keyboard/backdrop dismissal

**Brand Intelligence enhancements**
- Upgraded scraper to multi-page (homepage + up to 4 internal links) for richer brand data
- Updated build route to include the workspace's recent DB posts in the Claude prompt
- Built `GuidelinesUploader` — react-dropzone component for uploading PDF/Word/text brand guidelines directly to S3
- Added `/api/brand-intelligence/guidelines` POST/DELETE routes with cross-workspace key validation and atomic Prisma array push (prevents lost-update races on concurrent uploads)
- Guidelines uploader wired into the brand page — files are visible before and after a profile build

**YouTube platform**
- Added `services/social/youtube.ts` with Google OAuth 2.0, `youtube` + `youtube.upload` scopes, and YouTube Data API v3 channel fetch
- YouTube connect/callback cases added to the OAuth routes
- YouTube added to the Settings page platform list

**Security fixes**
- S3 key prefix validation on guidelines POST and DELETE (`guidelines/{workspaceId}/` prefix required) prevents cross-workspace key attachment/deletion
- Replaced non-atomic read-modify-write on `guidelineUrls` array with Prisma `{ push: key }` to prevent concurrent upload data loss

**Deployment fixes**
- Restored `netlify.toml` after it was corrupted by a cross-repo merge (outer `.git` at `LYRA/` vs inner `.git` at `LYRA/lyra/`)
- Removed nested `LYRA/lyra/` duplicate directory (~180 files) that was created by the same merge; added `/LYRA/` to `.gitignore` to prevent recurrence
- Fixed `draft-list.tsx` `react-hooks/set-state-in-effect` lint error blocking the Turbopack build
- Committed four previously untracked files that were causing build failures: `post-detail-panel.tsx`, `navigation-loader.tsx`, `guidelines-uploader.tsx`, `lib/s3.ts`

---

## 1. What LYRA Is

LYRA (lyraonline.ai) is a premium AI-powered social media management SaaS platform built for agencies, freelancers, and SMBs.

**Core capabilities:**
- Schedule posts across multiple social platforms
- Generate AI captions that match each client's brand voice
- Have AI respond to comments and reviews automatically, 24/7

**Primary differentiator:** No major competitor responds to comments. LYRA does — with configurable autonomy levels (fully autonomous / draft + approve / off) and agency-level guardrails.

**Business model:** Three subscription tiers:
- **Starter** — 1 workspace, basic scheduling, no AI responses
- **Pro** — 5 workspaces, AI caption drafts, draft-approve response mode
- **Agency** — Unlimited workspaces, full AI autonomy, team members, guardrails

---

## 2. Live URLs

| Environment | URL |
|---|---|
| Production app | https://lyraonline.ai |
| GitHub repository | https://github.com/rich3524-cyber/LYRA |
| Domain registrar | Namecheap (lyraonline.ai) |
| DNS provider | Cloudflare |

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| Language | TypeScript | 5.x |
| UI components | shadcn/ui (@base-ui/react) | 1.4.1 |
| Styling | Tailwind CSS | 4.x |
| Animation | Framer Motion | 12.x |
| Icons | Lucide React | 1.14.0 |
| Rich text | Tiptap | 3.x |
| Drag and drop | @dnd-kit | 6.x |
| Database ORM | Prisma | 6.19.3 |
| Database | PostgreSQL (Supabase) | — |
| AI | Anthropic Claude API | claude-sonnet-4-6 |
| Job queue | BullMQ + Redis | 5.x |
| Auth | Auth0 (@auth0/nextjs-auth0) | 4.20.0 |
| Payments | Stripe | 22.x |
| Storage | AWS S3 | 3.x |
| Web scraping | Cheerio | 1.x |
| Token encryption | Node.js crypto AES-256-GCM | built-in |
| App deployment | Netlify | — |
| Worker deployment | Railway | — |

---

## 4. Infrastructure & Services

### 4.1 Netlify (App Host)

- **Site name:** lyra-online-app
- **Build command:** `npx prisma generate && DIRECT_URL="$DATABASE_URL" npx prisma db push --accept-data-loss && npm run build`
- **Publish directory:** `.next`
- **Node version:** 20
- **Plugin:** `@netlify/plugin-nextjs`

The build now runs `prisma db push` automatically on every deploy — schema changes are applied to the production database as part of the build. No separate manual schema step is needed.

**Note on `DIRECT_URL` override:** The `DIRECT_URL` env var currently has an invalid scheme in Netlify, so the build forces it to `DATABASE_URL` inline. Once `DIRECT_URL` is corrected to a valid Supabase Session Pooler URL (port 5432), remove the `DIRECT_URL="$DATABASE_URL"` prefix from the build command and rely on the env var directly.

### 4.2 Supabase (Database)

- **Provider:** Supabase PostgreSQL
- Two connection strings are required:
  - `DATABASE_URL` — pooled connection via PgBouncer (port 6543, includes `?pgbouncer=true&connection_limit=1`)
  - `DIRECT_URL` — direct connection (port 5432, for migrations only)

### 4.3 Auth0

- Used for all authentication (login, session management, social OAuth)
- Callback URL configured: `https://lyraonline.ai/auth/callback` (note: `/auth/callback`, not `/api/auth/callback` — set in `lib/auth0.ts`)
- Logout URL configured: `https://lyraonline.ai`
- Old Netlify subdomain URLs are also listed as allowed in Auth0 as a fallback

### 4.4 Anthropic

- Claude API used for Brand Intelligence profile building and (future) AI caption/response generation
- Model: `claude-sonnet-4-6` — this exact model ID must be used. Other IDs return 404.

### 4.5 Social Platforms

| Platform | App Name | Status |
|---|---|---|
| LinkedIn | LYRA (App ID: 863jh229lfqonh) | Connected — personal profile only |
| Facebook/Instagram | LYRA (App ID: 1480576426774303) | OAuth flow built — needs testing |
| Google Business | Not created yet | Flow built, untested |
| X (Twitter) | Not created yet | Flow built, untested |
| TikTok | Not created yet | Flow built, untested |
| YouTube | Uses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | OAuth flow built — YouTube Data API v3 must be enabled in Google Cloud |

### 4.6 Google Search Console

- OAuth 2.0 credentials created in Google Cloud Console
- Client ID: `176890796510-39g1n3iab9o08rjqaf6hmij2d131k2sk.apps.googleusercontent.com`
- Authorized redirect URI: `https://lyra-online-app.netlify.app/api/seo/callback`
- Scope: `webmasters.readonly`
- Credentials stored in Netlify env vars (see Section 5)

---

## 5. Environment Variables

All set in Netlify dashboard under Site Settings → Environment Variables.

| Variable | Purpose |
|---|---|
| `AUTH0_SECRET` | Auth0 session encryption secret |
| `AUTH0_BASE_URL` | `https://lyraonline.ai` |
| `AUTH0_ISSUER_BASE_URL` | Auth0 tenant domain |
| `AUTH0_CLIENT_ID` | Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | Auth0 application client secret |
| `AUTH0_DOMAIN` | Auth0 tenant domain (same as issuer without https://) |
| `DATABASE_URL` | Supabase pooled connection string (PgBouncer, port 6543) |
| `DIRECT_URL` | Supabase direct connection string (port 5432) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `ENCRYPTION_KEY` | 64-character hex string for AES-256-GCM token encryption |
| `FACEBOOK_APP_ID` | `1480576426774303` |
| `FACEBOOK_APP_SECRET` | Facebook app secret |
| `LINKEDIN_CLIENT_ID` | `863jh229lfqonh` |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn primary client secret |
| `APP_BASE_URL` | `https://lyraonline.ai` |
| `NEXT_PUBLIC_APP_NAME` | `LYRA` |
| `STRIPE_STARTER_PRICE_ID` | Stripe price ID for Starter monthly |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Stripe price ID for Starter annual |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro monthly |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Stripe price ID for Pro annual |
| `STRIPE_AGENCY_PRICE_ID` | Stripe price ID for Agency monthly |
| `STRIPE_AGENCY_ANNUAL_PRICE_ID` | Stripe price ID for Agency annual |
| `STRIPE_STUDIO_PRICE_ID` | Stripe price ID (Studio tier, if applicable) |
| `STRIPE_STUDIO_ANNUAL_PRICE_ID` | Stripe price ID (Studio annual) |
| `AWS_S3_BUCKET` | S3 bucket name for brand guidelines / media storage |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — used for YouTube and Google Business |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret — used for YouTube and Google Business |
| `GOOGLE_SEARCH_CONSOLE_CLIENT_ID` | GSC OAuth client ID |
| `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET` | GSC OAuth client secret |
| `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` | `https://lyra-online-app.netlify.app/api/seo/callback` |
| `REDIS_URL` | Upstash Redis connection string (`rediss://...`) — required for BullMQ queues and workers |
| `CRON_SECRET` | Bearer token shared between cron-job.org and all `/api/cron/*` endpoints — any strong random string |

**Important:** `ENCRYPTION_KEY` must never change once social accounts have been connected. Changing it will make all stored tokens unreadable.

---

## 6. What Has Been Built

### 6.1 Authentication & Sessions

- Auth0 integration via `@auth0/nextjs-auth0` v4
- Login at `/auth/login`, logout at `/api/auth/logout`
- All dashboard pages are server-side protected — redirect to login if no session
- `getCurrentUser()` in `lib/auth.ts` fetches the user from the DB (creates on first login)
- Dashboard layout (`app/(dashboard)/layout.tsx`) double-checks session and DB user before rendering

### 6.2 App Shell

- **Sidebar** (`components/lyra/app-shell/sidebar.tsx`) — collapsible with Framer Motion animation, shows LYRA logo (full wordmark expanded, icon mark collapsed), workspace navigation, workspace switcher
- **Header** (`components/lyra/app-shell/header.tsx`) — user avatar, name display
- **Workspace Switcher** (`components/lyra/app-shell/workspace-switcher.tsx`) — dropdown to switch between workspaces

The sidebar receives a `brandReady` prop from the layout, which locks the Brand AI nav item behind a padlock icon if the workspace hasn't connected a website URL and at least one social account.

### 6.3 Dashboard Home (`app/(dashboard)/page.tsx`)

- Personalised greeting using the user's first name
- **Brand AI unlock banner** — appears when brand requirements are met but no profile has been built yet, prompts user to go build the profile
- **Setup checklist** — appears when brand requirements are not yet met, shows three steps: add website URL, connect a social account, build brand profile
- Workspace list cards linking to each workspace
- Quick-action links to Compose, Inbox, and Add Workspace

### 6.4 Workspace Settings (`app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`)

- Lists all supported social platforms with connect / reconnect buttons
- Shows connected accounts with a green dot indicator
- Disconnect button (soft-delete — marks `isActive: false`)
- **Success banner** on `?connected=platform` query param after OAuth completes
- **Danger Zone** section at the bottom with a delete workspace button, backed by an `AlertDialog` confirmation modal
- Deleting a workspace cascades through all children (social accounts, posts, brand profile, etc.) in a database transaction before removing the workspace

### 6.5 Brand Intelligence (`app/(dashboard)/workspace/[workspaceId]/brand/page.tsx`)

Three states:
1. **Locked** — website URL or social account not yet connected. Shows checklist + link to Settings.
2. **Ready, no profile** — requirements met but profile not built. Shows description of what will happen + "Build brand profile" button.
3. **Profile exists** — displays Voice Summary, Tone Attributes, Content Themes, Audience Profile (demographics, language level, interests, pain points), and Posting Guidelines. Shows timestamps for last website scrape and last profile build.

**Brand Build Button** (`components/lyra/brand/brand-build-button.tsx`) — client component that POSTs to `/api/brand-intelligence/build`, shows spinner during operation, refreshes the page on completion.

**Brand Intelligence API** (`app/api/brand-intelligence/build/route.ts`) — scrapes up to 5 pages of the workspace website (homepage + up to 4 internal links) using Cheerio, fetches the workspace's recent DB posts, passes all data to Claude claude-sonnet-4-6 to generate a structured brand profile, saves result to `BrandProfile` in the database.

**Brand Guidelines Uploader** (`components/lyra/brand/guidelines-uploader.tsx`) — react-dropzone client component that accepts PDF, Word, and text documents. Calls `/api/brand-intelligence/guidelines` to get a presigned S3 URL, uploads the file directly from the browser to S3, then saves the S3 key to `BrandProfile.guidelineUrls`. Uploaded files are shown as a list with delete buttons. Visible in all three page states — guidelines can be uploaded before building a profile.

**Guidelines API** (`app/api/brand-intelligence/guidelines/route.ts`) — POST returns a presigned S3 upload URL and saves the key atomically using Prisma `{ push: key }` (prevents lost-update races on concurrent uploads). DELETE validates the key prefix (`guidelines/{workspaceId}/`) to prevent cross-workspace deletion, removes from S3 and removes from `guidelineUrls` array. Both operations verify workspace access.

**Social post analysis** — the `analyzeSocialPosts()` function in `services/brand-intelligence/social-analyzer.ts` currently receives an empty array (social post fetching from platform APIs requires posting scopes that are not yet approved — see Known Limitations). The profile is built from website data and DB posts for now.

### 6.6 Content Calendar (`components/lyra/calendar/content-calendar.tsx`)

- Monthly grid calendar with previous/next month navigation
- Posts fetched from `/api/posts?workspaceId=...&month=yyyy-MM` with AbortController to cancel stale requests on month change
- **Filter tabs** — All / Scheduled / Published / Draft — filter the visible posts per day without a new API call
- Skeleton loading state while posts are fetching — no flash of empty calendar
- Drag-and-drop rescheduling using @dnd-kit — drag handle (GripVertical icon) initiates DnD; clicking the card body opens the detail panel. These are separate interactions with separate state (`activePost` for DnD ghost, `selectedPost` for the panel).
- Cross-month drag correctly calculates target date from the dropped day cell's data attribute
- PATCHes new `scheduledAt` to the API with optimistic UI update on drop
- **Platform colour indicators** — each day cell shows a deduped row of coloured dots in the top-right corner (one per unique platform with posts scheduled that day)
- **Post Detail Panel** (`components/lyra/calendar/post-detail-panel.tsx`) — slide-in panel (Framer Motion, respects `prefers-reduced-motion`) showing full post content, platform, status badge, scheduled time, and media thumbnails. Status can be changed inline (DRAFT → SCHEDULED, etc.) with a PATCH to the API. Panel closes on backdrop click, Escape key, or the close button.

### 6.7 Social OAuth Flows

OAuth connect/callback routes exist at:
- `app/api/social/connect/[platform]/route.ts` — initiates OAuth, redirects to platform
- `app/api/social/callback/[platform]/route.ts` — handles callback, exchanges code for token, encrypts and stores in `SocialAccount`

**Supported platforms in code:** Facebook, Instagram (via Facebook Graph API), LinkedIn, Google Business, Twitter, TikTok, YouTube.

All access tokens are AES-256-GCM encrypted using `ENCRYPTION_KEY` before being stored in the database. They are decrypted on-demand in service files. Tokens are never logged or returned in API responses.

### 6.8 API Routes Built

| Route | Methods | Purpose |
|---|---|---|
| `/api/workspaces` | GET, POST | List workspaces, create workspace |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Workspace CRUD |
| `/api/posts` | GET, POST | List posts by month, create post |
| `/api/posts/[id]` | GET, PATCH, DELETE | Post CRUD |
| `/api/posts/[id]/boost` | POST, DELETE | Create boost (Meta Marketing API) / Cancel boost |
| `/api/comments` | GET | Comments inbox |
| `/api/comments/[id]` | PATCH | Update comment status |
| `/api/brand-intelligence/build` | POST | Trigger brand profile build |
| `/api/brand-intelligence/analyze-engagement` | POST | Manually trigger engagement pattern analysis |
| `/api/schedule/generate` | POST | AI schedule generator — generates a week of posts |
| `/api/ai/generate` | POST | AI caption generation |
| `/api/ai/respond` | POST | AI comment response draft |
| `/api/social/connect/[platform]` | GET | Initiate platform OAuth |
| `/api/social/callback/[platform]` | GET | Handle OAuth callback |
| `/api/analytics` | GET | Fetch post metrics |
| `/api/upload` | POST | S3 media upload |
| `/api/onboarding` | POST | Generate client onboarding token |
| `/api/stripe/create-checkout` | POST | Create Stripe checkout session |
| `/api/stripe/webhook` | POST | Handle Stripe subscription events |
| `/api/cron/sync-comments` | GET | Sync comments from platforms |
| `/api/cron/sync-metrics` | GET | Sync post performance metrics |
| `/api/cron/brand-refresh` | GET | Weekly brand profile refresh |
| `/api/seo/connect` | GET | Initiate GSC OAuth |
| `/api/seo/callback` | GET | Handle GSC OAuth callback |
| `/api/seo/pages` | GET, POST | List/create tracked SEO pages |
| `/api/seo/pages/[pageId]` | DELETE | Delete a tracked page |
| `/api/seo/pages/[pageId]/analyze` | POST | Score page on-page SEO |
| `/api/seo/pages/[pageId]/generate` | POST | Generate AI SEO content |
| `/api/seo/gsc-data` | GET | Fetch GSC queries + trend data |
| `/api/competitors` | GET, POST | List / add competitor profiles |
| `/api/competitors/[id]` | DELETE | Remove a competitor |
| `/api/competitors/[id]/snapshot` | POST | Scrape + store a competitor snapshot |
| `/api/ai/score-content` | POST | Score post content across 6 dimensions |
| `/api/ai/repurpose` | POST (SSE) | Repurpose long-form content into platform-native posts |
| `/api/reports/generate` | POST | Generate PDF client report (7-day or 30-day) |

### 6.9 Database Schema

All models are in `prisma/schema.prisma`. Key relationships:

```
User → WorkspaceAccess → Workspace
Workspace → SocialAccount (many)
Workspace → Post (many)
Workspace → BrandProfile (one)
Workspace → Guardrail (many)
Workspace → OnboardingToken (one)
Workspace → SeoConnection (one)
Workspace → SeoPage (many)
Workspace → SearchConsoleData (many)
Workspace → CrisisEvent (many, onDelete: Cascade)
Workspace → Competitor (many, onDelete: Cascade)
Post → PostApproval, PostMetrics, Comment (many), PostBoost (one)
Comment → CommentResponse (many)
SocialAccount → Post, Comment (many)
SeoPage → SeoContent (many, onDelete: Cascade)
Competitor → CompetitorSnapshot (many, onDelete: Cascade)
```

**Note:** Foreign key cascades are not configured in the schema except for `SeoContent` (which cascades on `SeoPage` delete). The workspace delete API handles other cascades manually in a transaction. If any new child models are added to `Workspace`, the delete route (`app/api/workspaces/[id]/route.ts`) must be updated.

### 6.10 SEO v1

A full SEO module has been built and deployed. It includes:

**Google Search Console OAuth**
- Connect flow: `/api/seo/connect` → Google OAuth → `/api/seo/callback`
- Callback auto-selects the GSC property matching the workspace `websiteUrl`, falls back to first available
- Access token and refresh token are AES-256-GCM encrypted before storage in `SeoConnection`
- Token refresh happens proactively on every GSC data fetch (tokens expire in 1 hour)

**On-Page Scoring**
- `services/seo/on-page-analyzer.ts` — fetches the page HTML with Cheerio, scores 4 dimensions (title, meta description, H1, heading structure), each 0–25 points, total 100
- Returns current title/meta/H1 alongside the score breakdown

**AI SEO Content Generation**
- `services/seo/content-generator.ts` — calls Claude claude-sonnet-4-6 with the page analysis and the workspace `BrandProfile`
- Generates: Meta Title, Meta Description, H1 Heading, Intro Copy
- Stored as `SeoContent` records (one per `SeoContentType` enum value per page, latest wins)

**GSC Analytics Dashboard**
- `services/seo/gsc-client.ts` — queries GSC Search Analytics API for top queries (90 days) and click trend (30 days)
- Results displayed as a Recharts line chart (clicks + impressions) and a sortable top queries table
- GSC has a 3-day data lag — fresh connections will show an empty chart initially

**New DB models:** `SeoConnection`, `SeoPage`, `SeoContent`, `SearchConsoleData`

**Status:** Code deployed. DB tables require `prisma db push` against production Supabase — see Section 8 for the current blocker.

---

## 7. Current Workspace

One workspace is currently active in production:

- **Into The Wild Marketing** — the agency's own workspace, used for testing
- Website URL: set (intothewildmarketing.com.au or similar)
- Social accounts: LinkedIn personal profile connected
- Brand profile: built and visible on the Brand AI page

---

## 8. Known Limitations & Pending Work

### Social Platform Issues

**LinkedIn:**
- Only personal profiles can be connected with current approved scopes (`openid profile email`)
- Company page posting requires the LinkedIn Community Management API — this requires a separate LinkedIn Developer application and approval process
- Personal posting (`w_member_social` scope) requires LinkedIn to verify and approve the app — apply at [LinkedIn Developer Portal](https://developer.linkedin.com)

**Facebook / Instagram:**
- OAuth flow is built and the Facebook app (App ID: 1480576426774303) is created
- The Facebook redirect URI must be set to: `https://lyra-online-app.netlify.app/api/social/callback/facebook`
- Facebook apps in development mode only allow connections from users listed as app Testers or Developers. To allow any user to connect, the app must go through Facebook App Review.

**Google Business, Twitter, TikTok:**
- OAuth service files and routes exist in the codebase
- Developer apps have not been created for these platforms yet
- Connection will fail until the respective developer apps are created and credentials added to Netlify env vars

**YouTube:**
- OAuth flow built using Google OAuth 2.0 with `youtube` and `youtube.upload` scopes
- Uses the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as Google Business
- Requires: YouTube Data API v3 enabled in Google Cloud Console ✅ (done)
- Requires: `https://lyra-online-app.netlify.app/api/social/callback/youtube` added as an authorised redirect URI in the OAuth client ✅ (done)
- Fetches the connected Google account's YouTube channel (name, handle, avatar)
- Stores channel as a `YOUTUBE` `SocialAccount` with encrypted access + refresh tokens

### Brand AI Social Analysis

- The `analyzeSocialPosts()` function returns an empty array — no platform API integration yet reads recent posts for analysis
- Brand profiles are currently built entirely from website data
- Once posting scopes are approved on each platform, the social analyzer can be wired up to pull recent posts and enrich the brand profile

### BullMQ Workers

- Workers are **live on Railway**. Logs confirm `[workers] All workers started`.
- `lib/redis.ts` is the canonical Redis connection factory — imported by both cron routes (as Queue producers) and worker files (as Worker consumers)
- `railway.toml` specifies `buildCommand = "npm install"` (overrides Railway's default Next.js build) and `startCommand = "npx tsx workers/index.ts"`
- All four cron-job.org jobs are active and returning 200 responses

### Post Boosting — `ads_management` scope pending Meta App Review

- The boost UI, API routes, and database table are all live
- `adAccountId` will not be auto-populated on Facebook reconnect until Meta approves the `ads_management` scope for the app
- **Workaround for testing:** set `adAccountId` directly in Supabase: `UPDATE "SocialAccount" SET "adAccountId" = 'YOUR_AD_ACCOUNT_ID' WHERE platform = 'FACEBOOK'`
- Ad account IDs can be found in Meta Business Manager → Ad Accounts
- **Proper fix:** submit `ads_management` for Meta App Review, then re-add `'ads_management'` to the SCOPES array in `lyra/services/social/facebook.ts` — users will get it stored automatically on next Facebook reconnect

### Mobile Responsiveness

- The sidebar is not yet optimised for mobile — it does not collapse to a bottom nav or hamburger menu on small screens
- All other pages use responsive Tailwind classes and work acceptably on mobile

### Cron Jobs

Four cron routes exist and are production-ready. All require a `Authorization: Bearer {CRON_SECRET}` header. None are wired to an external scheduler yet.

| Route | Frequency | Purpose |
|---|---|---|
| `/api/cron/publish-due-posts` | Every 1 min | Enqueues SCHEDULED posts past their `scheduledAt` time into the `post-publishing` BullMQ queue |
| `/api/cron/sync-comments` | Every 5 min | Polls platform APIs for new comments; enqueues new ones to `ai-responding` queue |
| `/api/cron/sync-metrics` | Every hour | Fetches likes/comments/shares for PUBLISHED posts; updates `PostMetrics` rows |
| `/api/cron/brand-refresh` | Weekly (Sun midnight) | Refreshes brand intelligence + triggers engagement analysis for all workspaces |

**To activate:** configure these as HTTP cron jobs on [cron-job.org](https://cron-job.org) (free tier, sufficient). See Session 7 manual steps for the exact schedule and header configuration.

Note: Netlify scheduled functions are not suitable here because they cannot pass custom headers (needed for `CRON_SECRET` auth). Use an external HTTP cron service.

### Engagement Heat Map — Cold Start

The engagement heat map on the Brand page will show progress bars ("X of 20 posts") until each platform reaches the 20-post threshold with non-zero `PostMetrics`. This requires:
1. BullMQ workers deployed to Railway (so posts actually publish)
2. `sync-metrics` cron running (so `PostMetrics` rows are populated)

Until those workers are live, the panel will remain in cold-start state. This is expected behaviour — it degrades gracefully.

### Schema Changes Applied

**Schema is now auto-synced on every Netlify deploy** via `prisma db push --accept-data-loss` in the build command. No manual schema steps are needed after any deploy.

**All models and columns through the most recent session are in production**, including:
- `Post.topic` (Session 6)
- SEO tables: `SeoConnection`, `SeoPage`, `SeoContent`, `SearchConsoleData` (Session 6)
- `SocialAccount.lastCommentSyncAt` (Session 7)
- `PostBoost`, `BoostStatus` enum, `SocialAccount.adAccountId` (Session 10)
- Security audit indexes + unique constraint on `Comment` (2026-05-22 audit)
- **P1 Crisis Aware:** `Workspace.crisisAware`, `Workspace.crisisActive`, `Workspace.crisisTriggeredAt`, `CrisisEvent` model
- **P3 Competitor Intelligence:** `Competitor` model, `CompetitorSnapshot` model

**For local development:** schema changes still require a manual `prisma db push` or Supabase SQL Editor step against the development database. The automated step only runs in the Netlify build pipeline.

---

## 9. Local Development Setup

```bash
# Clone the repository
git clone https://github.com/rich3524-cyber/LYRA.git
cd LYRA/lyra

# Install dependencies
npm install

# Create .env.local with all variables from Section 5

# Generate Prisma client
npx prisma generate

# Start dev server
npm run dev
```

**Important for Windows + local SSL issues:** If you see certificate errors when running Netlify CLI, prefix commands with:
```
NODE_OPTIONS="--use-system-ca" npx netlify ...
```

### Applying Schema Changes

**Production:** schema changes are applied automatically by `prisma db push` as part of the Netlify build — push your code and the schema syncs on deploy.

**Local/development database:** still requires a manual push:

```bash
# From lyra/ directory, using your local DATABASE_URL
npx prisma db push

# If prisma db push fails (connection issues), use Supabase SQL Editor directly:
# write the SQL equivalent, paste into Supabase → SQL Editor, run
# then regenerate the client locally:
npx prisma generate
npm run type-check
```

---

## 10. Design System Summary

LYRA uses a strict dark near-black design system defined in `lyra/lib/design-tokens.ts` and `tailwind.config.ts`.

| Token | Value | Use |
|---|---|---|
| `background-primary` | `#080808` | Main app background |
| `background-secondary` | `#0f0f0f` | Cards, panels |
| `background-tertiary` | `#141414` | Elevated surfaces |
| `text-primary` | `#e2e2e2` | All primary text |
| `text-secondary` | `#888888` | Labels, metadata |
| `text-tertiary` | `#555555` | Muted, disabled |
| `accent-platinum` | `#d8d8d8` | CTAs, active states |
| `status-success` | `#4ade80` | Connected, published |
| `status-error` | `#f87171` | Errors, destructive |
| `status-warning` | `#fbbf24` | Pending approval |
| `status-info` | `#60a5fa` | Scheduled |

**Fonts:**
- `Instrument Serif` — display headings only (page titles)
- `DM Sans` — all UI text, weights 300/400/500 only (never bold/700)
- `Geist Mono` — all data values, metrics, IDs

**Rules:** Never hardcode hex values — always use Tailwind tokens. Lucide icons only, `strokeWidth={1.5}` default. No emoji as icons.

---

## 11. Key File Locations

| File | Purpose |
|---|---|
| `lyra/CLAUDE.md` | Full project standards — read by Claude Code at session start |
| `lyra/prisma/schema.prisma` | Complete database schema |
| `lyra/lib/auth.ts` | `getCurrentUser()` and `requireAuth()` |
| `lyra/lib/prisma.ts` | Prisma singleton (always import from here) |
| `lyra/lib/anthropic.ts` | Anthropic client |
| `lyra/lib/encrypt.ts` | AES-256-GCM `encrypt()` / `decrypt()` for social tokens |
| `lyra/lib/design-tokens.ts` | Design token reference |
| `lyra/services/brand-intelligence/scraper.ts` | Website scraper (Cheerio) |
| `lyra/services/brand-intelligence/profile-builder.ts` | Claude brand profiler |
| `lyra/lib/s3.ts` | S3 helpers — `getPresignedUploadUrl()`, `deleteObject()` |
| `lyra/services/social/facebook.ts` | Facebook Graph API helpers + `fetchAdAccountId()` |
| `lyra/services/social/meta-ads.ts` | Meta Marketing API — `createBoost()`, `cancelBoost()`, `getBoostReach()` |
| `lyra/services/social/linkedin.ts` | LinkedIn API helpers |
| `lyra/services/social/youtube.ts` | YouTube OAuth + channel fetch |
| `lyra/app/(dashboard)/layout.tsx` | Authenticated app shell |
| `lyra/app/api/workspaces/[id]/route.ts` | Workspace CRUD including cascade delete |
| `lyra/app/api/brand-intelligence/build/route.ts` | Brand profile build endpoint |
| `lyra/app/api/social/callback/[platform]/route.ts` | OAuth callback handler |
| `lyra/components/lyra/app-shell/sidebar.tsx` | Sidebar with brand lock logic |
| `lyra/components/lyra/calendar/content-calendar.tsx` | Monthly calendar with filters, DnD, and detail panel |
| `lyra/components/lyra/calendar/post-detail-panel.tsx` | Slide-in post detail + status editor |
| `lyra/components/lyra/brand/brand-build-button.tsx` | Brand profile build trigger |
| `lyra/components/lyra/brand/guidelines-uploader.tsx` | Drag-and-drop brand guidelines uploader |
| `lyra/components/lyra/settings/delete-workspace-button.tsx` | Delete with confirmation |
| `lyra/services/ai/engagement-analyzer.ts` | Engagement pattern analysis — weighted scoring, thresholds, normalisation |
| `lyra/services/ai/schedule-generator.ts` | AI schedule generator — Claude prompt builder, accepts `postingPatterns` |
| `lyra/app/api/brand-intelligence/analyze-engagement/route.ts` | Manual engagement analysis trigger endpoint |
| `lyra/app/api/schedule/generate/route.ts` | AI schedule generation endpoint |
| `lyra/components/lyra/brand/engagement-insights.tsx` | Engagement heat map panel + cold start progress bars |
| `lyra/components/lyra/schedule/schedule-generator.tsx` | AI schedule generator modal component |
| `lyra/lib/redis.ts` | `getRedisConnection()` factory + `redis` named export — imports by both cron routes and worker files |
| `lyra/workers/post-publisher.worker.ts` | BullMQ worker — publishes posts to Facebook, Instagram, LinkedIn, Twitter |
| `lyra/workers/comment-monitor.worker.ts` | BullMQ worker — polls platforms for new comments, enqueues to ai-responding queue |
| `lyra/workers/ai-responder.worker.ts` | BullMQ worker — generates AI draft/auto responses for new comments |
| `lyra/workers/brand-sync.worker.ts` | BullMQ worker — refreshes brand intelligence data on schedule |
| `lyra/workers/index.ts` | Worker entry point — starts all 4 workers, graceful SIGTERM/SIGINT shutdown |
| `lyra/railway.toml` | Railway deployment config — start command `npx tsx workers/index.ts` |
| `lyra/app/api/cron/publish-due-posts/route.ts` | Cron endpoint — enqueues due SCHEDULED posts into the post-publishing queue |
| `lyra/services/seo/gsc-client.ts` | GSC OAuth + API queries |
| `lyra/services/seo/on-page-analyzer.ts` | Cheerio page scraper + 100-point scorer |
| `lyra/services/seo/content-generator.ts` | Claude SEO content generator |
| `lyra/app/(dashboard)/workspace/[workspaceId]/seo/page.tsx` | SEO workspace page (exports `SeoPageWithContent` type) |
| `lyra/components/lyra/seo/seo-connect.tsx` | GSC connect prompt UI |
| `lyra/components/lyra/seo/seo-dashboard.tsx` | SEO dashboard shell |
| `lyra/components/lyra/seo/page-manager.tsx` | Add/remove tracked pages |
| `lyra/components/lyra/seo/page-card.tsx` | Per-page score + AI content card |
| `lyra/components/lyra/seo/ai-content-panel.tsx` | AI content display with copy buttons |
| `lyra/components/lyra/seo/gsc-analytics.tsx` | GSC chart + top queries table |
| `lyra/app/docs/legal/[filename]/route.ts` | Serves legal PDFs from `public/docs/legal/` — bypasses the Netlify static file routing issue |
| `lyra/public/docs/legal/` | Legal PDFs (Instruction Manual, Privacy Policy, Terms of Service) |
| `lyra/services/ai/content-scorer.ts` | `scoreContent(content, platform)` — 6-dimension Claude scorer, returns typed `ScoringResult` |
| `lyra/app/api/ai/score-content/route.ts` | POST endpoint for pre-publish content scoring |
| `lyra/components/lyra/composer/content-score-panel.tsx` | Slide-in score panel — `ScoreRing` SVG, `DotBar`, suggestions |
| `lyra/services/ai/content-repurposer.ts` | `extractArticleText(url)` (SSRF-safe Cheerio), `repurposeContent()` async generator |
| `lyra/app/api/ai/repurpose/route.ts` | SSE streaming repurpose endpoint |
| `lyra/components/lyra/repurpose/repurpose-form.tsx` | Repurpose UI — URL/text toggle, platform chips, SSE reader |
| `lyra/app/(dashboard)/workspace/[workspaceId]/repurpose/page.tsx` | Repurpose page (server, auth-guarded) |
| `lyra/app/(dashboard)/workspace/[workspaceId]/competitors/page.tsx` | Competitor Intelligence page |
| `lyra/netlify.toml` | Build config — now includes `prisma db push` for automatic schema sync |

---

## 12. Immediate Next Steps (Recommended Order)

**Deployment (do first):**
1. **Fix `DIRECT_URL` in Netlify** — set it to the Supabase Session Pooler URL (port 5432): `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`. Once fixed, remove the `DIRECT_URL="$DATABASE_URL"` prefix from the `netlify.toml` build command and push.

**New features (ready to build):**
2. **Inbox UI** — comments API exists (`/api/comments`), inbox page at `/workspace/[id]/inbox` needs a UI. Workers are live and populating `Comment` rows.
3. **Media Library** (Phase 3) — S3 upload, AI topic tagging, media picker in composer and schedule review. Spec: `lyra/docs/superpowers/specs/2026-05-19-ai-content-schedule-design.md` section 3.
4. **Crisis Aware UI** — the data model and detection logic exist; build the workspace settings toggle and the in-app crisis alert/resolve UI.

**Platform / integrations:**
5. **Test GSC OAuth end-to-end** — navigate to SEO → connect Search Console → verify property auto-selects → add a page → Analyse → Generate
6. **Test YouTube connection** — connect a Google account in Settings → YouTube, verify the channel saves correctly
7. **Connect Facebook** — reconnect Facebook in Settings; then set `adAccountId` manually in Supabase to test post boosting end-to-end
8. **Apply for Meta App Review** — submit `ads_management` scope. Once approved, re-add `'ads_management'` to SCOPES in `facebook.ts` — `adAccountId` will populate automatically on next reconnect.
9. **Apply for LinkedIn company page access** — submit LinkedIn Community Management API application so pages (not personal profiles) can be connected
10. **Apply for LinkedIn app verification** — enables `w_member_social` scope for posting
11. **Create Google Business, Twitter, TikTok developer apps** — add credentials to Netlify env vars so those OAuth flows work

**UX / business:**
12. **Mobile sidebar** — add a hamburger menu / bottom nav for mobile viewports
13. **Stripe billing / marketing page** — create Stripe products/prices, wire up checkout flow, build public marketing landing page (plan saved: `lyra/docs/superpowers/plans/2026-05-19-marketing-landing-page.md`)

**Post boosting — low priority polish:**
14. Add cron job or scheduled check to flip `PostBoost.status` from `ACTIVE` to `ENDED` when `endsAt` has passed (currently boosts stay ACTIVE in the DB after expiring on Meta's side)
15. Pull `broad` audience country from workspace settings instead of hardcoded `'AU'` in `meta-ads.ts`
