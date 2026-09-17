# LYRA Product Scope Document

**Version:** 2.0  
**Date:** 17 July 2026  
**Status:** Post-build retrospective — internal testing phase  
**Domain:** lyraonline.ai (live)

---

## 1. Executive Summary

LYRA is a self-serve SaaS social media intelligence platform built for agencies, freelancers, and SMBs, live in production at lyraonline.ai. It combines AI-powered content scheduling, brand voice generation, and AI-driven comment response across major social platforms. LYRA's core point of difference remains unchanged from the original vision: it does not just schedule and post content — it actively engages with audiences on behalf of clients, with configurable autonomy levels, confirmed working end-to-end in production.

This document is a retrospective update to the original v1.1 Scope Document (13 May 2026), written during initial product discovery before any build work had started. Everything described in this version reflects what has actually been built and verified working, not what was planned. Where original scope items remain unbuilt or partially built, that is stated explicitly rather than presented as complete.

LYRA is currently in an internal testing phase (started 14 July 2026) — the platform is functionally complete for its core workflows and is being deliberately exercised under real, varied use before wider release, rather than continuing active feature construction. A running testing checklist is maintained at `docs/LYRA-Testing-Checklist.md`.

---

## 2. Brand Identity

Unchanged from the original vision and fully implemented in the live product.

- **Name:** LYRA
- **Domain:** lyraonline.ai
- **Visual identity:** Ultra-premium, near-black / platinum / monochromatic aesthetic, implemented as a strict design token system. Near-black (`#080808`) background, platinum (`#d8d8d8`) accent, confirmed applied consistently across every authenticated page.
- **Typography:** DM Sans (UI text), Instrument Serif (display headings), Geist Mono (data values) — all three confirmed in use throughout the app.
- **Brand positioning:** LYRA is not a content scheduler. It is a brand intelligence platform that schedules, publishes, and converses — autonomously — on behalf of the world's most ambitious brands and agencies. This positioning is now backed by a live, working autonomous comment-response system, not just a stated ambition.

---

## 3. Target Market

Unchanged from the original scope. Three segments remain first-class citizens of the platform, differentiated by pricing tier (Starter / Pro / Agency): SMBs, freelancers, and agencies. No changes to this segmentation were required during the build.

---

## 4. Core Platform Features — Current State

### 4.1 Client Workspace Management — ✅ Built and live

Per-client workspaces with dedicated brand profile, connected social accounts, content calendar, post history, and engagement inbox. Workspace switching via persistent sidebar. Workspace count gating by plan tier is implemented in the API layer.

---

### 4.2 Social Platform Support — ✅ Built, architecture changed from original plan

**Significant architectural deviation from the original scope:** rather than integrating directly with each platform's official API (as originally planned), LYRA routes new social connections and publishing through Zernio, a unified social API bridge. This decision was made mid-build to avoid the multi-month platform app review process required for direct API access to several platforms. Native per-platform code (`services/social/*.ts`) is retained as a fallback for accounts connected before the Zernio bridge existed, and is still the live path for LinkedIn comment/reply operations.

**Confirmed live and tested end-to-end** (connect, publish, and — where applicable — comment sync):

- Facebook *(Into The Wild Marketing workspace; LYRA workspace blocked by an external Meta Business Portfolio propagation issue, not a LYRA defect)*
- Instagram
- LinkedIn
- X (Twitter)
- TikTok
- Google Business Profile
- YouTube

**Partially scaffolded, not yet functional** (enum and Zernio platform-slug mapping exist, but no connect route, settings UI, or service implementation):

- Pinterest
- Threads
- Bluesky

---

### 4.3 Social Account Connection — Guided Client Onboarding — ✅ Built

Secure, token-based onboarding link per client workspace; client authorises their own accounts via OAuth. Matches original scope exactly.

---

### 4.4 Brand Intelligence Engine — ✅ Built, one known gap

Website scraping (Cheerio-based crawler), uploaded brand guideline document parsing, and Claude-based brand profile generation are all built and live. AI caption generation is grounded in the resulting brand profile.

