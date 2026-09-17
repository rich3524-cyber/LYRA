# LYRA vs Metricool — Competitive Analysis

**Date:** 24 August 2026
**Prepared for:** Richard Unwin, Into The Wild Marketing
**Purpose:** Two things at once — a build-gap list to feed the Wishlist, and a positioning read to feed the sales story.

---

## Method and confidence

Metricool's side comes from their help centre (`help.metricool.com`), which I've treated as authoritative, cross-checked against their marketing pages, their 2026 monthly product updates, their live MCP server (which I queried directly for their real analytics metric catalogue), and credible third-party reviews. Where a claim only appears on a marketing page and their own docs don't back it, I've said so.

LYRA's side comes from the actual codebase at commit `df3c227` (16 Aug 2026) — not from the Handover or the Demo Guide, both of which I found to be ahead of the code in a couple of places. Where they disagree with the code, the code wins and I've flagged it.

**Currency note:** Metricool prices in EUR and USD only. AUD figures below are converted at **0.71676 AUD/USD** (24 Aug 2026, Trading Economics) and rounded. LYRA's own prices are shown as they appear in `lib/stripe.ts` — see the note in §4 about the fact that nothing in the codebase actually states which currency they're in.

---

## The one-paragraph read

Metricool is a mature, broad, cheap **measurement and publishing** platform with 3.5 million users, eleven networks, genuinely deep analytics, and paid+organic in one dashboard. LYRA is a narrow, early, expensive **engagement automation** platform that does one thing Metricool cannot do at any price on any plan: respond to comments and reviews autonomously, in brand voice, with guardrails. That gap is real and I confirmed it from Metricool's own documentation, not from their competitors' blogs. But LYRA is behind almost everywhere else, and the gaps that matter most aren't the exciting ones — they're post types, team seats, and analytics depth. LYRA cannot win a feature-count or price argument and shouldn't try.

---

# PART 1 — Where LYRA genuinely wins

These are defensible, verified, and worth building the entire sales story around.

### 1. Autonomous comment and review responses — Metricool has nothing comparable

This is the whole ballgame, and it's better than the Demo Guide currently claims, because it's now confirmed rather than assumed.

Metricool's own help centre states plainly that the Inbox has **no AI drafting and no auto-reply**. Their "Saved Answers" are manually written templates. Their entire "AI in Metricool" help category contains four articles — MCP, AI text generator, AI alt text, AI prompt customisation — and **no inbox AI article exists at all**. I reviewed every monthly product update from January to June 2026 individually: no AI, no assignment, no notifications, no multi-brand inbox view appeared in any of them.

LYRA has three autonomy modes, brand-voice grounding, four guardrail types (never-discuss, banned words, always-escalate, approved answers), and crisis detection sitting on top. There is no version of Metricool you can buy that does this.

**One honest caveat for the battlecard:** Metricool's Zapier integration (Advanced plan and up) exposes a **New Conversation in Inbox** trigger (Instagram, Facebook and X only) and a **New Google Business Profile Review** trigger, plus **Reply to a conversation** and **Respond to Google Business Profile reviews** actions. Note there is no comment-specific trigger or reply action — comments arrive inside the conversation trigger. A technical agency *could* wire an AI auto-responder themselves through Zapier. It would have no brand profile, no guardrails, no escalation, no crisis pause, and no audit trail — but the ability exists. Don't say "impossible"; say "you'd be building it yourself, and you'd be building it without the safety layer."

### 2. Crisis Aware — no equivalent anywhere in their product

Sentiment-spike and keyword detection, automatic pause of the entire scheduled queue, immediate email to every workspace owner and admin, full audit log. Metricool has **no notifications of any kind for inbox activity** — their own docs say so verbatim: *"There are no notifications for Inbox messages, comments, or mentions."* A Capterra reviewer called their related notification gap "a liability" for agencies.

Sell this as the after-hours story. It lands hardest against a competitor whose product will not tell you anything is happening unless you're looking at it.

### 3. Email campaigns on the social calendar

Klaviyo, Mailchimp and Customer.io campaigns rendering on the same calendar as social posts. Metricool has no email marketing integration of any kind. This is a genuine, uncontested differentiator and it's cheap to demo.

