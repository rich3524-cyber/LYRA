# LYRA vs. Metricool — Gap-Closure Roadmap (Design)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into an implementation plan. Phase 0 gets a full bite-sized plan immediately. Phases 1–9 each need their own superpowers:brainstorming pass before they get a bite-sized plan — this document scopes *what and why*, not *exactly how*.

**Goal:** Close the competitive gaps identified in `LYRA-vs-Metricool.md` (24 Aug 2026), reconciled against the existing `docs/LYRA-Wishlist.md` so the two don't drift out of sync.

**Source documents:**
- `LYRA-vs-Metricool.md` — the competitive analysis this roadmap is built from
- `docs/LYRA-Wishlist.md` — the living feature backlog this roadmap integrates with (see "Wishlist reconciliation" below)

---

## Why a roadmap doc instead of a single spec

`LYRA-vs-Metricool.md` surfaced roughly ten independent gaps, four of which already had partial or full scope in the Wishlist, one of which conflicts with an existing Wishlist decision, and one of which (Post Types) is entirely new and itself contains open design questions. This is not a single feature — it's a prioritized program. Per `superpowers:brainstorming`'s own decomposition guidance, this document sequences the program and resolves the decisions that affect sequencing; each phase still gets its own design pass immediately before it's built, except Phase 0 which is small and mechanical enough to plan now.

---

## Wishlist reconciliation

Before this roadmap, four Metricool-doc findings were already tracked independently in `docs/LYRA-Wishlist.md`. This roadmap does not replace the Wishlist — it sequences these items alongside the genuinely new ones and resolves one direct conflict.

| Wishlist item | Status before this roadmap | What changes here |
|---|---|---|
| Item 2 — Client portal | Picked by Richard 11 Aug 2026 as next-up, scoped as a full client-facing dashboard | **Rescoped** (decision below) to an email-link approval flow instead — cheaper, reuses `OnboardingToken`, closes client adoption faster. Full portal demoted to a later upsell, not part of this roadmap. |
| Item 3 — Team member invitations | Picked by Richard 11 Aug 2026 as next-up | Unchanged in design. Resequenced to Phase 2, after Post Types (decision below). |
| Item 6 — Email digest | Brainstorming started 11 Aug 2026, paused mid-way, no design decisions made | Unchanged. Resequenced to Phase 4. Its brainstorm resumes from where it left off. |
| Item 14 — Analytics dashboard depth | Partially built; follower growth explicitly blocked on missing `followerCount` field | Unchanged in substance. Resequenced to Phase 5, expanded with basic demographics (age/gender/country) per the Metricool doc's finding. |
| Items 17c–17e — Pinterest, Threads, Bluesky | Scaffolded (enum + Zernio slug mapping only), no connect routes | Unchanged in substance. Resequenced to Phase 9 (smallest remaining lift, given groundwork already exists). |
| Backlog — Media Library, item 9 (recycling), item 14 (Canva) | Three separate, loosely-connected entries | **Reframed** as one project (Phase 6) — Media Library is the prerequisite for both Canva sync and content reuse, not a parallel effort. |

Once this roadmap is approved, `docs/LYRA-Wishlist.md` should get a short pointer note under items 2, 3, 6, and 14 linking back here, so the two documents don't silently disagree. That edit is a Phase 0 task (see below).

Everything else in this roadmap (Post Types, ads reporting, report delivery, doc fixes, pricing decisions) is genuinely new — not previously tracked anywhere.

---

## Explicitly out of scope

Carried forward from `LYRA-vs-Metricool.md` Part 6, which argued against building these based on what the market has already priced or validated:

- Hashtag tracking (Metricool charges ~US$25/day/network for it; reviewers call it impractical)
- Twitch (Metricool itself only does analytics, not scheduling, for it)
- Looker Studio connector (solves a problem LYRA's buyer segment doesn't have)
- Full white-label (revisit once agencies are paying for the core product)
- Native mobile apps (the mobile audit is done, web is usable on a phone; native is a huge lift for marginal gain now)
- Chasing Metricool's ~150-field analytics depth generally (see Phase 5 for the specific pieces worth having instead)

Tier 3 items from the Metricool doc (public API, link-in-bio, competitor depth, recover-deleted-posts, multi-brand post duplication) stay in the Wishlist at their existing lower priority — not pulled into this roadmap. Item 17 (Public API) and item 13 (GA4) already have Wishlist scope of their own and are unaffected by this document.

---

## Phase 0 — Doc & Help-content correctness (build first, full plan now)

**Why first:** these aren't competitive gaps, they're live product surface actively telling users and prospects wrong things, independent of anything else in this roadmap.