**Known gap:** social feed analysis (analysing a client's own historical posts to refine the brand profile) is not implemented — `analyzeSocialPosts()` is called with an empty array from both the brand-sync worker and the manual brand-build endpoint. Brand profiles are currently built from website content and uploaded documents only, not from a brand's own posting history.

---

### 4.5 AI Content Generation — ✅ Built

Claude-based caption/content generation grounded in the Brand Intelligence Profile, plus a live 6-dimension Pre-Publish Content Scoring feature (hook, clarity, CTA, length, hashtags, emotional resonance) not present in the original scope document — added during the build as a differentiator.

---

### 4.6 Post Scheduling & Publishing — ✅ Built and confirmed fully automatic

Tiptap-based composer, platform selector, drag-and-drop and click-to-select media upload, content calendar with monthly grid view, and scheduled publishing via a BullMQ worker fleet (Railway) triggered by an external cron schedule (cron-job.org).

This is the most heavily exercised and hardened part of the platform: an extended debugging session (14 July 2026) traced and fixed four independently stacked infrastructure failures that had been silently preventing scheduled posts from ever publishing — missing cron authentication headers, an undeployed cron route, an overly-broad `.gitignore` rule blocking new files from being committed project-wide, and missing database credentials on the worker fleet. A related media-attachment bug (S3 bucket permissions plus an incorrect field in the Zernio publish request) was found and fixed the same day. Scheduled posts with attached media are now confirmed working automatically end-to-end, with no manual intervention required.

An "Edit in Composer" flow for already-scheduled posts — present as a link in the original UI but never actually functional — was built out properly on 17 July 2026 (loads the real post content, media, and schedule for editing, rather than opening a blank composer).

---

### 4.7 AI Comment & Review Response — ✅ Built and confirmed working live

All three autonomy modes from the original scope are implemented, using the exact terminology `OFF` / `DRAFT_APPROVE` / `FULL` in the platform's data model:

| Mode | Behaviour |
|---|---|
| **Full Automatic (`FULL`)** | AI generates and posts responses with no human review. Confirmed live 17 July 2026 on real Instagram comments — correct, on-brand, automatic responses with zero manual step. |
| **Post with Approval (`DRAFT_APPROVE`)** | AI drafts a response; a human approves before it posts. |
| **No Reply (`OFF`)** | AI does not respond; comments are surfaced for manual handling. |

Comment ingestion is Zernio-webhook-driven for ZERNIO-provider accounts (near-real-time) with a legacy polling path retained for NATIVE-provider accounts. A significant, previously-undetected bug was found and fixed on 17 July 2026: the webhook handler read a field (`comment.accountId`) that does not exist on real Zernio deliveries, meaning zero comments had ever successfully reached the Inbox since the webhook was originally built — a defect invisible in code review and only caught by testing with a real comment. A related self-reply feedback loop (the AI's own posted replies being re-ingested as new incoming comments) was found and fixed the same day.

Guardrails (never-discuss topics, banned words, always-escalate triggers, approved answers) are implemented via the `Guardrail` model and enforced in `generateCommentResponse()`. **Crisis Aware Detection** — not present in the original scope document — was added during the build: a sentiment-spike detector that automatically pauses posting and creates an audit trail (`CrisisEvent`) when triggered. No dedicated user-facing crisis dashboard exists yet; resolution currently requires direct database access.

---

### 4.8 Client Access & Approval Workflows — ✅ Built

`ClientAccess` levels (None / View / Approve) and the `PostApproval` model are implemented, matching the original scope.

---

### 4.9 Analytics & Reporting — ✅ Built 17 July 2026 (previously a placeholder)

This section required a substantial correction from prior project documentation. Until 17 July 2026, the Analytics tab's engagement metrics (Total Reach, Total Likes, and related figures) were not real data — the underlying sync job only ever wrote empty placeholder rows, by its own code comment (*"real platform polling will be implemented per-platform as social API access is granted"*), for the entire period the platform has existed. Post counts, comment response rate, and platform breakdown were unaffected since they don't depend on this data path, which is why the gap wasn't obvious from normal use.

Built and confirmed live 17 July 2026: the metrics sync job now calls Zernio's analytics API per post and writes real `likes` / `comments` / `shares` / `reach` / `impressions` / `clicks` / `saves` values. A follow-up fix the same day corrected a platform-specific resolution failure (LinkedIn posts weren't resolving via their native post ID; Zernio's own internal post ID is now captured and stored at publish time and preferred for analytics lookups).

**Delivered from original Phase 1 scope:** post-level stats, cross-platform dashboard, platform breakdown, top posts by reach, engagement-over-time chart, comment response rate.

**Not yet delivered from original Phase 2 (Advanced) scope:** AI-generated insights and recommendations, competitor benchmarking within the analytics view, content performance predictions before publishing. Follower growth over time and best-performing-content-type breakdowns are also not present in the current dashboard.

---

### 4.10 SEO Content Management — ✅ Built, some Phase 2/3 scope items not yet started

**Delivered:** Google Search Console OAuth connection, on-page analysis and scoring, AI-generated meta titles/descriptions/headings/intro copy grounded in the brand profile, tracked-pages manager.

The GSC connect flow itself required two separate fixes on 17 July 2026 before it worked at all: the OAuth redirect URI was pointing at a stale Netlify subdomain instead of the production domain, and the site had never actually been verified in Search Console. Confirmed working via a genuine disconnect-and-reconnect test.

**Not yet started from original Phase 2/3 scope:** keyword cluster workspace, content gap analysis, automated content refresh engine, unified social+SEO content calendar view, dedicated SEO analytics dashboard (organic traffic trends, keyword ranking history).

---

### 4.11 Competitor Intelligence — ✅ Built, not present in original scope document

Not part of the original v1.1 scope. Tracks up to 10 competitors per workspace (Pro/Agency plans), with a nightly scrape (4am) extracting recent posts and themes from each competitor's website. Instagram, LinkedIn, Twitter, and Facebook handle/page-ID fields can all be recorded against a competitor (Instagram and LinkedIn added 17 July 2026), but **none of the four platform fields currently drive real social scraping** — only website scraping is functionally implemented; the scraper's own code explicitly marks social-platform scraping as out of scope for the current version.

---

### 4.12 Post Boost (paid promotion) — ✅ Built, not present in original scope document

Not part of the original v1.1 scope. Allows boosting a published Facebook or Instagram post as a paid ad directly from the post detail panel, with budget/duration/audience controls. Requires a connected Facebook Ad Account and a Pro or Agency plan. Audience targeting currently hardcodes country to Australia (`AU`) — a known limitation, not yet configurable per workspace.

---

### 4.13 LYRA Trend (paid add-on) — Scaffolded, not functional

Not part of the original v1.1 scope; added as a planned à la carte add-on. A full code scaffold exists (worker, API routes, UI components, Stripe checkout route) but is not wired into the live product — the `sync-trends` cron endpoint is currently a stub returning a fixed "launches in Phase 3" response. The scaffold's presence in the codebase should not be read as functional completeness.

---

## 5. User Roles & Permissions — ✅ Built, unchanged from original scope

`UserRole` enum (Platform Owner, Agency Admin, Agency Team Member, Client View, Client Approve, SMB Owner) matches the original scope exactly, enforced via workspace-access-verification patterns throughout the API layer.

---

## 6. Guided Client Onboarding Flow — ✅ Built, matches original scope

---

## 7. Pricing Structure — Partially confirmed, needs live verification

Starter / Pro / Agency tiers exist as defined in the original scope, with Stripe checkout routes and price IDs configured as environment variables in production. Whether these are fully wired to live, correctly priced Stripe products and have been tested through a real subscription flow has not been confirmed during this testing pass — **this is flagged as an open item requiring verification before relying on it for real billing** (see Section 11).

---

## 8. Technical Architecture — Actual (differs from original plan in several places)

| Layer | Originally Planned | Actually Built |
|---|---|---|
| Frontend | Next.js (React) | Next.js 16, TypeScript |
| Backend | Node.js or Python (FastAPI) | Node.js (Next.js API routes + standalone BullMQ workers) |
| Database | PostgreSQL | Supabase-hosted PostgreSQL (Prisma ORM) |
| AI Layer | Anthropic Claude API | Anthropic Claude API (as planned) |
| Social APIs | Official platform APIs, direct | Zernio unified social API for new connects/publish; native platform code retained as fallback for pre-Zernio accounts and LinkedIn comment operations |
| Queue/Jobs | Redis + Bull | Redis (Upstash) + BullMQ, on Railway |
| Storage | AWS S3 or Cloudflare R2 | AWS S3 *(required a mid-build fix: Netlify reserves the `AWS_*` env var prefix for its own Lambda role, so credentials had to be renamed to `S3_*`)* |
| Auth | Auth0 or Clerk | Auth0 |
| Hosting | AWS or Vercel + Railway | Netlify (app) + Railway (background workers) |
| Payments | Stripe | Stripe (routes exist, full wiring unverified — see Section 7) |

**Additional architecture not in the original plan:** an externally-triggered cron mechanism (cron-job.org calling authenticated LYRA API routes) drives scheduled post publishing, comment/metrics sync, and brand refresh — this pattern, and its authentication requirements, was not part of the original technical architecture recommendations.

---

## 9. Development Phases — Actual status

The original three-phase, 12-month plan has been substantially completed, though not strictly in the original sequence — SEO features and several unplanned features (Crisis Aware, Post Boost, Competitor Intelligence) were built alongside core platform work rather than strictly after it.

- **Phase 1 — Foundation:** ✅ Complete. All items delivered.
- **Phase 2 — Intelligence:** ✅ Complete, with one gap. All items delivered except: social feed analysis for the Brand Intelligence Engine remains unimplemented (see Section 4.4).
- **Phase 2 — SEO Management:** ✅ Complete for the items listed (GSC connection, keyword-adjacent on-page AI generation, on-page recommendations). Note: the original scope's "keyword cluster workspace" (Task 16) was not built as a distinct feature.
- **Phase 3 — SEO Intelligence:** ❌ Not started. Content gap analysis, content refresh engine, unified social+SEO calendar, and dedicated SEO analytics dashboard all remain unbuilt.
- **Phase 3 — Autonomy & Scale:** ✅ Mostly complete. Full autonomous AI response posting is live and confirmed working. Agency-level guardrail controls and escalation routing are implemented. Phase 2 platform integrations (YouTube live; Pinterest/Threads/Bluesky partially scaffolded only) are incomplete. Exportable PDF reports are built (Agency Client PDF Reports). Production deployment, CI/CD, and CLAUDE.md are all in place.
- **Current phase (not in original plan):** Internal Testing, started 14 July 2026. The platform is feature-complete for its core loop and is being deliberately exercised under real use rather than having new features actively built, with issues found and fixed as they surface. See `docs/LYRA-Testing-Checklist.md`.

---

## 10. Competitive Landscape

Unchanged from the original assessment. LYRA's primary points of difference remain valid and are now backed by live functionality rather than plans: AI comment/review response at configurable autonomy (confirmed working), deep brand intelligence (built, with the noted social-feed-analysis gap), and integrated SEO content management (built).

---

## 11. Open Items for Resolution (updated)

**Original open items — current status:**

- ~~Register lyraonline.ai domain~~ — ✅ Done, live in production
- Final trademark clearance for LYRA — status unknown, not verifiable from the codebase
- Legal structure for LYRA as separate entity from Into The Wild Marketing — status unknown, not verifiable from the codebase
- Exact pricing per tier — Stripe price IDs exist but full billing flow is unverified (see Section 7)
- Logo design / visual identity — appears complete based on brand assets present in the codebase (`public/brand/`)
- X (Twitter) API cost assessment — superseded; LYRA now routes through Zernio rather than direct API access for most platforms
- TikTok comment API capability — TikTok connect is live; comment/reply capability for TikTok specifically has not been confirmed tested

**New open items identified during this testing pass:**

- Facebook connect for the LYRA workspace itself is blocked by an external Meta Business Portfolio propagation issue (not a LYRA defect) — parked pending Meta-side resolution or Zernio support escalation
- Social feed analysis for the Brand Intelligence Engine is unimplemented (empty array passed at all call sites)
- Pinterest, Threads, and Bluesky are not functional — enum and Zernio slug mapping only
- Competitor Intelligence's social platform fields (Twitter, Facebook, Instagram, LinkedIn) do not drive real scraping — website scraping only
- Post Boost audience targeting hardcodes country to Australia
- LYRA Trend add-on is scaffolded but not functional
- Crisis Aware Detection has no user-facing dashboard for reviewing or resolving a triggered crisis — requires direct database access currently
- Stripe billing flow needs end-to-end live verification before relying on it for real subscriptions
- No visible "reconnect needed" UI state exists yet for an expired or revoked platform token — a silent-failure gap identified but not yet tested

---

## 12. Success Metrics (Year 1) — Not yet measurable

All success metrics from the original scope document remain aspirational targets, not measured results — LYRA has not yet been released beyond internal testing to real paying customers at the scale these metrics assume. They are retained here unchanged as the eventual measurement targets once the platform moves past internal testing.

---

*This document was substantially rewritten 17 July 2026 as a retrospective correction to the original v1.1 product-discovery scope document (13 May 2026), which described a pre-build vision rather than the platform's actual state. Every claim of "built" or "confirmed working" in this version reflects direct verification during development and testing sessions, not assumption.*
