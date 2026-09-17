# Lyra Creator Plan — Design Spec

**Date:** 2026-07-21
**Status:** Parked — deliberately deferred 21 Jul 2026. Decision: focus on stabilizing and monetizing the core (business/agency) product first. Revisit only after that's live and generating revenue, and after getting real vendor pricing from Phyllo/Modash to validate Rival Tracker's unit economics before committing engineering time.
**Author:** Rich Unwin / Claude brainstorming session

---

## Overview

Lyra currently targets businesses and corporate clients. This spec defines a **Creator Plan** — a plan tier within the existing Lyra app designed for influencers and personal brand accounts. It is not a separate product; creators sign up to Lyra and receive a different feature set and home dashboard based on their `plan_type`.

The centrepiece differentiator for the Creator Plan is the **Rival Tracker** — a gamified weekly leaderboard showing how the user ranks against competitors they've nominated by social handle.

---

## 1. Plan Structure

### Plan Types
The user/account record gains a `plan_type` field with two values: `business` (existing behaviour) and `creator` (new).

Plan type is set during onboarding when the user selects their account type. It can also be changed in account settings. Switching plan type does not delete any data — it only changes which dashboard and nav items are displayed.

### Feature Matrix

| Feature | Business Plan | Creator Plan |
|---|---|---|
| Content scheduling | ✅ | ✅ |
| Inbox / message responses | ✅ | ✅ |
| Analytics | ✅ | ✅ |
| AI caption writing | ✅ | ✅ |
| Hashtag suggestions | ✅ | ✅ |
| Best time to post | ✅ | ✅ |
| Brand AI | ✅ | ❌ |
| Repurpose | ✅ | ❌ |
| SEO tools | ✅ | ❌ |
| Rival Tracker | ❌ | ✅ |

### Navigation (Creator Plan)
Home · Schedule · Inbox · Analytics · Rivals · Account

Business-only nav items (Brand AI, SEO, Repurpose) are conditionally rendered based on `plan_type` — same routes, hidden from nav.

---

## 2. Onboarding

During signup, users choose between:
- **Business** — existing onboarding flow
- **Creator / Influencer** — new onboarding flow

The creator onboarding collects:
1. Account type confirmation (sets `plan_type = creator`)
2. **Creator Profile** — niche (dropdown), content tone (dropdown), short "about me" (free text, ~1 sentence). Used to personalise AI captions and hashtag suggestions in place of Brand AI.
3. Platform connections (same as existing flow)

The Creator Profile can be edited at any time in account settings.

---

## 3. Influencer Home Dashboard

The creator home dashboard is purpose-built for personal brand growth. It replaces the standard business dashboard for `plan_type = creator` accounts.

### Layout

**Top — Rival Tracker Snapshot**
Condensed leaderboard showing current rank among tracked rivals this week, with a single trend callout (e.g., "You're #2 this week ↑ from #4 last week"). "View full leaderboard" links to the Rivals page. This sits at the top because it is the sticky daily hook for influencer users.

**Left Column — Engagement Snapshot**
This week's key numbers: engagement rate, total reach, top-performing post (thumbnail + stat). Sourced from connected account data, same as the existing analytics feature.

**Right Column — Upcoming Scheduled Posts**
Next 3–5 queued posts with platform icons and scheduled times. Quick-compose button lives here.

**Bottom — Best Time to Post**
Per-platform posting time recommendations based on the user's historical engagement data. One row per connected platform.

---

## 4. Rival Tracker

### Overview
The Rival Tracker lets creators add competitors by social handle and see a ranked weekly leaderboard comparing their performance. Light gamification (trend arrows, rank callouts, weekly digest) makes it sticky without feeling like a game app.

### Adding Rivals
- Users add rivals by social handle per platform (e.g., `@handle` on Instagram, `@handle` on TikTok)
- Supported platforms: all platforms Lyra supports
- Cap: **10 rivals per platform** — enough to be useful, keeps third-party API costs predictable

### Data Source
Rival metric data is sourced from a **third-party social data provider** — Phyllo or Modash are the recommended candidates. This is a hard dependency; the Rival Tracker cannot be built without it. Vendor selection and contracting must happen before development begins — this is the longest lead-time item in the feature.

