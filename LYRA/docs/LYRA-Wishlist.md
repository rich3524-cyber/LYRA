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

Sorted by importance — prerequisites first, differentiators second, polish last.

---

### 🔴 Critical — Prerequisites for Agencies at Scale

**1. Notifications**
LYRA's autonomy promise breaks without this. When a crisis triggers, a post fails, an approval is needed, or a comment is escalated — there is currently no way to tell anyone. Two layers needed: (a) urgent alerts sent immediately (crisis, post failure, escalation) and (b) a daily or weekly digest summarising posts published, comments responded to, drafts waiting, and top-performing content. Email is the minimum; push notifications via browser or mobile would be the full solution.

**2. Client portal**
The client approval workflow was built (Session 38) but clients have no interface to use it from. Agencies need a stripped-down client-facing view where clients can see their content calendar, approve or reject pending posts, and read AI draft responses — without accessing the full LYRA dashboard. The data model (`ClientAccess`, `WorkspaceAccess`, `PostApproval`) is already in place. This is the UI layer that makes the approval workflow usable in the real world.

**3. Team member invitations**
The schema supports roles (`AGENCY_ADMIN`, `CLIENT_APPROVE`, `SMB_OWNER`) and `WorkspaceAccess` records, but there is no UI to invite someone to a workspace or grant them a role. Currently the only way to add a team member is a direct database insert. Agencies have teams. This needs an invite-by-email flow with role selection.

---

### 🟠 High Value — Differentiators

**4. Best time to post**
LYRA already collects `PostMetrics` (likes, comments, shares, reach) for every published post. The engagement heat map on the Brand page is phase one. Phase two: close the loop in the composer by surfacing AI-generated posting time recommendations per platform, based on each workspace's own historical data — not generic industry averages. "Your last 30 LinkedIn posts suggest Tuesday 9am gets 3× your average engagement." No other scheduling tool does this with client-specific data.

**5. Bulk scheduling / CSV import**
Agencies plan content in spreadsheets. Every post currently has to be created individually in the composer. A CSV upload — columns: date, time, platform, caption, media URL — would let an agency upload an entire month's content in one step. The scheduled posts would appear in the calendar immediately. Standard agency workflow; frequently requested by social media managers.

**6. Email digest**
Weekly (or configurable) summary email per workspace sent to the workspace owner: posts published, comments responded to by AI, drafts waiting for review, crisis events, and the top-performing post of the week. Keeps agency owners and their clients informed without requiring a login. Pairs directly with the autonomous mode value proposition — if LYRA is working while you sleep, you need a morning report.

---

### 🟡 Medium Priority — Worth Building Post-Launch

**7. Post recycling / evergreen content**
Mark a post as evergreen and have LYRA auto-reshare it on a configurable schedule (e.g., every 90 days). Useful for high-performing content, product announcements, and seasonal campaigns. Simple to implement on top of the existing scheduler — just re-enqueue with a future `scheduledAt` date when a post is marked as evergreen.

**8. Hashtag intelligence**
When composing a post, LYRA analyses the content and the workspace brand profile and suggests platform-appropriate hashtags. LinkedIn hashtags differ from Instagram hashtags in style, count, and intent. Claude can generate these with a short prompt. Could also track which hashtags historically drive the most engagement for that workspace.

**9. White-labeling**
Agency tier upsell: custom domain (e.g., `social.agencyname.com`), logo replacement, and colour scheme override. Agencies that resell LYRA to clients under their own brand would pay a premium for this. Significant additional revenue per Agency seat.

**10. UTM parameter automation**
When a post contains a URL, automatically append UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) based on configurable workspace defaults. Links then flow into Google Analytics with correct attribution. Agencies tracking campaign ROI will want this.

---

### 🔵 Compliance — Needed Before Scaling to Europe

**11. GDPR tools**
Data export (all data held for a user/workspace as a downloadable ZIP) and deletion requests (purge a workspace and all its data on request). Required for any EU customers. Also needed: a visible data processing agreement and a cookie consent banner on the marketing site. Low effort to build; high risk to skip.

---

*Last updated: June 2026*