### 4. Brand Intelligence as a real profile, not a text box

Metricool's brand voice is **static, user-written prompt instructions** per brand (with per-network overrides) under Brand settings → AI Configuration. Their marketing page claims the AI "learns your brand's tone by adapting as you go" — I could not find a single help-centre article supporting that. Treat it as marketing copy.

LYRA crawls the website, analyses the workspace's own post history, and builds a structured profile that grounds every downstream AI feature including comment responses. That's a materially different thing.

### 5. Approval SLA tracking

Metricool's approval system is good — arguably better designed than LYRA's in one respect (see §2.3) — but its only deadline is a fixed **3-hour grace period** past the post's scheduled time, after which the task silently drops off *My Tasks* and the post simply doesn't publish. No configurable SLA, no overdue alerting, no escalation. LYRA has per-workspace deadlines (4h before scheduled time by default, 24h since submission for unscheduled posts), an hourly cron, calendar badges, and Slack alerts. For an agency chasing client sign-off, that's the difference between a workflow and a to-do list.

### 6. Slack notifications

Metricool has no Slack integration and no inbox notifications. LYRA has Slack via Zernio OAuth across six event types (crisis, comment escalated, post failed, pending approval, SLA breach, post published).

*Two hedges before you demo it:* the LYRA display name is passed to Zernio hopefully rather than contractually — `slack-formatter.ts` carries its own comment saying that if Zernio ignores the field, messages post under Zernio's identity instead. A real test send was confirmed once (11 Aug); confirm again before showing it. And "one-click" only holds for public channels — a private channel needs `/invite @Zernio` first.

### 7. The MCP server is a category ahead

Metricool has an official MCP server and it's good — free on every plan, including Free. But it is **read plus scheduling only**: the connector exposes brand settings, scheduled posts, create/update/submit-for-review, the analytics metric catalogue, analytics data, and best time to post. There are **no inbox tools in it at all**. LYRA's MCP has 14 tools plus 16 capabilities, including `respond_to_item`, which routes through the same autonomy and guardrail enforcement as the UI. An AI agent can run a LYRA workspace end to end; it can only report on a Metricool one.

Worth noting Metricool got to MCP first and markets it prominently. It's not a differentiator that LYRA *has* one — the differentiator is that LYRA's can act.

### 8. Pre-publish content scoring

Six live dimensions in the composer. Metricool has nothing equivalent. Modest, but it demos well and reinforces the "quality control before it goes out" theme.

### 9. Multiple accounts per platform per workspace

Structural, and more important than it looks. Metricool's docs: *"Each brand supports only one account per platform. If you manage multiple accounts of the same type, you'll need one brand per account."* So an agency running two Facebook Pages for one client burns two brand slots. A single brand can hold one account on each of eleven networks, so the constraint only bites on duplicate accounts of the same platform — but that's exactly the multi-location and multi-page client case agencies deal with constantly.

LYRA's data model puts multiple `SocialAccount` rows under one workspace. **Caveat:** the bulk import feature can't currently disambiguate two accounts on the same platform (known limitation, Wishlist item 5), so the advantage is architectural, not yet fully delivered.

---

# PART 2 — Where LYRA is behind

Ordered by how much I think each one actually matters for the agencies you'd be selling to. Existing Wishlist item numbers noted where they map.

### 🔴 Tier 1 — These block real-world use

**2.1 Post types don't exist in LYRA at all** — *effectively not on the Wishlist*

