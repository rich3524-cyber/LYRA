# LYRA — Feature Wishlist

A living document for features, improvements, and ideas to build. Items here are not committed to a timeline — they are candidates for future sessions.

Anything marked ✅ is already shipped. Anything without a mark is not yet built.

---

## From Phase 2 — Intelligence (original roadmap)

These items were on the original Phase 2 plan. Most are built; the ones below are still outstanding.

| # | Feature | Notes |
|---|---|---|
| 13 | ✅ **Stripe billing integration** | Fully built and verified live 29 Jul 2026 — a real test-mode purchase confirmed checkout → webhook → plan unlocked → UI reflects it. Found and fixed a genuine billing-integrity bug along the way (workspaces weren't syncing plan on purchase, and a duplicate workspace was silently created — both root-caused to resolving "this agency's workspaces" via an unpopulated FK instead of the real `WorkspaceAccess` relation). |
| 14 | **Analytics dashboard — depth** | Partially there now: platform breakdown, top posts (by reach/views), and an engagement trend chart all exist and are verified live. Still missing: follower growth over time (no `followerCount` field in the schema yet — nothing to chart) and true reach *estimates* vs. actual reach. |

---

## From Phase 3 — Autonomy & Scale (original roadmap)

| # | Feature | Notes |
|---|---|---|
| 15 | ✅ BullMQ workers | Post publisher, comment monitor, AI responder, brand sync — all live on Railway. |
| 16 | ✅ **Full end-to-end autonomous AI response** | Validated in production: Full Autonomy confirmed live on real Instagram comments, and Draft + Approve confirmed live on real Facebook comments (22 Jul 2026). Turns out waiting on Meta App Review wasn't actually necessary — the Zernio Bridge (unified social API, holds its own Meta/LinkedIn/TikTok approvals) sidesteps that dependency entirely; LYRA's own native Meta app review can still complete separately as a long-term path, but isn't blocking this. |
| 17a | ✅ YouTube | Connected. OAuth + channel storage working. |
| 17b | ✅ TikTok | Connected and live. |
| 17c | **Pinterest** | Platform enum exists in schema, and a Zernio slug mapping already exists in `services/social/provider/platform-map.ts` — but `ROUTE_TO_ZERNIO` (the actual connect route dispatch) has no `pinterest` entry, and there's no `services/social/pinterest.ts` or settings card yet. Verified 14 Jul 2026. |
| 17d | **Threads** | Same partial state as Pinterest — enum + Zernio slug mapping only, no connect route wiring or dedicated service file. Meta's newer platform, needs separate app setup (separate from Facebook App Review); API more limited than Instagram — research required before committing. Verified 14 Jul 2026. |
| 17e | **Bluesky** | Same partial state as Pinterest/Threads — enum + Zernio slug mapping only. AT Protocol (not OAuth) — separate auth model using app passwords, not yet implemented. Needs research into posting API and whether comment monitoring is viable. Verified 14 Jul 2026. |
| 18 | **Advanced analytics + AI insights** | Engagement heat map exists (brand page). Wishlist: AI-generated weekly performance summary per workspace ("Your top post this week was X. Engagement dropped 12% on LinkedIn — likely due to posting time."), posted via Claude using `PostMetrics` data. |
| 19 | ✅ **PDF export reports** | Built and confirmed correct 28 Jul 2026 — cover page with agency name, executive summary (posts/impressions/engagements/engagement rate/best platform), platform breakdown table, top posts with stats, and an AI-written performance narrative. 7-day or 30-day period, Agency plan. |
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
| ✅ **Social feed analysis for Brand AI** | `analyzeSocialPosts()` is wired up (verified in `app/api/brand-intelligence/build/route.ts`) — rather than waiting on platform read-scopes, it pulls the workspace's own last 40 published/scheduled/approved posts from LYRA's DB as the social content signal. Different approach than originally planned (LYRA's own history, not a live platform API pull), but the stated blocker ("returns an empty array") is resolved. |
| **Media Library** | S3 media browser inside LYRA — upload once, reuse across posts. AI topic tagging. Media picker in composer and schedule review. Phase 3 spec referenced in `2026-05-19-ai-content-schedule-design.md`. |

---

## New Ideas

Sorted by importance — prerequisites first, differentiators second, polish last.

---

### 🔴 Critical — Prerequisites for Agencies at Scale

**1. Notifications** — *partially built*
The crisis piece of this shipped 23 Jul 2026: every workspace owner/admin now gets a real email the moment Crisis Aware triggers, via Resend, with the triggering comment and a link into the Inbox — confirmed live. Still missing: alerts for a post failing to publish, a comment being escalated (non-crisis), an approval being needed, and the daily/weekly digest. Push notifications (browser/mobile) also still untouched. LYRA's autonomy promise still breaks for these other event types — there's currently no way to find out about them except checking the dashboard.

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

**7. Agency HQ — cross-client command centre**
A dedicated "Agency mode" that sits above the workspace level — a separate top-level context in the nav (alongside individual client workspaces) with its own sidebar and distinct visual treatment. Purpose: agency admins manage their entire client portfolio without navigating in and out of individual workspaces.

*Layout (designed Jun 2026):*
- **Top bar:** Agency HQ tab + open client workspace tabs + active crisis badge + user avatar. Switching between Agency HQ and a client workspace is a single click.
- **Agency sidebar:** Overview, Alerts, Team, Reports — separate from the per-workspace nav.
- **Metric strip (5 cards):** Total workspaces, posts published today, pending approvals (with overdue count), AI responses sent (last 24h), active crises.
- **Middle row — two panels side by side:**
  - *Needs attention:* Alert list sorted by severity — crisis active, SLA-breached approvals, workspaces with no scheduled content, posts scoring below 7 before publish date.
  - *All clients table:* One row per workspace — client name, status pill (On track / Pending / Low scores / Crisis / No content), posts this week, pending approvals, AI responses sent. Arrow to jump into that workspace.
- **Cross-client swim lane calendar:** Weekly view. One row (lane) per client workspace. Days across the top, today highlighted. Each post appears as a pill in the correct lane + day cell showing: platform icon, content score (green if 7+, amber if below 7), status colour (scheduled = purple, pending approval = amber, published = green, crisis-paused = red). Clicking a post pill opens the full post detail panel inline (same as clicking inside a per-workspace calendar). Navigates week by week. Vertically scrollable for larger portfolios.

*Scope notes:* Agency plan only. Data is read-only from this view — no posting or scheduling from Agency HQ. All edits happen inside the individual workspace. The swim lane calendar does not replace the per-workspace calendar; it is an overview layer only.

*Existing scaffold (verified 14 Jul 2026):* `app/(dashboard)/agency/clients/page.tsx` already exists, but it's just a simple workspace list/switcher card grid — no swim-lane calendar, metric strip, or alerts panel, and no dedicated "Agency HQ" nav tab. Worth building on rather than starting from scratch, but doesn't fulfill this item as described.

**8. Slack / Microsoft Teams notifications**
An enhancement to the notification layer (item 1) specifically for agency teams. Email alerts go to one person's inbox — a Slack message in a shared channel (e.g. `#client-acme-alerts`) means the agency owner, account manager, and social media manager all see a crisis or approval request simultaneously, without anyone having to forward anything. The team mobilises in parallel, not sequentially. Particularly valuable for after-hours coverage: an autonomous crisis firing at 11pm reaches whoever is on Slack, not just whoever checks email first.

*Build approach:* Start with inbound webhook URL input (Option A) — user creates an Incoming Webhook in Slack or Teams and pastes the URL into LYRA workspace settings. LYRA POSTs a JSON payload on configured events. No Slack app registration required; works immediately for both platforms. A native Slack App with OAuth (Option B) is a follow-up if there is user demand.

*Configurable events — per workspace, with sensible defaults:*

| Event | Urgency | Default |
|---|---|---|
| 🚨 Crisis detected | Immediate | On |
| ❌ Post failed to publish | Immediate | On |
| 📋 New post pending approval | Immediate | On |
| ⏰ Approval SLA breach | Immediate | On |
| ✅ Post published | Batched or off | Off |
| 🤖 AI response sent | Off (noisy) | Off |
| 📊 Weekly digest | Scheduled | On |

*Key UX requirement:* Per-workspace webhook URL mapping — agencies route different client workspaces to different Slack channels. Message format should use Slack Block Kit / Teams Adaptive Cards to include a direct deep-link button back to the relevant post or alert in LYRA.

*Scope:* Agency plan only. Not a meaningful improvement over email for solo or SMB users. Email notifications remain the baseline for all plans.

---

### 🟡 Medium Priority — Worth Building Post-Launch

**9. Post recycling / evergreen content**
Mark a post as evergreen and have LYRA auto-reshare it on a configurable schedule (e.g., every 90 days). Useful for high-performing content, product announcements, and seasonal campaigns. Simple to implement on top of the existing scheduler — just re-enqueue with a future `scheduledAt` date when a post is marked as evergreen.

**10. Hashtag intelligence**
When composing a post, LYRA analyses the content and the workspace brand profile and suggests platform-appropriate hashtags. LinkedIn hashtags differ from Instagram hashtags in style, count, and intent. Claude can generate these with a short prompt. Could also track which hashtags historically drive the most engagement for that workspace.

**11. White-labeling**
Agency tier upsell: custom domain (e.g., `social.agencyname.com`), logo replacement, and colour scheme override. Agencies that resell LYRA to clients under their own brand would pay a premium for this. Significant additional revenue per Agency seat.

**12. UTM parameter automation**
When a post contains a URL, automatically append UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) based on configurable workspace defaults. Links then flow into Google Analytics with correct attribution. Agencies tracking campaign ROI will want this.

**13. Google Analytics 4 (GA4) integration**
Connect a workspace's GA4 property to LYRA to close the attribution loop between social publishing and website outcomes. Agencies are routinely asked to prove social ROI — this surfaces the answer inside LYRA without requiring the client to export anything from GA4 manually.

*Dependency:* UTM automation (item 12) should be live first. Without UTMs on outgoing links, GA4 attribution is blunt — social traffic lumped together with no post-level precision. With UTMs active, attribution becomes specific: "This post drove 143 sessions."

*What surfaces in LYRA:*
- **Workspace analytics panel — "Social → Website":** Sessions from social by platform, trended by week. Pulled from the GA4 Data API and cached for 24 hours.
- **Post detail:** If UTM automation is active, show estimated sessions attributed to that specific post.
- **PDF client report:** Website traffic section alongside social engagement metrics — the combined view agencies currently have to assemble manually.

*Build notes:* Google OAuth 2.0 with `analytics.readonly` scope — same token pattern as existing social connections. On connect, LYRA pulls the list of GA4 properties the user has access to and they select the relevant one per workspace. Encrypted refresh token stored via existing `lib/encrypt.ts`. New `GAConnection` Prisma model: `workspaceId`, `ga4PropertyId`, `encryptedTokens`. GA4 Data API is REST-based and well-documented. The interesting build work is the attribution overlay on the post calendar view, not the API connection itself.

**14. Canva Connect API integration**
Connect LYRA to Canva via the Canva Connect API (OAuth 2.0 + PKCE) to create a two-way bridge between where many agencies design and where they publish. Free to build — there is no cost to build against the Connect APIs or to list on the Canva Apps Marketplace. Canva has 185 million monthly active users, most of them already designing social content. The distribution argument is strong even if the feature depth is limited by plan constraints.

*What's achievable without Canva Enterprise:*
- **Canva → LYRA Media Library sync:** User connects their Canva account. Finished Canva designs (PNG, JPG, MP4) flow directly into the LYRA Media Library — no manual download/upload. Available on any Canva plan.
- **LYRA → Canva asset push:** Completed Creative Studio generated images pushed directly into a user's Canva account for further editing or use in Canva designs.
- **Design listing inside LYRA:** Surface a user's Canva designs from within LYRA, allowing them to select and schedule a Canva-designed asset without leaving the platform.
- **Resize API:** Programmatically resize a Canva design to multiple social platform dimensions (1:1, 4:5, 9:16, 16:9) — useful for agencies needing the same post across formats.

*What requires Canva Enterprise (not feasible for most LYRA users):*
- **Autofill API** — auto-generating client social graphics from a Canva brand template by injecting Brand AI data (client name, copy, imagery). Requires both the LYRA developer account and each integration user to be on Canva Enterprise (custom-priced, 30+ seat minimum). Not viable at current scale. Revisit if LYRA targets large enterprise agencies.

*Strategic rationale:* No social media management tool currently has a native Canva integration. The Canva Apps Marketplace puts LYRA in front of Canva's audience — agencies searching for scheduling and publishing tools inside a design platform they already use daily. Even a basic integration (connect Canva → publish via LYRA) has meaningful discovery value. Build cost is low; distribution upside is high.

*Build notes:* Register integration at canva.com/developers. OAuth 2.0 Authorization Code flow with PKCE. Store tokens securely using existing `lib/encrypt.ts` pattern. New `CanvaConnection` model in Prisma (workspaceId, encryptedAccessToken, encryptedRefreshToken, canvaUserId, canvaTeamId). Export API supports PDF, JPG, PNG, GIF, PPTX, MP4 — ingest exported files to S3 Media Library using existing presign upload pattern. Rate limits: 750 exports per 5-minute window, 5,000 per 24-hour window per integration.

**15. Meeting notes → content ideas connector**
Content ideas come up naturally in meetings — client calls, internal planning sessions — and then get lost, or someone has to manually re-transcribe them into the content calendar. Rather than integrating with one specific meeting-notes tool, build a generic ingestion pipeline: any tool that can fire a webhook sends meeting notes/transcript text to a new LYRA endpoint, which feeds straight into the existing Smart Content Repurposing pipeline (item P5, already built) — same Claude extraction logic already used for blog URLs and long-form text, just a new input source, not a new AI capability.

*Why general-purpose, not tool-specific:* Investigated Granola specifically (Jul 2026) as the trigger for this idea — it has a real, documented public API (note retrieval, transcripts, OpenAPI spec published), but it's gated to Business/Enterprise Granola plans, which narrows who could use a direct integration. Zapier is the better integration point: Otter, Fireflies, Fathom, and Granola all support Zapier without needing any paid API tier, so one LYRA-side webhook receiver covers all of them (and anything else with Zapier support) for free. Users can label the relevant section for social content using each tool's own template/custom-prompt features (Granola has "templates" and "recipes" that produce structured, consistently-labeled sections) — LYRA doesn't need bespoke per-tool section parsing, since Claude can already pull relevant content out of raw note text the same way it does for a blog post today.

*Build notes:* New generic webhook endpoint (e.g. `POST /api/repurpose/ingest`) accepting raw text + workspace ID, feeding into the existing `repurposeContent()` pipeline. Publish a Zapier "Zap" template so users wire up whichever tool they already use, without LYRA building a native integration per tool. Gemini (Google Meet's built-in notes) is the outlier — no confirmed Zapier support as of Jul 2026; would need Google Docs/Drive export or a direct API if Google ships one.

*Status:* Idea only, not committed — parked here for now. Raised Jul 2026 in the same conversation as a Meta Ads/Google Ads-via-Zernio idea (declined: would require LYRA becoming an ad reseller to actually capture ad-spend revenue, which is a different business, not a feature).

---

### 🟣 Phase 3 — CRM Integration

**17. LYRA Public API + CRM Context Engine**

A two-part feature that opens LYRA to the broader agency toolstack and introduces a new category of content intelligence — content generated from what's actually happening in the agency's client relationships, not just what's on the brand's public website.

---

**Part A — LYRA Public API**

LYRA publishes a documented public API and webhook receiver so that any external tool — CRM, project management platform, communication tool, or automation layer — can connect to LYRA without LYRA needing to build individual integrations for each one.

*Why this direction over building native CRM integrations:* The CRM market is fragmented — Salesforce, HubSpot, Pipedrive, Monday.com, Zoho, Notion, and dozens more. Building and maintaining a native integration for each is unsustainable. The smarter model is to publish LYRA as the destination and let the ecosystem connect to it — the same approach used by Stripe, Twilio, and Klaviyo. Agencies using any CRM with Zapier, Make, or webhook support can wire up a connection without LYRA writing a single CRM-specific line of code.

*What the public API exposes (Phase 3 scope):*
- `POST /api/context/ingest` — receive context payloads (text, notes, conversation summaries) tagged to a workspace ID. Authenticated via workspace API key.
- `POST /api/webhooks/crm` — receive structured event triggers from CRM workflow automations (e.g. deal stage changed, task created, client note added).
- `GET /api/workspaces/:id/suggestions` — return current AI content suggestions for a workspace based on ingested context.
- Webhook events LYRA can fire outbound: post published, post failed, approval pending, approval overdue, crisis activated, crisis resolved, AI responses sent (daily digest), content month complete, client report generated.

*Authentication:* API key per workspace, generated in LYRA Settings → Integrations → API Access. Keys are scoped to a single workspace and can be revoked independently. No global API key — workspace isolation is maintained.

*Developer docs:* Publish at `docs.lyraonline.ai/api`. Include Zapier template library so agencies can wire up common CRM workflows (HubSpot → LYRA, Salesforce → LYRA, Pipedrive → LYRA) without custom code.

*Rate limits:* 60 inbound requests/minute per workspace API key. Webhook delivery uses BullMQ (existing pattern) with retry on failure.

---

**Part B — CRM Context Engine (Composer integration)**

Once a CRM or external tool is connected via the LYRA API, the ingested context powers a new capability inside the Composer: **CRM Suggestions**.

*How it works:*
1. Agency connects their CRM to LYRA via the public API (directly or via Zapier/Make).
2. The CRM pushes context to LYRA as it's created — meeting notes, email summaries, conversation logs, deal notes, client updates. LYRA stores this context against the relevant workspace.
3. Only context from the **last 30 days** is retained and used for suggestions. Older context is purged automatically. This keeps suggestions relevant and avoids stale data surfacing as content ideas.
4. In the Composer, a **"CRM Suggestions"** button appears beneath the caption field — visible only when a CRM is connected to that workspace. Users who haven't connected a CRM never see it.
5. The user clicks "CRM Suggestions." LYRA reads the last 30 days of ingested context for that workspace, passes it to Claude with the workspace Brand AI profile, and generates 3–5 specific content ideas based on what's actually happening with that client right now.
6. Each suggestion displays with a **confidence indicator** — a signal of how much relevant context LYRA found to generate it. High confidence = rich recent context (multiple notes, recent conversations). Low confidence = sparse context (only one note, or context is nearing the 30-day limit). This sets user expectations and signals when it's worth logging more in the CRM.
7. Each suggestion also shows a **"Based on"** summary — a one-line explanation of what context was used (e.g. "Based on: client meeting note 14 Jul — product launch discussion"). Transparency builds trust and helps the agency understand what LYRA is working from.
8. The user clicks a suggestion. The caption drops into the Composer window, pre-populated and ready to edit, score, and schedule.

*What CRM context can unlock that Brand AI alone cannot:*
- "Client mentioned they're launching a new product line in August — generate teaser content now"
- "CEO just completed a press interview on sustainability — ride that wave with supporting social posts"
- "Q3 sales figures were below target — client wants a promotional push, not brand awareness content"
- "Competitor just launched a campaign — client wants counter-positioning content"
- "New staff member joined the team — humanise the brand with a welcome post"

None of this is visible on the brand's website. All of it belongs in the content calendar. CRM context makes it available to LYRA without the agency having to brief it manually every time.

*Context types LYRA accepts via the API:*
- Raw text (meeting notes, email body, Slack message export)
- Structured JSON (title, body, timestamp, source, tags)
- Webhook event payloads from common CRMs (auto-parsed)

*Plan availability:* Agency plan only. CRM Suggestions is an agency-tier capability — it assumes a team that uses a CRM and logs client conversations. Not relevant for Starter or Pro single-workspace users.

*Part B prerequisites:* Part A (public API) must be built first. Media Library should also be live so any media referenced in CRM context (e.g. product images attached to a deal) can be ingested alongside the text.

---

*Data model additions:*
- `CRMContext` — workspaceId, sourceLabel (e.g. "HubSpot"), rawText, parsedSummary (Claude-generated on ingest), createdAt, expiresAt (createdAt + 30 days), confidenceScore.
- `WorkspaceAPIKey` — workspaceId, hashedKey, label, lastUsedAt, revokedAt.
- Nightly cron: purge `CRMContext` records where `expiresAt` has passed.

---

### 🔵 Compliance — Needed Before Scaling to Europe

**16. GDPR tools**
Data export (all data held for a user/workspace as a downloadable ZIP) and deletion requests (purge a workspace and all its data on request). Required for any EU customers. Also needed: a visible data processing agreement and a cookie consent banner on the marketing site. Low effort to build; high risk to skip.

---

### 💡 Future Ideas — Brainstormed Jun 2026

Ideas from a dedicated feature brainstorm session. Not yet prioritised. None of these are on the build roadmap.

**AI autonomy layer**

- *Tone calibration per comment type:* Classify each incoming comment (complaint / compliment / question / neutral) and apply a tone modifier on top of the brand profile. Complaints get warmer, more empathetic phrasing. Questions get concise and factual. Compliments get genuine enthusiasm. All still on-brand — situationally aware.
- *Response memory / thread awareness:* Build a lightweight per-workspace commenter history — last replied date, reply count, escalation history. AI uses this context to avoid repeating itself to the same person and to adjust tone for returning commenters.
- *Per-post sentiment trend alerts:* Crisis Aware fires on a platform-wide spike. This is more surgical — if a single post's negative comment ratio crosses a threshold (e.g. 30% negative within 60 minutes), alert the agency and optionally suppress further AI responses on that post pending human review.
- *Multilingual response handling:* Detect the language of each incoming comment. If it differs from the workspace default, respond in the detected language. Agency can configure a per-workspace language policy: auto-match, English-only, or a specific language list.
- *Response pacing / delay control:* Configurable delay before AI posts a response — Instant / 5–15 min / 30–60 min / Business hours only. Full Autonomy responding in 90 seconds at 3am reads as a bot. Business Hours mode queues responses and sends at the next available window.

**Intelligence layer**

- *Content performance prediction:* Before scheduling, LYRA predicts likely reach and engagement using each workspace's own PostMetrics history — posting time, day of week, content type, caption length, platform. Shown alongside the content score in the composer. Moves LYRA from quality assessment to performance prediction.
- *Audience growth intelligence:* Pull follower counts daily (where API allows), plot growth over time, overlay the posting calendar. AI generates a weekly insight attributing follower growth to specific posts. Growth attribution is one of the hardest things to show clients.
- *Brand voice drift detection:* Weekly brand consistency report per workspace. Scores the last N posts against the brand profile in aggregate, flags dimensions where drift is occurring ("Your last 10 posts score consistently low on Tone"). Drift score tracked over time, included in client PDF report.
- *Competitor content gap analysis:* Extract topic/theme tags from competitor posts, compare to the workspace's own content theme history, surface topics where competitors are active and the workspace is silent. Present as content opportunities in the LYRA Assistant strategy output.
- *Content lifecycle tracking:* Schedule periodic metric refreshes for published posts — 24h, 7d, 30d, 90d after publishing. Show the full lifecycle curve in post detail. Surface "slow burn" posts that accumulate engagement long after posting. Particularly relevant for LinkedIn and YouTube.
- *Comment sentiment history per brand:* Aggregate per-comment sentiment scores into a weekly average per workspace, tracked over time. Sentiment trend line in analytics. Flag two consecutive weeks of decline. Turns the inbox into a brand health monitor.

**Agency operations layer**

- *Content approval checklists:* Per-workspace configurable checklists that must be completed before a post can move to PENDING_APPROVAL. Items can be manual (checkbox) or automated (e.g. content score threshold auto-passes). Prevents junior team members submitting off-brand or low-quality posts to clients.
- *Internal commenting on posts:* Internal comment thread on each post, visible only to agency team members (not clients). @mention colleagues. Replaces the Slack thread or email chain that currently accompanies posts under review. Keeps conversation in context.
- *Post templates library:* Save any post as a reusable template — caption structure with [PLACEHOLDER] tokens, platform selection, content score targets, optional media slot. Templates can be agency-wide or workspace-specific. Massive time saving for recurring post formats (weekly tips, testimonials, product spotlights).
- *SLA tracking on approvals:* Configurable approval SLA per workspace (e.g. 48h). Timer starts when a post enters PENDING_APPROVAL. Reminder to client at 24h. Alert to agency admin at 48h. Optional auto-approve. Dashboard shows SLA breach count per workspace.
- *Workspace templates (onboarding playbook):* Agency-level workspace templates — define a standard client setup once (guardrails, autonomy ceiling, approval workflow, content scoring thresholds, competitor tracking cadence). New workspaces spin up from the template in one click. Onboarding a new client goes from 20+ minutes of config to 2 minutes.

---

*Last updated: 29 Jul 2026 — full codebase audit against every unmarked item, checked against a week of real shipped work: four items marked ✅ this pass — Stripe billing integration (item 13, verified end-to-end with a real bug found+fixed), full end-to-end autonomous AI response (item 16, validated live on both Full Autonomy and Draft+Approve — Meta App Review turned out not to be the blocker, Zernio Bridge sidesteps it), PDF export reports (item 19, confirmed correct 28 Jul), and social feed analysis for Brand AI (backlog — `analyzeSocialPosts()` is wired up to LYRA's own post history, verified in code, no longer an empty array). Two items got partial-completion notes rather than a full check: Analytics dashboard depth (item 14 — platform breakdown/top posts/engagement chart exist, follower growth still has no data source) and Notifications (New Ideas item 1 — Crisis Aware email alerts shipped and verified, but failure/escalation alerts and the digest are still missing). Confirmed still correctly unbuilt: Team member invitations (item 3) — verified via a full grep sweep while fixing help-doc pages that had been falsely describing this as a real feature; GDPR self-service export/deletion (item 16 in Compliance — a manual, email-request-based deletion process exists, but no self-service ZIP export or automated purge); Production hardening (item 20) — no Sentry, structured logging, or worker health checks found anywhere.*
*Previous update (14 Jul 2026) — full codebase audit against every unmarked item: nothing found to be secretly further along than documented (no new ✅s warranted), but added clarifying notes on existing partial scaffolding for Pinterest/Threads/Bluesky (17c–17e, Zernio slug mapping exists, connect routes don't) and Agency HQ (item 7, a bare workspace-list scaffold exists at `app/(dashboard)/agency/clients/page.tsx`). Previous update — added Phase 3 CRM Integration (item 17): LYRA Public API + CRM Context Engine with CRM Suggestions in Composer; added meeting notes → content ideas connector (item 15, general-purpose: Otter/Fireflies/Fathom/Granola/Gemini via Zapier); GDPR tools renumbered to 16 (now 18); June 2026 update: added Slack/Microsoft Teams notifications (item 8); added GA4 integration (item 13); TikTok marked live (17b); items renumbered accordingly*