1. **LYRA Assistant placeholder.** `app/(dashboard)/workspace/[workspaceId]/assistant/page.tsx` is a "coming soon" empty state, but it's linked in the primary sidebar and is the opening step of `docs/LYRA-Demo-Reference-Guide.html`'s recommended demo ("click Generate Report… in ~30 seconds LYRA analyses the last 90 days"). Fix: remove the sidebar link and the Demo Guide step; the placeholder's copy already reads honestly once it's not being actively demoed as if it works — verify it matches the pattern used on the Trend Hub page (`components/lyra/trends/trend-hub.tsx`) and adjust if not. Building a real Assistant is explicitly **not** part of this phase — it's a substantial AI feature (90-day analysis, narrative generation) that needs its own brainstorm if and when it's prioritized.
2. **Four Help articles describing non-existent features**, found via `LYRA-vs-Metricool.md` Part 7:
   - `components/lyra/help/section-09-analytics.tsx` — remove the "Net New Followers" metric description (no `followerCount` field exists yet; restore once Phase 5 ships it) and the post-type mentions in Top Posts (feed/reel/story — restore once Phase 1 ships).
   - `components/lyra/help/section-06-compose.tsx` — remove the instruction to drag Instagram carousel images to reorder them (no reorder code exists).
   - `components/lyra/help/section-03-social-connections.tsx` — remove "stories and reels" from the list of schedulable content types (restore once Phase 1 ships).
3. **Trend add-on pre-cutoff subscribers.** The Trend checkout route already returns 503 (fixed prior session), but anyone who purchased before that fix may still hold a live Stripe subscription for a feature that was never built. Query Stripe for active subscriptions against the Trend add-on price ID, and refund or pause each one — this is a billing-correctness issue, not a docs fix, and needs Richard's sign-off on refund vs. pause before it's automated.
4. **Wishlist sync note.** Add a one-line pointer under Wishlist items 2, 3, 6, and 14 linking to this document, so the two don't silently disagree (see "Wishlist reconciliation" above).

**Explicitly not in Phase 0:** any change to `Post`, `Workspace`, or other schema — this phase touches only display copy, nav, Stripe subscription state, and the Wishlist doc.

---

## Phase 1 — Post Types

**Why this is the largest gap:** `LYRA-vs-Metricool.md` §2.1 — LYRA's `Post` model is `content` + `mediaUrls[]` + `socialAccountId` with no post-type concept at all. No Stories, no Reels-as-a-type, no threads, no first comment, no product tags, no ALT text, no per-slide carousel control. A trial user finds this in the first ten minutes. It also blocks Phase 5's story/reel metrics and the UTM-automation sliver already in Wishlist item 12.

**Why it needs its own brainstorm before a bite-sized plan exists:**
- **Scope**: full per-platform parity (everything Metricool supports) vs. an MVP subset (e.g. Stories + carousel-as-first-class-type first, threads and documents later) is a real product call, not something to infer from a competitive doc.
- **Zernio dependency**: LYRA publishes through Zernio for every connected platform. What Zernio's API actually accepts per post-type (Stories, Reels metadata, carousel slide order/ALT/product tags, LinkedIn documents, X/Threads/Bluesky threads) needs to be confirmed against their real API before any schema or composer work starts — this could materially change what's buildable in v1.
- **Composer UI**: the current single-content-block composer needs a real design pass for how post-type selection, per-type fields (trending audio, product tags, thread splitting), and per-slide carousel editing actually work in the UI — not just a data model change.

**Deliverable of this phase's own brainstorm:** a design doc at `docs/superpowers/specs/`, then its own implementation plan(s). This roadmap does not pre-decide the schema.

---

## Phase 2 — Team member invitations (Wishlist item 3)

Data model already exists: `WorkspaceAccess`, role enum (`AGENCY_ADMIN`, `CLIENT_APPROVE`, `SMB_OWNER`, etc.). Needs: invite-by-email flow with role selection, replacing the current direct-database-insert-only path. Lower design risk than Phase 1 — the data model constrains the solution space significantly. Likely plannable in full (bite-sized TDD plan) with a shorter brainstorm than Phase 1, when its turn comes.

---

## Phase 3 — Client approval by email link (rescoped Wishlist item 2)