This is the biggest gap I found and, apart from UTM automation (New Ideas item 12), it isn't recorded anywhere. LYRA's `Post` model is `content` + `mediaUrls[]` + `socialAccountId`. There is no post-type concept. That means **no Stories, no Reels-as-a-type, no threads, no first comment, no product tags, no ALT text, no UTM builder, no AI-content labelling** — and no carousel as a first-class type (multi-image posts *do* publish as carousels via Zernio's `mediaItems` array, but with no slide ordering, no per-slide media handling and no per-slide ALT).

Metricool schedules all of it: Instagram Reels with trending audio (May 2026), Stories, carousels up to 10 mixed media, collaborators, product tags; Facebook up to 35 images plus Reels and Stories and first comment; LinkedIn documents (PDF/PPT/DOC) and carousels; X and Threads and Bluesky threads up to 80 posts; TikTok trending music for Business accounts; YouTube Shorts and long-form with privacy and category controls.

A social media manager will find this out in the first ten minutes of a trial. "You can't schedule a Story" is not a gap you can talk past. I'd put this above everything currently on the Wishlist.

**2.2 Team member seats** — *New Ideas item 3*

Already flagged as critical in your own docs, and this confirms it. Metricool gives **unlimited users** on Advanced with five default roles plus custom roles built from a permissions matrix, and shared brands only require the other person to hold a free account. LYRA's only way to add a team member is a direct database insert. An agency cannot onboard onto LYRA in its current state.

**2.3 Client access** — *New Ideas item 2*

Worth changing the plan here rather than just noting the gap. Your Wishlist specifies a full client portal UI. Metricool solved the same problem far more cheaply: **reviewers approve or reject straight from the review email and never need a Metricool account at all**. They also offer a read-only shared calendar link, and a link that lets a client connect their own social accounts without signing up.

Given LYRA already has `OnboardingToken` (unauthenticated, UUID-based) in the schema and working, an email-link approval flow is a fraction of the build of a portal and removes the client-adoption problem entirely. I'd seriously consider doing that first and treating the portal as a later upsell.

### 🟠 Tier 2 — Real competitive exposure

**2.4 Analytics depth** — *Wishlist original-roadmap item 14, partially*

I pulled Metricool's actual metric catalogue through their MCP. Instagram alone exposes **roughly 150 metric fields across 14 connectors**: account evolution, posts, reels, stories, competitors, competitor posts, competitor reels, country, city, age and gender, promoted posts, promoted reels, per-publication performance timelines, and hashtags. Reels carry average watch time, retention percentage, view rate and reposts. Account-level metrics break down by media product type and by follower vs non-follower.

LYRA's `PostMetrics` model holds eight fields: likes, comments, shares, reach, impressions, views, clicks and saves. That's a reasonable per-post spine — the gap isn't post metrics, it's everything around them. There is **no `followerCount` field anywhere in the schema**, so follower growth cannot be charted at all (already noted in original-roadmap item 14). There are no demographics, no story or reel metrics, no watch time, no retention, and no per-publication performance timeline.

You will not close this gap and shouldn't try to. But the specific pieces worth having are: **follower growth over time** (every client asks), **basic demographics** (age/gender/country), and **story/reel metrics** once post types exist.

**2.5 Ads reporting** — *not on the Wishlist*

Metricool connects Meta Ads, Google Ads and TikTok Ads on **every plan including Free**, and shows paid alongside organic. Independent reviewers repeatedly name this as their genuine differentiator. LYRA has post boosting via the Meta Ads API and a single `getBoostReach()` read path for one boosted post — but no ads *reporting* in any meaningful sense.

Your Wishlist declined the Meta/Google Ads idea in July on the grounds it would mean becoming an ad reseller. That reasoning applies to *spending* ad budget, not to *reading* ad performance. Read-only ads reporting is a different feature and a much smaller build — and for an agency doing both organic and paid (which is most of them, including yours), a report that covers only organic is half a report.

**2.6 Reporting tooling**

LYRA has a one-click branded PDF with an AI narrative — good, and genuinely useful. Metricool has four separate reporting products: standard PDF/PPT reports with **automated monthly email delivery**, custom report templates with logo and colours, **Campaign Dashboards** combining organic and paid with editable AI insights, **Metricool Studio** (launched 27 May 2026 — natural-language prompt to analytics views, shareable read-only links that auto-refresh), and a **Looker Studio connector**.

The two pieces I'd actually want from that list are **scheduled automatic report delivery by email** (their report goes out monthly without anyone touching it; LYRA's requires a human to click) and **shareable read-only report links** rather than PDF attachments.

**Fair warning for the battlecard:** Studio and Campaign Dashboards are heavily gated — 2 views and 3 dashboards per brand, undeleteable, unless you buy the Advanced Analytics add-on. Metricool's own May 2026 update admits both were "temporarily available… before converting to paid add-ons."

**2.7 Media library and content reuse** — *Wishlist backlog (Media Library), New Ideas item 9 (recycling), New Ideas item 14 (Canva)*

