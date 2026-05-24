# LYRA — Project Handover Document

**Date:** May 2026 (updated May 2026)  
**Prepared by:** Claude Code (Anthropic)  
**Project owner:** Richard Unwin, Into The Wild Marketing

---

## Changelog

### May 2026 — Session 19

**28-point UX overhaul — mobile nav, live preview, account page, design system**

Full UX audit implemented across the entire app. Every page in the authenticated shell was reviewed and updated. 22 files changed, 1,330 insertions, 6 new files created.

**Commits shipped:**
- `48c0d06` — feat: 28-point UX overhaul — mobile nav, live preview, account page, design system
- `0705f1c` — fix: remove asChild from AlertDialogTrigger — base-ui has no asChild prop

**App shell**
- `components/lyra/app-shell/sidebar.tsx` — active nav item now has a left platinum border accent; hit area extended with invisible padding so the full row is clickable; collapsed state shows workspace monogram instead of empty space; hidden on mobile (`hidden md:flex`)
- `components/lyra/app-shell/mobile-nav.tsx` — **new file**; fixed bottom navigation bar for mobile, 5 items (Dashboard, Calendar, Compose, Inbox, Brand), `md:hidden`
- `components/lyra/app-shell/header.tsx` — removed stale `title` prop; user dropdown now uses `router.push('/account')` (was broken 404)
- `app/(dashboard)/layout.tsx` — imports and renders `<MobileNav>`; main content area gets `pb-20 md:pb-6` to clear the mobile bottom nav

**Calendar**
- `components/lyra/calendar/content-calendar.tsx` — Today button left of navigation arrows (dimmed/disabled when already on current month); mobile agenda view (`md:hidden`) with chronological day groups, platform colour dot, `HH:mm` time, 80-char content excerpt; calendar grid wrapped in `hidden md:grid`; proper empty state in both views
- `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` — heading updated to `font-display text-4xl`

**Composer**
- `components/lyra/composer/post-composer.tsx` — toolbar split into two rows (row 1: AI generate + media; row 2: char counter + schedule + save draft + post now + schedule button); "Post now" opens an AlertDialog confirmation listing target platforms and a 120-char content preview
- `components/lyra/composer/post-preview.tsx` — **new file**; six platform-specific mock previews (Instagram, Facebook, LinkedIn, Twitter, Google Business, TikTok); desktop/mobile toggle; tab per selected platform; placeholder when no platform selected
- `components/lyra/composer/compose-client.tsx` — **new file**; client wrapper that lifts `content` and `selectedPlatforms` state; mobile tab strip (Compose / Preview); desktop side-by-side `md:grid-cols-2` layout with sticky preview panel
- `app/(dashboard)/workspace/[workspaceId]/compose/page.tsx` — rewritten to use `ComposeClient`; `max-w-2xl` → `max-w-3xl`; heading `font-display text-4xl`

**Dashboard**
- `app/(dashboard)/dashboard/page.tsx` — KPI status strip: 3 tiles (Pending comments → inbox, Scheduled today → calendar, Posts this week → analytics) with `font-mono` counts; workspace cards show platform colour dots + pending comment badge; setup checklist items show ChevronRight on hover

**Settings**
- `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — workspace name + website URL edit form with server action (`prisma.workspace.updateMany` with access check); connected platform cards show `border-l-2 border-l-status-success/50` accent; danger zone uses `border-t border-status-error/20` and card `border border-status-error/20`

**Inbox**
- `components/lyra/inbox/response-inbox.tsx` — filter area reserves fixed `h-7` height with skeleton during load (no layout shift); all three tabs always show count badge (zero shown as dimmed mono text); comment lists wrapped in `<AnimatePresence>` with Framer Motion exit animation (`opacity: 0, x: -16, duration: 200ms`)
- `app/(dashboard)/workspace/[workspaceId]/inbox/page.tsx` — heading `font-display text-4xl`

**Brand**
- `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` — voice summary wrapped in `border-l-2 border-accent-platinum pl-4` with `text-base leading-relaxed`; all tag spans (tone, themes, interests) get `select-none cursor-default`

**Analytics**
- `app/(dashboard)/workspace/[workspaceId]/analytics/page.tsx` — heading and subtext replaced with design system tokens (was hardcoded hex + `font-semibold`)

**Marketing page**
- `app/page.tsx` — sign-in link added `absolute top-6 right-6`; founding member slot counter colour changed from `text-status-warning` to `text-accent-platinum`

**Account page (new)**
- `app/(dashboard)/account/page.tsx` — **new file**; Profile section (avatar image or initials, name, email); Plan & Billing section (plan badge, founding member badge, "Manage billing" link); Danger Zone section
- `components/lyra/account/delete-account-button.tsx` — **new file**; AlertDialog confirmation before deleting account; on confirm calls `DELETE /api/account` then redirects to `/auth/logout`
- `app/api/account/route.ts` — **new file**; DELETE handler removes all user data in a single Prisma transaction (cascade order: commentResponses → comments → postMetrics → postApproval → posts → socialAccounts → brandProfile → guardrails → onboardingTokens → workspaceAccess → workspaces → user)

**Billing client — design system tokens**
- `app/(dashboard)/account/billing/billing-client.tsx` — all hardcoded hex values (`#e2e2e2`, `#555`, `#888`, `#111`, `#141414`, `#0f0f0f`, `#080808`, `#333`) replaced with design tokens; `font-semibold` / `font-bold` replaced with `font-medium`; price moved to `font-mono`; checkmarks changed from `text-emerald-400` to `text-status-success`

**Build fix**
- `AlertDialogTrigger asChild` — this project uses `@base-ui/react` (not Radix). `asChild` does not exist in base-ui; `Trigger` already renders as a `<button>`. Fix: removed `asChild`, applied className directly to `AlertDialogTrigger`.

**Git incident — stale rebase-merge directory**
- The repo had a stale empty `.git/rebase-merge/` directory causing git to report "You are currently rebasing" even though no rebase was in progress. Fixed by removing the directory manually, then committing normally.

**Codebase size as of this session:** ~21,200 lines across 196 source files (192 TypeScript/TSX files).

---

### May 2026 — Session 18

**Facebook Page-picker flow + Meta/LinkedIn App Review preparation**

Full implementation to make LYRA's Facebook connection ready for Meta App Review, plus the submission guides Richard needs to complete the business-side steps.

**Code changes (commit `aa3dca3`)**

_Facebook callback — `app/api/social/callback/[platform]/route.ts`_
- Facebook case no longer writes directly to DB after OAuth
- Instead: stores pages in Redis key `fb_pending:{uuid}` (10-min TTL, JSON with encrypted Page tokens)
- Redirects to `/workspace/{id}/settings?fbpending={uuid}` — triggers the Page-picker modal

_New routes_
- `app/api/social/facebook/pending/route.ts` — `GET ?key={uuid}`: reads Redis, verifies workspace access, returns display data (no tokens) for the picker to show
- `app/api/social/facebook/complete/route.ts` — `POST { key, selectedPageIds }`: decrypts tokens from Redis, upserts selected Pages + linked Instagram accounts to DB, deletes Redis key

_New components_
- `components/lyra/settings/facebook-connect-button.tsx` — Client Component; shows a pre-connect warning modal before redirecting to Facebook. Modal copy: "Leave every permission and every Page checkbox turned on." The single most common cause of missing Pages (user unticks permissions) is addressed here.
- `components/lyra/settings/facebook-page-picker.tsx` — Client Component; shown after OAuth returns `?fbpending` param. Lists all managed Pages with avatars and checkboxes (all pre-selected). User chooses which Pages to connect; posts to /complete route; navigates to `?connected=facebook` on success.