**Design direction (resolved during this roadmap's brainstorm):** reviewers approve or reject a post directly from a link in the review email, without ever needing a LYRA account — matching Metricool's own design. Built on the existing `OnboardingToken` model (unauthenticated, UUID-based, already working for the onboarding flow) rather than a new authenticated portal UI.

**Open for this phase's own brainstorm:**
- Whether to also build Metricool's read-only shared-calendar link and client-self-connect-social-accounts link as part of this phase, or split them into separate follow-on items.
- Token expiry/security model for the approval link specifically (different trust profile than the onboarding token, since it grants a write action — approve/reject — not just a read view).
- What happens to the original item 2 full-portal scope: demoted to a later upsell, not deleted from the Wishlist, but not part of this roadmap.

---

## Phase 4 — Email digest (Wishlist item 6)

Resumes the brainstorm paused 11 Aug 2026 — weekly (or configurable) per-workspace summary email: posts published, AI comment responses sent, drafts awaiting review, crisis events, top-performing post of the week. No new design decisions introduced by this roadmap; picks up exactly where item 6 left off.

---

## Phase 5 — Follower growth + basic demographics (Wishlist item 14, expanded)

**Why these two specifically, not broader analytics parity:** `LYRA-vs-Metricool.md` §2.4 — these are the two gaps clients ask about by name; chasing Metricool's ~150-field catalogue generally is explicitly out of scope (see above).

**Needs, in order:**
1. Confirm what Zernio's API actually exposes per platform for follower counts and demographics (age/gender/country) — this determines feasibility and shape before any schema work.
2. Add a `followerCount` field (and demographics fields, if Zernio provides them) — currently absent from `prisma/schema.prisma` entirely.
3. A daily collection job (likely alongside the existing metrics-sync cron) to populate history for a growth-over-time chart.
4. Story/reel-specific metrics (watch time, retention, view rate) are **blocked on Phase 1** shipping a post-type concept to attach them to — not part of this phase.

---

## Phase 6 — Media Library

**Reframed as one project**, per `LYRA-vs-Metricool.md` §2.7: a media library is the prerequisite for both the Canva integration (Wishlist item 14) and any real content-reuse workflow (Wishlist item 9, evergreen recycling), not three independent efforts.

**Scope for this phase's own brainstorm:**
- S3-backed browsable media library (upload once, reuse across posts) — this piece already has a pointer in the Wishlist backlog and a Phase 3 reference in `2026-05-19-ai-content-schedule-design.md`, worth reading first.
- Media picker integration in the composer and the bulk-import review screen.
- Whether Canva sync (item 14) and evergreen recycling (item 9) ship in the same phase or as immediate follow-ons once the library itself exists.

---

## Phase 7 — Read-only ads reporting

**Reopens the July 2026 decision** that declined a Meta/Google Ads idea on the grounds it would mean LYRA becoming an ad reseller. `LYRA-vs-Metricool.md` §2.5 draws the distinction explicitly: that reasoning applies to *spending* ad budget, not to *reading* ad performance. This phase is scoped to read-only reporting only — extending the existing single-boosted-post `getBoostReach()` read path (`services/social/meta-ads.ts`) into real ads-performance reporting alongside organic metrics. No spend, checkout, or budget-management surface is in scope here or in any future phase without a separate explicit decision.

---

## Phase 8 — Report delivery: scheduled email + shareable links

Extends the already-shipped PDF export (Wishlist item 19) rather than replacing it:
- Automatic monthly email delivery of the existing branded PDF report, instead of requiring a manual click each time.
- A read-only shareable link to a report, as an alternative to a PDF attachment.

Distinct from Phase 4 (email digest, a recurring activity summary) — this phase is specifically about the existing formal client report.

---

## Phase 9 — New networks: Pinterest, Threads, Bluesky (Wishlist items 17c–17e)

Smallest remaining lift among the major items — Zernio slug mappings already exist for all three; what's missing is the connect-route wiring and a service file per platform (matching the pattern of existing platforms like `services/social/linkedin.ts`). Bluesky is the outlier: AT Protocol app-password auth instead of OAuth, needs its own research into posting API and whether comment monitoring is viable before it can be scoped like the other two.

---

## Business decisions (not build tasks)

These affect the product but aren't engineering work, and shouldn't be silently assumed by whoever picks up Phase 0 or later phases:

1. **Stripe Price currency.** Nothing in the codebase declares whether LYRA's `lib/stripe.ts` prices are AUD or USD — the UI renders a bare `$`. This needs checking directly against the live Stripe Price objects (not the repo) and then, if it's ambiguous or wrong, fixed before it causes a support ticket over an unexpected charge amount.
2. **Starter tier viability.** At $49/month for one workspace with autonomy switched off, Starter is priced above Metricool's equivalent tier while offering a fifth of the brands, four fewer networks, and the product's core differentiator disabled. Richard to decide: bundle Draft+Approve autonomy into Starter so the product's reason for existing is present at entry, drop the tier entirely, or leave as-is with rationale.

---

## Sequencing rationale (why this order)

Post Types (Phase 1) goes immediately after the Phase 0 doc fixes rather than continuing the already-in-flight items 3/6, because it's both the single largest gap found and a dependency for later phases (Phase 5's story/reel metrics, the existing UTM-automation Wishlist item). Items 3 and 6 were already mid-flight decisions from 11 Aug 2026 and keep their relative order (2 demoted/rescoped to Phase 3, 3 to Phase 2, 6 to Phase 4) rather than being re-litigated. Phases 5 onward are ordered by how directly `LYRA-vs-Metricool.md` ties them to a named, recurring client ask (follower growth, then media reuse, then ads reporting, then report delivery, then new networks) — this is the same rationale the source document used in its own "Recommended next moves" section.

Nothing after Phase 0 is committed to a hard timeline — each phase begins with its own brainstorm when it's actually picked up, which may reorder later phases based on what's learned building earlier ones (particularly Phase 1, which could surface Zernio API limitations that change how attractive Phase 5's per-platform metrics work looks).