Metricool has: a **Posts Library** of reusable post templates (capped at 50 per brand, paid plans), **Autolists** for evergreen recycling with circular republishing, up to 200 posts per list, fed manually or by AI or CSV or **RSS feed**, plus **Canva, Google Drive and Adobe Express** integrations directly in the composer.

LYRA has none of it. Media is uploaded per post and cannot be reused. Three separate Wishlist items live here and they're more connected than the Wishlist implies — a media library is the prerequisite for both the Canva integration and any real reuse workflow.

The RSS-into-autolist idea isn't on your Wishlist at all and is a cheap, well-understood pattern.

**2.8 Networks — 7 vs 11**

Metricool: Facebook, Instagram, Threads, X, Bluesky, TikTok, LinkedIn, Google Business Profile, Pinterest, YouTube, Twitch, plus three ad platforms.
LYRA: Facebook, Instagram, LinkedIn, TikTok, YouTube, Google Business Profile, X. Pinterest, Threads and Bluesky exist in the `Platform` enum and have Zernio slug mappings but **no connect route and no service file** — original-roadmap items 17c–17e.

Given Zernio already handles the hard part, Pinterest and Threads look like small builds relative to their sales value. Bluesky needs the AT Protocol app-password model and is genuinely different work.

### 🟡 Tier 3 — Worth knowing, lower urgency

| Gap | Metricool | LYRA | Wishlist |
|---|---|---|---|
| **Public API / Zapier / Make** | Advanced+, documented, token-based | None | New Ideas item 17 Part A |
| **White label** | Custom plan, quote-only — full rebrand, custom domain | None | New Ideas item 11 |
| **Link-in-bio** | SmartLinks 2.0, unlimited, 100 buttons, CTR analytics, paid plans | None | *Not listed* |
| **Hashtag tracking** | X and Instagram, US$25/day/network pay-per-use | None | New Ideas item 10 is *suggestions*, not tracking |
| **Competitor depth** | Post-level and reel-level data; Free capped at 5/network, paid cap not documented | 10 per workspace, scraped summary | — |
| **Website analytics** | WordPress plugin, JS tag, pixel, GTM | GSC/SEO module instead | New Ideas item 13 is GA4 |
| **Native mobile apps** | iOS and Android | Responsive web only | *Not listed* |
| **Recover deleted posts** | Documented feature | None | *Not listed* |
| **Multi-brand post duplication** | Post once to several brands with per-brand dates | None | *Not listed* |

---

# PART 3 — Where you're at parity (or quietly ahead)

- **Bulk import** — Metricool does CSV with a recommended 50-post limit and public-URL-only media. LYRA does a locked `.xlsx` template with a review screen, 500-row cap, and S3 re-hosting of media URLs. LYRA's is tighter; Metricool's is more flexible. Roughly even, and LYRA's approval-safe design is the better story for agencies.
- **Approval workflow** — both have one. Metricool's is Advanced-only and lets reviewers act without an account; LYRA's has SLA tracking. Different strengths.
- **Best time to post** — LYRA is ahead, with a real caveat. Metricool uses your actual account data only for **Instagram connected via Facebook with 100+ followers**, **TikTok Business with 100+ followers**, and **X with 300+ active followers**; LinkedIn, YouTube and (unless connected before Sept 2024) Facebook fall back to **generic behavioural studies** presented in the same UI as the real thing. They store no history — "past and future weeks will show the same best times." LYRA derives every recommendation from that workspace's own `PostMetrics`, on every platform. **But** LYRA needs **12+ published posts on a platform** before it produces anything at all, with no generic fallback — so on a brand-new client, Metricool shows something and LYRA shows nothing. Worth closing that with a fallback. Separately, LYRA's time-slot bucketing currently uses UTC rather than workspace-local time, which shifts every recommendation for an Australian client — that's a bug, not a design choice.
- **AI captions** — both do it. LYRA's are brand-profile grounded; Metricool's run on static instructions and a **credit budget** (5/20/35 per brand per month, token-consumed, **no top-ups, no rollover**). LYRA has no per-plan AI cap at all, which is a real advantage to name in a demo.
- **Content repurposing** — LYRA ingests a URL or long-form text and generates platform-native variants. Metricool's AI adapts existing post text. LYRA slightly ahead.
- **Neither has a unified multi-brand inbox.** Don't claim this one — LYRA's inbox is per-workspace too.