_Settings page — `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`_
- Imports both new components
- Facebook platform row uses `FacebookConnectButton` instead of a generic Link
- `FacebookPagePicker` rendered at top of page when `fbpending` searchParam is present

_LinkedIn — `services/social/linkedin.ts`_
- `w_member_social` scope added (personal feed posting, available via "Share on LinkedIn" product — no App Review needed)
- `r_organization_social`, `w_organization_social`, `rw_organization_admin` scopes documented in comment — will be added once LinkedIn Community Management API is approved

_Redis — `lib/redis.ts`_
- Added `redisClient` (ioredis singleton) for direct get/set operations alongside the existing BullMQ `ConnectionOptions` export

**Docs (in `lyra/docs/platform-review/`)**
- `meta-app-review-guide.md` — Full step-by-step guide for Richard: Meta Business Verification, Facebook Login for Business, Login Configuration setup, per-permission justification text (all 11 scopes), screencast requirements, submission checklist
- `linkedin-community-api-guide.md` — Full step-by-step guide: LinkedIn developer app setup, Page verification, which products to request, ready-to-paste application use-case text, scope-add instructions for developer post-approval, checklist

**Commits shipped:**
- `aa3dca3` — feat: Facebook Page-picker flow + Meta/LinkedIn App Review preparation

**Outstanding actions (Richard — these are the blockers to real customer connections)**

Meta (do these in order, allow 4–8 weeks total):
1. Complete Meta Business Verification (Settings → Business Manager → Security Centre)
2. Confirm app type is "Business" in Meta App Dashboard
3. Add Facebook Login for Business product; create a Login Configuration with all 11 permissions + Page/Instagram asset types; share Configuration ID with developer
4. Create a test Facebook user + Page for screencasts
5. Record screencasts for each permission and submit App Review
6. Guide: `docs/platform-review/meta-app-review-guide.md`

LinkedIn (start immediately — 1–4 weeks for review):
1. Create/confirm LinkedIn developer app at linkedin.com/developers
2. Verify app with LYRA LinkedIn Page (Super Admin required)
3. Add Share on LinkedIn product (fast-approved)
4. Submit Community Management API application (use the ready-to-paste text in the guide)
5. Guide: `docs/platform-review/linkedin-community-api-guide.md`

---

### May 2026 — Session 17

**Website SEO — sitemap, robots.txt, OG tags, structured data, OG image**

Full technical SEO implementation for lyraonline.ai. Google Search Console property added, sitemap submitted and confirmed (2 pages discovered). All changes in commits `e45145b` and `d1987c3` (the security review commit which was also pushed this session after an OneDrive sync revert).

**Root layout metadata (`app/layout.tsx`)**
- Added `metadataBase: new URL('https://lyraonline.ai')` — required for relative OG image URLs to resolve correctly
- Full `openGraph` object: `type`, `locale`, `url`, `siteName`, `title`, `description`, `images` (1200×630)
- Full `twitter` card: `summary_large_image`, title, description, image
- `keywords` array: social media management, AI social media, social media automation, AI comment response, social media agency tool, AI caption generator, social media scheduling
- `authors`, `creator`, `applicationName` fields
- `alternates.canonical` set to `https://lyraonline.ai`
- JSON-LD structured data block (`<script type="application/ld+json">`) added to `<body>` with two schemas:
  - `Organization` — name, url, logo, sameAs (Facebook, Instagram, LinkedIn)
  - `SoftwareApplication` — applicationCategory BusinessApplication, three `Offer` nodes (Starter $49, Pro $149, Agency $399 USD/month)

**New files**
- `app/robots.ts` — generates `/robots.txt`; allows `/` and `/thank-you`; disallows `/dashboard`, `/agency`, `/account`, `/api/`, `/workspace/`; declares sitemap URL
- `app/sitemap.ts` — generates `/sitemap.xml`; two entries: `/` (priority 1, weekly) and `/thank-you` (priority 0.3, monthly)
- `app/opengraph-image.tsx` — Edge runtime dynamic OG image (1200×630); dark `#080808` background, ambient radial glow, framed L mark + YRA wordmark, tagline, domain watermark; served at `/opengraph-image`

**Page-level metadata**
- `app/page.tsx` — exports `metadata` with canonical `https://lyraonline.ai` and page-specific OG URL
- `app/thank-you/page.tsx` — exports `metadata` with `robots: { index: false, follow: false }` so the post-subscribe confirmation page is excluded from search results
- `app/(dashboard)/layout.tsx` — exports `metadata` with `robots: { index: false, follow: false }` so all authenticated app pages are excluded from Google index

**Google Search Console**
- Property added: URL prefix `https://lyraonline.ai`
- Verified via Google Analytics (GA4 `G-ZX3Y84SH8T` already active on site — instant verification, no code changes needed)
- Sitemap submitted: `/sitemap.xml` — Status: **Success**, 2 pages discovered ✅

**OneDrive sync revert (second incident)**
- Local `.git` folder was reverted by OneDrive, dropping the security review commit (`d1987c3`) from local git log while remote was also behind
- Recovery: staged all modified files → committed as security review → pushed both commits (`e45145b` SEO + `d1987c3` security) to `origin/main`
- Netlify deployed both in one build

**Commits shipped:**
- `e45145b` — feat: comprehensive website SEO — OG tags, sitemap, robots.txt, structured data, OG image
- `d1987c3` — fix: comprehensive security and quality review (Sessions 11-12)

**What to expect in GSC:**
- 24–48 hours: Coverage data (pages indexed vs errors)
- 3–7 days: First impressions and clicks in Performance tab
- 1–2 weeks: Full keyword position tracking

**Outstanding actions (user):**
- All previously outstanding actions from Session 16 remain (prisma migrate, Facebook App Review, Stripe env vars, Klaviyo flows)
- GSC: verify Owner permission is set for the GA4 account under Settings → Users and permissions

---

### May 2026 — Session 16

**Comprehensive security and quality audit — 25 fixes across all layers**

Full end-to-end code review of the LYRA codebase. Every API route, worker, service, and schema was audited. Three critical security vulnerabilities, eight reliability issues, and fourteen code-quality problems were identified and fixed in a single session. All changes committed as `968fe30`.

---

**Critical security fixes**

**1. Cross-tenant OAuth token injection (CRITICAL)**
- `app/api/social/callback/[platform]/route.ts` and `app/api/seo/callback/route.ts` were writing tokens to the DB without verifying the authenticated user had access to the target workspace ID from the OAuth `state` parameter.
- An attacker who could trigger an OAuth callback could inject their own access token into any workspace.
- Fix: Added `prisma.workspaceAccess.findFirst({ workspaceId, userId: user.id })` check before any DB write in both callback routes.

**2. Auth0 diagnostic logging (CRITICAL)**
- Debug block in the social callback route was logging raw cookie headers, `state` parameter, and the full request URL — all of which contain OAuth tokens and CSRF state.
- Fix: Removed the diagnostic `console.log` block entirely.

**3. SSRF in brand intelligence scraper (CRITICAL)**
- `services/brand-intelligence/scraper.ts` fetched arbitrary user-supplied URLs with no validation. An attacker could supply an internal URL (e.g. `http://169.254.169.254/latest/meta-data/`) to probe Railway or Netlify metadata services.
- Fix: DNS-resolves each URL before fetching; blocks RFC1918 (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1), link-local (169.254/16), and CGNAT (100.64/10) ranges. Also enforces https-only.

