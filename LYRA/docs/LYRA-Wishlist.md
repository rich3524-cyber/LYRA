# LYRA — Feature Wishlist

A living document for features, improvements, and ideas to build. Items here are not committed to a timeline — they are candidates for future sessions.

Anything marked ✅ is already shipped. Anything without a mark is not yet built.

---

## From Phase 2 — Intelligence (original roadmap)

These items were on the original Phase 2 plan. Most are built; the ones below are still outstanding.

| # | Feature | Notes |
|---|---|---|
| 13 | **Stripe billing integration** | Products and prices created in Stripe; checkout and webhook handling code exists in `app/api/stripe/`. Waiting on bank setup before activating. |
| 14 | **Analytics dashboard — depth** | Phase 1 analytics page exists. Needs richer charts: follower growth, best-performing content, platform breakdown over time, and reach estimates. |

---

## From Phase 3 — Autonomy & Scale (original roadmap)

| # | Feature | Notes |
|---|---|---|
| 15 | ✅ BullMQ workers | Post publisher, comment monitor, AI responder, brand sync — all live on Railway. |
| 16 | **Full end-to-end autonomous AI response** | Workers are built. Need to validate the full loop in production: comment synced → AI draft generated → auto-posted without human action (FULL autonomy mode). Also need to test DRAFT_APPROVE flow with real Facebook comments once Meta App Review passes. |
| 17a | ✅ YouTube | Connected. OAuth + channel storage working. |
| 17b | **Pinterest** | Platform enum exists in schema. Needs OAuth setup in Pinterest Developer portal, `services/social/pinterest.ts`, callback handler, and settings card. |
| 17c | **Threads** | Meta's newer platform. Needs separate app setup (separate from Facebook App Review). API is more limited than Instagram — research required before committing. |
| 17d | **Bluesky** | AT Protocol (not OAuth). Separate auth model — uses app passwords. Needs research into posting API and whether comment monitoring is viable. |
| 18 | **Advanced analytics + AI insights** | Engagement heat map exists (brand page). Wishlist: AI-generated weekly performance summary per workspace ("Your top post this week was X. Engagement dropped 12% on LinkedIn — likely due to posting time."), posted via Claude using `PostMetrics` data. |
| 19 | **PDF export reports** | Monthly or custom-range PDF report per workspace: top posts, engagement metrics, platform breakdown, AI response summary. Branded with workspace name. Useful for agency client reporting. |
| 20 | **Production hardening** | Sentry error tracking, structured logging (Pino or similar), Netlify analytics / uptime monitoring, Railway worker health checks, alert on worker crash. |

---

## Post-Launch Add-Ons (already specced)

| Feature | Spec | Notes |
|---|---|---|
| **Creative Studio** | `docs/superpowers/specs/2026-06-07-creative-studio-design.md` | AI image + video generation guided by Brand AI. Phase 1: images (Ideogram, FLUX). Phase 2: short-form video (Higgsfield, Runway). Do not build until core product is validated with paying users. |

---

## Backlog — Low Priority Polish

| Feature | Notes |
|---|---|
| **Post boost expiry cron** | Flip `PostBoost.status` from `ACTIVE` to `ENDED` when `endsAt` passes. Currently boosts stay ACTIVE in DB after expiring on Meta's side. |
| **Boost audience country from settings** | `meta-ads.ts` has `'AU'` hardcoded. Should pull from workspace timezone/settings. |
| **Social feed analysis for Brand AI** | `analyzeSocialPosts()` returns an empty array — no platform reads recent posts for brand profiling yet. Once posting scopes are approved, wire up post fetching to enrich brand profiles. |
| **Media Library** | S3 media browser inside LYRA — upload once, reuse across posts. AI topic tagging. Media picker in composer and schedule review. Phase 3 spec referenced in `2026-05-19-ai-content-schedule-design.md`. |

---

## New Ideas

*Add future wishlist items here.*

---

*Last updated: June 2026*