---

# PART 4 — Pricing

### Metricool (converted at 0.71676 AUD/USD, 24 Aug 2026)

| Plan | Brands | Monthly USD | **Monthly AUD** | Annual per-month AUD |
|---|---|---|---|---|
| Free | 1 | $0 | **$0** | — |
| Starter | 5 | $20 | **~$28** | ~$21 |
| Starter | 10 | $36 | **~$50** | ~$38 |
| Advanced | 15 | $53 | **~$74** | ~$56 |
| Advanced | 25 | $85 | **~$119** | ~$90 |
| Advanced | 50 | $159 | **~$222** | ~$169 |
| Custom | 50+ | Quote | Quote | Quote |

*The annual column is derived from Metricool's advertised "save up to 24%" banner, not from published per-tier annual prices — treat it as indicative. Monthly figures are quoted directly.*

**Add-ons:** X/Twitter **~$14/month per connected account** (US$10; a prior US$5 rate and July 2026 increase are widely reported but I couldn't confirm them on Metricool's own pages). Advanced Analytics **~$17/month** on Starter, **~$50/month** on Advanced. Hashtag Tracker **~$35/day per network** (US$25).

"Unlimited posting" is governed by a Fair Use Policy with a **600 posts per brand per month** review threshold that isn't stated on the pricing page.

### LYRA (from `lib/stripe.ts`)

| Plan | Workspaces | Monthly | Annual per-month | Autonomy ceiling |
|---|---|---|---|---|
| Starter | 1 | $49 | $41 | Off |
| Pro | 5 | $149 | $124 | Draft + Approve |
| Agency | Unlimited | $399 | $332 | Full |

**⚠️ Nothing in the codebase declares a currency.** The UI renders a bare `$` and the actual currency lives on the Stripe Price objects behind env vars. For an Australian company selling to an audience that will assume USD, that's worth fixing before beta — a US prospect seeing "$399" and being charged AUD (or vice versa) is a support ticket at best.

### The honest read on price

Assuming AUD, at 5 client workspaces LYRA Pro is **$149 against Metricool Starter's ~$28** — 5.3×. At the top, LYRA Agency unlimited is **$399 against Metricool Advanced 50-brand at ~$222** — about 1.8×, and that's the *narrowest* gap in the lineup, which tells you where LYRA's pricing actually makes sense.

**LYRA Starter is the problem.** At $49 for one workspace with autonomy switched off, it is more expensive than Metricool Starter, offers one-fifth the brands, four fewer networks, dramatically less analytics — and has the differentiating feature disabled. There is no prospect for whom that is the right purchase. I'd either bundle Draft + Approve into Starter so the product's whole reason for existing is present at entry, or drop the tier and start at Pro.

The Agency tier is defensible because unlimited workspaces plus full autonomy has no competitor at any price. Pro is defensible only if the buyer specifically wants AI responses. Neither is defensible on breadth, so the pricing conversation has to be reframed as "what does an account manager's time cost you" rather than "what does the tool cost."

---

# PART 5 — Battlecard: selling against Metricool

**Lead with, in this order:** autonomous responses → crisis pause and alerting → email campaigns on the calendar → guardrails and brand grounding.

**Never lead with:** analytics, reporting breadth, networks, post types, price, or integrations. You lose all six.

### Their documented weaknesses, with sources

