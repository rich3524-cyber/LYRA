# Help-Docs Accuracy Audit — Consolidated Findings

**Date:** 24 Aug 2026
**Scope:** All 13 files in `components/lyra/help/`. 3 audited during Phase 0 of the Metricool gap-closure roadmap (PR #49); 10 audited in this pass.
**Purpose:** Fact-finding only — this report does not fix anything. Fix work (patch vs. rewrite, per file, per severity) is scoped in a separate future brainstorm per `docs/superpowers/specs/2026-08-24-help-docs-audit-design.md`.

---

## Headline

**~167 findings across all 13 files: roughly 50 Critical, 71 Important, 46 Minor.** No file came back clean. The smallest file (22 lines, Trends) had the fewest problems (1 Important, 1 Minor) but still wasn't accurate. Several files describe entire subsystems that were never built — a General settings tab, a Guardrails configuration screen, a platform filter on the calendar, a property picker for SEO — while several genuinely-shipped features (the SEO module's on-page scorer and AI content generator, YouTube as a connected platform, the Trend add-on's card-level "not yet functional" labeling) go completely undocumented in the sections that should describe them.

**This audit also surfaced real product bugs, independent of documentation — these are more urgent than any doc-wording fix:**

1. **Account deletion never cancels the Stripe subscription, and deletes the only DB pointer that could later cancel it** (`app/api/account/route.ts`) — a deleted user's card keeps being charged indefinitely with no way to stop it through LYRA. Found via `section-14-data-deletion.tsx`.
2. **Plan upgrades create a second concurrent Stripe subscription instead of modifying the existing one** (`app/api/stripe/create-checkout/route.ts`) — an upgrading customer is charged for both plans simultaneously. Found via `section-11-billing.tsx`.
3. **The weekly automated brand-profile refresh cron silently erases the client's pasted brand guidelines text** every time it runs, because its upsert never preserves `userGuidelines` (`workers/brand-sync.worker.ts`). Found via `section-04-brand-intelligence.tsx`.
4. **Google Business reviews are sold as an inbox feature but are never ingested** — no `Review` model exists in the schema at all, and the only fetch function for reviews is never called by any ingestion path. Found via `section-07-inbox.tsx`.
5. **Comment sentiment is documented as AI-classified and filterable, but the field is never written anywhere** — always `null`. Found via `section-07-inbox.tsx`.
6. **`AWAITING_APPROVAL` is dead code** — no path in the codebase ever assigns that comment status, despite being read in several places. Found via `section-07-inbox.tsx`.
7. **Starter-plan workspaces can be set to Draft + Approve autonomy and have the AI generate (and bill for) drafts, but the UI that would let a Starter user approve them is hidden** — a broken combination reachable today. Found via `section-07-inbox.tsx`.
8. **`audience.languageLevel` is read by the Brand page but never written by the build pipeline** (which writes `audienceProfile.language` instead) — a dead UI field from a property-name mismatch. Found via `section-04-brand-intelligence.tsx`.

None of these were fixed as part of this investigation — they're flagged here for prioritization alongside the documentation fix work.

---

## Severity summary across all 13 files

| File | Critical | Important | Minor | Notes |
|---|---|---|---|---|
| section-01-getting-started.tsx | 3 | 6 | 4 | False "no credit card required" claim; described signup flow doesn't exist on the live marketing page |
| section-02-workspaces.tsx | 7 | 5 | 4 | Editing workspace details and deleting a workspace both describe UI that doesn't exist |
| section-03-social-connections.tsx | 2 | 4 | 5 | Phase 0 (PR #49) — includes the Zernio custody finding, tracked separately in the companion investigation |
| section-04-brand-intelligence.tsx | 4 | 8 | 5 | Includes 2 real product bugs (guidelines-erasing cron, dead `languageLevel` field) |
| section-05-content-calendar.tsx | 6 | 7 | 5 | Worst of the 10 new audits — an entire platform-filter subsection is fiction, drag restriction is inverted |
| section-06-compose.tsx | 5 | 3 | 3 | Phase 0 (PR #49) — includes the false auto-save claim (highest data-loss risk found across all 13 files) |
| section-07-inbox.tsx | 5 | 10 | 5 | Most total findings (20) — Guardrails config UI is fiction, 3 of 6 documented platforms aren't ingested |
| section-08-seo.tsx | 5 | 5 | 3 | Disconnect flow, property picker, and 4 metric cards all fictional; real features (page scoring, AI content gen) undocumented |
| section-09-analytics.tsx | 2 | 8 | 1 | Phase 0 (PR #49) |
| section-10-settings.tsx | 5 | 4 | 3 | 5 of ~8 subsections (General, Client Access, Guardrails, Integrations, Account Profile) describe nonexistent UI |
| section-11-billing.tsx | 3 | 5 | 5 | Includes 1 real product bug (duplicate-subscription upgrade path) |
| section-13-trends.tsx | 0 | 1 | 1 | Cleanest file — correctly says the feature isn't shipped, one stale billing clause |
| section-14-data-deletion.tsx | 3 | 5 | 2 | Includes 1 real product bug (orphaned live Stripe subscription on account deletion) |
| **Total** | **~50** | **~71** | **~46** | **~167 findings** |

*(Phase 0 counts are approximate re-summaries of reviews already completed under PR #49 — see the full text below for the actual findings, not just this table.)*

---

## Full findings by file

### section-01-getting-started.tsx

**3 Critical, 6 Important, 4 Minor.**

**Critical:**
1. **Free trial length is wrong** — doc says 14 days on Pro/Agency only; code (`app/onboard/page.tsx:57-58`) sets `trial_period_days: 30` for every plan. Contradicts both the marketing page (`app/page.tsx:130`, "30-day") and section-11-billing.tsx (`:185`, "30-day"). Note: `app/onboard/success/page.tsx` is itself stale and still says 14 days — the doc appears to have been written from that stale page, not the actual checkout config.
2. **"No credit card required to start" is false** — Stripe Checkout in `mode: 'subscription'` with no `payment_method_collection: 'if_required'` requires a card up front; confirmed by the app's own post-checkout copy ("Card will be charged after your 14-day trial").
3. **The entire "Creating your account" flow (Steps 1-5) describes an unshipped product.** `lyraonline.ai` has no "Get started free" button — the live root page is a waitlist/coming-soon page. No plan-selection UI exists (`/onboard` reads plan from a `?plan=` query param, defaulting to PRO if absent). No step asks for an agency/business name — it's auto-generated (`${user.name}'s Agency`). "You are taken to the dashboard" is wrong — Stripe redirects to an interstitial requiring a manual "Enter LYRA" click.

**Important:**
4. "Account → Profile" cannot be edited — it's read-only display, and the page itself says "Profile details are managed through your login provider."
5. Dashboard bullet list — 4 of 5 bullets wrong: actual KPIs are Pending comments/Scheduled today/Posts this week (not a rolling 7-day window); no per-workspace brand-status; no billing/account notice banner exists anywhere.
6. Sidebar nav list — "Brand Intelligence" is actually labelled "Brand AI"; four shipped items (Dashboard, Competitors, Repurpose, Trends) are missing from the doc's list.
7. No search icon in the header — only an Upgrade button and avatar exist; no command palette either.
8. Settings does not contain guardrails or client access — guardrails live on the Brand AI page; client access is set once at creation with no editor in Settings.
9. Sidebar does not collapse to icon-only on smaller screens — below the `lg` breakpoint it's removed entirely, replaced by a hamburger drawer; icon-only is a manual toggle available at any width.

**Minor:** avatar dropdown has no billing item (billing is one level deeper, inside Account); workspace switcher invisible when sidebar collapsed; "guided setup prompt" for first workspace is just a static empty-state card, not a wizard; "most recently active workspace" quick-link has no recency logic (hardcodes `workspaces[0]`).

---

### section-02-workspaces.tsx

**7 Critical, 5 Important, 4 Minor.**

**Critical:**
1. "Settings → General" does not exist — the settings page has no General tab/section at all.
2. Workspace name is not editable anywhere in the UI (API supports it, nothing calls it).
3. Website URL is not editable anywhere in the UI.
4. Industry is not editable anywhere in the UI. (Only Client timezone, of the doc's 4-item list, is real.) Aggravating: the Brand page's setup checklist has a "Go to Settings" button for the website URL that lands on a page with no such field.
5. No brand-profile rebuild prompt fires on website URL change — no such prompt exists, and there's no UI to change the URL in the first place.
6. Deleting a workspace does not ask you to type the workspace name to confirm — the dialog has no text input, Delete fires immediately on click.
7. "New workspace" is never disabled when at the plan limit, and there's no upgrade prompt at the point of creation — the limit only surfaces as an error message *after* filling in the entire creation form.

**Important:** the creation field is labelled "Client name", not "Workspace name"; Industry is display-only and never reaches any AI prompt; the workspace name IS shown to the client (doc claims it's agency-only); the overview page's description (connection status, brand-build status, action items) is largely wrong — it shows 3 stat cards and a recent-posts list, nothing else; the creation form's fields are in a different order than documented and a whole 4th field (Client access — a materially more consequential choice than industry) is undocumented.

**Minor:** fictional workspace-ID example format (`ws_abc123` vs. real cuids); switcher not available "at any time" (hidden when sidebar collapsed); plan limit is bypassed entirely for users with no agency.

---

### section-03-social-connections.tsx (Phase 0, PR #49)

**2 Critical, 4 Important, 5 Minor.** (See the companion investigation, `2026-08-24-zernio-token-custody-findings.md`, for the full custody/scope-disclosure detail behind finding #1 below.)

**Critical:**
1. **Privacy claim wrong**: states LYRA is the sole custodian of OAuth tokens ("LYRA stores only the OAuth access token... and uses it exclusively") — the live connect flow routes through Zernio, a third party, which actually holds the tokens for every current connection. Several requested permission scopes (Facebook `business_management`/`ads_management`, X `offline.access`) are undisclosed anywhere in-app.
2. Instagram connect-order description is inverted, and the settings page's own copy ("Connected separately from Facebook") directly contradicts it.

**Important:** YouTube is a fully shipped, connectable platform missing from the doc's platform list entirely; disconnect claims tokens are "immediately revoked" — the code only sets `isActive: false`, the encrypted token row is retained; the page-picker step described for Facebook/Google Business/LinkedIn doesn't exist for the latter two, and the one real picker (`FacebookPagePicker`) is vestigial dead code on the current Zernio path; the Facebook troubleshooting steps contradict the live in-app error message, which explicitly tells users the issue is Zernio-side and not fixable via those steps.

**Minor:** `rerequest=true` reconnect param is dead (nothing on the live path honors it); multi-workspace connections aren't flagged as separately billed Zernio accounts; a few smaller copy/label mismatches.

---

### section-04-brand-intelligence.tsx

**4 Critical, 8 Important, 5 Minor.** Includes 2 real product bugs — see Headline section above.

**Critical:**
1. **The "Upload guidelines" flow does not exist in the UI** — only a paste-in textarea is shipped. The upload API exists but nothing calls it.
2. **The weekly automated refresh doesn't do what the manual rebuild does, and silently erases pasted guidelines** (real bug — see Headline #3). The cron only picks up workspaces with a website URL, scrapes the homepage only (not multiple pages), uses zero social signal (hardcoded empty array), and its upsert overwrites `userGuidelines` with nothing.
3. **"Social feed analysis" doesn't read any social feed** — it reads LYRA's own `Post` table (posts authored *in* LYRA), never calls a platform API. A workspace with Facebook/Instagram connected but no LYRA-authored posts contributes zero social signal, the opposite of the doc's advice.
4. **The 5-area Voice Summary structure doesn't match what's actually built** — "Writing style" and "What to avoid" fields don't exist in the schema or the Claude prompt; the AI has no backing data for "actively avoids these topics."

**Important:** website crawl scope is 3 hardcoded URLs, not "blog posts and any linked pages"; no progress bar exists (a single spinner); the website-URL "Edit" verification step doesn't exist; the social-account prerequisite is a hard blocking gate, not an optional tip as documented; "what happens without a profile" is wrong on 3 counts (comments auto-escalate rather than "disabled"; no inline prompt links to the Brand page; AI schedule generation is blocked, contrary to "scheduling works regardless"); document parsing only works for plain text/markdown — PDF/DOCX fall through to raw-byte extraction, effectively non-functional; sidebar label mismatch ("Brand Intelligence" vs. actual "Brand AI"); **the Audience "language level" field is dead code** (real bug — see Headline #8).

**Minor:** theme-count mismatch (3-7 documented vs. 5-8 actually prompted); undocumented rebuild rate limit (5 per 5 minutes); crisis-keywords panel visibility description is slightly off; wrong settings path named for the Crisis Aware toggle; profile injection reach is overstated (not read by content-scorer, repurposer, or crisis-detector).

---

### section-05-content-calendar.tsx

**6 Critical, 7 Important, 5 Minor.** The worst of the 10 newly-audited files.

**Critical:**
1. **The entire "Filtering the calendar" subsection is fiction** — the real filter is single-select by status (All/Scheduled/Drafts/Pending/Published/Failed); there is no platform filter anywhere.
2. **The drag restriction is inverted** — the doc says Published and Failed posts cannot be dragged; the actual drag handler has no status guard at all, so they can be.
3. **The `+N more` day-overflow expander doesn't exist** — every post/campaign renders unconditionally in a growing cell.
4. **Clicking an empty day cell does nothing** — no "+ New post" button; the only entry point is a header-level link with no date pre-fill.
5. **Published posts show neither a publish timestamp nor a link to the live post** — the detail panel's only date field is `scheduledAt`; `publishedAt` is fetched but never rendered, and there's no outbound platform link anywhere.
6. **Drafts with no scheduled date never appear on the calendar at all** — contrary to the doc's claim they show up on their creation date; the query filters them out entirely.

**Important:** no Retry option and no "Edit & Reschedule" flow for failed posts (the only real action is "Move back to draft"); Approved does not move to Scheduled "automatically" on media attach — it requires a manual click, which is itself hidden while media is missing; posts are never auto-cancelled when a social account disconnects; no Duplicate button exists, and media is shown as a text count, not previews; 3 of 4 "reading the calendar" chip claims are wrong (dot not icon, full text not truncated, badge not border, desktop chip shows no time at all); clicking a chip opens the detail panel, not the composer, directly contradicting another line in the same doc; CSV export silently drops posts that have media attached, or hard-errors if none qualify.

**Minor:** "Add all to calendar" creates drafts, not scheduled posts; generation is per-week/concurrent, not "one platform at a time"; Today button and chevrons aren't positioned as described; the Approved legend color doesn't match what actually renders; bulk import, the mobile agenda view, and email-campaign display on the calendar are all undocumented.

---

### section-06-compose.tsx (Phase 0, PR #49)

**5 Critical, 3 Important, 3 Minor.** Includes the single highest data-loss-risk finding across all 13 files.

**Critical:**
1. **False auto-save claim** — the doc promises unsaved changes are auto-saved every 30 seconds with a browser confirmation prompt on close; no such timer or handler exists anywhere. A user trusting this can lose real work.
2. Per-platform caption customization is fictional — one shared editor exists; `handleSubmit` sends one `content` string to all selected platforms.
3. The documented 4-step AI workflow (brief prompt → 3 variations → Regenerate/Refine) is fictional — reality is one button, one generated caption, no variations, and the prompt explicitly instructs the model to return no alternatives.
4. Hashtag-suggestion feature is entirely fictional — no such button, endpoint, or logic exists anywhere.
5. "Send for approval" button doesn't exist — approval routing happens server-side after clicking the ordinary Schedule button; the user never makes an explicit choice.

**Important:** media limits are wrong in 4 ways (documented 20MB/image and 512MB/video vs. actual flat 50MB cap for all media; no image-count cap exists at all despite a documented "10 images" limit; AVI is rejected, not accepted, while undocumented webm is accepted); character counter is in the wrong location with hardcoded limits for only 2 of 6 platforms; scheduling constraints (6-month horizon, 5-minute lead time, no backdating) are entirely unenforced in code.

**Minor:** editor lacks emoji/mention/link-preview features the doc claims; "Add media" button is actually labelled "Media"; "Best time to post" is an inline hint strip, not a button inside a date picker.

---

### section-07-inbox.tsx

**5 Critical, 10 Important, 5 Minor.** The most total findings of any file (20).

**Critical:**
1. **"Settings → Guardrails" doesn't exist, and 3 of the 4 documented guardrail types cannot be created by any code path.** The guardrails API only exposes DELETE; the sole write path anywhere in the codebase hardcodes `ALWAYS_ESCALATE` only.
2. **Platform list is wrong — 3 of 6 listed platforms aren't ingested.** Comment sync is hard-filtered to Facebook/Instagram/LinkedIn only. TikTok comments are explicitly unsupported via Zernio (code comment confirms it). **Google Business reviews are never ingested at all — no `Review` model exists in the schema, and the fetch function is never called anywhere** (real bug — see Headline #4). X/Twitter has no polling branch.
3. **"Awaiting Approval" status is dead code** — no path ever assigns it; drafts are written with a different status entirely (real bug — see Headline #6).
4. Approved answers are not used verbatim and have no trigger-matching — they're a soft prompt hint the model may or may not follow; the doc's "factual accuracy guarantee" doesn't exist.
5. Full Autonomy is not Agency-only — Pro workspaces can access it too, contrary to the doc's plan gate.

**Important:** Draft + Approve has no real server-side plan gate — Starter workspaces can have it enabled and drafts generated (and billed), but the UI to approve those drafts is hidden from Starter, a broken combination (real bug — see Headline #7); only 1 of 4 documented inbox filters exists (platform only — no date range or sentiment filter, and status is fixed tabs, not a filter); **sentiment is never classified — the field is always null** (real bug — see Headline #5); inbox is not scoped to "last 30 days" — it's the most recent 100 rows of all time, unbounded by date; escalated comments are not pinned to the top — they're in a completely separate tab, excluded from the main list; guardrails are not all checked pre-generation — only `ALWAYS_ESCALATE` is; the others are checked against the model's *output* after the (billed) call already happened; "Never discuss" is a literal substring scan of the generated response, not a topic classifier of the incoming comment; the described review panel (comment left, draft right, amber border) doesn't exist — cards are always fully expanded inline, single column, no conditional border; "Write manually" control doesn't exist — the same textarea is just editable; the approve button is labelled "Approve & send", not "Approve & Post" as stated three separate times in the doc.

**Minor:** all 3 autonomy mode names differ from the actual UI labels; the settings section is named "AI Response Mode", not "AI Autonomy"; "Pending" status is not reliably brief — with autonomy Off it sits indefinitely; escalation *does* have a Slack/Teams notification path, contrary to the doc's "no notification yet" caveat; "Guardrails (Agency plan)" over-restricts — Pro-with-Crisis-Aware-add-on also has access.

---

### section-08-seo.tsx

**5 Critical, 5 Important, 3 Minor.**

**Critical:**
1. "Settings → Integrations → Disconnect" doesn't exist — no Integrations section anywhere, no disconnect route for GSC; a user cannot disconnect GSC short of destroying the whole workspace.
2. No property picker and no "Connect this property" button — the property is chosen entirely server-side via fuzzy URL match, with a silent fallback to the first available site.
3. The dashboard has no metric cards — all 4 documented (Clicks/Impressions/Avg CTR/Avg Position) don't exist; only a chart and one query table are rendered.
4. The "Top Pages" table doesn't exist — the GSC client only ever requests `query` and `date` dimensions, never `page`.
5. There is no date-range picker — the windows are hardcoded (30 days for trend, 90 days for queries) and not user-adjustable.

**Important:** "last 28 days" is wrong in both directions (actual: 30-day trend, 90-day queries, both explicitly labelled in the UI); column headers aren't sortable and the table caps at 25 rows, contrary to a documented sort-by-impressions workflow; "no historical data stored, nothing to delete" is misleading — tracked pages, AI-generated content, scores, and encrypted OAuth tokens all persist; the doc omits the module's two headline shipped features entirely (the on-page analyzer/scorer and the AI content generator, which is the *primary* section on the actual dashboard); the recommended client-onboarding workaround for connecting GSC doesn't work — the onboarding wizard has no account-connection step at all.

**Minor:** access-level prerequisite is overstated (Restricted GSC access actually works, contrary to the doc); the "28 days of data" prerequisite has no basis in code; a lag-time figure disagreement (doc says 2-3 days, product says 3 days everywhere else).

---

### section-09-analytics.tsx (Phase 0, PR #49)

**2 Critical, 8 Important, 1 Minor.**

**Findings (re-summarized from the original Phase 0 review):** fabricated interactive features — a click-to-drill-down post analytics panel and a platform-card drill-down view, neither of which exist (posts and platform cards are non-interactive); wrong period options documented (7d/28d/3mo/6mo/12mo/custom) against the actual 3 fixed options (7d/30d/90d); an invented "last sync" timestamp display that's never rendered anywhere; a metric-list mismatch — Impressions, Engagements, and Engagement Rate are documented but not shown on the real dashboard, while Total Views and Response Rate are shown but undocumented; the "Net New Followers" metric described doesn't exist (no `followerCount` field anywhere in the schema); Top Posts sort order and legend-toggle behavior described don't match the real chart's per-metric (not per-platform) series.

---

### section-10-settings.tsx

**5 Critical, 4 Important, 3 Minor.**

**Critical:**
1. "Workspace settings — General" (name/website/industry/timezone fields) doesn't exist — only the Timezone control is real.
2. "Client Access" isn't a settings-page control at all — it's set once at workspace creation with no post-creation editor.
3. "Guardrails" describes a full configuration screen that doesn't exist — no guardrail UI anywhere, and the API only supports delete.
4. "Account settings — Profile" editing (display name, photo, email, verification step) is entirely fictional — the account page is explicitly read-only, stating profile is managed through the login provider.
5. The Social Accounts list claims 4 data points (status variants, token expiry date, connection date); only platform and name are actually shown, and disconnected accounts are filtered out of the list entirely rather than shown with a "Disconnected" status.

**Important:** the workspace timezone is not used by the composer or calendar at all, and Analytics uses the *viewer's browser* timezone instead, meaning two people in different countries see different daily buckets for the same workspace; the "Integrations" subsection names the wrong integration (documents GSC, which isn't there) and omits the real one (Email Marketing: Klaviyo/Mailchimp/Customer.io, which is); Danger Zone has no type-to-confirm and no "30 seconds" deletion window — it's a single click, synchronous; the Crisis Aware plan gate is internally inconsistent within the same file (one line says "Pro and Agency", another correctly says "Agency, or Pro with the add-on").

**Minor:** autonomy option labels don't match the shipped UI; the Trend add-on card is undocumented; "no self-service client onboarding link" is contradicted by a real, shipped token-based flow (though it serves a narrower purpose than full dashboard access).

---

### section-11-billing.tsx

**3 Critical, 5 Important, 5 Minor.** Includes 1 real product bug — see Headline section above.

**Critical:**
1. Cancellation does not produce a "free read-only state" — the account silently downgrades to paid Starter (still $49/mo), which retains nearly full write access, not a read-only mode that doesn't exist anywhere in the codebase.
2. **Upgrades are not pro-rated — a second concurrent subscription is created instead of modifying the existing one** (real bug — see Headline #2). An upgrading customer is charged the full new-plan price on top of the old subscription.
3. "Full AI autonomy" is documented as Agency-exclusive, but Pro workspaces can enable it — the plan constant declaring Pro's ceiling is defined but never actually read by any gate.

**Important:** currency is asserted as USD but nothing in the code sets a currency — it lives entirely in the Stripe dashboard, unverifiable from the repo; guardrail controls are documented as Agency-exclusive but aren't plan-gated anywhere, available on every tier; AI caption generation is documented as Pro-exclusive, but the plan-features list itself includes it under Starter, and the generation endpoint has no gate at all; trial length contradicts the app's own post-checkout screen (30 vs. 14 days); the documented "Change plan" button doesn't exist (the real controls are "Manage billing", "Upgrade to X", and "Downgrade", none matching the doc).

**Minor:** "Manage subscription" button is actually labelled "Manage billing" and is conditionally hidden; "6 social platforms" undercounts — the composer actually offers 7; the annual Crisis Aware add-on option is unreachable from any UI even though the backend supports it; the Starter Crisis Aware card has no upgrade CTA despite the doc's claim; "bank account" as a payment method isn't supported by the checkout flow's `payment_method_types`.

---

### section-13-trends.tsx

**0 Critical, 1 Important, 1 Minor.** The cleanest file audited — correctly frames the feature as unshipped.

**Important:** "Checkout is disabled so no one is charged for it" is false for anyone who subscribed before checkout was disabled — a remediation script exists specifically to find such subscriptions (currently zero found, per the companion investigation's real Stripe check, but the doc's blanket claim doesn't hold as a general statement), and the product's own Trend add-on card already concedes this ("Subscription ID... manage or cancel below").

**Minor:** published section numbering skips 12 (Billing is 11, Trends is 13 — no section 12 exists), a cosmetic gap in the reading order.

**Confirmed accurate:** the core "not yet shipped" framing, checkout-disabled state, absent Trend Hub, absent discovery sync, and absent composer integration are all verified correct against the actual (stub) implementation.

---

### section-14-data-deletion.tsx

**3 Critical, 5 Important, 2 Minor.** Includes 1 real product bug — see Headline section above.

**Critical:**
1. "The stored token is deleted immediately" on disconnect is false, stated twice — the code only flips `isActive: false`; the encrypted token row (and refresh token, expiry, webhook ID) persists indefinitely. This is a compliance-facing page, making the same defect as section-03 materially worse here.
2. **"Active subscriptions are cancelled immediately with no further charges" is false — no Stripe call exists anywhere in the account-deletion path, and the deletion transaction destroys the only DB record that could later cancel the subscription** (real bug — see Headline #1). The user keeps being charged after deleting their account.
3. The navigation path to the delete-account control is wrong (doc says Account → Billing → Delete account; the real location is Account → Danger Zone, a different page).

**Important:** "all associated data — including all workspaces" over-claims — only workspaces the user owns are destroyed, shared workspaces survive, and the route can hard-fail with a 500 if the user authored posts in a shared workspace (an unhandled foreign-key restriction); per-social-account scoped deletion is promised but no code can perform it — every deletion path is scoped to a whole workspace, never a single connected account; no Meta Data Deletion Request Callback endpoint exists (the doc's email-based process is an acceptable substitute per Meta's rules, but shouldn't be read as evidence a callback exists); the "three-dot menu" for disconnect doesn't exist (same defect as section-03); there's no confirmation dialog for disconnect at all, despite the doc describing a confirm step.

**Minor:** the list of stored credential fields is incomplete (omits refresh token, webhook ID, and others — under-discloses what's actually retained); "all data removed within 30 days" isn't literally true even on success (one orphaned table, `FacebookPending`, is never included in the deletion transaction).

**Confirmed accurate:** the note directing users to separately revoke access at the platform level (Facebook Business Integrations) is correct and important — there is genuinely no Graph API revocation call anywhere in the codebase, so this manual step really is the only way to fully revoke.

---

## Cross-file patterns worth noting

1. **"Settings → General" / a workspace-editing screen is claimed by at least 3 files** (section-02, section-04, section-10) and doesn't exist in any of them — this is the single most-repeated fictional UI element across the whole directory. A fix should address it once, not three times independently.
2. **The Guardrails configuration screen is claimed by at least 2 files** (section-07, section-10) and is fictional in both — the only real guardrail-adjacent UI anywhere is the Crisis Keywords panel on the Brand page, scoped to exactly one guardrail type (`ALWAYS_ESCALATE`).
3. **"Brand Intelligence" vs. "Brand AI" sidebar-label mismatch appears in at least 3 files** (section-01, section-04, and implicitly others) — a single source-of-truth fix (correcting every doc reference to match the real nav label) would resolve all of them at once.
4. **Disconnect-doesn't-actually-revoke-the-token appears in at least 2 files** (section-03, section-14) — same code defect, described wrong in both places identically.
5. **Every file that discusses billing/plan gating (section-07, section-10, section-11) contains at least one wrong plan-gate claim** — Full Autonomy's actual plan boundary, guardrails' actual plan boundary, and AI caption generation's actual plan boundary are each documented differently than the code enforces, in different files. A single accurate plan/feature matrix, referenced by all three sections rather than re-described in each, would prevent this drift recurring across files even after a one-time fix.
6. **Multiple files understate what's actually shipped, not just overstate** — section-08 (SEO's real primary features are undocumented), section-10 (Email Marketing integration undocumented), section-01 (Competitors and Repurpose missing from the nav list) all have the "opposite" problem alongside the more common false-claim pattern.

## Recurrence prevention (noted, not designed)

Per the design doc's explicit scope decision, this report does NOT design a mechanism to prevent this drift recurring (tests, review cadence, etc.) — that's a separate future item. Noting it here once so it isn't lost: given the scale found (167 findings, every one of 13 files affected, several files describing entire subsystems that were never built), a one-time fix pass alone will not hold — whatever ships next (Post Types, Team Invitations, the other Metricool roadmap phases) needs some mechanism, decided later, to keep Help content in sync with what actually ships.