Platform APIs (Instagram Graph API, TikTok API, etc.) do not expose competitor data, so direct API calls are not an option. Web scraping is explicitly ruled out (fragile, ToS violations).

### Metrics Tracked Per Rival
- Follower count
- Follower growth (week-on-week delta)
- Post frequency (posts published this week)
- Engagement rate (interactions ÷ followers)
- Total engagement volume (raw interactions)

### Weekly Refresh
A scheduled job runs **Sunday night** to pull the latest metrics for all tracked handles across all creator accounts. Results are stored in Lyra's database. The leaderboard UI reads from stored data — no live API calls on page load.

If a refresh fails (API error, rate limit), the previous week's data is shown with a "data as of [date]" label. The leaderboard never shows blank.

### Leaderboard UI (Rivals Page)
- Ranked table: the user's own account sits in the list alongside rivals
- Columns: rank, handle, platform, selected metric value, trend arrow (↑↓→)
- **Ranking metric selector** (dropdown at top of table): engagement rate, total engagement, post frequency, follower growth. Switching re-sorts the table instantly client-side.
- Top of page callout: "You're ahead of X rivals this week" (light gamification)
- **Weekly digest** (optional, opt-in): email or in-app notification sent Monday morning summarising rank changes

### Rival Tracker Snapshot (Dashboard Widget)
A condensed version of the leaderboard shown on the home dashboard. Displays current rank, trend direction, and a one-line callout. Links through to the full Rivals page.

---

## 5. AI Features Without Brand AI

### AI Caption Writing
For business users, captions are grounded by Brand AI (website scrape, tone of voice, messaging guidelines). Creator plan users have no Brand AI, so captions are personalised using the **Creator Profile** collected during onboarding (niche, tone, about me). The Creator Profile is injected as context into caption prompts.

The caption tool UX is identical — user inputs topic or uploads media, AI drafts a caption. The only difference is the personalisation source.

### Hashtag Suggestions
Returns hashtags grouped by reach tier: high-reach (broad), mid-reach (niche), low-reach (community/micro). Suggestions are generated from post content combined with the user's niche from their Creator Profile. No changes to the underlying hashtag engine — different input signal only.

### Best Time to Post
No changes from the business version. Driven by the user's own historical engagement data per platform.

---

## 6. Technical Architecture

### plan_type Flag
Single field on the user/account record (`business` | `creator`). All feature visibility and routing decisions branch off this flag. Nav items for business-only features are conditionally rendered — same routes, not shown in creator nav.

### Creator Profile Storage
Stored as a JSON field on the user record. Fields: `niche` (string), `tone` (string), `about` (string). Used as prompt context injection for AI captions and hashtags.

### Rival Data Storage (Supabase)
Two tables:
- `rival_handles` — user_id, handle, platform, created_at
- `rival_snapshots` — handle, platform, week_start_date, follower_count, follower_growth, post_count, engagement_rate, total_engagement

Weekly refresh job upserts into `rival_snapshots`. Leaderboard queries join these tables filtered by the user's tracked handles and the current week.

### Third-Party Provider Dependency
Phyllo and Modash are the recommended candidates for evaluation. Selection criteria: platform coverage (must cover all platforms Lyra supports), data freshness (weekly is sufficient), pricing model (per-handle or per-request), and ToS compliance. **Must be contracted before Rival Tracker development begins.**

### Weekly Refresh Job
Runs Sunday 23:00 AEST. Iterates all creator accounts with tracked rivals, calls the data provider for each handle, stores results. Failures logged, previous snapshot retained as fallback.

---

## 7. Open Questions

- **Plan switching flow:** Should existing users be able to self-serve switch between business and creator plans, or does it require support/a pricing page conversion? Needs a decision before onboarding is built.
- **Third-party data provider:** Phyllo vs Modash — needs evaluation and contracting. Blocks Rival Tracker entirely.
- **Creator Plan pricing:** Not in scope for this spec, but needs to be set before the plan is launched publicly.
- **Rival Tracker rival cap:** 10 per platform is the working assumption. Revisit based on provider pricing once vendor is selected.