| Weakness | Evidence |
|---|---|
| **No inbox notifications at all** | Their own help centre, verbatim |
| **No AI or automation in the inbox** | Their own help centre; absent from every 2026 product update |
| **No unified multi-brand inbox** | Their own help centre |
| **No conversation assignment** | Their own help centre |
| **Meta reply windows** — comments 24h, DMs 7d, then read-only | Their own help centre |
| **No X public replies, no LinkedIn DMs in the inbox** | Their own help centre |
| **Auto-renewal billing complaints** | Loudest recurring theme on G2 and Capterra; refunds reported as available only within 15 days of initial purchase, never on renewal. *Review-sourced — re-confirm against their current terms before putting it in front of a prospect.* |
| **Accounts silently disconnecting** | Repeated across G2, Capterra, independent reviews — Instagram especially |
| **Publishing reliability** | Efficient.app's 2026 review verdict: *"Disappointing & Unreliable"*, reviewer migrated to Buffer |
| **AI credits can't be topped up or rolled over** | Their own docs — heavy users hit a wall mid-cycle |
| **No AI image generation** | Confirmed absent |
| **No social listening** | Confirmed absent |
| **Competitor engagement calculated on followers, not reach** | Their own docs. Their documented workaround is to add your own account as a competitor — which means abandoning your real reach-based numbers to get a like-for-like view |
| **Best time to post is generic data on LinkedIn, YouTube and usually Facebook** | Their own docs, while sitting in the same UI as real account data. Instagram also needs a Facebook connection and 100+ followers; X needs 300+ |
| **Support** | Capterra scores Customer Service 4.0 vs 4.5 ease of use; slow responses, no phone |

**Ratings for context:** G2 4.5/5 (98 reviews), Capterra 4.4/5 (98 reviews). They are a well-regarded product. Don't run them down — run at the specific hole.

### Objections you'll get, and what I'd say

**"Metricool does all this for $28 a month."**
It does more scheduling and far more analytics for $28. It does not answer a single comment. The question isn't which tool costs less, it's what an account manager costs you to sit in an inbox — and whether you'd rather they did that or the strategy work.

**"We already use Metricool and we're happy."**
Then keep it. LYRA isn't a scheduler replacement for you — it's the response layer Metricool doesn't have. Worth being ready for this to become the actual product shape: LYRA sitting alongside their existing scheduler rather than replacing it.

**"Can't we just do this with Zapier and ChatGPT?"**
Yes, and some agencies do. What you don't get is the brand profile, the guardrails, the always-escalate rules, the crisis pause, the approval routing, or the audit log — and those are the parts that stop it going wrong publicly on a client account.

**"Do you support Stories / carousels / threads?"**
Not yet. Don't bluff this — see §2.1.

---

# PART 6 — What I would *not* build

- **Hashtag tracking.** Metricool charges ~$35/day (US$25) per network for it and multiple reviewers call it impractical. The market has told you what it's worth.
- **Twitch.** Metricool supports analytics only and doesn't even schedule to it.
- **Looker Studio connector.** Solves a problem your buyer segment doesn't have.
- **Full white label** before you have agencies paying for the core product.
- **Native mobile apps.** The mobile audit is done and the web app is usable on a phone. Native is an enormous lift for a marginal gain at this stage.
- **Chasing analytics parity.** ~150 Instagram fields is not a race worth entering. Pick the three clients ask for.

---

# PART 7 — What this exposed about LYRA's own documentation

Not comparison findings, but they came out of checking LYRA's claims against its own code, and you should know before beta.

**1. 🔴 LYRA Assistant is an empty placeholder.**
`app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx` renders a "coming soon" empty state. There is no quarterly review, no 3-month strategy generator — a repo-wide grep for "quarterly" returns nothing. Yet it's linked in the primary sidebar, listed as a shipped feature in the Handover's What's New, and the **Demo Reference Guide opens the recommended demo with it** — step 01, "click Generate Report… in ~30 seconds LYRA analyses the last 90 days." That's the first thing a prospect would be shown and it doesn't exist. Either build it or pull it from the sidebar and the Demo Guide.

**2. 🔴 The in-app Help pages document at least four features that don't exist.** This is worse than the Demo Guide problem because Help ships to every user, not just to prospects you're standing next to:

- `section-09-analytics.tsx` documents a **"Net New Followers"** metric — there is no `followerCount` field anywhere in the schema (see §2.4).
- `section-09-analytics.tsx` describes Top Posts showing **post type (feed, reel, story)** — no post-type concept exists (§2.1).
- `section-06-compose.tsx` tells users to **drag Instagram carousel images to reorder them** — there is no reorder code in the composer.
- `section-03-social-connections.tsx` lists **"scheduling feed posts, reels, carousels, and stories"** — stories and reels-as-types aren't supported.