**4. Cron secret timing attack (HIGH)**
- Cron routes used `=== secret` string equality for auth. Timing-unsafe comparison leaks secret length and content via timing side-channel.
- Fix: All cron routes now use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.

**5. Media upload access check (HIGH)**
- `app/api/brand-intelligence/guidelines/presigned/route.ts` generated S3 presigned upload URLs without verifying workspace membership.
- Fix: Added workspace access check before issuing the presigned URL.

**6. aiResponseMode plan clamp (HIGH)**
- `PATCH /api/workspaces/[id]` accepted any `aiResponseMode` string from the client, including `FULL`, regardless of the workspace's plan. A STARTER plan user could upgrade themselves to full autonomous AI responses.
- Fix: `clampAutonomy(requested, maxForPlan)` added to the PATCH handler; PLANS config from `lib/stripe.ts` gates the maximum autonomy level by plan.

**7. SEO callback error reflection (MEDIUM)**
- The SEO OAuth callback included the raw `error` query parameter in a `console.error` log that would also be reflected in error responses.
- Fix: Sanitised error logging; only the error code (not raw value) is reflected in the response.

**8. POST /api/posts status injection (MEDIUM)**
- The POST body `status` field was passed directly to `prisma.post.create`. A client could create posts with status `PUBLISHED`, `FAILED`, or any other privileged status.
- Fix: Allowlist enforced — only `DRAFT` and `SCHEDULED` are accepted on creation; anything else defaults to `DRAFT`.

---

**Reliability fixes**

**9. Prisma singleton not retained in production**
- `lib/prisma.ts` had `if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma`. In production, `globalThis.prisma` was never set, so a new `PrismaClient` was created on every warm Netlify Function invocation — silent connection pool exhaustion under load.
- Fix: Removed the condition; singleton is always retained.

**10. Post publisher falsely marks posts PUBLISHED on unimplemented platform**
- `workers/post-publisher.worker.ts` had `default: console.warn(...)` in the platform switch — execution fell through to the success update, marking posts PUBLISHED even though nothing was posted.
- Fix: `default: throw new Error(...)` so the catch block marks the post FAILED.

**11. BullMQ jobId scheme mismatch**
- `services/scheduler/post-queue.ts` used bare `postId` as the BullMQ job ID; `app/api/cron/sync-comments/route.ts` used `post-${p.id}` to deduplicate. Mismatched keys meant the deduplication never worked.
- Fix: Standardised to `post-${postId}` in `post-queue.ts`.

**12. BullMQ retry count too low**
- `attempts: 3` with exponential backoff. Transient platform API outages (Instagram, Facebook) routinely last longer than three attempts.
- Fix: `attempts: 5`.

**13. Comment monitor N+1 queries**
- `workers/comment-monitor.worker.ts` called `prisma.comment.findFirst` + `prisma.comment.create` in a per-comment loop — O(n) DB round trips for each monitored post.
- Fix: Single `prisma.comment.findMany({ where: { platformCommentId: { in: allIds } } })` to build an existence set, then `prisma.comment.createMany({ data: toInsert, skipDuplicates: true })`.

**14. schedule-generator max_tokens too low**
- `services/ai/schedule-generator.ts` had `max_tokens: 2000`. A 49-post monthly schedule easily exceeds 2000 tokens; Claude was silently truncating the JSON output, causing parse errors downstream.
- Fix: `max_tokens: 8000`.

**15. analyzeEngagement inline in Netlify Function timeout risk**
- `app/api/cron/brand-refresh/route.ts` was calling `analyzeEngagement()` inline for every workspace with a brand profile. With 50+ workspaces, this would breach Netlify's 26-second function timeout.
- Fix: Removed inline calls; each workspace is now queued as a `analyze-engagement` BullMQ job handled by the Railway `brand-sync` worker. The cron route returns immediately with `{ queued: N, engagementQueued: M }`.

**16. cancelBoost used DELETED instead of PAUSED**
- `services/social/meta-ads.ts` `cancelBoost` was calling the Meta Ads API with `status: 'DELETED'`. Deleting a campaign destroys all spend history and performance data permanently and is irreversible.
- Fix: Changed to `status: 'PAUSED'`. The rollback path inside `createBoost`'s catch block intentionally still uses DELETED (for genuinely orphaned incomplete campaigns).

**17. Guidelines DELETE race condition**
- `app/api/brand-intelligence/guidelines/route.ts` DELETE handler was doing a read-then-write (`findUnique` → `update({ guidelineUrls: existing.filter(...) })`). Concurrent uploads between the read and write would lose entries.
- Fix: Replaced with atomic `prisma.$executeRaw` `array_remove("guidelineUrls", ${key})`.

---

**Code quality fixes**

**18. Stale AI model string in caption-generator**
- `services/ai/caption-generator.ts` had `model: 'claude-sonnet-4-20250514'` — a stale ID that no longer resolves.
- Fix: Extracted `CLAUDE_MODEL = 'claude-sonnet-4-6' as const` in `lib/anthropic.ts`; all five AI service files now import and use it. `CLAUDE.md` tech stack table updated to match.

**19. `force-dynamic` missing on 27 API routes**
- Next.js 15 Turbopack attempts to statically prerender routes at build time. Any route calling `requireAuth()` (which reads request cookies) must export `export const dynamic = 'force-dynamic'` or the build crashes with `DYNAMIC_SERVER_USAGE`.
- Fix: Added to all 27 affected routes.

**20. Facebook service had no fetch timeouts**
- `services/social/facebook.ts` made 5 `fetch` calls with no timeout. A hung connection would block a Netlify Function until the platform's 26s limit.
- Fix: `AbortSignal.timeout(10_000)` added to all five calls.

**21. Missing Prisma indexes and unique constraint**
- Schema was missing indexes on the most-queried columns, causing full-table scans on `WorkspaceAccess`, `Post`, and `Comment`.
- Fix: Added `@@index([userId])` on `WorkspaceAccess`; `@@index([workspaceId, scheduledAt])` and `@@index([workspaceId, status])` on `Post`; `@@unique([socialAccountId, platformCommentId])` (also prevents duplicates), `@@index([workspaceId, createdAt])`, and `@@index([workspaceId, status])` on `Comment`.

**22. Stale backup files deleted**
- Three OneDrive merge-conflict backup files were present in the repo: `lib/stripe-DESKTOP-HP80LH8.ts`, `app/layout-DESKTOP-HP80LH8.tsx`, `app/api/stripe/webhook/route-DESKTOP-HP80LH8.ts`. These were committed as dead code and would cause confusing duplicate exports.
- Fix: Deleted all three.