Your Wishlist records a previous sweep (29 Jul) that fixed help docs falsely describing team invitations as shipped. So this is a recurring failure mode, not a one-off. Worth a standing check rather than another one-off fix.

**3. 🟡 The Trend add-on card.** Better than I first read it: the card shows a *truncated* subscription ID and labels the feature "not yet functional", and the Trends page shows a proper "launches in Phase 3" placeholder rather than nothing. The residual issue is commercial, not cosmetic — a pre-cutoff subscriber still has a live Stripe subscription for an unshipped feature.

**4. ✅ Everything else in the Demo Guide checks out** — Crisis Aware, guardrails, autonomy modes, Slack, SLA tracking, bulk import, repurposing, the calendar, and the MCP all match the code. The Assistant is the only demo-flow discrepancy, but it's the one at the top of the demo.

---

# Recommended next moves

If it were my call, in this order:

1. **Fix the Assistant discrepancy and audit the Help pages** (§7) — before any demo or beta invite. A day's work, and it's the difference between an honest product and one that over-promises in writing.
2. **Post types** (§2.1) — the largest genuine product gap, and only its UTM sliver is on the Wishlist. Needs a design pass before it can be scoped.
3. **Team seats** (New Ideas item 3) — an agency literally cannot onboard without it.
4. **Client approval by email link** instead of the full portal (New Ideas item 2, rescoped) — Metricool's design is cheaper to build and removes the client-adoption problem entirely.
5. **Follower growth + basic demographics** — the two analytics gaps clients ask about by name. Follower growth needs a schema field before anything else can happen.
6. **Read-only ads reporting** — reopen the July decision; reading is not reselling.
7. **Media library**, as the unlock for Canva and content reuse (New Ideas items 14 and 9 plus the backlog entry — probably one item, not three).

Two quick fixes worth doing alongside: the **best-time-to-post UTC bucketing bug** (§3), and a **generic fallback** for workspaces under the 12-post threshold.

Two pricing decisions worth making before beta: **what currency LYRA bills in** (the answer is in Stripe, not the code), and **whether Starter survives in its current shape**.

---

## What I couldn't verify

Flagging these so nothing goes in front of a prospect on my say-so alone:

- **Metricool's paid competitor cap** (I've seen 100/network cited but it isn't in their docs; Free = 5/network is documented).
- **The X add-on price history** — current US$10 is confirmed; the prior US$5 rate, the July 2026 increase and grandfathering are widely reported but not on their own pages.
- **All review-derived claims** in the battlecard — G2/Capterra ratings, the refund window, the reliability quotes. Re-source the refund claim specifically before using it commercially.
- **Metricool's feature caps** — Posts Library 50/brand, Autolists 200/list, SmartLinks 100 buttons, Studio 2 views / 3 dashboards. Single-sourced.
- **Whether LYRA's Stripe Prices are AUD or USD** — not determinable from the repo.

---

## Sources

**Metricool — product and marketing**
[Pricing](https://metricool.com/pricing/) · [Plans explained](https://metricool.com/premium-vs-free-metricool-plans/) · [Metricool Studio](https://metricool.com/metricool-studio/) · [Studio press release](https://metricool.com/press-release-metricool-studio/) · [LinkedIn Marketing Partner Program](https://metricool.com/press-release-metricool-joins-linkedin-marketing-partner-program/) · [AI Social Media Assistant](https://metricool.com/ai-social-media-assistant-metricool/) · [Social Media Inbox](https://metricool.com/social-media-messages/) · [Integrations](https://metricool.com/metricool-integrations/) · [Zapier integration guide](https://metricool.com/zapier-with-metricool/) · [MCP for Claude](https://metricool.com/metricool-mcp-claude/) · Product updates [Jan](https://metricool.com/product-updates-january-2026/) [Feb](https://metricool.com/product-updates-february-2026/) [Mar](https://metricool.com/product-updates-march-2026/) [Apr](https://metricool.com/product-updates-april-2026/) [May](https://metricool.com/product-updates-may-2026/) [Jun](https://metricool.com/product-updates-june-2026/) 2026

**Metricool — help centre (treated as authoritative)**
[Plans, add-ons and API access](https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u) · [Free vs paid](https://help.metricool.com/main-differences-between-free-and-paid-plans-bl0v9) · [X add-on](https://help.metricool.com/en/article/your-guide-to-the-new-xtwitter-add-on-1wegbud/) · [Advanced Analytics add-on](https://help.metricool.com/your-guide-to-the-advanced-analytics-add-on-ft6hi) · [Fair Use Policy](https://help.metricool.com/en/article/fair-use-policy-for-social-media-scheduling-oh90gv/) · [Inbox Manager](https://help.metricool.com/inbox-manager-how-to-manage-messages-and-comments-from-metricool-s9zze) · [Inbox Saved Answers](https://help.metricool.com/en/article/inbox-saved-answers-qt7rvl/) · [Notifications](https://help.metricool.com/en/article/how-to-set-up-notifications-1nwygja/) · [Scheduling options by network](https://help.metricool.com/en/article/scheduling-and-posting-options-by-social-network-127eukv/) · [CSV batch scheduling](https://help.metricool.com/en/article/how-to-schedule-posts-in-batch-with-a-csv-file-in-metricool-3wihqx/) · [Autolists](https://help.metricool.com/en/article/schedule-content-from-an-autolist-zj5crc/) · [Posts Library](https://help.metricool.com/en/article/posts-library-gq1m4u/) · [Canva integration](https://help.metricool.com/en/article/canva-integration-1w5lxu8/) · [Google Drive integration](https://help.metricool.com/google-drive-integration-0u1ei) · [Approval system](https://help.metricool.com/how-to-send-posts-for-review-with-metricools-approval-system-yvdr0) · [Metricool for Agencies](https://help.metricool.com/en/article/metricool-for-agencies-everything-you-need-to-know-bk2n2j/) · [User management](https://help.metricool.com/en/article/user-management-xh3ius/) · [Metrics guide](https://help.metricool.com/your-metrics-in-metricool-full-guide-pcwam) · [Historical data available](https://help.metricool.com/en/article/historical-data-available-rn3q49/) · [API limitations per network](https://help.metricool.com/en/article/api-limitations-per-social-network-508ay5/) · [Competitor analysis](https://help.metricool.com/competitor-analysis-ouhue) · [Hashtag Tracker](https://help.metricool.com/en/article/hashtag-tracker-hgey9v/) · [Best time to post](https://help.metricool.com/en/article/best-time-to-post-on-social-media-in-metricool-hj3rgj/) · [What is Metricool Studio](https://help.metricool.com/what-is-metricool-studio-o4pac) · [Campaign Dashboards](https://help.metricool.com/what-is-campaign-dashboards-334yd) · [Looker Studio](https://help.metricool.com/custom-reports-with-looker-studio-nsv1r) · [White Label overview](https://help.metricool.com/white-label-for-agencies-product-overview-wihqh) · [SmartLinks](https://help.metricool.com/en/article/smartlinks-in-metricool-full-guide-lfd6xx/) · [API access](https://help.metricool.com/api-access-export-your-metricool-data-to-other-tools-and-automate-tasks-x8ln5) · [MCP FAQs](https://help.metricool.com/faqs-about-the-metricool-mcp-1i3w0) · [AI text generator](https://help.metricool.com/en/article/how-to-create-posts-with-metricools-ai-text-generator-1fozdmp/) · [AI prompt customization](https://help.metricool.com/en/article/how-to-set-up-ai-prompt-customization-in-metricool-hxhplw/)

**Reviews** — [G2](https://www.g2.com/products/metricool/reviews) · [Capterra](https://www.capterra.com/p/193657/Metricool/) · [Efficient.app](https://efficient.app/apps/metricool)

**Live data** — Metricool MCP server (`getBrandSettings`, `getAnalyticsAvailableMetrics` for Instagram, queried 24 Aug 2026) · [AUD/USD rate, Trading Economics](https://tradingeconomics.com/australia/currency)

**LYRA** — repository `rich3524-cyber/LYRA` at commit `df3c227`; `prisma/schema.prisma`, `lib/stripe.ts`, `services/**`, `app/(dashboard)/**`, `lyra-mcp/src/**`; `LYRA-Handover.md`; `docs/LYRA-Wishlist.md`; `docs/LYRA-Demo-Reference-Guide.html`