**23–25. Minor quality fixes**
- `workers/post-publisher.worker.ts`: removed dead `postPublishingQueue` Queue declaration (conflicting options with `post-queue.ts`)
- `workers/ai-responder.worker.ts`: import cleaned up to only import `Worker`, not `Queue`
- `brand-sync.worker.ts`: added handler for `analyze-engagement` job type (required for fix #15)

---

**Files modified this session (selected key files):**
- `lib/anthropic.ts` — added `CLAUDE_MODEL` export
- `lib/prisma.ts` — singleton retained unconditionally in production
- `prisma/schema.prisma` — 6 indexes + 1 unique constraint added
- `services/ai/caption-generator.ts`, `response-generator.ts`, `schedule-generator.ts` — model constant, max_tokens fix
- `services/brand-intelligence/scraper.ts` — SSRF protection
- `services/social/facebook.ts` — fetch timeouts
- `services/social/meta-ads.ts` — cancelBoost PAUSED
- `services/scheduler/post-queue.ts` — attempts + jobId fix
- `workers/post-publisher.worker.ts` — throw on unimplemented platform, remove dead Queue
- `workers/comment-monitor.worker.ts` — batched upsert
- `workers/brand-sync.worker.ts` — analyze-engagement handler
- `workers/ai-responder.worker.ts` — import cleanup
- `app/api/posts/route.ts` — status allowlist, force-dynamic
- `app/api/workspaces/[id]/route.ts` — autonomy clamp, force-dynamic
- `app/api/social/callback/[platform]/route.ts` — workspace access check, remove diagnostic logging
- `app/api/cron/brand-refresh/route.ts` — analyzeEngagement offloaded to queue
- `app/api/brand-intelligence/guidelines/route.ts` — atomic array_remove
- 27 API routes — `export const dynamic = 'force-dynamic'` added
- `CLAUDE.md` — model ID corrected in tech stack table
- Deleted: `lib/stripe-DESKTOP-HP80LH8.ts`, `app/layout-DESKTOP-HP80LH8.tsx`, `app/api/stripe/webhook/route-DESKTOP-HP80LH8.ts`

**Commits shipped:**
- `968fe30` — security, reliability and code quality review: 25 fixes across API routes, workers, services and schema

**Outstanding actions (user):**
- Run `npx prisma migrate dev` (or `prisma db push` in staging) to apply the 6 new schema indexes and unique constraint to the database
- All previously outstanding actions from Session 15 remain (Facebook App Review, Stripe env vars, Klaviyo flows)

---

### May 2026 — Session 15

**Meta domain verification, build fix, Klaviyo welcome flow copy, Facebook App status**

**Build fix — TypeScript error in email-subscribe**
- Removed stale `|| status === 'success'` guard from `handleSubmit` in `components/lyra/marketing/email-subscribe.tsx`
- `'success'` was removed from the status union type when the redirect to `/thank-you` was added, but the guard wasn't cleaned up — TypeScript caught it at build time on Netlify
- Commit: `167a281`

**Meta domain verification**
- DNS TXT record verification failed (DNS propagation/cPanel routing issue)
- Switched to meta tag verification method instead — added `facebook-domain-verification: '1zdz2p7z9vsq0qh3nzc2qwm36gojlu'` to the `metadata.other` field in `app/layout.tsx`
- Next.js renders this as `<meta name="facebook-domain-verification" content="...">` in the `<head>` of every page
- `lyraonline.ai` domain is now **verified** in Meta Business Manager ✅
- Commit: `81e9128`

**Tracking stack — fully confirmed live**
- GA4 (`G-ZX3Y84SH8T`) firing ✅
- GTM (`GTM-KH28ZQGJ`) firing ✅
- Meta Pixel (`1016046914329329`) firing — 8 events recorded ✅
- Meta domain verified ✅
- Klaviyo capturing pre-launch subscribers ✅

**Klaviyo welcome flow — copy written**

The welcome email to send immediately when someone subscribes via the coming soon page:

- **Trigger:** Added to pre-launch list
- **Send:** Immediately
- **Subject:** `You're in. Here's what comes next.`
- **Preview text:** `Founding member spots are going fast — here's what that means for you.`
- **Content:** Confirms list membership, explains what LYRA does, explains founding member pricing lock-in, sets expectation for launch announcement, social follow links
- **Klaviyo config:** 600px width, dark background `#080808`, text `#e2e2e2` to match site brand

Flows still to build before launch:
1. New customer welcome series (days 1, 3, 7, 14 post-checkout)
2. Trial expiring — 3 days before 30-day trial ends
3. Trial expired / didn't convert — win-back 1–2 days after lapse
4. Launch announcement — one-time broadcast campaign on launch day

**Facebook App — Development Mode (action required before launch)**

During testing of the Facebook social connection flow with a test workspace (Solar Clean Meters), the OAuth flow returned: *"Facebook Login is currently unavailable for this app, since we are updating additional details."*

- **Root cause:** The LYRA Facebook App is in Development Mode. Only users with an explicit role on the app (Admin, Developer, Tester) can use OAuth in this mode.
- **For testing now:** Add test users via developers.facebook.com → LYRA app → App Roles → Roles → Add Testers. Friend must accept the invite before connecting.
- **Before public launch (critical):** The app must be switched to Live Mode. This requires:
  1. Complete app details in Facebook for Developers → App Settings → Basic: Privacy Policy URL (`lyraonline.ai/docs/legal/LYRA-Privacy-Policy.pdf`), Terms of Service URL, app icon, category
  2. Submit permissions for App Review: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_comments`, `ads_management`
  3. App Review can take days to weeks — **start this well before launch date**
  4. Once approved, switch app status to Live

**Files modified this session:**
- `lyra/components/lyra/marketing/email-subscribe.tsx` — removed stale `success` status guard
- `lyra/app/layout.tsx` — added `metadata.other` with `facebook-domain-verification` meta tag

**Commits shipped:**
- `167a281` — fix: remove stale success status check from email-subscribe
- `81e9128` — fix: add Meta facebook-domain-verification meta tag to head

**Outstanding actions (user):**
- Add friend as Facebook App Tester to unblock Social Clean Meters workspace testing
- Begin Facebook App Review process — longest lead time item before launch
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Netlify env vars (outstanding from Session 13)
- Build remaining Klaviyo flows (new customer welcome series, trial expiring, trial expired, launch announcement)
- Run Supabase SQL for `foundingMember` column — **done ✅**

---

### May 2026 — Session 14

**Pre-launch campaign infrastructure — coming soon page, analytics, founding member tier, thank you page**

Marketing page replaced with a branded coming soon page while the product is prepared for public launch. Full pre-launch tracking and email capture stack built and deployed.

**Coming soon page (`app/page.tsx`)**
- Replaces the full marketing page temporarily; all marketing components remain untouched in `components/lyra/marketing/` — restoring the full page is a single file swap
- Authenticated users still redirected to `/dashboard`
- Design: LYRA logo, ambient radial glow, Instrument Serif headline ("The AI that runs your social media."), founding member offer card with live slot counter, email subscribe form, social icons, contact email
- To restore the full marketing page: replace `app/page.tsx` contents with the full marketing page component (all imports and sections)

**Analytics stack (all fire on every page)**
- **Google Tag Manager** — already installed (Session 12), `GTM-KH28ZQGJ`
- **Google Analytics 4** — added `G-ZX3Y84SH8T` via `next/script` `afterInteractive` in `app/layout.tsx`
- **Meta Pixel** — added `1016046914329329` via `next/script` `afterInteractive` in `app/layout.tsx`; noscript `<img>` fallback inside `<body>`
- All three IDs are hardcoded constants at the top of `app/layout.tsx` (`GTM_ID`, `GA_ID`, `META_ID`)

**Founding member tier**
- First 100 sign-ups lock in current pricing forever; status never changes even if prices rise
- `foundingMember Boolean @default(false)` added to `Agency` model in `prisma/schema.prisma`
- Column applied to production DB via Supabase SQL Editor: `ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "foundingMember" BOOLEAN NOT NULL DEFAULT false;`
- Stripe webhook (`app/api/stripe/webhook/route.ts`) assigns founding member status atomically on `checkout.session.completed` — uses a Prisma transaction to count + update, preventing race conditions at slot 100
- Trial extended from 14 → 30 days in `app/onboard/page.tsx` (founding member offer requires time to experience value)
- Dashboard header (`components/lyra/app-shell/header.tsx`) shows a "Founding Member" badge chip in the user dropdown for qualifying accounts
- Coming soon page queries `Agency.count({ foundingMember: true })` server-side and displays live remaining slot count

**Thank you page (`app/thank-you/page.tsx`)**
- New page at `/thank-you` — shown after successful email subscribe
- Design matches coming soon page: logo, glow, "You're on the list." headline, message, social follow card, back link
- `EmailSubscribe` component now redirects to `/thank-you` via `router.push()` on success instead of showing inline text; success state removed from component

**Klaviyo — full coverage**
- Extracted shared helper: `lib/klaviyo.ts` exports `subscribeEmail(email: string): Promise<void>`
- `app/api/klaviyo/subscribe/route.ts` refactored to use the shared helper (no behaviour change)
- `app/api/stripe/webhook/route.ts` now calls `subscribeEmail()` after `checkout.session.completed` — product sign-ups automatically enter the Klaviyo list alongside pre-launch subscribers. Klaviyo failure is caught and logged without breaking the checkout flow.
- Both the pre-launch mailing list and paying customers write to the same Klaviyo list; segment in Klaviyo by sign-up date or custom properties as needed

**Files modified this session:**
- `lyra/app/layout.tsx` — added GA4 and Meta Pixel `<Script>` blocks
- `lyra/app/page.tsx` — replaced with coming soon page (founding member offer, slot count, social icons)
- `lyra/app/thank-you/page.tsx` — new thank you page
- `lyra/app/onboard/page.tsx` — trial extended to 30 days
- `lyra/app/api/klaviyo/subscribe/route.ts` — refactored to use `lib/klaviyo.ts`
- `lyra/app/api/stripe/webhook/route.ts` — added Klaviyo subscribe + founding member assignment
- `lyra/components/lyra/marketing/email-subscribe.tsx` — redirects to `/thank-you` on success
- `lyra/components/lyra/app-shell/header.tsx` — added `foundingMember` prop + badge chip
- `lyra/app/(dashboard)/layout.tsx` — passes `foundingMember` from `user.agency` to Header
- `lyra/prisma/schema.prisma` — added `foundingMember Boolean @default(false)` to Agency
- `lyra/lib/klaviyo.ts` — new shared Klaviyo helper

**Commits shipped (in order):**
- `abd2ede` — chore: replace marketing page with coming soon placeholder
- `dca17fb` — chore: on-brand coming soon page with glow, headline, and email capture
- `f64d561` — chore: add social media icons to coming soon page
- `c64798f` — feat: add Google Analytics GA4 (G-ZX3Y84SH8T) to root layout
- `a1bf530` — feat: add Meta Pixel (1016046914329329) to root layout
- `dcd0035` — feat: founding member tier — first 100 sign-ups lock in pricing forever
- `eee31b7` — feat: thank you page, Klaviyo on Stripe checkout, shared klaviyo helper

**Pending (user action required):**
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Netlify env vars (still outstanding from Session 13)
- Add Meta Pixel ID to Meta Business Manager → Events Manager → Test Events to verify pixel is firing
- When ready to launch: restore full marketing page by swapping `app/page.tsx` back to the full marketing page content

**Architecture notes:**
- The `foundingMember` flag lives on the `Agency` model, not the `User` model — agencies are the billing entity in LYRA, so price lock belongs there
- The Klaviyo helper (`lib/klaviyo.ts`) silently skips (logs only) if env vars are missing — safe for local dev without Klaviyo keys set
- The founding member transaction is safe for the expected scale (100 slots) but not hardened for thousands of concurrent checkouts — if LYRA ever runs a flash sale at scale, use a PostgreSQL advisory lock or a Redis counter instead

---

### May 2026 — Session 13

**Marketing page deployment fixes + social media links added to footer**

Three build/runtime failures diagnosed and fixed after the Session 12 push landed on Netlify. Social media profile links also added to the marketing footer.

**Deployment failure #1 — Dynamic server usage (build crash)**

- **Root cause:** Next.js 16 Turbopack statically prerenders all pages at build time. `app/page.tsx` calls `getCurrentUser()` and `app/onboard/page.tsx` calls `requireAuth()` — both call `auth0.getSession()` which reads request cookies. This throws `DYNAMIC_SERVER_USAGE` during static generation and crashes the build.
- **Fix:** Added `export const dynamic = 'force-dynamic'` as the first line of both files. This opts each page out of static prerendering and forces server-side rendering on every request.
- **Files changed:** `lyra/app/page.tsx`, `lyra/app/onboard/page.tsx`

**Deployment failure #2 — `STRIPE_SECRET_KEY` missing at runtime (500 on `/onboard`)**

- **Root cause:** `lib/stripe.ts` line 6 explicitly throws `Error: STRIPE_SECRET_KEY is not set` if the env var is absent. The key was missing from Netlify's environment variable configuration.
- **Fix (user action required):** Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Netlify → Site configuration → Environment variables.
  - `STRIPE_SECRET_KEY` — Stripe Dashboard → Developers → API keys → Secret key (`sk_live_...` or `sk_test_...`)
  - `STRIPE_WEBHOOK_SECRET` — Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret (`whsec_...`)
- **Also confirm these annual price ID vars are set:** `STRIPE_STARTER_ANNUAL_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_AGENCY_ANNUAL_PRICE_ID`

**Deployment failure #3 — lucide-react brand icons removed (build crash)**

- **Root cause:** `lucide-react` v1.14.0 (installed) does not export `Facebook`, `Instagram`, or `Linkedin`. Brand/social icons were removed from the library at v0.429.0. The first version of `marketing-footer.tsx` imported them as Lucide components, causing a module export error at build time.
- **Fix:** Replaced all three with inline SVG function components (`FacebookIcon`, `InstagramIcon`, `LinkedInIcon`) using `stroke="currentColor"`, `strokeWidth="1.5"`, 16×16px — visually identical to what Lucide would have rendered.
- **Rule going forward:** Never import social/brand icons from `lucide-react`. Always use inline SVG for brand icons (Facebook, Instagram, LinkedIn, TikTok, X, etc.).

**Social media links added to marketing footer**

- Added Facebook, Instagram, and LinkedIn profile links between the nav links and copyright in `marketing-footer.tsx`
- URLs: `https://www.facebook.com/profile.php?id=61590029438901`, `https://www.instagram.com/lyra.online.social/`, `https://www.linkedin.com/company/lyra-online-social`
- Each link has `target="_blank" rel="noopener noreferrer"` and an `aria-label` for accessibility

**OneDrive sync incident**

OneDrive synced a stale version of the `.git` folder, reverting the local repo to Session 11 (commit `af50f27`) while GitHub origin was at Session 13 (`c76bddd` — 26 commits ahead). Recovery: `git stash` → remove untracked files that would be overwritten → `git pull origin main --ff-only` (fast-forward 26 commits) → `git stash pop`. No work was lost.

**Files modified this session:**
- `lyra/app/page.tsx` — added `export const dynamic = 'force-dynamic'`
- `lyra/app/onboard/page.tsx` — added `export const dynamic = 'force-dynamic'`
- `lyra/components/lyra/marketing/marketing-footer.tsx` — replaced lucide brand icon imports with inline SVGs; added `SOCIAL_LINKS` array and social icon row

**Commits shipped (in order):**
- `134ddc8` — fix: add force-dynamic to marketing and onboard pages to prevent build-time prerender crash
- `5fe80e9` — (intermediate fix commit)
- `c76bddd` — feat: add social media links to marketing footer with inline SVG icons

**Env vars status (Netlify):**

| Var | Status |
|---|---|
| `KLAVIYO_PRIVATE_API_KEY` | Set ✅ |
| `KLAVIYO_LIST_ID` | Set ✅ |
| `NEXT_PUBLIC_APP_URL` | Set ✅ |
| `STRIPE_SECRET_KEY` | **Missing — must add** |
| `STRIPE_WEBHOOK_SECRET` | **Missing — must add** |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Confirm set |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Confirm set |
| `STRIPE_AGENCY_ANNUAL_PRICE_ID` | Confirm set |

**Smoke test checklist (once Stripe keys are added):**
- [ ] Incognito → `lyraonline.ai` → marketing page loads (all sections visible)
- [ ] Click "Start free trial" on Pro → Auth0 signup → Stripe test card `4242 4242 4242 4242` → `/onboard/success` → `/dashboard` with workspace visible and plan = PRO
- [ ] Visit `lyraonline.ai` while logged in → redirects to `/dashboard`
- [ ] Footer social links open correct profiles in new tabs

**Architecture rules established this session:**
1. **`export const dynamic = 'force-dynamic'`** is required on any Next.js App Router page outside `(dashboard)/` layout that calls `requireAuth()` or `getCurrentUser()`. These functions read request cookies via `auth0.getSession()`, which is incompatible with static prerendering.
2. **Never import social/brand icons from `lucide-react`**. Brand icons were removed from lucide-react at v0.429.0. Use inline SVG with `stroke="currentColor"`, `strokeWidth="1.5"`, 16×16px.

---

### May 2026 — Session 12

**Public Marketing Landing Page — built and fully deployed**

All 15 implementation tasks completed. The public marketing page now lives at `/` (`lyraonline.ai`) with a complete signup flow: visitor → pricing → Auth0 → Stripe Checkout (14-day trial) → first workspace created → dashboard. Google Tag Manager and Klaviyo email capture are also live.

**Routing change:**
- `app/(dashboard)/page.tsx` deleted — dashboard home moved to `app/(dashboard)/dashboard/page.tsx` (serves `/dashboard`)
- `app/page.tsx` created — public marketing page at `/`; authenticated users are redirected to `/dashboard` server-side

**New files:**
- `lyra/app/page.tsx` — root public marketing page; uses `getCurrentUser()`, redirects logged-in users to `/dashboard`, assembles all marketing sections
- `lyra/app/(dashboard)/dashboard/page.tsx` — dashboard home (moved from `app/(dashboard)/page.tsx`)
- `lyra/app/onboard/page.tsx` — server component: reads `?plan`/`?billing` from query params, finds/creates `Agency` for the user, creates Stripe Checkout session (14-day trial, card required), redirects to Stripe. Does **not** conflict with existing `app/onboard/[token]/page.tsx` (Next.js resolves static routes before dynamic ones).
- `lyra/app/onboard/success/page.tsx` — post-Stripe confirmation page with CheckCircle icon and "Enter LYRA →" button → `/dashboard`
- `lyra/app/api/klaviyo/subscribe/route.ts` — POST: validates email, calls Klaviyo `profile-subscriptions-bulk-create-jobs` API (revision 2024-10-15), reads `KLAVIYO_PRIVATE_API_KEY` and `KLAVIYO_LIST_ID` from env
- `lyra/components/lyra/marketing/marketing-nav.tsx` — sticky nav; LYRA logo, Features/Pricing anchor links (hidden on mobile), Log in → `/auth/login`, Start free trial → `#pricing`
- `lyra/components/lyra/marketing/hero-section.tsx` — radial gradient glow, eyebrow chip, H1 (Instrument Serif 52px), subheadline, two CTA buttons, trial note, renders `<HeroCarousel />`
- `lyra/components/lyra/marketing/hero-carousel.tsx` — `'use client'`; 4-slide browser chrome carousel (Content Calendar, AI Inbox, Brand Intelligence, AI Scheduling); auto-advances every 4s; respects `prefers-reduced-motion`; ARIA tablist/tabpanel roles; Lucide `Sparkles` for AI accent; dot indicators (active elongates to pill)
- `lyra/components/lyra/marketing/features-section.tsx` — 3 feature cards (Brand Intelligence / Autonomous AI Responses / Intelligent Scheduling) with Zap, MessageSquare, Calendar icons
- `lyra/components/lyra/marketing/pricing-section.tsx` — `'use client'`; monthly/annual billing toggle; 4 pricing cards (Starter $49, Pro $149 highlighted, Agency $399, Enterprise custom); CTA detects auth state via `useUser()` and redirects accordingly; `returnTo` param is `encodeURIComponent`-encoded; spinner + disabled during redirect
- `lyra/components/lyra/marketing/video-placeholder.tsx` — placeholder panel with Play icon; swap for iframe when demo video is ready
- `lyra/components/lyra/marketing/cta-banner.tsx` — "Ready to get your time back?" section with primary CTA and `<VideoPlaceholder />` below
- `lyra/components/lyra/marketing/marketing-footer.tsx` — logo, Privacy Policy / Terms of Service / Contact links, copyright; `<EmailSubscribe />` form above the footer links
- `lyra/components/lyra/marketing/email-subscribe.tsx` — `'use client'`; email input + Submit button; idle/loading/success/error states; posts to `/api/klaviyo/subscribe`

**Modified files:**
- `lyra/lib/stripe.ts` — added `annualPriceId` and `annualPrice` (display price per month) to STARTER, PRO, AGENCY plans
- `lyra/app/api/stripe/webhook/route.ts` — extended `checkout.session.completed` case: updates `Agency.stripeCustomerId`, creates first `Workspace` + `WorkspaceAccess` when `agency.workspaces.length === 0`. Fixed `toPlan()` to uppercase the input (metadata arrives as lowercase `'pro'`/`'agency'` but the enum is uppercase)
- `lyra/app/layout.tsx` — injected GTM (`GTM-KH28ZQGJ`): `<Script strategy="afterInteractive">` with the GTM snippet + `<noscript>` iframe fallback as first child of `<body>`

**Critical bugs caught and fixed before launch:**
1. `toPlan()` in the webhook was case-sensitive — `'pro'` from session metadata would silently create a STARTER workspace. Fixed: `value?.toUpperCase()` before the includes check.
2. Stripe session `metadata` is not propagated to the created Subscription — `customer.subscription.created` would read `sub.metadata.plan` as empty and also downgrade to STARTER. Fixed: added `subscription_data.metadata` in `app/onboard/page.tsx` so both the session and the subscription carry the plan.
3. `returnTo` in the pricing CTA redirect was unencoded — `&billing=monthly` would be parsed as a separate query param by the login route. Fixed: `encodeURIComponent(...)`.

**Commits shipped (in order):**
- `b068472` — feat: add annual pricing to PLANS in lib/stripe.ts
- `928cef3` — feat: move dashboard home to /dashboard, free / for marketing page
- `30d9c8c` — feat: extend stripe webhook — create first workspace on checkout.session.completed
- `12d829e` — feat: add MarketingNav component
- `8c43879` — feat: add HeroCarousel client component
- `7ae5d07` — fix: add approve button to negative card, add X chip to calendar slide
- `c15564a` — fix: replace emoji icons with Sparkles, add ARIA carousel roles, expand touch targets
- `6e222e0` — feat: add HeroSection marketing component
- `727c837` — feat: add FeaturesSection marketing component
- `972a5b6` — feat: add PricingSection marketing component with billing toggle
- `54ed3a9` — fix: encode returnTo param in pricing CTA redirect
- `2a3cbcb` — feat: add VideoPlaceholder and CTABanner marketing components
- `83a6bb0` — feat: add MarketingFooter component
- `85127c4` — feat: add root marketing page at / with auth redirect to /dashboard
- `94f001d` — feat: add onboard page — Stripe checkout redirect with 14-day trial
- `8571882` — feat: add onboard success page post Stripe checkout
- `4446416` — feat: inject Google Tag Manager via NEXT_PUBLIC_GTM_ID env var
- `a40d3a6` — fix: hardcode GTM container ID GTM-KH28ZQGJ
- `4338a4b` — feat: add Klaviyo email subscribe form to marketing footer
- `dd4f3ac` — fix: toPlan case-insensitive + propagate plan to subscription metadata

**New env vars required in Netlify (not yet set):**
- `KLAVIYO_PRIVATE_API_KEY` — Klaviyo private API key (from Klaviyo → Settings → API Keys)
- `KLAVIYO_LIST_ID` — the Klaviyo list ID to subscribe marketing sign-ups to
- `NEXT_PUBLIC_APP_URL` — set to `https://lyraonline.ai` (used for Stripe success/cancel redirect URLs)

**Smoke test checklist (do before calling it live):**
- [ ] Visit `/` incognito → marketing page loads with all 6 sections
- [ ] Click "Start free trial" on Pro → Auth0 signup → Stripe test card → `/onboard/success` → `/dashboard` with workspace visible and plan = PRO
- [ ] Visit `/` while logged in → redirects to `/dashboard`
- [ ] Enterprise "Contact us" → opens mail client to `hello@lyraonline.ai`
- [ ] Email subscribe form in footer → success message appears; email visible in Klaviyo list
- [ ] GTM firing — check Tag Assistant or GTM preview mode on `lyraonline.ai`

**Known follow-up items (non-blocking):**
- Demo video: `VideoPlaceholder` is ready — when a real video URL exists, swap the placeholder for an `<iframe>` embed in `video-placeholder.tsx` with no other code changes
- `Agency.plan` defaults to `AGENCY` in the schema (line 41 of `schema.prisma`) — newly created agencies are briefly AGENCY-tier until the subscription webhook corrects it. Consider defaulting to `STARTER` to be more conservative.

---

### May 2026 — Session 11

**Comment Inbox UI — built and fully deployed**

All 7 implementation tasks completed and deployed to production. The Comment Inbox now supports live platform replies (Facebook and Instagram), mode-aware UI gating per plan and AI response mode, platform filter chips, and fully autonomous auto-posting via the BullMQ worker.

**Modified files:**
- `lyra/services/ai/response-generator.ts` — fixed model ID from `claude-sonnet-4-20250514` → `claude-sonnet-4-6`
- `lyra/services/social/facebook.ts` — added `replyToComment(platformCommentId, message, accessToken)`: calls `POST https://graph.facebook.com/v19.0/{platformCommentId}/comments`. Checks both `!res.ok` and `data.error` for robust error detection. Works for both Facebook and Instagram (same Graph API endpoint).
- `lyra/app/(dashboard)/workspace/[workspaceId]/inbox/page.tsx` — workspace select now includes `aiResponseMode` and `plan`; passes both to `<ResponseInbox>`. Uses `getCurrentUser()` + redirect (correct for page components — `requireAuth()` throws which would show an error page instead of redirecting)
- `lyra/components/lyra/inbox/response-inbox.tsx` — added `aiResponseMode` and `plan` props; added platform filter chips (only shown when >1 platform has comments, client-side filtering across all tabs); added fetch error state; skeleton loaders on all three tabs; `handleUpdate` correctly forwards the actual new status string
- `lyra/components/lyra/inbox/comment-card.tsx` — mode-aware UI: `showAi = plan !== 'STARTER' && aiResponseMode !== 'OFF'`; "Send reply" / "Approve & send" button calls `POST /api/comments/[id]/reply` then calls `onUpdate('RESPONDED')` and shows a toast; "Escalate" and "Ignore" have try/catch + `res.ok` guards + `toast.error`; RESPONDED comments in FULL mode show `finalResponse` text with "Auto-sent" label (Sparkles icon); `SENTIMENT_LABELS` map for sentence-case sentiment display
- `lyra/workers/ai-responder.worker.ts` — replaced `// TODO: publish to platform via social API` with full autoPost implementation: fetches `socialAccount`, decrypts token, calls `replyToComment()`, updates comment to `RESPONDED`; on unsupported platform or thrown error, falls back to `AI_DRAFTED` so the comment surfaces for manual review

**New files:**
- `lyra/app/api/comments/[id]/reply/route.ts` — POST handler: auth → workspace access verify → platform guard (FB/IG only) → `decrypt()` token → `replyToComment()` → update comment to `RESPONDED`. Error responses: 400 (empty body, already responded, unsupported platform), 403 (no workspace access), 404 (comment not found), 502 (platform API failure). Platform API call happens BEFORE DB update — if the API call throws, the comment is left in its current status.

**Commits shipped (in order):**
- `1703a45` — fix: use correct claude-sonnet-4-6 model ID in response-generator
- `64572e3` — feat: add replyToComment to facebook service
- `f202fbe` — fix: check res.ok in replyToComment for robust error handling
- `bb4b6ce` — feat: add POST /api/comments/[id]/reply — publish response to platform
- `03cff10` — feat: inbox mode-aware UI, platform filter, and live reply endpoint
- `dfd8adf` — fix: inbox UI quality — error handling, skeletons, status transitions, a11y
- `a5c02f4` — feat: wire up autoPost platform publishing in ai-responder worker
- `81d18db` — fix: include AWAITING_APPROVAL in pending tab filter

**Known follow-up items (non-blocking):**
- Non-atomic reply/DB: if `replyToComment()` succeeds but the subsequent DB update fails, the comment remains in `PENDING` even though the reply was sent — re-sending will publish a duplicate reply. Fix: add a `platformReplyId` column to the `Comment` model and use it as a dedup guard in the reply route.
- `PATCH /api/comments/[id]` status transitions have no allowlist guard — any status can be patched to any other status. Add a transition map to prevent invalid transitions (pre-existing gap, not introduced this session).
- `handleUpdate` in `response-inbox.tsx` only forwards `newStatus` — if a comment has a draft that was just generated, navigating away via the platform filter then back will show the original empty draft. Fix: extend `handleUpdate` to also carry `aiDraftResponse` through the state update.
- `CommentData` interface and `PLATFORM_LABELS` are duplicated between `response-inbox.tsx` and `comment-card.tsx` — extract to `types/index.ts`.

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
- **Build command:** `npx prisma generate && npm run build`
- **Publish directory:** `.next`
- **Node version:** 20
- **Plugin:** `@netlify/plugin-nextjs`

The Netlify build does NOT run `prisma db push` — schema changes must be applied separately (see Section 8).

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

- **Sidebar** (`components/lyra/app-shell/sidebar.tsx`) — collapsible with Framer Motion animation, shows LYRA logo (full wordmark expanded, icon mark collapsed), workspace navigation, workspace switcher. Active item has platinum left border accent. Full row is clickable via invisible hit-area padding. Hidden on mobile (`hidden md:flex`).
- **Mobile Nav** (`components/lyra/app-shell/mobile-nav.tsx`) — fixed bottom navigation bar for mobile viewports (`md:hidden`); 5 items: Dashboard, Calendar, Compose, Inbox, Brand. Main content area has `pb-20 md:pb-6` to clear it.
- **Header** (`components/lyra/app-shell/header.tsx`) — user avatar, name display. User dropdown links to `/account` (working).
- **Workspace Switcher** (`components/lyra/app-shell/workspace-switcher.tsx`) — dropdown to switch between workspaces

The sidebar receives a `brandReady` prop from the layout, which locks the Brand AI nav item behind a padlock icon if the workspace hasn't connected a website URL and at least one social account.

### 6.3 Dashboard Home (`app/(dashboard)/dashboard/page.tsx`)

- Personalised greeting using the user's first name
- **KPI status strip** — 3 tiles at the top: Pending comments (links to inbox), Scheduled today (links to calendar), Posts this week (links to analytics). Counts in `font-mono`, fetched in parallel via Prisma.
- **Brand AI unlock banner** — appears when brand requirements are met but no profile has been built yet, prompts user to go build the profile
- **Setup checklist** — appears when brand requirements are not yet met, shows three steps: add website URL, connect a social account, build brand profile. Items show ChevronRight arrow on hover.
- Workspace list cards with platform colour dots and pending comment badge
- Quick-action links to Compose, Inbox, and Add Workspace

### 6.4 Workspace Settings (`app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`)

- **Workspace section** at top — editable name and website URL fields, saved via server action (`prisma.workspace.updateMany` with access check)
- Lists all supported social platforms with connect / reconnect buttons
- Connected platform rows show `border-l-2 border-l-status-success/50` left accent
- Shows connected accounts with a green dot indicator
- Disconnect button (soft-delete — marks `isActive: false`)
- **Success banner** on `?connected=platform` query param after OAuth completes
- **Danger Zone** section styled with `border-t border-status-error/20` and card `border border-status-error/20`; delete workspace button backed by an `AlertDialog` confirmation modal
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
| `/api/comments/[id]/reply` | POST | Publish response to Facebook/Instagram and mark comment RESPONDED |
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
Post → PostApproval, PostMetrics, Comment (many), PostBoost (one, pending)
Comment → CommentResponse (many)
SocialAccount → Post, Comment (many)
SeoPage → SeoContent (many, onDelete: Cascade)
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

- Mobile navigation is now live — fixed bottom nav bar (`components/lyra/app-shell/mobile-nav.tsx`) with 5 items, visible below the `md` breakpoint
- The calendar switches to an agenda view on mobile; the full grid is desktop-only
- The composer shows a tab strip (Compose / Preview) on mobile instead of side-by-side columns
- All pages use responsive Tailwind classes and work acceptably on mobile

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

**All schema changes through Session 9 have been applied to production Supabase**, including:
- `Post.topic` (Session 6)
- SEO tables: `SeoConnection`, `SeoPage`, `SeoContent`, `SearchConsoleData` (Session 6)
- `SocialAccount.lastCommentSyncAt` (Session 7, applied via Supabase SQL Editor in Session 9)

**Also applied (Session 10):** `PostBoost` table, `BoostStatus` enum, `SocialAccount.adAccountId` column — all applied to Supabase. SQL in Session 10 changelog.

**How to apply future schema changes — Supabase SQL Editor is the preferred method:**

After repeated failures with `prisma db push` (connection string issues, special characters in passwords, pooler vs. direct URL confusion), the established approach is:

1. Write the SQL equivalent of your Prisma schema changes
2. Open Supabase → SQL Editor → paste and run
3. Run `npx prisma generate` locally to regenerate the client
4. Run `npm run type-check` to verify

`prisma db push` can still be used if the connection is reliable, but the SQL Editor approach is faster and avoids all connection string problems.

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

Schema changes (edits to `prisma/schema.prisma`) must be pushed to the database manually — the Netlify build does not do this automatically.

```bash
# Uses DIRECT_URL (not the pooled PgBouncer URL)
npx prisma db push

# Or for production-grade migrations:
npx prisma migrate dev --name describe-your-change
npx prisma migrate deploy
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
| `lyra/components/lyra/app-shell/sidebar.tsx` | Sidebar with brand lock logic, platinum active border, mobile hidden |
| `lyra/components/lyra/app-shell/mobile-nav.tsx` | Fixed bottom nav bar for mobile (md:hidden), 5 items |
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
| `lyra/workers/ai-responder.worker.ts` | BullMQ worker — generates AI draft/auto responses; autoPost=true publishes live via `replyToComment()`, falls back to AI_DRAFTED on failure or unsupported platform |
| `lyra/workers/brand-sync.worker.ts` | BullMQ worker — refreshes brand intelligence data on schedule |
| `lyra/workers/index.ts` | Worker entry point — starts all 4 workers, graceful SIGTERM/SIGINT shutdown |
| `lyra/railway.toml` | Railway deployment config — start command `npx tsx workers/index.ts` |
| `lyra/app/api/comments/[id]/reply/route.ts` | POST — publishes response to Facebook/Instagram and marks comment RESPONDED |
| `lyra/components/lyra/inbox/response-inbox.tsx` | Comment inbox shell — tabs (Pending / Escalated / Done), platform filter chips, fetch + error state |
| `lyra/components/lyra/inbox/comment-card.tsx` | Mode-aware comment card — STARTER/PRO/AGENCY UI states, live reply, escalate, ignore |
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
| `lyra/app/(dashboard)/account/page.tsx` | Account page — profile, plan/billing, danger zone |
| `lyra/app/api/account/route.ts` | DELETE handler — full cascade user data deletion in one transaction |
| `lyra/components/lyra/account/delete-account-button.tsx` | AlertDialog confirmation for account deletion |
| `lyra/components/lyra/composer/compose-client.tsx` | Client wrapper lifting content + platform state; mobile tab strip, desktop side-by-side |
| `lyra/components/lyra/composer/post-preview.tsx` | Six platform-specific post preview renderers; desktop/mobile toggle |

---

## 12. Immediate Next Steps (Recommended Order)

**New features (ready to build):**
1. **Media Library** (Phase 3) — S3 upload, AI topic tagging, media picker in composer and schedule review. Spec: `lyra/docs/superpowers/specs/2026-05-19-ai-content-schedule-design.md` section 3.
2. **Inbox follow-up items** — see Session 11 Known Follow-up Items above (non-atomic reply/DB, PATCH transition guard, handleUpdate draft carry-through, shared types).

**Platform / integrations:**
3. **Test GSC OAuth end-to-end** — navigate to SEO → connect Search Console → verify property auto-selects → add a page → Analyse → Generate
4. **Test YouTube connection** — connect a Google account in Settings → YouTube, verify the channel saves correctly
5. **Connect Facebook** — reconnect Facebook in Settings; then set `adAccountId` manually in Supabase to test post boosting end-to-end
6. **Apply for Meta App Review** — submit `ads_management` scope. Once approved, re-add `'ads_management'` to SCOPES in `facebook.ts` — `adAccountId` will populate automatically on next reconnect.
7. **Apply for LinkedIn company page access** — submit LinkedIn Community Management API application so pages (not personal profiles) can be connected
8. **Apply for LinkedIn app verification** — enables `w_member_social` scope for posting
9. **Create Google Business, Twitter, TikTok developer apps** — add credentials to Netlify env vars so those OAuth flows work

**UX / business:**
10. **Mobile sidebar** — ✅ done (Session 19) — fixed bottom nav bar live on mobile
11. **Stripe billing / marketing page** — create Stripe products/prices, wire up checkout flow, build public marketing landing page (plan saved: `lyra/docs/superpowers/plans/2026-05-19-marketing-landing-page.md`)

**Post boosting — low priority polish:**
12. Add cron job or scheduled check to flip `PostBoost.status` from `ACTIVE` to `ENDED` when `endsAt` has passed (currently boosts stay ACTIVE in the DB after expiring on Meta's side)
13. Pull `broad` audience country from workspace settings instead of hardcoded `'AU'` in `meta-ads.ts`
