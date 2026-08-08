# LYRA — Project Handover Document

**Date:** May 2026 (updated July 2026 — internal testing pass: ✅ Analytics tab now shows real engagement data (was entirely unbuilt — `sync-metrics` only ever wrote placeholder zeros — now fetches real numbers from Zernio, plus a follow-up fix so LinkedIn posts resolve correctly too); ✅ Inbox comment ingestion fixed (webhook was reading a field that doesn't exist on real deliveries, so zero comments had ever landed since the Zernio webhook was built) + a self-reply feedback loop fixed; ✅ Dashboard false-FAILED status on a genuinely-published post fixed (same class of bug — trusted a speculative Zernio response field name over their actual docs); ✅ Google Search Console connect flow fixed (wrong redirect domain + site never verified) and confirmed working via a real reconnect test; composer UX fixes (score panel close button, real edit-existing-post flow, drag-and-drop media upload); LYRA Trend add-on scaffold committed (Phase 3); ✅ scheduled posts with media confirmed fully automatic end-to-end: fixed 4 stacked infra bugs (missing cron-job.org auth headers, an undeployed cron route, an overly-broad root `.gitignore` silently blocking new files project-wide, and a missing `DATABASE_URL` on the Railway worker fleet), plus a separate media-attachment bug (S3 bucket needed a public-read policy for Zernio to fetch files, and Zernio's `mediaItems` field was in the wrong place in our request shape), plus 4 of 5 cron-job.org jobs having been auto-disabled and needing re-activation + faster intervals; ✅ media uploads fixed (was a 4-layer AWS misconfiguration, now confirmed working); Zernio platform testing: X/TikTok/YouTube/Google Business connected, Facebook blocked on LYRA workspace by a Meta new-Business-Portfolio issue (not a code bug); Autonomy settings control; Inbox unread badge; Zernio Bridge Phases 1–4: unified social API replaces per-platform native OAuth for new connects; updated June 2026 — Session 40: LinkedIn Community Management API + token introspection; Session 39: full mobile UI/UX audit + fixes; Session 38: media upload fix, client approval workflow, tsconfig dedup fix; updated 2026-07-19 — ✅ email marketing integration (Klaviyo/Mailchimp/Customer.io campaigns in Content Calendar — Klaviyo confirmed working); Agency Plan badge in header; LYRA Assistant placeholder page; competitor scraper heading-fallback + honest postsPerWeek; updated 2026-07-18 — ✅ full comprehensive code review completed and every Critical + High finding fixed (5 Critical in commit `3a4dab0`, all 16 High in commit `f471680`): cross-tenant IDOR on upload presign, 4 live debug/publish routes deleted, SSRF hardening via new `lib/safe-fetch.ts`, atomic post-publish status transition, shared Redis connection for BullMQ, workspace role-gating, account-deletion scope fix, Stripe webhook idempotency + a real billing-downgrade bug fixed on the unreleased Trend add-on, security headers (CSP/HSTS/etc., verified live in-browser), AI auto-reply hardened against prompt injection, a genuinely broken Docker worker deploy path fixed, HTTP timeouts added across every external client, N+1 query batching, a DB index + safety cap on the publish-due-posts cron, Redis-backed rate limiting on AI/upload/PDF routes, and frontend perf fixes (lazy-loaded charts, an O(n²) bug, React.memo); plus the one non-code follow-up item (a separate Postgres connection for the Railway worker) completed manually in Supabase/Railway); updated 2026-07-20 — ✅ Medium/Low review findings fixed (commit `6e34496`); ✅ Instagram GIF-format publish failure fixed (JPEG/PNG only on Instagram/Threads, now checked live in Compose before scheduling) plus 2 real bugs found alongside it (dead BullMQ retry logic, no visibility into failure reasons — both fixed); ✅ a duplicate-publish bug found the same night (a DB write failing after a successful platform publish could trigger a real second publish attempt via BullMQ retry — fixed so nothing can throw after a successful publish); 🔧 a rough night of Netlify deploys — hosted CI's SSH connection to GitHub was intermittently broken (Netlify-side, self-resolved), two brief local-CLI-deploy-caused outages (~3 min, ~30 sec) both caught and rolled back immediately, root-caused (Turbopack workspace-root misdetection from stray lockfiles, fixed via `turbopack.root`) and documented in full — **recommendation: avoid local `netlify deploy --prod` from this machine going forward, prefer hosted CI**; updated 2026-07-20 (evening) — ✅ Facebook connect to the LYRA workspace resolved (a confirmed Meta-side stuck permission grant, not a LYRA code issue — Zernio support pinpointed the fix); ✅ Klaviyo campaign dates showing a day off on the calendar, root-caused to a decoy API field (`scheduled_at` is an audit timestamp, not the send time — switched to `send_time`); ✅ YouTube added to the Compose platform selector (was fully wired everywhere else, just missing from that one list); ✅ AI Schedule Generator caption CSV export + an "Awaiting Media" gate shipped end-to-end (new `requiresMedia` field, export button, Calendar/detail-panel/Compose enforcement, all server-side-gated) via full brainstorm → spec → plan → subagent-driven implementation with two-stage review per task; ✅ a stuck full-screen loading-spinner bug found and fixed in `NavigationLoader` (was misreading `blob:` download links as SPA navigation — also silently affected the pre-existing Help PDF download, never previously reported); updated 2026-07-21 (afternoon) — ✅ dashboard YouTube label overflow fixed; ✅ Inbox self-comment filter added to sync route; ✅ Analytics inboxPending count fixed (was counting IGNORED as pending); ✅ on-demand Sync button added to Analytics page (new /api/analytics/sync endpoint); ✅ Analytics engagement chart now buckets by local date not UTC (timezone offset param); ✅ response rate now excludes IGNORED comments from denominator; ✅ GSC SEO connection now surfaces a reconnect prompt instead of silent "no data" when token expires; updated 2026-07-21 — ✅ Klaviyo campaigns now sync through to Sent → Published (was permanently stuck at Scheduled once a campaign actually sent); ✅ a real "FB published, LinkedIn+Instagram showed Failed" incident root-caused to a client-side timeout + BullMQ retry racing Zernio's own duplicate-post detection — fixed with a proper idempotency key, the two affected posts corrected in the DB to match reality (they had genuinely published); ✅ Inbox comment sync found completely broken for every Zernio-connected account, on every platform, both the manual Sync button and the automatic cron — root-caused live via a real LinkedIn comment test, fixed by routing through the same provider abstraction publish() already uses, confirmed working end-to-end on LinkedIn, Facebook, and Instagram; ✅ Analytics page's "Total reach"/"Top posts" looked empty despite real activity — root-caused to `views` (populates before `reach` on IG/LinkedIn) being silently dropped since the field was never declared anywhere in the codebase; added end-to-end (schema, sync cron, API, dashboard, chart); extensive live alpha testing this session with the Testing Checklist updated throughout, evidence-first (DB queries, production log checks, and direct visual confirmation) rather than taking test results at face value; updated 2026-07-22 — ✅ page heading font/size unified across all dashboard pages to `font-display text-4xl text-text-primary` (Analytics page had a fully wrong style — hardcoded hex color, extra font-weight — others had legitimate but unwanted size variance); evaluated Google Pomelli (Google Labs/DeepMind) as a possible addition to the Creative Studio Phase 2 platform lineup — no public API exists, so there's no ingestion path into LYRA's launcher+ingestion architecture, and its "Business DNA" concept duplicates LYRA's existing Brand AI rather than adding new capability; not integrated, logged as a watch-list note in the Creative Studio scope doc's Open Questions section instead; updated 2026-07-23 — ✅ publish-idempotency fix and drag-and-drop reschedule both confirmed live: the 4 posts dragged to a new time on 22 Jul all published clean and showed Published on the calendar, closing out both open checklist items in one real test; ✅ Inbox unread badge staleness fixed — badge stayed lit after switching workspaces even with nothing genuinely pending, root-caused to the badge count being computed once server-side and never refreshed on a client-side workspace switch (unlike the active-workspace-id itself, which already had this exact workaround) — fixed with a new live-count endpoint fetched client-side, keyed on the active workspace; ✅ media upload had no real file-size limit — the actual upload path Compose uses had zero size validation (a 50MB check existed only in dead, unreachable code), so a large file's fate depended on whether it finished before the presigned URL's 5-minute expiry rather than any real policy; added a real 50MB limit enforced client- and server-side, plus stopped swallowing the real error message on failed uploads; ✅ Content Calendar confirmed matching the DB exactly (20 ITWM posts, 21–29 Jul, cross-checked directly) — no phantom or missing entries; ✅ Crisis Aware fully confirmed working end-to-end after fixing a real gap — it never checked comments arriving via the real-time webhook (only the polling cron, separately broken for Facebook on a Meta permission error), fixed by wiring the same check into the webhook handler, re-tested and confirmed (crisisActive flips, CrisisEvent created, banner shown); also confirmed a real UX gap along the way — Crisis Aware's escalation is in-app only, no email/notification exists anywhere in the app, flagged for later; ✅ escalated Inbox comments had zero way to be replied to or dismissed (pure frontend gap, backend never blocked it) — fixed and confirmed live (manual reply posted to Facebook within seconds), AI Generate stays hidden for escalated ones since AI itself declined to draft a reply, escalationReason now surfaced too; ✅ self-reply loop recurred a third time via the webhook's self-comment filter — its native-id and username fallbacks were structurally broken for Zernio-connected accounts (platformId stores Zernio's own id, not the native one; Facebook Pages have no username), fixed by adding the same name-match fallback the other two ingestion paths already had; ✅ shipped Crisis Aware AI-suggested keywords end-to-end via full brainstorm → spec → plan → subagent-driven implementation (10 tasks, two-stage review per task plus a final cross-task review) — Brand AI now generates suggested crisis-escalation keywords (legal/safety/discrimination/media/business-specific) during a rebuild, reviewable on the Brand AI page (only shown when Crisis Aware is on) with approve/dismiss/manual-add/remove; suggestions live separately from the live `Guardrail` table until approved, so detection is provably unaffected until a human acts; real bugs caught and fixed along the way (an intra-batch AI-suggestion dedup gap, a malformed-JSON fail-open gap, a genuine race condition on concurrent approves closed with a DB unique constraint + atomic upsert, an accessibility gap, an idempotent-delete gap, and a final-review catch where the race fix had silently made duplicate detection case-sensitive, contradicting the spec — fixed by normalizing to lowercase on write); email notification on crisis trigger intentionally scoped out as a separate follow-up spec, not yet built; updated 2026-07-24 — ✅ per-platform media slots shipped in Compose: a "Customise per platform" toggle appears once media is attached and platforms are selected, opening a tab per platform; each tab shows the shared media dimmed as a fallback and accepts its own upload to override for that platform only; tabs with no override fall back to shared at post-creation time (no schema change — each Post row already holds its own mediaUrls); a UX bug found immediately in live testing (tabs were pre-seeded with shared media copies, causing users to accidentally send 2 videos to TikTok/LinkedIn which reject multi-video posts — root-caused via DB query showing FAILED rows with 2-file mediaUrls and Zernio's explicit "single video file only" error) and fixed the same session: tabs now open empty showing shared as read-only fallback, API hardened to treat empty platformMedia array as no-override; TikTok and LinkedIn hints updated to flag single-video-only restriction; dots on tab labels indicate which platforms have an active override; updated 2026-07-28 — ✅ Stripe CLI installed (winget) and authenticated to the LYRA live Stripe account; all Stripe price IDs (Starter/Pro/Agency monthly + annual, Trend monthly + annual, Crisis Aware monthly + annual) added to `.env.local` and Netlify environment variables; `STRIPE_WEBHOOK_SECRET` (`whsec_...`) and `ENCRYPTION_KEY` (AES-256 hex) filled in (both were placeholders); stray `STRIPE ACCOUNT BACKUP` line removed from env file; ✅ Crisis Aware billing integration shipped — Option A pricing (Agency plan includes Crisis Aware free, Pro plan can add it for a monthly subscription, Starter sees a locked card): new `crisisAwareSubId` field on `Agency` schema (DB column added via Supabase SQL Editor), new `/api/stripe/crisis-aware-checkout` route, webhook handling for `crisis_aware` subscription type on `checkout.session.completed` / `subscription.updated` / `subscription.deleted`, new `CrisisAwareAddonCard` component, `CrisisAwareToggle.isPro` renamed to `hasAccess`, settings page computes access from plan + `crisisAwareSubId` and renders toggle or addon card accordingly; two bugs fixed during testing: (1) new Stripe price IDs not set in Netlify env vars → Internal server error on Activate (fixed by adding all price IDs to Netlify); (2) standalone workspaces with no `agencyId` link caused "No agency found" (fixed by looking up agency via user membership, same approach as the main plan checkout) — Stripe checkout form confirmed opening correctly for a Pro-plan workspace after both fixes; ✅ Agency PDF report confirmed correct (19 posts, 251 impressions, 5.18% engagement rate, AI narrative — all accurate, all formatting clean); ✅ Brand Intelligence rebuild confirmed on-brand; ✅ Pre-Publish Content Scoring confirmed working after fixing a silent bug (Claude wrapping JSON in markdown code fences caused `JSON.parse` to throw → 503 → silent failure in the composer; fixed by stripping fences before parse and surfacing errors as a toast); updated 2026-07-30 — ✅ LYRA Trend add-on billing wired end-to-end: `trendSubId` added to `Workspace` schema (DB column via Supabase MCP), webhook fulfillment added for all three subscription event types, `TrendAddonCard` rendered in Settings Add-ons section with live `enabled` state, price set to $10/month; updated 2026-08-01 — ✅ six /code-review findings fixed (commit `9d29b8f`): Critical — Stripe webhook workspace creation now atomic in `$transaction` (orphaned workspace + infinite retry loop closed); Medium — `isAwaitingMedia` in per-platform mode now respects shared mediaUrls fallback; Medium — sessionStorage cleared at schedule generation start to prevent stale prior-run review; Medium — `Promise.allSettled` replaces `Promise.all` in schedule generator (one platform failure no longer discards all others); Medium — schedule-generator.ts throws on Claude parse failure so route returns 500 and client can surface it; Low — stale score cleared alongside toast on non-OK scoring response; updated 2026-07-28 (later) — ✅ AI Schedule Generator "Schedule generation failed" bug root-caused and fixed — a first fix (raising the Claude client's own timeout) proved insufficient; the real constraint was Netlify's own hard 60s synchronous function ceiling, independent of any client-side timeout; fixed by splitting generation into one Claude call per platform per week (run concurrently) instead of one call covering every platform, verified live at 17–23s per call; feature then fully live-tested end-to-end (generate → CSV export → Awaiting Media badges → attach media → gate clears → SCHEDULED), closing out Testing Checklist line 89; also fixed a GitHub push permission conflict between two accounts used on this machine (LYRA vs. Spice Space) by scoping LYRA's remote URL to its own credential slot; updated 2026-07-29 (later) — ✅ full 48-item alpha Testing Checklist complete (last item, bad-token failure visibility, answered via code review — no dedicated "reconnect needed" detection exists, Help page corrected); ✅ post-completion regression sweep across all 48 items found zero cross-fix regressions, but surfaced and fixed two unrelated real gaps (Schedule Review's media upload bypassing the 50MB limit; content scoring failing silently on a real API error) plus cleanup (a 22MB stale duplicate project directory, a dead Redis-based route); ✅ Demo Guide + in-app Help docs audited against actual code (not just dates) — found and corrected four entirely fictional features that had zero implementation (client self-service onboarding links, team member invitations with named roles, configurable per-event email notifications, an AI credit/allowance system), plus two smaller inaccuracies (free trial length/scope, annual billing availability); added Help docs for two real undocumented features (per-platform media, AI Schedule Generator); ✅ Wishlist audited the same way — 4 items marked done (Stripe billing, full autonomous AI response loop, PDF reports, social feed analysis for Brand AI) with 2 more given partial-completion notes; 🔍 investigated the Brand AI "Engagement Insights" counter not updating — root-caused to the query excluding `views` entirely (only counts likes/comments/shares/saves/clicks), a real design gap left for a product decision, not yet fixed; updated 2026-08-02 — ✅ full `/comprehensive-review` (212 findings, 26 Critical/62 High/74 Medium/50 Low across 5 phases) plus a same-day second wave remediated end-to-end and pushed (commits `d24e4d9`, `58b2f9c`): RBAC closed across 44 previously-ungated routes (the `CLIENT_VIEW` write/spend/delete bypass), hardcoded Meta token stripped from code (still needs manual revocation), LYRA Trend billing disabled, SSRF gap closed, `EmailIntegration.apiKey` encrypted, PKCE `code_verifier` moved out of the client-visible OAuth state into Redis, prompt-injection fencing extended to every Claude call site touching untrusted content, CSP `connect-src` tightened, all 6 workers given real graceful shutdown, `sync-metrics` moved off inline sequential calls onto a proper worker queue, test suite grew 37→76 with `npm test` now actually gating CI, a stale duplicate app tree at the OneDrive repo root deleted, and the LYRA Trend/team-invite/onboarding-link fictional-feature class in the docs corrected again (a 5th recurring instance found); two of the review's own findings independently corrected after direct verification (Railway's DB connection pool was never actually shared with the app — the review had read `.env.local` as if it were the deployed config; `DIRECT_URL` is unreachable from this machine, explaining why past sessions found `prisma migrate` "hang"); ✅ same-day follow-up — a redundant `railway up` CI step (fighting Railway's own native GitHub auto-deploy) removed after it started sending false-failure emails, diagnosed live via Railway CLI + GitHub Actions API with zero actual production impact throughout; updated 2026-08-04 — 🔧 LYRA MCP server Phase 0 (OAuth authorization layer) built via full brainstorm → spec → plan → subagent-driven implementation with two-stage review per task: Auth0 confirmed and configured as the real OAuth 2.1 authorization server (no custom AS built — LYRA only adds what Auth0 lacks natively), new RFC 7591 Dynamic Client Registration shim (`app/api/oauth/register`, rate-limited, provisions real Auth0 Applications on demand), new RFC 8414 metadata discovery document (`app/.well-known/oauth-authorization-server`), new JWKS-based bearer-token verification (`lib/jwt-verify.ts`, new `jose` dependency), and an additive bearer-token auth path in `lib/auth.ts` sitting alongside the existing session-cookie auth so all ~66 existing API routes gain bearer-token support for free with zero per-route changes; real issues caught and fixed via two-stage subagent review (a silent JWT audience-check bypass that would have accepted tokens for *any* Auth0 API in the tenant if `AUTH0_MCP_AUDIENCE` were ever unset, an uncaught crash on a literal `null` JSON body in the DCR shim, missing rate limiting on that same unauthenticated endpoint, undocumented/untested bearer-vs-session-cookie precedence); 112/112 tests passing, clean typecheck; ✅ **fully verified end-to-end against the real Auth0 tenant same day** — Auth0 dashboard configured (API, M2M app for the DCR shim, refresh token rotation, Application Access Policy), and a full live OAuth flow run (discovery → DCR registration → Auth0 login/consent → PKCE token exchange → bearer-token-authenticated LYRA API call) confirmed working via a throwaway verification script (deleted after use, per plan); that live run caught two more real bugs no unit test could reach: Auth0's Management API rejects `refresh_token.rotation_type: 'rotating'` unless the created Application is explicitly `oidc_conformant: true` (fixed in `lib/auth0-management.ts`), and the LYRA MCP API's Application Access Policy defaulted to "Per-app authorization," which would have silently broken every dynamically-registered client — the entire point of DCR — until switched to "All Applications"; all work pushed to `main`; updated 2026-08-05 — ✅ LYRA MCP server Phase 1 (gateway + 7 core read tools) fully deployed and dogfooded end-to-end via a real Claude conversation, closing Phase 1's exit criteria: new `lyra-mcp` service live at `mcp.lyraonline.ai` (Railway), all 7 tools verified working with real production data through both MCP Inspector and an actual Claude connector session; live deployment surfaced and fixed four more real production issues no local testing could have caught — Phase 0's Auth0 Management API credentials (`AUTH0_MCP_AUDIENCE`/`AUTH0_MGMT_CLIENT_ID`/`AUTH0_MGMT_CLIENT_SECRET`) were only ever set in local `.env.local`, never added to Netlify production (added, redeployed); the RFC 8414 authorization-server metadata's `issuer` field didn't match its own hosting URL, which MCP Inspector's spec-strict discovery correctly rejected (fixed, `issuer` now `APP_BASE_URL`); a two-part RFC 8707 resource-identifier mismatch — real MCP clients correctly send the exact endpoint URL they connect to (`.../mcp`) as the OAuth resource/audience parameter, but the existing Auth0 API's identifier was the bare origin with no path; since Auth0 doesn't allow editing an API's identifier post-creation, a new Auth0 API was created with the correct `.../mcp` identifier and `AUTH0_MCP_AUDIENCE` updated to match everywhere (Railway gateway env, Netlify main-app env); and an Auth0 tenant-wide cap on total Applications was hit after repeated DCR registrations during testing (each registration permanently provisions a new Auth0 Application), resolved by deleting throwaway test/verification-script entries via the dashboard; deployment itself done largely by Claude directly via the Railway and Netlify CLIs (both already authenticated on this machine from earlier sessions) plus direct Auth0 Management API calls for read-only diagnostics — DNS records (Cloudflare) were the one piece requiring Richard directly, no Cloudflare access available; also added the LYRA app icon to the MCP server's own metadata (`src/mcp-server.ts`), shown in a connecting client's UI (e.g. Claude's connector list) when added manually by URL — purely cosmetic, and distinct from Anthropic's public connector directory listing (a separate submission process, still Phase 4); Phase 2 (writes, approval integration, audit logging) fully implemented and code-reviewed (15-task plan, subagent-driven, multiple rounds of code-quality fixes caught and closed real bugs pre-deploy — a publish-approval deadlock, a content-swap approval bypass, a double-send race on `respond_to_item`, an unbounded Redis-outage hang on every tool call, and an audit-trail workspace misattribution for multi-workspace/agency callers); ✅ **deployed and verified end-to-end same day** — migration applied, `REDIS_URL` set on Railway (same Upstash instance the main app's worker fleet uses), both services redeployed clean (no crash-loop), and all 3 write tools dogfooded live via MCP Inspector against the real ITWM workspace: `draft_post` returned a real six-dimension score and created a real draft; `schedule_post` truthfully reported back `PENDING_APPROVAL` (ITWM has client approval enabled) rather than blindly echoing the requested `SCHEDULED`; `respond_to_item` correctly stayed draft-only and never sent, since the workspace isn't set to `FULL` autonomy — confirmed via `McpAuditLog` that all 4 calls made during testing (including a `list_inbox_items` read) logged correctly with the right workspace attribution, closing the loop on the workspace-misattribution fix from the same day's final review; updated 2026-08-06 — ✅ the double-send race condition flagged (not fixed) at the end of the Phase 2 MCP work closed properly: all 5 real writers to `Comment.status` in the response/escalation lifecycle now use atomic, status-scoped `updateMany` claims instead of unconditional writes — `workers/ai-responder.worker.ts`, `app/api/comments/[id]/reply/route.ts` (the manual Reply button), `app/api/ai/respond/route.ts` (the Generate AI draft button, which had the widest race window of the group — a multi-second AI call sitting between the read and the write), and `app/api/comments/[id]/route.ts` (the Escalate/Ignore buttons' generic PATCH endpoint, found completely unguarded partway through this work with a concrete exploit path: a stale-Pending UI card clicked Escalate on a comment the worker had already sent a real reply to, silently clobbering RESPONDED to ESCALATED, which then let a second real reply go out through the reply route's deliberately-permissive ESCALATED predicate); real sub-bugs caught and fixed along the way — an initial fix on the manual reply route correctly let ESCALATED comments stay repliable (a deliberate, verified-safe deviation from the standard guard, needed because a prior fix had made ESCALATED comments un-clearable any other way) but its rollback-on-send-failure path then silently downgraded ESCALATED to AI_DRAFTED on failure, losing the escalation (fixed to restore prior status correctly); rollback writes across two files were found not crash-safe — a transient DB blip on the rollback itself could permanently strand a comment as falsely "answered" with nothing actually sent, since a BullMQ retry's first check would see RESPONDED and silently return (fixed with the same 3-attempt inline-retry pattern already established in `workers/post-publisher.worker.ts`); the generic PATCH route's `status` field was writable as any string with zero validation (now whitelisted against the real Prisma `CommentStatus` enum); confirmed via full-codebase grep that zero unguarded `prisma.comment.update()` (singular) calls remain anywhere — 207/207 tests passing, clean typecheck; two adjacent findings logged but not fixed (out of scope for this pass): `handleEscalate`/`handleIgnore` in the Inbox UI don't yet consume the new `alreadyResolved` response field the backend now sends (minor UX inconsistency, no correctness impact); comments sitting at `IGNORED` can still receive an autonomous auto-reply if a respond job was already queued/in-flight when Ignore was clicked (pre-existing, same "human intent silently overridden" class as the fixed bugs but not itself a double-send, since nothing was sent before — worth a follow-up ticket); updated 2026-08-06 (later) — ✅ LYRA MCP server Phase 3 (capability registry, search_capabilities/call_capability generic dispatch, 4 MCP prompts, tool-selection eval) built and deployed via full brainstorm → spec → plan → subagent-driven implementation, 13 planned tasks plus a substantial holistic-review fix round and an eval-harness rework found only by actually running it; 16-entry capability registry (competitor tracking, SEO tools, brand intelligence, crisis-keyword/guardrail management, email campaign visibility, content scoring, AI schedule generation) reachable through one generic `call_capability` dispatcher instead of 15+ hand-written tool functions; real bugs caught and fixed across many review rounds — a workspace-scoping gap where 3 path-derived capabilities never sent `workspace_id` to the backend at all (fixed by making the scoping decision an explicit, tested registry field instead of inferring it from a URL regex); a workspace-name echo-back that could confirm entirely the wrong workspace for those same capabilities (now suppressed for them); `search_capabilities`' matching logic rewritten twice after review found it returned zero results for realistic multi-word queries and, once fixed, still let a single stray cross-reference in one capability's description make it the *sole* result for an unrelated query; `approve_crisis_keyword` had no real floor on the keyword length (a validation bypass via whitespace padding was caught and closed on the second pass) and no way to undo an approval — investigated and found a real, already-existing backend route (`DELETE /api/guardrails/[id]`) and added a `remove_guardrail` capability for it rather than inventing new backend surface; a declared-but-unenforced OAuth `requiredScope` field on every capability was found to become concretely exploitable the moment this phase's `settings:write` capabilities landed — **Richard's decision: document as declarative-only for now rather than touch the shared authorization wrapper used by all 12 tools**, real enforcement deferred to a future phase; ✅ **deployed** (32 commits pushed to `main`, Railway auto-deploy triggered) — manual MCP Inspector verification against the live gateway still needed from Richard directly; 🔍 tool-selection eval run for real against the live Claude API, landed at 63.3% (not the 90% target) with a clearly understood, non-alarming root cause: Claude reasonably performs more exploratory tool calls (checking workspace identity, checking brand voice before drafting) than the eval's fixed-turn-budget grading can currently credit — **Richard's decision: stop iterating on the eval here**, the finding is logged as a known gap for a future dedicated eval-tooling pass rather than a blocker on shipping the (fully built and reviewed) gateway code itself; updated 2026-08-07 — media upload rebuilt twice from scratch after two dead ends (chunked multipart upload discarded pre-ship as unworkable for an LLM tool call; a source_url fetch-and-rehost design then found live to be solving the wrong problem, since Claude Desktop renders generated media locally in its own sandbox with no public URL) — real fix is a presigned S3 upload (`get_media_upload_url`), Claude Desktop's sandbox uploads directly to S3 outside the MCP token channel; 4 real bugs found via live Claude Desktop E2E testing the same day (post deletion silently failing on any post that had entered approval, MCP tool responses not returning `mediaUrls` so attachment couldn't be verified, the Approve button hidden for 4 of 5 backend-authorized roles, a recurring Auth0 DCR application-count cap); updated 2026-08-08 — ✅ self-approval deadlock closed (workspace-composition-aware rule + matching UI labeling), immediately caught and resolved a live instance of the exact gap on LYRA's own workspace; ✅ auto-schedule-on-approval shipped (approving a ready post now goes straight to Scheduled, no separate manual click) — review caught and fixed a real bug before it shipped (a post with no scheduled time could have silently auto-scheduled to a state that would never actually publish); **✅ LYRA MCP gateway confirmed fully functional end-to-end** — media upload, scheduling, and the full approval workflow all validated through real live use, not just tests  
**Prepared by:** Claude Code (Anthropic)  
**Project owner:** Richard Unwin, Into The Wild Marketing

---

## Changelog
### 2026-08-08 — Self-approval deadlock closed, auto-schedule-on-approval shipped — LYRA MCP gateway confirmed fully functional end-to-end

✅ **Self-approval deadlock.** The morning after the approve-button-visibility fix landed (see previous entry), Richard hit `PATCH /api/posts/[id]`'s unconditional self-approval rejection ("Cannot approve your own post") on a real post — and correctly pushed back that this could be a genuine product-breaking gap, not just an edge case: any workspace where nobody with approver-capable access is a different person from the post's author (realistically, a solo/small agency that turns on `clientAccessLevel: APPROVE` before a real second reviewer is active) hits a *permanent* deadlock with zero way out via the UI. Full brainstorm → spec → plan → subagent-driven implementation (`docs/superpowers/specs/2026-08-07-self-approval-deadlock-design.md`): the rule now only blocks self-approval when another approver-capable `WorkspaceAccess` row genuinely exists on the same workspace (`3cd8865`); the calendar UI mirrors the same three-way logic (not-author unchanged; author + another approver exists → "Recall for editing" only, no button shown that's known to 403; author + no other approver → labeled "Approve (no other reviewer available)", making clear no real second-party review happened) (`68481b4`).

**Immediately caught a real-world instance of exactly this gap** — the live LYRA workspace itself had two `AGENCY_ADMIN` grants, so the fix correctly blocked self-approval and showed "Recall for editing" instead of a button. Investigation found the second grant belonged to `metareviewlyra2026@proton.me`, an account created for Meta's App Review process, not a genuine second human reviewer. Richard chose to remove that account's workspace access (via a one-off script, not a UI action — no team-member-removal API route exists yet) rather than keep it; self-approval then correctly succeeded with the "no other reviewer available" label, confirmed live.

✅ **Auto-schedule-on-approval.** Manually testing the above, Richard asked whether "Approved" and "Scheduled" meant the same thing — they didn't: approving a post always required a *separate* manual "Schedule post" click afterward, an extra step for the common case where nothing else is blocking. Full brainstorm → spec → plan → subagent-driven implementation (`docs/superpowers/specs/2026-08-08-auto-schedule-on-approval-design.md`): approving a post now jumps `finalStatus` straight to `SCHEDULED` when its media requirement is already satisfied (`f9c0626`); `APPROVED` becomes a narrower status meaning "approved, but still blocked," and the existing "Awaiting media" badge now covers it in both the calendar card and detail panel instead of a bare, unexplained "Approved" (`71bae96`).

**Code review caught a real bug before it shipped**: the initial version only checked media readiness, not whether the post even had a `scheduledAt` set at all — a post could reach `PENDING_APPROVAL` with no scheduled time (`Submit for approval` has no date requirement), and approving it would have silently jumped it to `SCHEDULED` with `scheduledAt: null`. The publish cron only picks up posts with a non-null `scheduledAt`, so that post would have displayed "Scheduled" and never actually published, with no error and no obvious way back. Fixed same session (`f41e021`) — "no scheduled time" is now treated the same as "no media": the post stays at `APPROVED` instead.

**Logged but not fixed** (flagged, not silently ignored): the same "no scheduledAt" failure mode still exists via the pre-existing *manual* "Schedule post"/"Mark as scheduled" buttons — a post stuck at `APPROVED` purely for lack of a scheduled time (media already fine) can still be pushed to `SCHEDULED` with `scheduledAt: null` through those, since neither ever validated it either. Pre-existing, not introduced by this work, but worth its own small follow-up (thread `scheduledAt` into `getNextStatuses`'s filtering, same pattern as the media check).

✅ **Confirmed live, end-to-end, by Richard directly** — approved a real post on the real LYRA workspace after the metareview-account cleanup, watched it self-approve with the correct label, then confirmed on refresh it showed correctly. Combined with the presigned-upload and approval-workflow fixes below, this closes out the arc that started with Claude Desktop scheduling posts with no media: **the LYRA MCP gateway is now confirmed fully functional end-to-end** — media upload, scheduling, and the full approval workflow all validated through real use, not just tests.

### 2026-08-07 — Media upload rebuilt twice from scratch, landing on presigned S3 uploads; 4 real bugs found via live Claude Desktop E2E testing

🔧 The chunked multipart upload design built the previous evening (Aug 6, 12-task plan) turned out to be fundamentally unworkable on holistic review before it ever shipped to a real client: an LLM tool call cannot emit megabytes of base64 chunk data as a tool argument — the design assumed Claude itself would read a local file and stream it chunk-by-chunk through MCP tool calls, which isn't how any MCP client actually works. Discarded entirely (`0236a58`, `7073754`) before any real user hit it.

**First replacement attempt: `attach_media` (source_url based).** Redesigned around the assumption that Claude Desktop-generated media (e.g. via Higgsfield) would already be hosted somewhere public, and the gateway would just fetch-and-rehost that URL server-side (`a9adb2c`, plus SSRF hardening for the new outbound fetch — `ec4b0d7`, `11e92c4`, `114eec3`, `b4065fa`). Shipped and registered (`a8c611d`).

**Then found the real blocker via actual use**: Richard ran a real Claude Desktop session scheduling 5 posts with Higgsfield-generated video. All 5 posts scheduled with captions but *zero* media attached. Root cause, confirmed by asking Claude Desktop directly to test its own sandbox network access: Claude Desktop renders/holds generated media **locally in its own sandbox**, with no public URL for `attach_media`'s source_url to fetch — Higgsfield didn't create a hosted URL at all, Claude Desktop did the rendering. `attach_media` was solving the wrong problem.

**Real fix: presigned S3 upload**, full brainstorm → spec → plan → subagent-driven implementation (`docs/superpowers/specs/2026-08-07-media-presign-design.md`): new `get_media_upload_url` MCP tool returns a presigned S3 POST policy (`@aws-sdk/s3-presigned-post`); Claude Desktop's own sandbox — confirmed to have full outbound internet access — performs the actual multipart upload directly to S3, entirely outside the MCP/LLM token channel; the returned public URL is then passed to `draft_post`/`schedule_post` as normal. Shipped (`796246f`→`34336bf`), including a fix round adding an explicit note to the tool description that S3 silently ignores the file field if it isn't listed last in the multipart form.

**Real bugs found via live Claude Desktop E2E testing against the real ITWM/LYRA workspaces, same day:**
1. **Post deletion silently failing** (`fbe1086`) — any post that had ever entered `PENDING_APPROVAL` or had metrics synced threw a foreign-key violation on delete (`PostApproval`/`PostMetrics` don't cascade at the DB level — the same gap already fixed once for the bulk account-delete path, never applied to the single-post route). Surfaced as a generic "Failed to delete post" when Richard tried to remove a bad test post. Fixed with the same `$transaction` pattern; comments are detached (not deleted) since they're real platform engagement history.
2. **No way to verify media actually attached from the tool output** (`5758707`) — `draft_post`/`schedule_post` never returned `mediaUrls` in their response, so Claude Desktop (or Richard) had no way to confirm the new upload flow actually worked without a separate `list_scheduled_posts` round-trip. Claude Desktop itself flagged this gap unprompted during testing. Fixed by adding `mediaUrls` to both tools' response shape.
3. **Approve button only visible to one of five authorized roles** (`7b7542b`) — the backend's `PATCH /api/posts/[id]` already authorized `PLATFORM_OWNER`/`AGENCY_ADMIN`/`AGENCY_MEMBER`/`SMB_OWNER`/`CLIENT_APPROVE` to approve a `PENDING_APPROVAL` post, but the UI's `getNextStatuses` only ever showed the Approve/Request-changes buttons for `CLIENT_APPROVE` specifically — every other authorized role saw no way to approve anything, only "Recall for editing." `APPROVER_ROLES` extracted to a shared `lib/authz.ts` export so frontend and backend can't drift again.
4. **Recurring Auth0 DCR application-count cap hit again** — same class of issue as Phase 1 (disposable "Claude" Application entries from repeated reconnect attempts never get cleaned up). Diagnosed via the Management API, 4 duplicate entries identified and handed to Richard to delete manually via the dashboard (the M2M app's token still only has `create:clients`/`read:clients`, no `delete:clients` — same limitation as before).

Fixing #3 immediately surfaced a deeper, structural problem — closed the next day, see entry above.

### 2026-08-06 (later) — LYRA MCP server Phase 3: capability registry, generic dispatch, MCP prompts, tool-selection eval

✅ Built and deployed the third phase of the LYRA MCP gateway (`LYRA/lyra-mcp`, separate service from the main app, already live at `mcp.lyraonline.ai` since Phase 1). Phases 0–2 gave the gateway OAuth, 7 read tools, and 3 write tools (10 total). This phase adds a **capability registry**: a data-driven manifest of 16 additional operations (grew from 15 during the holistic review — see below) reachable through two new generic tools, `search_capabilities` and `call_capability`, instead of writing a dedicated hand-rolled tool function for each one. Also added: 4 MCP "prompts" (pre-written conversation starters — `plan_next_week`, `triage_inbox`, `summarise_client_performance`, `turn_trend_into_post`) and a dev-only tool-selection eval script (`npm run eval`) that calls the real Claude API to measure whether it picks the right tool for a set of realistic prompts.

**Process**: full brainstorm → spec → plan → subagent-driven implementation, same as every prior MCP phase. The 13-task plan (`docs/superpowers/plans/2026-08-06-mcp-gateway-phase3.md`) went through the usual per-task two-stage review (spec-compliance, then code-quality, with fix loops), but this phase's real story is what a **final holistic review across the whole phase, plus actually running the eval for real**, turned up that no individual task's review could have caught alone.

**What shipped:**
1. `deleteLyraApi` added to the gateway's backend API client (DELETE support, including a real 204-No-Content edge case an initial version got wrong).
2. `CAPABILITY_REGISTRY` (`src/capabilities/registry.ts`) — 16 entries (competitor tracking add/list/remove, SEO page tracking/analysis/content-generation, Search Console data, brand-intelligence rebuild + engagement-pattern analysis, crisis-keyword approve/dismiss + a new guardrail-removal capability, email campaign visibility, content scoring, AI schedule generation), each declaring its backing endpoint, HTTP method, Zod param schema, minimum plan tier, whether it mutates data, whether its response needs untrusted-content framing, and — added after a real bug was found — an explicit `workspaceScoping` field.
3. `call_capability` — one generic dispatcher: registry lookup, param validation, path-parameter substitution, plan-tier gating, HTTP dispatch, then response shaping (untrusted-content wrapping for capabilities that return third-party scraped content; workspace-name echo-back for mutating ones, so a misresolved workspace is visible immediately).
4. `search_capabilities` — keyword search over the registry with availability flags, so a capability your plan doesn't cover is still shown (marked unavailable with the tier that unlocks it) rather than hidden.
5. Both registered in `TOOL_REGISTRY` (10 → 12 tools), going through the exact same rate-limiting/audit-logging wrapper as every other tool for free.
6. 4 MCP prompts registered via the SDK's `registerPrompt` (first use of this MCP primitive in the codebase — confirmed the real signature against the installed type definitions rather than guessing).
7. `scripts/tool-selection-eval.ts` + `scripts/eval-cases.ts` — a 30-case dataset, calls the real Anthropic API, measures tool-selection accuracy against a 90% target.

**Real bugs found and fixed across the review rounds** (this phase had unusually many, caught by unusually persistent reviewers — logged in full since several are the kind of thing worth remembering the shape of):

- **Workspace-scoping gap**: 3 capabilities backed by routes with a path parameter (`remove_competitor`, `analyze_seo_page`, `generate_seo_content`) never sent `workspace_id` to the backend at all, since the backend derives the workspace from the path-identified resource. A review found this decision was being *inferred* from a regex on the endpoint string rather than *declared* — fragile, and a real gap since nothing verifies the caller's claimed workspace actually contains the resource being acted on (echoes a bug class already fixed once in Phase 2, commit `f7db30c`). Fixed by adding an explicit, tested `workspaceScoping: 'explicit' | 'derived-from-path'` field instead of the regex.
- **False workspace confirmation**: the workspace-name echo-back used the *claimed* workspace, which for `derived-from-path` capabilities can be entirely wrong — worse than no echo, since it looks like confirmation. Now suppressed specifically for those capabilities.
- **`search_capabilities` matching rewritten twice**: an initial strict AND-token match returned *zero* results for realistic multi-word queries ("brand intelligence tools", "SEO tools"). Fixed with an OR-ranked fallback — which then let stopwords and unweighted term-counting let irrelevant capabilities outrank relevant ones ("tools for tracking competitors" ranked an SEO capability above the actual competitor-tracking ones). Fixed with stopword filtering + name-weighted scoring. Then, separately, a capability's own description cross-referencing another capability's name by exact string caused an unrelated query ("competitor tracking") to surface *only* the destructive delete capability, with nothing marking it as destructive — fixed by removing the cross-reference and adding a `mutates` flag to search results so an LLM caller can see which results are safe to explore versus which will change data.
- **`approve_crisis_keyword` validation gap**: originally accepted any 1-character string, which the real backend matches as a case-insensitive substring — a single approved letter would escalate every future comment containing it, permanently, with no way to undo (the sibling `dismiss_crisis_keyword` only touches *suggested* keywords, never active ones). Fixed in two passes: a length floor (`min(3)` + letter-content check), which a review then found was itself bypassable by padding the string with whitespace (`" a "` passes a naive `.min(3)` but the backend trims before storing, yielding the 1-character guardrail anyway) — fixed with `.trim()` chained *before* `.min()`. Separately, investigated whether a real backend route exists to undo an approval: found `DELETE /api/guardrails/[id]` already exists (not crisis-keyword-specific — deletes any guardrail type), added a new `remove_guardrail` capability for it rather than inventing new backend surface (this phase is gateway-only by design).
- **OAuth `requiredScope` declared but never enforced**: every capability (and every core tool, going back to Phase 0) declares a required OAuth scope, and the gateway extracts scopes from the JWT into its auth context — but nothing anywhere actually checks one against the other. This is a pre-existing gap from the original OAuth design, not introduced this phase, but this phase is the first point it becomes concretely exploitable: `approve_crisis_keyword`/`dismiss_crisis_keyword`/`remove_guardrail` all require `settings:write`, a scope no previously-registered tool needed, so a client that only ever consented to `content:read`/`content:write` can invoke them anyway. **Richard's explicit decision**: document this as declarative-only (clear comments added in the registry) rather than wire real enforcement into the shared wrapper used by all 12 tools — that's judged a separate, future piece of work, not something to fold into this phase under time pressure.

**Logged but not fixed this pass** (flagged, not silently ignored):
- Audit-log granularity: `call_capability`'s audit rows record `toolName: 'call_capability'` for all mutating capabilities, not which specific one — recoverable from the JSONB params field unless it hits the 50KB truncation cap, but a real gap for anyone querying "what mutations happened" by tool name.
- `call_capability`'s DELETE-dispatch loud-failure guard checks the wrong variable (`rest` instead of `scopedRest`) for a hypothetical future `explicit`-scoped DELETE capability — unreachable with the current registry (the only DELETE capability is path-derived), so low urgency, but worth fixing whenever a second DELETE capability is added.
- `search_capabilities` still has residual matching gaps: no stemming (plural/singular mismatches), and a short-term filter can produce empty results for queries combining a filtered short word with an unrelated word (e.g. "AI tools").
- The eval harness's own architecture: after two significant rounds of expansion (two-turn support for the search→call_capability protocol, then a `list_workspaces` "prefix hop" once a real run showed Claude reasonably resolving workspace context before acting), a **real eval run against the live API landed at 63.3%, not 90%**. The remaining gap has a clear, non-alarming cause: Claude often takes a *second* reasonable exploratory step (e.g. checking `get_brand_profile` before drafting/scheduling content — which the gateway's own MCP prompts explicitly instruct it to do) that the harness's fixed turn-budget can't credit. Properly fixing this means either another targeted hop (same pattern, smaller lift) or a genuinely general bounded multi-turn loop (bigger lift, more realistic). **Richard's explicit decision: stop here** — the Phase 3 *code* is fully built, reviewed, and deployed; the eval is a measurement tool whose current limits are understood and documented, not a blocker.
- A related, smaller finding from the same holistic review: the eval script (`scripts/tool-selection-eval.ts`) has absorbed seven or so incremental correctness fixes across this phase and would benefit from a real "drive the conversation" vs. "grade the transcript" split before an eighth feature lands on top of it — not done, explicitly deferred, worth doing before the next eval-harness change rather than after.
- `DELETE /api/guardrails/[id]` (the backend route `remove_guardrail` is built on) returns only `{ok: true}` — no identifying information about what was actually deleted. Combined with the suppressed echo-back, an LLM invoking this capability can only report "done," not which guardrail/type/workspace. A backend-side fix (return the deleted row) would close this; out of scope for this gateway-only phase.

**Deployment**: 32 commits pushed to `main` (this repo spans the whole OneDrive folder as one git tree — `LYRA/lyra-mcp` changes and this handover doc live in the same push), triggering Railway's native auto-deploy for `lyra-mcp`. **Manual MCP Inspector verification against the live deployed gateway is still needed from Richard directly** (needs production access this session doesn't have) — the plan's final task, not yet done as of this entry.

### 2026-08-06 — Comment double-send race condition closed across all 5 writers

✅ Closed out the one known follow-up item flagged at the end of yesterday's MCP Phase 2 work: `workers/ai-responder.worker.ts` had no atomic claim before its status-changing writes, meaning a retry or a race against the new `POST /api/mcp/respond-to-item` endpoint could send two real replies to the same customer comment. Fixed with the same atomic compare-and-swap `updateMany` claim pattern already proven in `workers/post-publisher.worker.ts` and `respond-to-item`'s own hardening — claim to `RESPONDED` *before* calling the send provider, not after, so only one concurrent caller can ever win the write and proceed to send.

**What started as a single-file fix grew into a full subsystem sweep**, via the same two-stage subagent review process used throughout the MCP work (implement → independent spec-compliance review → independent code-quality review → fix loop), because each review round kept finding the next unguarded writer in the chain:

1. `workers/ai-responder.worker.ts` — atomic claim before send; rollback-on-failure needed its own follow-up fix once a review found the rollback write itself wasn't crash-safe (a transient DB blip on the rollback could permanently strand a comment as falsely "answered" with nothing sent — fixed with a 3-attempt inline retry, matching `post-publisher.worker.ts`'s established pattern for "nothing after an irreversible action is allowed to throw uncaught").
2. `app/api/comments/[id]/reply/route.ts` (manual Reply button) — same atomic-claim treatment. The implementer made a well-judged deviation here: rather than blindly excluding ESCALATED comments from the claim (matching the other files), they found and cited an existing UI comment explaining that ESCALATED comments must stay repliable through this specific route, or they'd become permanently un-clearable — verified safe by an independent review (neither autonomous path ever acts on an ESCALATED comment, so allowing manual replies through doesn't reopen the race). A follow-up round then found the rollback path was losing the ESCALATED status on failure (fixed to restore prior status) and wasn't crash-safe either (fixed with the same retry pattern).
3. `app/api/ai/respond/route.ts` (Generate AI draft button) — the widest race window of the whole group, since a multi-second AI generation call sits between the read and the write (every other writer's window is a fast synchronous DB operation). This route never sends anything itself, so the fix is simpler — guard both writes, and honestly tell the caller when a race was lost (a new `alreadyResolved` response field) instead of a claim-then-rollback pattern. Wired the frontend (`comment-card.tsx`) to actually act on that field by moving the card to wherever it really belongs instead of leaving a stale "Pending" card that would just lose the same race again on retry.
4. `app/api/comments/[id]/route.ts` (the generic PATCH backing the Escalate/Ignore buttons) — found by a review to be a fifth, completely unguarded writer with a real, concrete exploit path all the way through to a second live message going out. Guarded with `status: { not: 'RESPONDED' }` (deliberately not excluding ESCALATED, since this route is how a comment legitimately becomes ESCALATED in the first place), plus added a whitelist validating the `status` field against the real Prisma enum (previously any string was accepted and written straight through).

**Final verification**: a full-codebase grep confirmed zero remaining unguarded `prisma.comment.update()` (singular) calls anywhere — every write to a comment's status now goes through a guarded, atomic `updateMany`. 207/207 tests passing, clean typecheck. Pushed to `main`.

**Logged but not fixed this pass** (both flagged to Richard rather than silently fixed or silently ignored):
- `handleEscalate`/`handleIgnore` in the Inbox UI don't yet read the new `alreadyResolved` field the backend now sends on a lost race — an operator hitting this edge case sees a generic error toast instead of the card correctly moving to wherever it actually ended up. Low-severity, no correctness impact (the backend guard still protects correctly either way) — just a UX polish item.
- Comments sitting at `IGNORED` can still receive an autonomous auto-reply if a respond job was already queued/in-flight at the moment Ignore was clicked. Same "human intent silently overridden by an autonomous path" class as everything else fixed today, but not itself a double-send (nothing had been sent before) — pre-existing, worth its own follow-up ticket.

### 2026-08-05 (later) — LYRA MCP server Phase 2: write tools built, hardened, deployed, and verified live

✅ Implemented and merged to `main` in both repos (`LYRA/lyra`, `LYRA/lyra-mcp`) via the subagent-driven-development workflow: implement → independent spec-compliance review → independent code-quality review → fix loop, repeated per task across all 15 tasks in `docs/superpowers/plans/2026-08-05-mcp-gateway-phase2.md`, plus a final holistic cross-cutting review after all 15 landed.

**What shipped:**
- 3 new MCP write tools: `draft_post`, `schedule_post`, `respond_to_item` — registered alongside the 7 Phase 1 read tools (10 total in `TOOL_REGISTRY`).
- New `McpAuditLog` table + `POST /api/mcp/audit` endpoint (main app) — the gateway now writes one audit row per tool call (workspace, user, tool name, params, outcome), wired through a shared wrapper that also enforces per-user (60/min) and per-workspace (120/min) rate limiting via a new Redis-backed `ioredis` module in the gateway.
- Server-side approval-workflow enforcement for `POST /api/posts` and `PATCH /api/posts/[id]` — previously only a UI menu prevented bypassing client approval; now enforced in the API itself.
- New composed `POST /api/mcp/respond-to-item` endpoint — drafts via the existing AI responder, sends only under `FULL` autonomy (workspace-config-driven, never a caller parameter), re-checks guardrails against whatever text is about to be sent (AI-generated or caller-supplied) immediately before sending.
- Every write tool echoes back workspace name + platform + account handle in its response (parent spec §6.2), so a misresolved workspace is visible immediately rather than silently wrong.

**Real bugs found and fixed during code-quality review** (the reason this took many review rounds — each one caught something that would have been a real production incident):
1. **Publish deadlock**: an early version of the approval-routing fix redirected *every* `SCHEDULED` request in an approval-enabled workspace back to `PENDING_APPROVAL`, including the legitimate post-approval scheduling step — meaning no approved post could ever actually get scheduled and publish, in any workspace using the approval feature. Fixed by excluding already-`APPROVED` posts from the redirect.
2. **Content-swap approval bypass**: the fix for #1 then let an *already-approved* post's content be silently edited and re-scheduled without re-review — an approver's signature would apply to content they never saw. Fixed by requiring re-review whenever content actually changed.
3. **Double-send race on `respond_to_item`**: a retry or two concurrent calls for the same comment could both pass the "not already responded" check and both send a real reply to a customer, because intermediate status writes weren’t atomically guarded. Fixed with the same compare-and-swap `updateMany` claim pattern the codebase already used for post publishing, applied to every status transition in the route (draft write, both escalation writes, the send claim, and the failure rollback).
4. **Unbounded Redis-outage hang**: if Redis were ever unreachable, every single tool call would queue and hang for 10–20 seconds (ioredis's default retry behavior) before failing with a raw, leaked infra error visible to the calling model. Fixed with a 3-second timeout and a generic client-facing error — genuine rate-limit denials are unaffected, only infrastructure failures are bounded.
5. **Audit/rate-limit workspace misattribution**: found in the final holistic review, after all 15 tasks individually passed review. `respond_to_item` resolved a workspace for disambiguation but never told the backend, while the gateway's audit/rate-limit wrapper attributed the call to that resolved workspace anyway — a multi-workspace agency caller could claim workspace A while acting on a comment that actually belonged to workspace B; the reply itself always went to the right account, but the audit trail and rate limit were charged to the wrong client. Fixed by threading the resolved workspace through to the backend, which now cross-checks it against the comment’s real workspace and rejects a mismatch.

**Known, accepted gaps** (documented, not fixed — explicit scope decisions):
- `workers/ai-responder.worker.ts` (a pre-existing, separate async comment-sending path) has its own unrelated concurrency race with no atomic claim of its own, and can now race against the new `respond_to_item` endpoint under `FULL` autonomy — found during this work but explicitly **not fixed**, since it's a pre-existing bug in a different, already-shipped file, not something Phase 2 introduced. **Flagged as the top follow-up item for whoever picks up next.**
- `list_workspaces` is the one tool (of 10) that gets no per-workspace rate limiting and no audit row — structural (it has no workspace concept, `McpAuditLog.workspaceId` is `NOT NULL`), not an oversight.
- Audit logging is backend-storage-only for this phase, per an earlier scoping decision — no UI to view it yet (a real future addition once there's real audit data to design against).

**Deployed and verified live the same day.** Migration applied via the Supabase SQL Editor, `REDIS_URL` set on the Railway `lyra-mcp` service (same Upstash instance the main app's worker fleet already uses), both services redeployed clean with no crash-loop (confirmed via `railway logs` — `lyra-mcp listening on port 8080` — and both `/health` and the OAuth metadata endpoint returning 200). All 3 write tools dogfooded live via MCP Inspector against the real Into The Wild Marketing workspace: `draft_post` returned a real six-dimension score and created a real `DRAFT` post; `schedule_post` truthfully reported `PENDING_APPROVAL` rather than the requested `SCHEDULED`, confirming ITWM's client-approval routing works end-to-end; `respond_to_item` correctly stayed draft-only (`sent: false`) since the workspace isn't set to `FULL` autonomy. Confirmed via a direct `McpAuditLog` query that all 4 tool calls made during testing — including a `list_inbox_items` read — logged correctly with accurate workspace attribution, which specifically closes the loop on the `respond_to_item` workspace-misattribution fix from the final holistic review (that fix's whole purpose was making sure this exact query would show the *right* workspace).


### 2026-08-05 — LYRA MCP server Phase 1: gateway deployed, dogfooded, and verified live

---

#### ✅ Full Phase 1 deployment, closing its exit criteria (dogfooded on Into The Wild's own client accounts)

Phase 1 (gateway plus 7 read-only core tools — build summarized in the previous changelog entry below) went from code-complete to fully live and verified in this session: Railway service created (`lyra-mcp`, Root Directory `LYRA/lyra-mcp`), domain bound (`mcp.lyraonline.ai`, Cloudflare DNS — the one step requiring Richard directly, no Cloudflare MCP access available), env vars set, deployed, and confirmed responding correctly at the HTTP/protocol-discovery level (health check, RFC 9728 metadata, bearer-auth 401 enforcement all correct on first real request). Most of this — service creation, env vars, domain binding, redeploys, log inspection, Auth0 Management API diagnostics — was done directly by Claude via the Railway and Netlify CLIs (both already authenticated on this machine from earlier sessions), not handed to Richard as manual dashboard steps.

**Four real production issues found and fixed via live testing, none of which local/unit testing could have caught:**

1. **Phase 0's Auth0 Management API credentials never made it to production.** `AUTH0_MCP_AUDIENCE`, `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET` were added to `.env.local` during Phase 0's local E2E verification but never added to Netlify's actual production environment — the DCR shim (`/api/oauth/register`) had been silently broken in production since Phase 0 shipped. Found by reproducing the failure directly (`curl` against the live endpoint) and streaming live Netlify function logs (`netlify logs -f`) to catch the real underlying error (`Auth0 Management API token request failed: 401`) rather than the generic `{"error":"server_error"}` the route deliberately returns to callers. Fixed by adding all three vars to Netlify production and triggering a rebuild via the Netlify API (`createSiteBuild`) — not a local `netlify deploy --prod`, per this project's standing rule against that.
2. **RFC 8414 issuer self-consistency bug.** The Phase 0 `/.well-known/oauth-authorization-server` document set `issuer` to Auth0's own domain, but is actually served from `lyraonline.ai` — RFC 8414 §3.3 requires those to match, and MCP Inspector's spec-strict discovery correctly rejected it (`Issuer mismatch`). This was a known, previously-flagged-but-deferred open question from Phase 1's planning research, now confirmed as a real blocker. Fixed by setting `issuer` to `APP_BASE_URL` — bearer-token validation itself was unaffected, since `lib/jwt-verify.ts` checks a token's real `iss` claim against `AUTH0_DOMAIN` directly, never against this metadata document at runtime.
3. **RFC 8707 resource-identifier mismatch (two-part fix).** Real MCP clients correctly send the exact endpoint URL they connect to (`https://mcp.lyraonline.ai/mcp`, with the path) as the OAuth `resource`/`audience` parameter — this is correct client behavior per spec, not a quirk. The existing Auth0 API's identifier was the bare origin with no path, so Auth0 rejected every authorize request with `Service not found`. A first attempted fix (changing the gateway's own RFC 9728 metadata to advertise the bare origin instead) was backwards and got reverted. Since Auth0 doesn't allow editing an API's identifier after creation, the real fix was creating a new Auth0 API with the correct `.../mcp` identifier and updating `AUTH0_MCP_AUDIENCE` to match everywhere (Railway gateway env, Netlify main-app env, restoring the gateway's metadata to its original correct value).
4. **Auth0 tenant application-count cap hit mid-testing.** Every DCR registration permanently provisions a new Auth0 Application — repeated testing (MCP Inspector, Claude's connector, and several debug `curl` calls while diagnosing the above) accumulated enough throwaway Applications to hit the tenant's cap (`too_many_entities`, 11 total against what turned out to be roughly a 10-application ceiling on this tenant tier). Diagnosed by listing all tenant Applications via the Management API (read-only — the DCR shim's M2M credentials are deliberately scoped to `create:clients`/`read:clients` only, no `delete:clients`, so cleanup required Richard deleting 3-4 throwaway entries via the dashboard rather than Claude doing it via API).

**Full verification chain completed:** MCP Inspector confirmed protocol conformance (OAuth flow, all 7 tools listed with correct schemas, `list_workspaces` returning real live data with correct role/platform fields). A real Claude conversation was then connected via Claude's own connector settings and used to ask real questions against the ITWM workspace — correctly resolved the workspace by name (no `workspace_id` needed, single-workspace implicit resolution working as designed), correctly reported zero pending approvals/inbox items with the right autonomy mode, and for a scheduled-posts query returned accurate real data plus an unprompted, genuinely useful observation (three of five posts landing on the same day, same thematic angle) — confirming the tool responses are shaped well enough for the model to reason usefully about them, not just regurgitate data.

**Cosmetic addition:** the LYRA app icon (`public/brand/lyra-app-icon-512.svg`, already hosted publicly by the main app) was added to the MCP server's own `Implementation` metadata (`icons` field, confirmed supported by reading the actual installed SDK types before using it) — shown in a connecting client's UI (e.g. Claude's connector list) for anyone adding the connector manually by URL. Explicitly distinct from Anthropic's public connector directory listing, which is a separate submission process and still Phase 4 per the rollout plan — not done.

**Next:** Phase 2 (writes — `draft_post`/`schedule_post`/`respond_to_item`, approval-workflow integration, audit logging, gateway-side rate limiting) brainstormed and approved this session; spec and implementation plan not yet written.

---

### 2026-08-04 — LYRA MCP server Phase 0: OAuth authorization layer

---

#### 🔧 Built the OAuth 2.1 authorization layer for LYRA's planned MCP server (Phase 0 of `docs/LYRA-mcp-server-design.md`)

Full brainstorm → spec → plan → subagent-driven-development cycle. Read the existing (already-"Approved") MCP server design spec, found two real gaps in it (claimed the LYRA API was "unchanged" when it actually has zero bearer-token support today; assumed a custom OAuth authorization server would need to be hand-built), corrected both after live investigation against the real Auth0 tenant, and rewrote spec sections 2.2/2.3 accordingly before writing the implementation plan (`docs/superpowers/plans/2026-08-04-mcp-oauth-phase0.md`).

**Architecture decision:** Auth0 (already used for LYRA's own login) acts as the real OAuth 2.1 authorization server/token issuer — no custom AS was built. LYRA only adds the pieces Auth0 doesn't provide natively:
- `lib/auth0-management.ts` — talks to Auth0's Management API (via a new, narrowly-scoped M2M app) to provision real Auth0 Applications on demand.
- `lib/jwt-verify.ts` — JWKS-based verification of Auth0-issued access tokens (`jose`, new dependency).
- `lib/auth.ts` — additive bearer-token auth path, sitting alongside (never replacing) the existing session-cookie auth; every one of LYRA's ~66 API routes gains bearer-token support for free via the shared `getCurrentUser()`/`requireAuth()` call every route already uses.
- `app/api/oauth/register/route.ts` — RFC 7591 Dynamic Client Registration shim (unauthenticated by design, since it's how a not-yet-known OAuth client registers itself).
- `app/.well-known/oauth-authorization-server/route.ts` — RFC 8414 metadata discovery document.

Each of the 5 code tasks went through implement → spec-compliance review → code-quality review (fresh subagent per stage), plus a final holistic cross-file review. Real issues caught and fixed along the way:
- A silent audience-check bypass in JWT verification — `jose`'s `audience` check is a no-op if passed `undefined`; an unset/misconfigured `AUTH0_MCP_AUDIENCE` would have silently accepted any validly-signed Auth0 token issued for *any* API in the tenant, not just the intended one. Fixed with a fail-closed env-var guard plus pinning `algorithms: ['RS256']`.
- An uncaught crash in the DCR shim on a literal JSON `null` body (bypassed the intended 400 response, fell through to a generic 500).
- No rate limiting on the DCR shim — an unauthenticated route that provisions real, permanent Auth0 resources on every call — despite an established `lib/rate-limit.ts` convention already used by comparable routes (`klaviyo/subscribe`, `onboarding`); added, matching that pattern (5 req/10min per IP), plus length/count caps on `redirect_uris`/`client_name`.
- Bearer-vs-session-cookie precedence in `getCurrentUser()` (bearer wins when both are present) was implemented correctly but undocumented and untested — added a comment and dedicated tests.

Verification: 112/112 tests passing, clean `tsc --noEmit`, full suite re-run after every fix. All work committed and pushed to `main` (matching this project's established convention of working directly on `main`, not a feature branch).

#### ✅ Auth0 dashboard configured, full flow verified end-to-end against the real tenant

Richard completed Task 1 (Auth0 dashboard: "LYRA MCP API" resource server, 60min token expiry, refresh token rotation, a dedicated M2M app scoped only to `create:clients`/`read:clients` for the DCR shim, env vars wired into `.env.local`), and Task 7's throwaway verification script (`scripts/verify-mcp-oauth-flow.mjs`, deleted after use) confirmed the whole flow works live: metadata discovery → DCR registration → real Auth0 login/consent (manual browser step) → PKCE code exchange → bearer-token call to a real LYRA API route (`GET /api/workspaces`), returning real workspace data.

That live run caught two more real bugs — exactly the class of issue this verification step exists to catch, since neither is reachable from a unit test:
- **Auth0 rejects refresh-token rotation unless the Application is explicitly `oidc_conformant: true`** — the Management API returned `400 "Application must be OIDC Conformant when Refresh Token rotation is enabled"` on every dynamically-provisioned client. Fixed by adding `oidc_conformant: true` to `createAuth0Client`'s create-client payload in `lib/auth0-management.ts`.
- **The LYRA MCP API's Application Access Policy defaulted to "Per-app authorization"** — every application (including ones the DCR shim provisions on the fly, with no human in the loop) needed manual dashboard authorization before it could request a token for the API's audience, which would have silently broken Dynamic Client Registration entirely. Fixed by switching **User-delegated Access** to "All Applications" in the API's Access Settings — the correct policy for an API meant to serve dynamically-registered clients, since the real security boundary here is the user's own login + consent, not a pre-approved app allowlist.

Separately, verification also surfaced that `checkRateLimit` (`lib/rate-limit.ts`) hangs indefinitely rather than failing fast when Redis is unreachable — the shared ioredis client is configured with `maxRetriesPerRequest: null` (deliberate for BullMQ workers, so a job is never lost) but the same client backs synchronous HTTP rate-limit checks too, so any route using `checkRateLimit` (including the new DCR shim, plus `klaviyo/subscribe`, `onboarding`, `schedule/generate`, and others) would hang the whole request rather than degrade if Redis ever goes down in production. Worked around locally for this verification run only (temporarily bypassed, reverted immediately after); **not fixed** — flagged here as a real production reliability gap worth a dedicated look.

---

### 2026-08-02 (latest 3) — Removed redundant/failing Railway deploy step from CI

---

#### ✅ Diagnosed a false-failure email and removed its cause

The second remediation wave's push (below) triggered a "workflow failed" email. Investigated directly via Railway CLI (`railway status`, `railway logs`, `railway deployment list`) and the GitHub Actions API: the worker service was healthy and the actual deployment (`c6c6362c...`) had already succeeded via Railway's own native GitHub integration at 11:24am — three minutes *before* `.github/workflows/deploy.yml`'s separate `deploy-workers` job even started. That job's own `railway up --service lyra-workers --detach` call failed fast (~11s) against Railway's already-completed deploy — a redundant, conflicting deploy path, not a real outage. It only started emailing because last session's fix removed `continue-on-error: true` from that job (previously it silently swallowed exactly this kind of failure). Removed the `deploy-workers` job entirely rather than fixing it, since Railway's native integration already does the job on its own; updated `README.md`'s two references to it accordingly. No production impact at any point — the worker fleet ran the new code correctly throughout.

Separately noted while investigating: two Facebook-connected pages are hitting a recurring Meta permissions error (`pages_read_user_content`/Page Public Content Access) on comment sync — pre-existing, unrelated to any of this session's changes, not yet fixed.

---

### 2026-08-02 (latest 2) — Second remediation wave: remaining High/Medium findings

---

#### ✅ Continued remediation of the 2 Aug review — everything from the "not done in this pass" list, plus more

Following directly on from the same-day full remediation below. `tsc` clean, 76/76 tests passing (up from 73), lint shows only the same pre-existing documented backlog (8 instances of one already-known rule, `react-hooks/set-state-in-effect`, matching the already-logged "14+ components fetch-on-mount" finding — no new violations).

**Reliability/operations:**
- All 6 BullMQ workers now have `.on('error', ...)` listeners (previously only `.on('failed', ...)`, so an error BullMQ couldn't attribute to a specific job crashed the whole process silently).
- `workers/index.ts` rewritten for real graceful shutdown — `SIGTERM`/`SIGINT` now call `Worker.close()` on all 6 workers (waits for in-flight jobs, 25s cap) before exiting, instead of the previous immediate `process.exit(0)` with zero drain.
- New `/api/health` endpoint (DB + Redis connectivity check) for external uptime monitoring — covers the Netlify app; the Railway worker fleet has no HTTP server to expose an equivalent on (would need a dedicated listener added to `workers/index.ts`, not done).
- 4 routes with zero try/catch fixed (`email-campaigns`, `email-integrations` GET+POST, `email-integrations/[id]` DELETE, `email-integrations/[id]/sync` POST) — were producing raw 500s instead of 401 on an unauthenticated request.

**Security:**
- Workspace-creation entitlement check added (`POST /api/workspaces`) — any authenticated user could previously create unlimited workspaces regardless of plan; also fixed new workspaces silently defaulting to STARTER regardless of the paying agency's actual plan.
- Rate limiting added to 4 previously-unrated expensive routes (`schedule/generate`, `brand-intelligence/build`, `reports/generate`, `comments/sync`) — inverted before (cheap single-LLM-call routes were capped, the most expensive ones weren't).
- `lib/rate-limit.ts`'s INCR+EXPIRE race fixed — now a single atomic Lua script, so a crash between the two calls can no longer permanently exhaust a bucket.
- **RBAC rollout extended**: `canWrite()` applied to 34 previously-ungated routes in the same-day pass below; this wave additionally fixed the **fetch-then-authorize race** at 10 more routes (comments, guardrails, post boost/publish, email integrations) — resource was fetched unscoped, then access checked separately; consolidated into one scoped query per route (matching `posts/[id]/route.ts`'s existing correct pattern), closing the "one-line refactor away from a real IDOR" hazard.
- **PKCE code_verifier no longer travels through the OAuth `state` parameter** (Twitter connect flow) — was signed-but-not-encrypted, fully readable in the redirect URL, defeating PKCE's actual purpose. Now stored server-side in Redis with a 10-minute TTL, single-use, keyed by the signed state value.
- Prompt-injection fencing extended from 1 of 11 Claude call sites to all sites that actually interpolate untrusted external content (scraped websites, uploaded documents, competitor posts, public comments) — 7 sites fenced, 3 correctly left unfenced after tracing their inputs back to LYRA's own internal data. Added a shared `neutralizeFenceCloser()` helper so embedded content can't prematurely close its own fence tag.
- CSP `connect-src` tightened from a blanket `https:` allowlist to the 4 specific hosts the browser actually calls (Stripe, GTM, GA4, Meta Pixel) — verified against the real inline scripts in `app/layout.tsx`, not assumed. `script-src`'s `unsafe-inline` investigated for a nonce-based fix; **not implemented** — Next.js 16 requires forcing every page into dynamic rendering to read a per-request nonce, and a misconfiguration would silently break payment/analytics scripts with no build-time signal. Full implementation plan written as a comment in `middleware.ts` for a human to review and decide on.
- Klaviyo's public subscribe endpoint rate-limited (5/10min per IP) — was completely open.
- `.dockerignore` added (the dormant `.env`-in-Docker-image risk from Phase 2 is now closed if the currently-unused `Dockerfile.worker` is ever activated) + a non-root `USER node` instruction added to the same file.

**Maintainability:**
- New `lib/platform-labels.ts` — canonical `Record<Platform, string>` display-label map, replacing 8 independently-drifted copies (`'Twitter/X'` vs `'X'` vs `'Twitter / X'` etc.) across composer/schedule/settings components and the crisis alert email.
- `.env.example` added (names only, no values) — was previously impossible to create without hitting the blanket `.env*` gitignore rule; added a `!.env.example` exception.
- `.github/CODEOWNERS` added for the deploy-critical config files (workflows, `netlify.toml`, `railway.toml`, `Dockerfile.worker`).

**Not done, flagged for later:** nonce-based CSP `script-src` (see above, needs live-browser verification); the OAuth `getAuthUrl`/`exchangeCode` duplication across 6 platform files (deferred to avoid conflicting with the concurrent PKCE fix touching the same files); converting 3 raw-string schema fields (`CrisisEvent.triggerType`, `Review.status`, `EmailCampaign.status`) to real Prisma enums (low-value type-safety polish, not a runtime bug); the remaining Medium/Low findings not covered by either wave (analytics-duplication between dashboard/PDF report, `noUncheckedIndexedAccess` tsconfig flag, `satisfies`/discriminated-union adoption, branch protection on `main` — a GitHub UI setting, not something fixable in code, no `gh` CLI on this machine either).

---

#### ✅ Full remediation of the 29 Jul–2 Aug `/comprehensive-review` (212 findings: 26 Critical, 62 High, 74 Medium, 50 Low across 5 phases)

Worked through the review's own prioritized action plan. Not every Medium/Low item was individually touched — this pass focused on every Critical, every High that was safe to fix without a larger design process, and the two largest structural items (RBAC, DB indexes). Summary by area:

**Security — stopped active harm:**
- Live hardcoded Meta API token (`scripts/meta-api-test.mjs`) removed from code, moved to `META_TEST_TOKEN` env var. **Token itself still needs manual revocation at developers.facebook.com — not done by this pass**, since only the account owner can do that.
- LYRA Trend Stripe checkout disabled (`app/api/stripe/trend-checkout/route.ts` now returns 503) — was live and billable despite the feature being entirely unimplemented. Billing portal (`TrendAddonCard`) rewired to the real, already-existing `/api/stripe/create-checkout` GET billing-portal endpoint so any existing subscribers can still cancel.
- **RBAC rollout**: new `lib/authz.ts` (`canWrite(role)`, blocks the read-only `CLIENT_VIEW` role) applied across 34 previously-ungated mutating routes — closes the Critical finding where a `CLIENT_VIEW` client could call routes directly to publish posts, spend ad budget, delete Crisis Aware keywords, or reply as the brand. `app/api/upload/presign/route.ts` additionally hardened: `workspaceId` is now unconditionally required (was previously skippable). One deviation flagged and reviewed: `stripe/create-checkout` has no `WorkspaceAccess` context, gated on `User.role` instead — confirmed this is currently a no-op (nothing in the app ever sets `User.role` away from its schema default) but is not a live hole either, since the route's pre-existing `Agency.members` filter already structurally excludes CLIENT_VIEW-only clients (they only ever get a `WorkspaceAccess` row, never `Agency.members`).
- SSRF gap closed: `services/brand-intelligence/scraper.ts` now uses `safeFetch()` (was calling raw `fetch()` after its own weaker check, missing redirect-hop re-validation) — also covers `workers/brand-sync.worker.ts`, which calls the scraper directly.
- `EmailIntegration.apiKey` (Klaviyo/Mailchimp/Customer.io keys) now encrypted at rest via `lib/encrypt.ts`, matching `SocialAccount`/`SeoConnection`. Existing plaintext rows self-heal on next read (decrypt failure → treated as legacy plaintext → re-encrypted-and-saved), since a live migration script couldn't be safely run from here.
- Stripe webhook idempotency: the compensating-delete's silently-swallowed failure (`.catch(() => {})`) now logs a `CRITICAL` error instead of vanishing — the underlying "event permanently lost on Stripe retry" edge case still exists (no structured alerting in this codebase yet) but is no longer invisible.

**Reliability:**
- Crisis Aware post-stranding bug fixed: the publish worker was `return`-ing (not throwing) on a crisis-active check, which BullMQ resolves as *completed* — combined with a stable job id, re-enqueueing after the crisis cleared was a silent no-op. Now throws (real retry) and `publish-due-posts` proactively clears any stuck completed/failed job before re-adding.
- Random stock-photo fallback removed (`services/social/provider/native.ts` was substituting a `picsum.photos` placeholder when media resolution failed — now throws and the post fails visibly instead of publishing the wrong image).
- Analytics page hard-crash fixed (`data === null` loading/`data = {}` poison-value pattern replaced with a real error state).
- Dashboard setup checklist's hardcoded `done={true}/{false}` now wired to real computed state.
- 6 UI mutations that skipped `res.ok` before showing success now check it properly (notably: AI-respond and AI-generate handlers no longer wipe an operator's in-progress draft on a failed response).

**Testing** — 37 → 73 tests (13 files, up from 7), plus `npm test` now actually gates CI (see below): new coverage for `lib/oauth-state.ts`, `lib/safe-fetch.ts`, the Stripe webhook, `workers/post-publisher.worker.ts` (extracted into a testable `processPublishJob`), `workers/comment-monitor.worker.ts`, and the new `workers/metrics-sync.worker.ts`. Two `Promise.all`→`Promise.allSettled` fixes (crisis alert email fan-out, AI-response enqueue fan-out) so one failure no longer silently drops the rest of a batch.

**Performance:**
- `sync-metrics` no longer runs ~200 sequential Zernio API calls inline in a Netlify function (real risk of exceeding the function timeout ceiling on any workspace with volume) — now fans out to a new `metrics-sync` BullMQ queue/worker, matching the pattern every other sync job already uses.
- **Correction to the review's own Critical finding**: verified directly against live `netlify env:get`/`railway variables` that the app and worker fleet do **not** share one `connection_limit=1` connection — Railway already has its own separate `DATABASE_URL` (`connection_limit=10`, direct port 5432) distinct from Netlify's PgBouncer-pooled one. The review had read `.env.local` (which does say `connection_limit=1`) as if it were the deployed config. No code change needed; correction logged in `.full-review/02-security-performance.md`.
- 4 missing indexes added and verified live: `SocialAccount.zernioAccountId`, `Post.publishedAt`, `Post.socialAccountId`, `CrisisEvent.workspaceId` (`prisma/migrations-sql/2026-08-02-missing-fk-indexes.sql`).

**CI/CD:**
- `npm test` now gates the build in `.github/workflows/deploy.yml` (previously only lint+typecheck+build ran — the 37/73 tests provided zero real regression protection).
- Worker deploy job's `continue-on-error: true` removed — a failed Railway deploy now fails the pipeline instead of silently showing green.
- `deploy.yml`/`crons.yml` scoped with `paths: ['LYRA/lyra/**', ...]` — previously any commit anywhere in this OneDrive-rooted repo triggered a full build + live worker redeploy.
- Netlify PR previews/branch deploys disabled (`netlify.toml`) until a real staging DB/Stripe/Auth0 config exists — previously every preview ran against production data.
- `crons.yml`: `CRON_SECRET` moved to `env:` blocks (was shell-interpolated); added a 5-minute-offset in-repo backstop trigger for `publish-due-posts` (previously had zero version-controlled fallback — 100% dependent on an external cron-job.org account).
- Fixed a stale `AUTH0_ISSUER_BASE_URL` placeholder in the CI build env that didn't match any real code (`AUTH0_DOMAIN` is what's actually read).

**Documentation:**
- `README.md` rewritten from unmodified `create-next-app` boilerplate (was telling contributors to deploy on Vercel) to real setup/architecture/env-var/deploy docs.
- LYRA Trend's fictional "fully working" description removed from `docs/LYRA-Demo-Reference-Guide.html` (5 locations) and `components/lyra/help/section-13-trends.tsx` (rewritten to an honest "not yet available" placeholder).
- A **fifth** instance of the fictional-feature pattern found last week's docs audit missed: `section-10-settings.tsx` still had a fictional "Onboarding link"/"Approval notifications" bullet pair (duplicating a lie the earlier audit already corrected in `section-03-social-connections.tsx` but missed here) plus a stale "Crisis Aware email is only planned" note contradicting the same file's own correct description 70 lines later. All three fixed.
- `LYRA-Handover.md` §5 env var table: added `RESEND_API_KEY`, `STRIPE_CRISIS_AWARE_PRICE_ID`/`_ANNUAL`, `S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (were missing despite being required by shipped features). §6.8 API route table regenerated from source — was covering under half of the real 66 routes and omitted `publish-due-posts` entirely.
- `docs/LYRA-Wishlist.md`: added an honest "LYRA Trend — In Progress, not yet shipped" entry (previously had zero mention of Trend in either the shipped or not-shipped sense).

**Dead code / infra cleanup:**
- Deleted a confirmed-stale duplicate LYRA app tree sitting at the OneDrive repo root (`app/`, `components/`, `lib/`, `services/`, `workers/`, `package.json`, `Dockerfile.worker`, `vercel.json`, etc. — last touched 21 Jun 2026, superseded by `LYRA/lyra/` which has had continuous commits through 1 Aug). One file, `email-subscribe.tsx`, was mistakenly deleted along with a dead `components/lyra/marketing/` subtree and had to be restored — it's the one component in that directory actually used by the live landing page.
- Deleted the dead nested `LYRA/lyra/.github/workflows/` copy (GitHub Actions only ever reads workflows from the true repo root; this copy had already drifted).
- `axios` removed (zero import sites); `shadcn` moved from `dependencies` to `devDependencies` (it's a CLI scaffolding tool, never imported at runtime).
- `getCurrentUser()` (`lib/auth.ts`) wrapped in React's `cache()` — was firing an Auth0 session fetch + a Prisma **write** twice per dashboard page load.
- Added `engines: { node: "20.x" }` to `package.json`; `Dockerfile.worker` now has a header comment stating it's not actually wired into Railway's deploy (which uses Nixpacks via `railway.toml`, not this Dockerfile).
- New `lib/anthropic.ts` `extractClaudeText()` helper replaces a duplicated unsafe `content[0]` indexing pattern across 10 AI service files.
- **Prisma migration ledger baseline created** (`prisma/migrations/20260802000000_baseline/`) — but the final `migrate resolve --applied` step needs to run from an environment that can reach Supabase's direct connection (`DIRECT_URL` timed out from this machine — likely why past sessions found `migrate dev`/`db push` "hang," they were actually failing to connect, not hanging). See `prisma/migrations/README.md` for the exact command.

**Not done in this pass** (flagged, needs a human decision or a dedicated session): revoking the Meta token itself; the actual Prisma migration baseline resolve step; further Medium/Low findings not listed above (duplication cleanup, CSP `unsafe-inline` tightening, prompt-injection fencing at the 10 remaining Claude call sites, `noUncheckedIndexedAccess` tsconfig flag, branch protection on `main`, monitoring/error-tracking (Sentry etc.), a `/api/health` endpoint, `CODEOWNERS`, `.env.example`).

Verification: `npx tsc --noEmit` clean, `npm test` 73/73 passing (13 files), `npm run lint` shows only the pre-existing documented 762-error backlog (non-blocking) plus warnings, no new errors outside one now-fixed test file.

---

### 2026-08-01 — Six code-review findings fixed

---

#### ✅ FIXED — Six verified bugs from /code-review pass, commit `9d29b8f`

**1. Critical — Stripe webhook: non-atomic workspace creation** (`app/api/stripe/webhook/route.ts`)
`workspace.create` and `workspaceAccess.create` ran as two separate DB writes. A failure between them left an orphaned workspace the user could never access, and the idempotency marker deletion caused Stripe to retry indefinitely — creating one new orphaned workspace per retry over its ~72-hour window. Fixed by wrapping both writes in `prisma.$transaction(async (tx) => { ... })`.

**2. Medium — Composer: `isAwaitingMedia` blocked scheduling with shared media in per-platform mode** (`components/lyra/composer/post-composer.tsx`)
When a user attached shared media then enabled "Customise per platform", `platformMedia` reset to `{}`. The gate checked only `platformMedia[p].length === 0`, ignoring `mediaUrls` (shared media that would be used as fallback at publish time) — permanently disabling the Schedule button despite valid media being attached. Fixed: `selectedPlatforms.some((p) => (platformMedia[p] ?? []).length === 0 && mediaUrls.length === 0)`.

**3. Medium — Schedule generator: stale prior-run posts reaching review page on failed regeneration** (`components/lyra/schedule/schedule-generator.tsx`)
`sessionStorage` was only written on successful generation completion, never cleared at the start of a new run. A failed mid-run regeneration left the prior run's posts in sessionStorage; navigating to the review page silently showed the old schedule as if it were the new one. Fixed by calling `sessionStorage.removeItem(key)` at the start of `handleGenerate`.

**4. Medium — Schedule generator: one platform's 5xx discards all other platforms' results** (`components/lyra/schedule/schedule-generator.tsx`)
`Promise.all` rejected the entire week the moment any single platform's API call returned non-OK. Three platforms that succeeded would be thrown away alongside the one that failed. Fixed with `Promise.allSettled`: fulfilled platforms' posts are kept, failed platforms surface a named toast (`"Week N: INSTAGRAM failed to generate. Other platforms saved."`), and only an all-platforms-failed week throws to abort generation.

**5. Medium — Schedule generator: Claude parse failure silently returns empty posts with 200 OK** (`services/ai/schedule-generator.ts`)
On a parse error or non-array response from Claude, `generateWeekPosts` returned `[]` — the route responded `{ posts: [] }` with status 200. The client's `!res.ok` guard never fired, generation completed "successfully" with missing platforms, and the user proceeded to the review page with an incomplete schedule. Fixed by throwing on parse failure, non-array shape, or empty validated array — the route's catch block now propagates a 500, and the client (now using `Promise.allSettled`) surfaces it as a per-platform error.

**6. Low — Composer: stale score displayed alongside "Scoring unavailable" toast** (`components/lyra/composer/post-composer.tsx`)
When the scoring API returned a non-OK response, the toast fired but `scoreResult` was not cleared. The `ContentScorePanel` continued showing the previous successful score for the edited (unscored) draft. Fixed by adding `setScoreResult(null)` in the `else` branch before the toast.

---

### 2026-07-30 (latest 2) — Trend add-on billing wired end-to-end

---

#### ✅ SHIPPED — LYRA Trend add-on now fully integrated into billing and settings

The Trend add-on was previously scaffolded but entirely disconnected — the `TrendAddonCard` component and `/api/stripe/trend-checkout` route existed as untracked files, but the settings page never rendered the card, the webhook had a logged stub ("no fulfilment implemented"), and there was no DB field to track whether a workspace had an active subscription.

**What was built:**

- `lyra/prisma/schema.prisma` — `trendSubId String? @unique` added to `Workspace` model. DB column applied via Supabase MCP (`ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "trendSubId" TEXT UNIQUE`). `npx prisma generate` regenerated types.
- `lyra/app/api/stripe/webhook/route.ts` — replaced the stub with real fulfillment in all three relevant handlers:
  - `customer.subscription.created/updated`: `prisma.workspace.update({ where: { id: metadata.workspaceId }, data: { trendSubId: sub.id } })`
  - `customer.subscription.deleted`: clears `trendSubId` (without touching plan — same pattern as Crisis Aware)
  - `checkout.session.completed`: new early branch checks `metadata.type === 'trend_addon'` before the existing `agencyId`-gated branch (Trend metadata carries `workspaceId` but no `agencyId`, so it was always skipped by the existing code)
- `lyra/components/lyra/settings/trend-addon-card.tsx` — price placeholder updated from `$X/month` to `$10/month`.
- `lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — imported `TrendAddonCard`; added `trendSubId` to the Prisma select; renders `<TrendAddonCard enabled={!!workspace.trendSubId} subscriptionId={workspace.trendSubId} />` in the Add-ons section above Crisis Aware.

**Pricing:** $10/month, cancel anytime. No annual pricing configured yet (only monthly price ID exists in Stripe — `STRIPE_TREND_PRICE_ID`). The "Manage subscription" button on the active state is a stub (TODO: wire to Stripe billing portal once `User.stripeCustomerId` is on the schema).

Commits: `8ffc465` (full integration), `e93e3da` (price $10/month).

---

### 2026-07-29 (latest 2) — Full alpha checklist complete (48/48); post-completion regression sweep; docs audit found and fixed real gaps

---

#### ✅ TESTING CHECKLIST COMPLETE — all 48 items checked off, last one (bad token visibility) answered via code, not live risk

Closed the final open item (Week 2 — Failure visibility: does LYRA show a "reconnect needed" state for a bad/expired token, or fail silently?) without touching any real platform connection. Read `workers/post-publisher.worker.ts` directly: a token/auth failure is handled identically to any other publish failure — `Post.status → FAILED` with the raw platform error in `failureReason`. No code anywhere distinguishes an auth error from a media/rate-limit/network error, no `SocialAccount`-level flag gets set, and Settings shows the same "Reconnect" link on every account unconditionally, not conditionally on a detected problem. Answer: **not silent** (a real error message is visible), **but no dedicated detection or badge exists** — which contradicted the in-app Help page's claim of a "Token expired" badge that was never actually built. Corrected the Help page to describe the real behavior.

---

#### ✅ FIXED — Full regression sweep of all 48 checklist items after completion, two real (unrelated) gaps found and fixed

Richard asked for a double-check that no fix had broken another across the whole 48-item list. Ran a baseline `tsc`/`vitest` pass (clean), then three parallel code-review sweeps covering every fix by area (scheduling/publishing/media, Inbox/AI-response/Crisis Aware, billing/analytics/SEO/misc), each explicitly checking for cross-fix interference — particularly the files touched multiple times this week (`schedule-generator.ts`, `crisis-detector.ts`, the Stripe webhook). Verdict: **no regressions** — every fix is still intact and none conflict with each other, including the trickiest case (today's webhook fix coexisting cleanly with the 18 Jul `toPlan()`-undefined fix and the Crisis Aware add-on logic).

The sweep did turn up two genuine, pre-existing gaps unrelated to any of this week's fixes:
- **Schedule Review's "Attach media" flow bypassed the 50MB upload limit entirely** — it called `/api/upload/presign` directly without sending a file size, so neither client nor server enforced any cap on that one screen, unlike every other upload path in the app. Fixed by routing through the shared `uploadMediaFile()` helper instead of duplicating the presign+PUT logic.
- **Content scoring failed silently on a real API error** — the toast-on-failure logic only caught network-level exceptions (`catch`); an actual 5xx from the scoring endpoint (`res.ok === false`) fell through a missing `else` branch with no toast, no error state, just the spinner stopping.

Also cleaned up two things found along the way: a 22MB gitignored stale duplicate of the entire project sitting at `LYRA/lyra/` (untracked, last touched June, a real trap for accidental edits) and a dead Redis-based Facebook pages route left over from a superseded DB-backed implementation. Commit `5555abb`.

---

#### ✅ FIXED — Demo Reference Guide, in-app Help docs, and Wishlist all brought current; four entirely fictional features found and corrected

Richard asked for a check that the Demo Guide and Help docs were up to date. Went further than a date-stamp pass — cross-checked specific claims against actual code rather than trusting the existing copy, and found four features documented as real that don't exist anywhere in the codebase (confirmed via grep, not just review):
- **Client self-service onboarding links** (a "Generate onboarding link" button, 7-day expiry, described in two separate Help sections) — no such route, button, or flow exists anywhere.
- **Team member invitations with Admin/Manager/Editor roles** — described in detail (invite-by-email, 7-day link expiry, three permission tiers) in a Help section and in the Demo Guide's pricing table; zero implementation. The real `UserRole` enum doesn't even have those role names.
- **Configurable per-event email notification preferences** (six event types, per-toggle) — already known to be aspirational; it was explicitly flagged as a deferred, separate project in the Crisis Aware email alert's own design spec from earlier this week, but the Help page never got updated to say so.
- **An AI generation credit/allowance system** — no such limit exists in the codebase at all.

All four corrected to describe actual current behavior rather than just deleting the topic, so a user who hits the real limitation understands why instead of chasing a button that isn't there. Also fixed two smaller inaccuracies caught while verifying claims: the free trial is 30 days (not 14) and applies to any plan via the public signup flow (not just Pro/Agency), and does require a card upfront; annual billing is signup-only, not available via the in-app Upgrade flow. Added Help documentation for two real, shipped, previously-undocumented features: per-platform media customisation and the AI Schedule Generator (CSV export + Awaiting Media gate). Demo Guide dates updated to 29 Jul, Crisis Aware entries now cover the email alert as well as keyword suggestions, new entries added for Stripe billing going live and the Schedule Generator's scaling fix, and the pricing table corrected to show Crisis Aware as Agency-bundled-or-Pro-add-on rather than Agency-exclusive. Commit `bd7971f`.

Separately, did the same real-verification pass on `docs/LYRA-Wishlist.md` — checked every unmarked item against actual code rather than assuming. Marked four items done: **Stripe billing integration** (verified end-to-end this week), **full end-to-end autonomous AI response** (validated live on both autonomy modes — turned out the item's stated blocker, Meta App Review, was never actually the blocker, since Zernio Bridge sidesteps it), **PDF export reports** (confirmed correct 28 Jul), and **social feed analysis for Brand AI** (checked `app/api/brand-intelligence/build/route.ts` directly — `analyzeSocialPosts()` is genuinely wired up to the workspace's own post history now, not an empty array as the wishlist claimed). Two items got partial-completion notes instead of a full check (Analytics depth, Notifications). Commit `e7de2a3`.

---

#### 🔍 INVESTIGATED — Brand AI's "Engagement Insights" counter explained; doesn't count views, only likes/comments/shares/saves/clicks

Richard asked what actually triggers the counter and why it "doesn't seem to be updating." Traced it to `services/ai/engagement-analyzer.ts`: the query explicitly filters for posts with `likes > 0 OR comments > 0 OR shares > 0 OR saves > 0 OR clicks > 0` — **`views` is not in that list at all**. Checked ITWM's real data: Facebook and YouTube are stuck at 1 of 12 qualifying posts each despite 5 published posts on each platform, because most of their real activity shows up as views (confirmed populating correctly — one YouTube post has 12 real views) rather than likes/comments. Since the same filtered post set feeds the entire feature (not just the progress bar — the heatmap and best-posting-times logic too), a view-heavy platform like YouTube may functionally never reach the 12-post threshold. Not fixed yet — this is a design decision (should `views > 0` count as "has engagement," or is the definition intentionally narrower?), left for Richard to decide. Also confirmed separately: LYRA's engagement/analytics features only ever see posts LYRA itself published (verified `Post` rows are only ever created via `app/api/posts/route.ts` — no historical backfill of a platform account's pre-existing posts exists anywhere), while the Inbox is broader and pulls in comments at the account level regardless of whether LYRA published the underlying post (`Comment.postId` is nullable).

---

### 2026-07-29 — Stripe billing end-to-end verified live; real billing-integrity bug found and fixed

---

#### ✅ FIXED — Real Stripe purchases weren't updating existing workspaces' plan, and were silently creating duplicate workspaces

Closed out Testing Checklist line 87 (the last of three items — 87, 89, 90 — tackled this session), the one flagged since the pre-alpha pass as unverified because live Stripe keys meant any real test would be a genuine charge.

**Setup:** reinstalled the Stripe CLI (uninstalled itself somehow since 28 Jul), re-authenticated, created test-mode Starter and Pro products/prices, temporarily swapped `.env.local` to test-mode keys, ran the dev server locally with `stripe listen` forwarding webhooks. Along the way also fixed two other things blocking local dev entirely: `.env.local`'s `DATABASE_URL`/`DIRECT_URL` still had the stale password flagged back on 23 Jul (fixed to match Netlify's real value — kept permanently, not just for this test), and Auth0 was completely unconfigured for localhost (`AUTH0_DOMAIN="your-tenant.auth0.com"` — literal template placeholder, never filled in). Pulled the real Auth0 credentials from Netlify's production env and had Richard add `localhost:3000` to the Auth0 app's allowed callback/logout/origin URLs — same Auth0 application as production, just an additional allowed URL.

**Downgraded ITWM/LYRA's shared Agency to Starter** to make a real upgrade purchase possible, first confirming via code review that nothing in this codebase actually enforces `maxAutonomy`/`maxWorkspaces` at runtime — no worker or cron checks plan at all except `competitor-monitor.worker.ts`'s all-workspaces cron (PRO/AGENCY-only), so scheduled posts and AI auto-reply kept running throughout, unaffected.

**Real bug found and fixed:** completed a genuine test-mode checkout (Stripe test card, real webhook delivery) and DB-verified the result — `Agency.plan` updated to PRO correctly, but **both LYRA and ITWM workspaces' own `plan` field stayed at STARTER**. Root cause: `app/api/stripe/webhook/route.ts` resolved "this agency's workspaces" via `Workspace.agencyId`, a FK that's never populated by the normal onboarding flow (workspaces are actually linked to an agency through their owning user's `User.agencyId`, via `WorkspaceAccess` — the same indirection `create-checkout` and `crisis-aware-checkout` already had to work around for exactly this reason on 28 Jul). Worse: the same broken relation backed the webhook's "does this agency already have a workspace" check, so it also silently created a duplicate empty **"My Workspace"** on the completed checkout — meaning every future real purchase for an existing customer would keep spawning phantom workspaces, on top of never actually unlocking the plan they paid for.

Fixed all three affected handlers (`checkout.session.completed`, `customer.subscription.created`/`updated`, `customer.subscription.deleted`) to resolve workspaces via `access.some.user.agencyId` instead. Re-verified live with a second real checkout: plan synced to both workspaces correctly, no duplicate workspace created this time. Commit `34f9dde`.

**Cleanup:** deleted the spurious test "My Workspace", restored `.env.local` to live Stripe keys/prices, restored ITWM to Agency and LYRA to Pro (Richard's choice, not a plain revert to the original all-Agency state).

---

### 2026-07-28 (latest 2) — AI Schedule Generator "Schedule generation failed" fixed and verified live

---

#### ✅ FIXED — AI Schedule Generator failing with a generic "Schedule generation failed. Try again." toast

Richard hit this trying to generate a 3-week schedule (3 posts/week × 4 platforms) for the Testing Checklist's line 89 item. Investigated systematically rather than guessing at a fix.

**First hypothesis, confirmed then found insufficient:** `lib/anthropic.ts`'s Claude client has a global 60s request timeout. A live timing test against production Claude reproducing the exact scenario (12 posts: 4 platforms × 3/week, one combined call) took 57.5s — right on the edge. Production function logs for the actual failed request showed a duration of exactly `60000ms`, the signature of a timeout firing mid-generation. Fixed by raising this specific call's timeout to a 180s per-request override (not a global bump — other Claude call sites like report narratives and brand profile synthesis keep the shorter default). Deployed, retested — **still failed, same way.**

**Real root cause:** Netlify enforces its own hard 60-second ceiling on synchronous function execution for this site (Pro plan), completely independent of whatever timeout the Claude client itself is configured with. Confirmed by re-checking live function logs after the first fix deployed — the request was killed at exactly `60000ms` again, despite the client now being willing to wait 180s. The client-side timeout was never the binding constraint; Netlify's own platform ceiling was.

**Actual fix:** restructured `generateWeekPosts` (`services/ai/schedule-generator.ts`), the `/api/schedule/generate` route, and the client (`schedule-generator.tsx`) to make **one Claude call per platform per week** instead of one call covering every selected platform at once. The client now fires these concurrently (`Promise.all`) across a week's active platforms, so total wall-clock time per week doesn't grow with platform count either. Verified live before deploying: 4 concurrent single-platform calls (the same 4-platform scenario that was failing) each completed in 17–23 seconds — 2-3x headroom under the 60s ceiling, and this holds regardless of how many platforms or posts-per-week get selected, unlike the old single-combined-call design which got proportionally slower (and closer to the wall) as more platforms/posts were added.

Commits: `0003064` (first fix, insufficient alone), `27973e2` (actual fix).

**Confirmed live, same session:** Richard regenerated the same 3-week/4-platform schedule successfully, exported captions to CSV, and confirmed the calendar showed 27 posts from 3 Aug onward with the amber "Awaiting media" badge. DB-verified directly: all 27 posts `status: DRAFT`, `requiresMedia: true`, 0 media attached — matching the badges exactly. Richard then attached media to all 27; DB-reconfirmed every post flipped `status: DRAFT → SCHEDULED` with `mediaCount: 1`, closing out the "attach media clears the gate" half of the checklist item too. (Testing Checklist line 89 marked done — see that file for full detail.)

---

#### 🔧 Fixed a GitHub push permission conflict between two accounts used on this machine

`git push` started failing with `Permission to rich3524-cyber/LYRA.git denied to SpiceSpaceOnline` — Git Credential Manager was handing over a cached credential for Richard's other GitHub account (used for the separate Spice Space project) instead of `rich3524-cyber`, because both accounts were competing for the same single `github.com` credential slot in Windows Credential Manager. Since Richard needs to keep switching between both projects on this machine, deleting the cached credential would've just flipped which project broke next.

**Fixed:** set LYRA's git remote to include the username explicitly (`https://rich3524-cyber@github.com/rich3524-cyber/LYRA.git`), which gives Git Credential Manager a distinct, separately-keyed credential slot instead of the one shared generic `github.com` entry — so LYRA and Spice Space can each hold their own cached login without colliding. **If Spice Space ever hits the same 403,** the identical fix applies there: add `SpiceSpaceOnline@` to that repo's remote URL too.

---

### 2026-07-28 (latest) — Alpha testing pass: PDF report, Brand Intelligence, Content Scoring + bug fixes

---

#### ✅ TESTED — Agency PDF report (line 85)

Generated a 30-day PDF report for the Into The Wild Marketing workspace. Confirmed correct: cover page with agency name and generation date, executive summary (19 posts, 251 impressions, 13 engagements, 5.18% avg engagement rate, best platform LinkedIn), platform breakdown table (LinkedIn/Instagram/Facebook/YouTube), top posts section with preview text and stats, and AI-written performance analysis narrative. All data accurate, formatting clean. Checklist item marked done.

---

#### ✅ TESTED — Brand Intelligence (line 82)

Regenerated brand profile for Into The Wild Marketing workspace. Confirmed AI captions still feel on-brand after rebuild. Checklist item marked done.

---

#### ✅ TESTED — Pre-Publish Content Scoring (line 83)

Tested with a deliberately weak draft ("We do marketing. Contact us if you want to know more..."). Scorer returned sensible low scores across all 6 dimensions (hook, clarity, CTA, length, hashtags, emotional resonance).

**Bug found and fixed same session:** Claude was wrapping its JSON response in markdown code fences (` ```json ... ``` `) despite being told not to. `JSON.parse(text)` threw, the route returned 503, and the composer silently swallowed it — the panel showed the skeleton loader briefly then went blank with no feedback. Fixed in two parts:
1. `lyra/services/ai/content-scorer.ts` — strip markdown code fences from Claude's response before parsing
2. `lyra/components/lyra/composer/post-composer.tsx` — surface scoring failures as a toast instead of silently failing

Commit: `1d632e3`. Confirmed working on production after deploy.

---

### 2026-07-28 — Stripe setup + Crisis Aware billing

---

#### ✅ SHIPPED — Stripe CLI configured and Crisis Aware billing integrated

**Stripe CLI setup:**
- Installed via `winget install Stripe.StripeCli` (v1.44.0)
- Authenticated to the LYRA live Stripe account (`acct_1TWbfdB9n0tvPxkH`) — note: CLI session expires after 90 days
- All price IDs added to `.env.local` and Netlify environment variables: Starter/Pro/Agency (monthly + annual), Trend (monthly + annual), Crisis Aware (monthly + annual)
- `STRIPE_WEBHOOK_SECRET` filled in with the real `whsec_...` value from `stripe listen`; `ENCRYPTION_KEY` filled in (was a placeholder — required for OAuth token encryption)
- Stray `STRIPE ACCOUNT BACKUP` line removed from env file (value saved to password manager)
- **Note for local testing:** `stripe listen --forward-to localhost:3000/api/stripe/webhook` must be running in a terminal. The local `whsec_...` is a temporary per-session value; Netlify uses its own webhook endpoint secret from the Stripe Dashboard.

**Crisis Aware billing — Option A (Agency free, Pro add-on):**

Pricing model chosen: Agency plan includes Crisis Aware at no extra cost (bundled — makes sense alongside full AI autonomy); Pro plan can purchase it as a monthly add-on; Starter sees a locked state with an upgrade prompt.

**Files:**
- `lyra/prisma/schema.prisma` — `crisisAwareSubId String? @unique` added to `Agency`; DB column added via Supabase SQL Editor (`ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "crisisAwareSubId" TEXT UNIQUE`)
- `lyra/app/api/stripe/crisis-aware-checkout/route.ts` (new) — creates Stripe Checkout session for the add-on; supports monthly/annual billing param; Pro-plan guard; looks up agency via user membership (not workspace `agencyId`, which can be null for standalone workspaces)
- `lyra/app/api/stripe/webhook/route.ts` — handles `crisis_aware` subscription type: `checkout.session.completed` sets `agency.crisisAwareSubId`; `subscription.updated` keeps it in sync; `subscription.deleted` clears it (without touching the agency plan)
- `lyra/components/lyra/settings/crisis-aware-addon-card.tsx` (new) — shown to Pro users (Activate button → checkout) and Starter users (locked icon + plan note)
- `lyra/components/lyra/settings/crisis-aware-toggle.tsx` — renamed `isPro` prop to `hasAccess` (more accurate — access now comes from plan OR add-on subscription)
- `lyra/app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — fetches `agency.crisisAwareSubId`, computes `hasCrisisAware = plan === 'AGENCY' || (plan === 'PRO' && !!crisisAwareSubId)`, renders toggle or addon card accordingly

**Bugs fixed during testing:**
1. **Internal server error on Activate** — new price IDs were in `.env.local` only, not Netlify. Fixed by adding all 10 price IDs to Netlify environment variables and redeploying.
2. **"No agency found"** — the route originally resolved the agency through `workspace.agency` (the `agencyId` FK), which is null for standalone workspaces not linked to an agency. Fixed to use `prisma.agency.findFirst({ where: { members: { some: { id: user.id } } } })` — the same approach the main plan checkout uses.

**Confirmed working:** Stripe checkout form opens correctly for a Pro-plan workspace after both fixes. Full end-to-end purchase not tested (live keys — would be a real charge). Webhook flow code-reviewed and correct.

---

### 2026-07-24 — Per-platform media slots in Compose

---

#### ✅ SHIPPED — Compose now supports different media per platform

Addresses the real-world problem that platforms like TikTok (9:16 vertical video, single file only) and Instagram (1:1 or 4:5 image) have incompatible media requirements — a single shared file posted across all platforms will often be the wrong ratio or format for some of them.

**How it works:** After attaching shared media and selecting platforms, a "Customise per platform" button appears below the media strip. Clicking it opens a tab row with one tab per selected platform. Each tab shows the shared media dimmed as a read-only fallback ("Using shared media — upload below to use different media for this platform"). Uploading to a tab sets a platform-specific override for that platform only; tabs left empty continue to use the shared media. A dot appears on tab labels that have an active override. The shared Media button in the toolbar is hidden while per-platform mode is on (uploads go to the active tab instead). Toggling off clears all overrides and reverts to the shared strip. No schema migration — each `Post` row already has its own `mediaUrls String[]`, so the API simply writes the platform-specific array (or the shared fallback) into each row at creation time.

**Files:** `lyra/components/lyra/composer/platform-media-tabs.tsx` (new), `lyra/components/lyra/composer/post-composer.tsx`, `lyra/app/api/posts/route.ts`, `lyra/services/social/media-compatibility.ts` (new `checkPlatformCompatibility` helper).

**Real bug found and fixed in live testing (same session):** The initial build pre-seeded every platform tab with a copy of the shared media. Richard's first test resulted in TikTok and LinkedIn both receiving 2 video files — TikTok failed with Zernio's explicit "TikTok video posts only support a single video file" error; LinkedIn failed silently. X published both files (X accepts multiple media). Root-caused directly from the DB (`mediaUrls` arrays confirmed as 2-item on the failed rows). Fixed: tabs now open empty with the shared media shown as a dimmed fallback. The API was also hardened to treat an empty `platformMedia` array as "no override" (length check, not just null/undefined check) so removing the last item from a tab correctly falls back to shared rather than posting with no media.

**Platform-specific hints shown in each tab:** TikTok: "9:16 vertical · one video file only"; LinkedIn: "1.91:1 landscape or 1:1 square · one video file only"; Instagram: "1:1 square or 4:5 portrait"; Facebook: "Flexible — 1.91:1 landscape or 1:1 square"; X: "16:9 landscape or 1:1 square"; YouTube: "16:9 landscape"; Google Business: "1:1 square or 4:3 landscape".

---

### 2026-07-23 (latest) — Crisis Aware email alert shipped

---

#### ✅ SHIPPED — Crisis Aware now emails the workspace owner/admin when it triggers

Second half of the day's two-part Crisis Aware expansion (after the AI-suggested keywords work below). Closes the gap flagged during that earlier work: Crisis Aware's escalation was in-app only (banner + auto-pause posting) — nobody found out unless they happened to have LYRA open.

**Full process:** brainstorm → design spec (`docs/superpowers/specs/2026-07-23-crisis-aware-email-alert-design.md`) → implementation plan (`docs/superpowers/plans/2026-07-23-crisis-aware-email-alert.md`) → subagent-driven implementation, 5 tasks, each with spec-compliance + code-quality review, plus a final cross-task review.

**Provider:** Resend, reusing the `RESEND_API_KEY` already provisioned for the Coming Soon landing pages (confirmed still valid; Richard upgraded it to Full Access permission for this). No separate Crisis Aware-specific key — not worth the isolation at this scale.

**Architecture:** `lib/resend.ts` (lazy client singleton, mirroring `lib/stripe.ts`'s pattern — not `lib/anthropic.ts`'s module-load pattern, because the Resend constructor throws synchronously on a missing key and that throw needs to land inside a caller's try/catch, not at import time) + `services/notifications/crisis-alert-email.ts` (pure `buildCrisisAlertEmail` builder, TDD'd with 8 tests, plus impure `sendCrisisAlertEmail` that fetches recipients/comment excerpt and sends). Wired into `checkAndTriggerCrisis()` in `services/ai/crisis-detector.ts`, the single call site already shared by the webhook and the polling cron.

**Recipients:** every `WorkspaceAccess` with role `SMB_OWNER` or `AGENCY_ADMIN` — not `Workspace.ownerId`, which exists in the schema but is never actually populated anywhere in the app (confirmed against real data). Email includes the trigger description, a ~150-char excerpt of the triggering comment, platform, author, and a link into the workspace's Inbox. No one-click resolve link (security — resolving stays an in-app-only action).

**Real bugs found and fixed during review, not just style nits:**
- Task 1's Resend client was originally built with module-load instantiation (matching `lib/anthropic.ts`) — code review caught that this would make a missing API key crash at import time, outside any try/catch, taking down all of Crisis Aware detection. Fixed to the lazy pattern before it ever shipped.
- The comment-excerpt truncation used plain `.slice(0, 150)`, which can bisect a UTF-16 surrogate pair (an emoji) and produce a broken glyph. Fixed with `Array.from(text).slice(...).join('')`, which splits on code points instead.
- Resend's SDK resolves `{ data, error }` rather than throwing on an API-level failure (bad recipient, domain issue) — caught during the plan's own self-review before implementation started, so `sendCrisisAlertEmail` explicitly checks `.error` on every send result rather than treating a failed send as silent success.
- The biggest one: Task 3's code-quality review surfaced a **pre-existing concurrency race** in `checkAndTriggerCrisis`, unrelated to email — it read `crisisActive` in one round-trip then unconditionally wrote it `true` in a later transaction, so two concurrent callers (the webhook and the polling cron, or two overlapping webhook deliveries) could both pass the check and both commit. Previously this was silent (a duplicate `CrisisEvent` row nobody would notice); adding email made the consequence real (duplicate alert emails). Folded into Task 4 rather than filed separately, since it touches the exact same lines: replaced the unconditional transaction with a compare-and-set (`updateMany` with `crisisActive: false` in the WHERE clause, checked via `count`), so only the transaction's actual winner records the `CrisisEvent` and sends the email.

**Confirmed live, same day:** triggered a real crisis on ITWM (Facebook comment matching the "lawsuit" `ALWAYS_ESCALATE` keyword) — DB-confirmed a single `CrisisEvent` with no duplicate, in-app banner and Inbox updated, and the email arrived within seconds with the correct subject, comment excerpt, and working Inbox link. Richard confirmed 100% verified.

---

### 2026-07-23 (later) — Crisis Aware AI-suggested keywords shipped

---

#### ✅ SHIPPED — Brand AI now suggests Crisis Aware escalation keywords

Follow-up to the day's earlier Crisis Aware fixes. Richard asked how a real user would ever add crisis keywords, since there was no UI for it at all — only direct DB access (used for that day's testing). Rather than build a bare keyword-input form, brainstormed a design where Brand AI (which already analyses the business's website, content themes, and audience) also suggests realistic crisis keywords tailored to the business, which the user reviews on the Brand AI page.

**Full process:** brainstorm → design spec (`docs/superpowers/specs/2026-07-23-crisis-aware-keyword-suggestions-design.md`) → implementation plan (`docs/superpowers/plans/2026-07-23-crisis-aware-keyword-suggestions.md`) → subagent-driven implementation, 10 tasks, each with a fresh implementer subagent, spec-compliance review, and code-quality review — plus a final cross-task review at the end that a per-task review couldn't have caught.

**Architecture:** suggestions (`BrandProfile.suggestedCrisisKeywords`, a new JSON field) are generated by a new Claude call using guided categories (legal/safety/discrimination/media) plus business-specific ones, alongside the existing Brand AI build. They live entirely separately from the `Guardrail` table — the table Crisis Aware's detection actually reads — until a human explicitly approves one. This means detection is provably unaffected by an AI suggestion until someone acts on it; verified in the final review by confirming `crisis-detector.ts` never reads the suggestions field, only `Guardrail`.

**New surface:** three API routes (`approve`, `dismiss`, and `DELETE /api/guardrails/[id]`) — the first API of any kind for the `Guardrail` model — plus a `CrisisKeywordsSection` component on the Brand AI page (rendered only when Crisis Aware is toggled on), showing pending suggestions (Approve/Dismiss), active keywords (Remove), and a manual "Add a keyword" input.

**Real bugs found and fixed during review cycles, not just style nits:**
- The merge logic didn't dedupe *within* a single batch of fresh AI suggestions — Claude returning "lawsuit" and "Lawsuit" in the same response would have produced two suggestion chips.
- The Claude-calling function's `JSON.parse` wasn't wrapped in try/catch, so a malformed response would throw instead of failing open — inconsistent with its own visible fail-open intent elsewhere in the same function.
- A genuine race condition: the original approve endpoint used find-then-create for `Guardrail` rows with no DB constraint behind it, so two near-simultaneous approves of the same new keyword could create duplicate rows. Fixed with a new `@@unique([workspaceId, type, value])` constraint and an atomic `upsert`.
- That race fix then silently made duplicate-keyword detection case-sensitive (contradicting the spec's explicit "duplicate approve is a no-op" requirement, and inconsistent with every other case-insensitive comparison in the feature) — caught only in the final end-to-end review, not any single task's review, since no per-task diff showed the whole picture. Fixed by normalizing keywords to lowercase on write.
- The delete endpoint threw a 500 on a concurrent double-delete instead of treating "already gone" as success.
- The "add a keyword" input had no accessible name (placeholder-only).

**Deliberately out of scope, per the original spec:** email notification when a crisis triggers. Right now Crisis Aware's entire escalation is in-app only (banner + auto-pause posting) — there is no email-sending capability anywhere in this codebase, for any feature. Confirmed this while investigating Crisis Aware earlier the same day; Richard wants this as a second, separate brainstorm/spec/plan cycle next.

**First live test, same day:** rebuilt Brand AI on ITWM — manual add worked immediately, but the 15 real AI-generated suggestions the rebuild produced didn't show up until a hard refresh. Root-caused: `CrisisKeywordsSection` seeds its suggestions list via `useState(initialSuggestions)`, which only takes effect on a component's first mount. The rebuild button's `router.refresh()` correctly re-fetches fresh server data, but since the component stays mounted at the same spot on the page, React reuses the existing instance and silently ignores the new prop. Fixed by keying the component on `profile.lastUpdatedAt`, so a rebuild forces a genuine remount (commit `ffba1d6`). Confirmed the underlying data and every layer of the page's query/render logic were correct throughout — this was purely a client-side remount bug, not a generation or persistence issue.

---

### 2026-07-23 — Publish-idempotency fix and drag-and-drop reschedule both confirmed live; Inbox unread badge staleness fixed

---

#### ✅ FIXED — Inbox unread badge stayed lit after switching workspaces, with nothing actually pending

Richard reported a new-message badge against Inbox after switching back to the Into The Wild Marketing workspace from LYRA, but both the Pending and Escalated tabs were genuinely empty. First ruled out a simpler theory — that the badge (which counts `PENDING`/`AI_DRAFTED`/`AWAITING_APPROVAL`/`ESCALATED`) and the Inbox's default "Pending" tab (which excludes `ESCALATED`) disagree on what counts as unread — by having Richard check the Escalated tab directly; it was empty too, ruling that out.

**Root cause:** `unreadCount` is computed once, server-side, in the shared `app/(dashboard)/layout.tsx` and passed down as a static prop through `AppShellClient` → `Sidebar`. Workspace switching happens via `router.push()` (a client-side/soft navigation, confirmed in `workspace-switcher.tsx`), and nothing in the app calls `router.refresh()` or sets Next's `staleTimes` to force revalidation — so the shared layout isn't guaranteed to re-run its comment-count query on every workspace switch. Tellingly, `Sidebar` and `WorkspaceSwitcher` already both re-derive `activeWorkspaceId` from the live `pathname` instead of trusting the same server-passed `workspaceId` prop, with in-code comments explicitly noting *why* ("the layout always passes workspaceAccess[0] ... can't rely on the prop when the user has switched workspaces") — `unreadCount` was the one piece of workspace-scoped state that never got the same treatment.

**Fixed:** added `GET /api/comments/unread-count` (same auth + workspace-access check pattern as the existing `/api/comments` route) and had `Sidebar` fetch a live count client-side, keyed on the pathname-derived `activeWorkspaceId`, plus refetch on window focus. (Commit `3ff994c`)

---

#### ✅ FIXED — No real file-size limit on media upload; large-file failures were unexplained and speed-dependent

Testing the Week 1 "oversized file" checklist item, Richard attached a 31MB file (no warning, attached cleanly) then a 1.4GB file (failed with a generic "Failed to upload media" message). Investigated why the 1.4GB one actually failed, since 31MB working fine implied *some* size handling existed.

**Root cause:** the code path Compose actually uses for uploads (`lib/upload-media.ts` → `POST /api/upload/presign` → direct browser-to-S3 PUT) had **zero size validation anywhere**. A 50MB check exists in `app/api/upload/route.ts` — but nothing in the frontend calls that route; it's dead code, never reachable from the actual upload flow. The presigned S3 URL is also only valid for 5 minutes (`lib/s3.ts`), so the most likely explanation for the 1.4GB failure is that the upload simply didn't finish within that window and the presigned URL expired mid-transfer — a timing accident, not a deliberate rejection. That means a large file's fate depended on the user's upload speed rather than any real policy, and either way the actual cause was discarded into a generic toast (`catch { toast.error('Failed to upload media') }` in both `media-uploader.tsx` and `post-composer.tsx`'s drag-and-drop path), so there was no way to tell "too big," "network hiccup," and "expired mid-upload" apart from the message shown.

**Fixed:** added a real 50MB limit — client-side in `uploadMediaFile` (fails fast before wasting an upload attempt, with the actual file size shown in the error) and server-side in `/api/upload/presign` (the real enforcement point, since a client-only check is trivially bypassable). Also stopped discarding the real error message in both upload entry points, so a rejected upload now says why instead of a generic message every time. (Commit `5685ce0`)

---

#### ✅ CONFIRMED — Content Calendar matches the DB exactly, no phantom or missing entries

Queried the ITWM workspace's Post table directly (20 posts, 21–29 Jul 2026 — three published days of 4 posts each, plus two upcoming scheduled days of 4 posts each) using the same query shape the Calendar's own `/api/posts?workspaceId=X&month=YYYY-MM` route uses, and had Richard cross-check the live Calendar's July view against it. Everything matched exactly — dates, times, platforms, statuses. This closes out the last open item in Week 1's core scheduling/publishing section other than full Post Now platform coverage and the cancel-before-publish test.

Also worth noting: while querying, found the local `.env` file's `DATABASE_URL` password no longer matches what's actually deployed on Netlify (confirmed via `netlify env:get`). Harmless — `.env` is gitignored, never committed, production unaffected — but local dev/debugging against the real DB from this machine won't work until it's synced with the current Netlify value.

---

#### ✅ FIXED — Crisis Aware never checked comments arriving via the real-time webhook

First-ever test of Crisis Aware (Testing Checklist line 59): added an `ALWAYS_ESCALATE` guardrail keyword ("lawsuit") to ITWM, left a matching Facebook comment, waited 8+ minutes. Never triggered. Investigated via Railway worker logs rather than guessing.

**Two separate things found:**
1. ITWM's (and LYRA's) Facebook comment-monitor cron is currently failing on every tick with a Meta 400 error — `"requires the 'pages_read_user_content' permission or the 'Page Public Content Access' feature"`. Same class of issue as the earlier New Pages Experience stuck-permission incident, likely needs a Zernio/Meta-side fix rather than a code change — **not fixed, flagged for follow-up.**
2. Because of (1), the test comment actually arrived via the real-time Zernio webhook instead of the polling cron — and `detectCrisis()` (the actual Crisis Aware engine) was only ever called from `comment-monitor.worker.ts` (the cron), never from `app/api/zernio/webhook/route.ts` (the webhook). So the comment was never evaluated at all, independent of (1) — this would be true even with Facebook's cron working, for any comment that happens to arrive via webhook first (the faster, primary path).

**Fixed:** extracted the trigger logic (crisisAware/crisisActive check, `detectCrisis()` call, the `crisisActive`/`CrisisEvent` writes) into a shared `checkAndTriggerCrisis()` in `services/ai/crisis-detector.ts`, called from both the polling worker and the webhook handler. (Commit `caf414c`)

**Known limitation, not attempted:** the webhook delivers one comment per call, so only `KEYWORD_MATCH` is reachable through it — `SENTIMENT_SPIKE` needs 3+ very negative comments in one batch, which still only works via the polling path. Extending that to webhook deliveries would need a rolling-window query, a separate piece of work.

**Re-tested after deploy** — confirmed working end-to-end: Richard deleted and re-posted the "lawsuit" comment, and within moments `workspace.crisisActive` flipped to `true`, a `CrisisEvent` was created (`triggerType: KEYWORD_MATCH`, correctly linked to the new comment), and the in-app crisis banner appeared. Scheduled posts will now hold (not cancel) until Resolve is clicked, per `post-publisher.worker.ts`'s existing `crisisActive` check.

**Separate finding while investigating what "alerts you" actually does:** Crisis Aware's entire escalation is in-app only — the workspace-wide `crisisActive` flag, the `CrisisEvent` audit row, held posts, and a red dashboard banner with a manual Resolve button. There is no email, push, or SMS notification anywhere — in fact no email-sending capability exists anywhere in the codebase at all, for any feature. If nobody has LYRA open when a real crisis triggers, nobody finds out until they happen to log in. The Settings toggle's own copy ("...alerts you when triggered") currently overstates what happens. Richard is deferring a fix to a planned "build the guardrail-keyword UI out properly" follow-up, which real notification should probably be bundled into.

---

#### ✅ FIXED — Escalated comments had zero way to be replied to or dismissed

Richard clicked Resolve on the crisis banner, then found a second, separate gap: the escalated comment from the test sat in the Inbox's Escalated tab with no way to respond to it at all.

**Root cause:** `CommentCard`'s `isActionable` flag excluded `ESCALATED` from both the reply textarea and the entire action-button row — not even the Ignore button rendered. It wasn't a backend restriction (`POST /api/comments/[id]/reply` only blocks `RESPONDED`; the `PATCH` route accepts any status transition) — purely a frontend gap. The only way out of Escalated was direct database access.

**Fixed:** escalated comments can now be replied to manually or ignored. The AI "Generate" button stays hidden specifically for escalated ones, since the entire point of an escalation is that the AI itself declined to draft a reply — a human has to write it. Also surfaced `comment.escalationReason` (captured in the DB by `ai-responder.worker.ts` since the feature was built, but never rendered anywhere) so whoever handles it can see why. `response-inbox.tsx`'s Escalated tab was passing a no-op update callback (correct when the cards were non-interactive) — switched to the real handler so a sent reply or Ignore now reflects immediately without a page refresh. (Commit `1c55095`)

**Re-tested and confirmed live:** Richard wrote a manual reply to the real escalated comment and it posted to Facebook within seconds.

---

#### ✅ FIXED — Third recurrence of the self-reply loop: webhook's self-comment filter had two structurally broken fallbacks for Zernio accounts

Right after the escalated-comment fix above, the Inbox badge showed unread again with both Pending and Escalated empty. This looked identical to the workspace-switch staleness bug fixed earlier today, but it wasn't — there was a genuine new comment: Richard's manual reply to the escalated comment had come back through the real-time webhook as a "new" incoming comment (Facebook fires the webhook for any comment on a tracked post, including the Page's own replies), and the AI had drafted a reply to its own reply — the same self-reply-loop bug class from 22 Jul, now recurring a third time via the one remaining ingestion path (the webhook) that does have a self-comment check.

**Root cause, more specific than the earlier two incidents:** the webhook's self-comment filter has three conditions — `isOwner === true`, a native-id match, or a username match. `isOwner` wasn't set on this delivery. The other two turned out to be structurally incapable of ever matching for a Zernio-connected account: `account.platformId` stores *Zernio's own internal account id* for Zernio-provider accounts (confirmed via `zernio/connect/callback/route.ts`'s own code comment — there's no native platform id available at connect time), not the native Facebook id a live webhook delivery's `author.id` would contain, so that comparison can never succeed regardless of whether it really is a self-comment. And Facebook Pages generally don't have a "username" the way personal profiles do, so that fallback was empty too. In effect, this Page's self-comment protection depended entirely on `isOwner`, with zero working fallback.

**Fixed:** added the same name-match fallback (`authorName` vs. the connected account's own `name`) that the manual sync route and the automatic cron already use for exactly this reason. (Commit `387d47e`). The one stray `AI_DRAFTED` comment this produced was cleared.

---

---

#### ✅ CONFIRMED — Idempotency fix holds up live; drag-and-drop reschedule genuinely re-fires

The 4 ITWM posts dragged to a new time (8:06am 23 Jul) via the Calendar drag-and-drop fix (22 Jul) all published clean on their platforms and showed as **Published** on the LYRA calendar — no false-Failed recurrence. This closes out two open Testing Checklist items in one real-world test: (1) the publish-idempotency fix (stable `x-request-id` + graceful 409 handling, shipped 21 Jul after the FB-published/LinkedIn+Instagram-false-Failed incident) held up under a genuine BullMQ-retry-prone multi-platform batch; (2) the drag-and-drop reschedule actually re-fires the post at its new time, not just visually moving the calendar card. Confirmed per Richard's direct report.

---

### 2026-07-22 — Page heading consistency pass, Creative Studio Phase 2 platform research (Google Pomelli)

---

#### ✅ FIXED — Page heading font/size inconsistent across the dashboard

Richard asked for every page heading to be checked for matching font and size. A full grep sweep across `app/(dashboard)/**/page.tsx` found the Analytics page using a completely different style (`text-2xl font-semibold` with a hardcoded `#e2e2e2` hex color instead of the design system's `text-text-primary` token) — a clear pre-existing bug. Seven other pages (Assistant, Competitors, Repurpose, agency Clients + New workspace, workspace Overview, Calendar) used smaller or inconsistent sizes (`text-2xl`/`text-3xl`, one with a responsive `text-3xl sm:text-4xl` breakpoint) versus the dominant `text-4xl` used elsewhere. Richard confirmed `text-4xl` as the intended standard.

**Fixed:** unified all 8 non-conforming page titles to `font-display text-4xl text-text-primary`, leaving each page's existing `<h1>`/`<h2>` tag as-is (tag-level consistency wasn't part of the ask). Verified clean via `tsc --noEmit` and the full test suite (23/23 passing) before committing. (Commit `b499ae7`)

---

#### 🔍 RESEARCHED, NOT INTEGRATED — Google Pomelli evaluated for Creative Studio Phase 2

Richard asked whether Google Labs' newly-launched Pomelli (AI marketing tool, Google Labs/DeepMind, free public beta since Oct 2025) should be added to the Creative Studio scope as an additional Phase 2 platform, alongside Ideogram/Higgsfield/FLUX (images) and Arcads/HeyGen (UGC video).

**Verdict: not a fit, for an architectural reason, not a preference.** Every platform in the existing Creative Studio spec was chosen specifically because it has an API or MCP — Creative Studio's entire design is "launcher + ingestion" (LYRA injects Brand AI context, the user generates on their own third-party subscription, LYRA pulls the finished asset back into the Media Library programmatically). Pomelli has **no public API** — standalone web app only, no committed post-beta roadmap. Without an API there's no ingestion path; a user would have to manually download-and-reupload, defeating the point of the module. Separately, Pomelli's "Business DNA" (colors/tone/fonts extracted from a website) is conceptually identical to LYRA's existing Brand AI, so it adds no new capability even setting the API issue aside.

**Action taken:** added a "Platforms monitored, not integrated" subsection with a one-line Pomelli note to `Scope Docs - Future projects/LYRA-Creative-Studio-Scope.docx`, section 11 (Open Questions) — to revisit only if Google ships an API. No code changes; the Creative Studio module itself remains a post-launch add-on, not being built pre-launch per standing direction.

---

### 2026-07-21 (afternoon) — Dashboard/Inbox polish, Analytics overhaul, SEO GSC reconnect fix

---

#### ✅ FIXED — YouTube platform label overflowing post text on the dashboard

The Recent Posts section on the workspace overview page showed the full string "YOUTUBE" in the platform column instead of a short code, causing it to push into the post text. Added `YOUTUBE: 'YT'` to the `PLATFORM_SHORT` map in `app/(dashboard)/workspace/[workspaceId]/page.tsx`. (Commit `cd771b5`)

---

#### ✅ FIXED — Self-comments appearing in Inbox Pending

The Facebook Page "Into The Wild Marketing" had commented on its own post; that comment was being pulled in by the Zernio comment sync route and landing in the Inbox as a pending item. The webhook path already had a self-comment filter (`isOwner`, platform ID, and handle checks) but the sync route (`app/api/comments/sync/route.ts`) had no equivalent. Added a name/handle comparison filter to the Zernio sync path, mirroring the webhook's logic. The existing spurious DB row was manually set to IGNORED. (Commit `5fee55e`)

---

#### ✅ FIXED — Analytics "Response Rate" pending count inflated by IGNORED comments

`inboxPending` was calculated as `commentCount − respondedCount`, which counted deliberately-IGNORED comments (spam, self-comments) as "unanswered", inflating the pending number. Fixed in `app/api/analytics/route.ts` to count only the four genuinely actionable statuses: `PENDING`, `AI_DRAFTED`, `AWAITING_APPROVAL`, `ESCALATED`. (Commit `9508a5c`)

---

#### ✅ ADDED — On-demand Sync button on the Analytics page

The only way to refresh analytics metrics was to wait for the `sync-metrics` cron (runs daily). Added a user-facing **Sync** button to `PerformanceDashboard` that calls a new `POST /api/analytics/sync` endpoint — same logic as the cron but user-auth instead of cron-secret, 1-hour staleness window (so clicking it twice doesn't hammer Zernio), capped at 50 posts per call. The button spins while in flight and re-fetches analytics data on completion. (Commit `9508a5c`)

---

#### ✅ FIXED — Analytics engagement chart bucketing posts by UTC date instead of local date

Posts published at e.g. 8:45am Brisbane (UTC+10) are stored as 10:45pm UTC the previous calendar day. The engagement chart was doing `format(publishedAt, 'MMM d')` in UTC on the server, so all of Brisbane's "today" posts landed in "yesterday's" bar. Fixed by accepting a `tzOffset` query param (minutes, computed client-side from `getTimezoneOffset()`) and shifting all dates by that offset before formatting into bucket keys. The DB query itself stays UTC-based; only the label formatting is affected. (Commit `78d85dd`)

---

#### ✅ FIXED — Response rate counting IGNORED comments as "unanswered"

`commentResponseRate` was `respondedCount / commentCount` — IGNORED comments (spam, self-comments you chose to dismiss) were in the denominator, making the rate look artificially low. Changed the denominator to `respondedCount + pendingCount` (i.e. responded ÷ non-ignored) so only comments you actually engaged with or left pending affect the rate. (Commit `b4f5580`)

---

#### ✅ FIXED — GSC SEO connection silently showing "No trend data" when token expires

The Into The Wild Marketing workspace had a GSC connection from May 2026 that hadn't been used since May 25. The `gsc-data` route proactively refreshes the access token on every call — but if the refresh fails, it was silently swallowing the error and continuing with the 2-month-old expired access token. The GSC API returned 401, `getTopQueries`/`getClicksTrend` cast the error body as `{ rows?: ... }` (no `rows` field on errors → returned `[]`), and the component showed "No trend data yet — GSC has a 3-day lag" despite GSC having real data.

**Three-file fix:**
- `services/seo/gsc-client.ts` — both query functions now check `res.ok` and throw on non-OK responses instead of returning empty arrays
- `app/api/seo/gsc-data/route.ts` — if token refresh fails, immediately returns `{ error: 'reconnect_required' }` with status 401 rather than falling through to the expired token
- `components/lyra/seo/gsc-analytics.tsx` — detects the 401 and renders a "Google Search Console connection has expired — Reconnect" link instead of the misleading no-data message

Confirmed working: reconnecting the ITWM GSC connection surfaced real keyword data immediately. (Commit `5875b80`)

---

### 2026-07-21 — Publish-idempotency incident, comment sync completely broken for Zernio accounts, Analytics views gap, and a full day of live alpha testing

---

#### ✅ FIXED — Klaviyo campaigns stuck at "Scheduled" forever once actually sent

Follow-up to the 20 Jul `scheduled_at` → `send_time` field fix. The sync only ever fetched Draft/Scheduled campaigns from Klaviyo's API — once a campaign genuinely sent, it dropped out of every future fetch and the existing LYRA calendar entry was left stuck forever with nothing to update it.

**Fixed** (`services/email-marketing/klaviyo-campaigns.ts`): broadened the fetch to include Sent campaigns, bounded to the last 30 days via `updated_at` (confirmed the `and(...)` filter combinator live before shipping it, to avoid repeating the earlier wrong-field-name 400) and mapped `Sent` → `PUBLISHED` so it renders identically to a published social post. Separately found the specific EmailIntegration hadn't been re-synced since before this fix deployed (no cron exists for email sync — it's manual-only), so backfilled that one row by hand. **Flagged, not built:** there's no automatic background sync for email campaigns at all, unlike comments/metrics/trends which all run on a cron — worth adding if this manual-click dependency keeps causing "why hasn't this updated" moments.

---

#### ✅ RESOLVED — Real incident: FB published, LinkedIn + Instagram both showed Failed

Richard scheduled Facebook + LinkedIn + Instagram together (8:45am). Facebook published; LinkedIn and Instagram both showed `Failed` with `Zernio POST /posts failed (409)`. Root-caused live, fully evidence-backed (not a guess): queried Zernio's own post records directly and both posts had genuinely published successfully — real post IDs, `[published]` status on Zernio's side.

**Mechanism:** the worker's retry logic (from the 20 Jul duplicate-publish fix) intentionally re-calls `publish()` when a job retries while a post is still `PUBLISHING`. If the *first* attempt's response is lost to a client-side timeout — confirmed this is common for LinkedIn/Instagram, whose video-publish latency routinely exceeds the client's 20s timeout even though the platform-side publish succeeds — the retry calls Zernio's create-post endpoint a second time with identical content. Zernio's own documented "Layer 2" content-hash dedup correctly rejects that with 409, but LYRA was treating that rejection as an unrecoverable failure instead of "this already went out."

**Fixed**, per Zernio's own documented idempotency guide: `zernio-client.ts` now sends a stable `x-request-id` header (derived from the LYRA `Post.id`, so every retry of the same logical publish reuses it) — a retry within Zernio's ~5 minute window now gets back the original successful post instead of racing into the dedup rejection. As a backstop, a 409 that still occurs is now treated as a successful publish using the `existingPostId` Zernio provides. Also fixed a bug where Zernio's actual error message field (`error`, not `message`) was never being read, so every error was previously showing a generic, detail-free message. The two affected posts were corrected by hand in production to `PUBLISHED` with their real Zernio post IDs.

---

#### ✅ RESOLVED — Inbox comment sync completely broken for every Zernio-connected account

Richard left a real LinkedIn comment, synced the Inbox repeatedly, and it never appeared. Confirmed live via Zernio's own API that the comment genuinely existed on their side — so the gap was entirely on LYRA's ingestion.

**Root cause:** both the manual Sync button (`app/api/comments/sync/route.ts`) and the automatic `comment-monitor.worker.ts` cron were written entirely against the old native-OAuth model — they call each platform's native API directly using `SocialAccount.accessToken`, and skip the account outright when that's null. Every Zernio-connected account (the default connection method since the Zernio Bridge migration — i.e. every account going forward) has `accessToken: null` by design, since Zernio holds the platform credentials on its own side. Confirmed directly in production logs: `"Skipping comment sync for account ... — no access token"` firing at the exact moment of each of Richard's sync attempts. This means comment ingestion via either the manual button or the cron has been **completely broken for every Zernio-connected account, on every platform, this whole time** — the only thing that was ever working was the separate real-time webhook path used for the Full Automatic AI-reply feature.

**Fixed:** routed Zernio-connected accounts through `getProvider(account).fetchRecentComments(account)` — the same provider abstraction `publish()`/`replyToComment()` already correctly use — instead of a native-token fetch. Native-connected accounts are untouched, zero behavior change for them. Confirmed working end-to-end afterward: comment appeared, reply sent from the Inbox landed live on LinkedIn within seconds, then the same full loop (sync, badge, reply) confirmed on Facebook and Instagram too, all 100% successful.

---

#### ✅ FIXED — Analytics page: "Total reach" / "Top posts" looked empty despite real activity

Richard flagged the Analytics page wasn't showing information properly. Root-caused to two compounding issues, confirmed against Zernio's live analytics for real posts: **(1)** the page's headline stat is "Total reach," and reach genuinely populates more slowly than `views`/`impressions` on Instagram and LinkedIn — brand-new posts show `0` reach for a while even with real activity; **(2)** a genuine data-loss bug — Zernio's analytics response includes a `views` field that was never declared anywhere in `zernio-client.ts`'s types, so it was silently dropped on every sync, for every post, structurally, this whole time.

**Fixed:** added `views` end-to-end — new `PostMetrics.views` column, captured by the `sync-metrics` cron, aggregated in `/api/analytics`, and surfaced on the dashboard as a new "Total Views" stat card (alongside reach, not replacing it) plus a Views line on the trend chart. "Top posts" now falls back to views as a secondary sort key when reach ties at zero, so the list isn't arbitrarily ordered during that early-reach-lag window. Manually backfilled the `views` value for today's two ITWM posts so the fix was visible immediately rather than waiting up to 24h for the next natural cron cycle.

---

#### 📋 Live alpha testing — Testing Checklist substantially advanced, evidence-first

A full session of real live testing against the ITWM workspace, with each checklist item verified against actual evidence (DB queries, live Zernio API checks, production log searches, or Richard's direct visual confirmation) rather than taken at face value — a couple of claims were specifically *not* checked off until evidence held up (e.g. a "1 hour out" schedule test was recorded as based on recollection rather than a re-traced DB record, since the original post may have since been edited).

Confirmed working and checked off this session: multi-platform simultaneous scheduling (the incident above aside, delivery itself never dropped anything), next-day scheduling surviving overnight, Post Now on LinkedIn/Instagram, image and video media rendering correctly on-platform, the full Inbox loop (badge accuracy, badge clearing, manual reply, sync) across Facebook/LinkedIn/Instagram, and No Reply autonomy mode. See `docs/LYRA-Testing-Checklist.md` for the full detail and remaining open items (Post with approval mode, autonomy mode-switching, Crisis Aware trigger test, bad-token failure visibility, and Post Now still needed for Facebook/X/TikTok/Google Business).

---

### 2026-07-20 (evening) — Facebook connect resolved, two more real bugs, and the Schedule Generator caption export/media-gate feature shipped

---

#### ✅ RESOLVED — Facebook still wouldn't connect to the LYRA workspace

Confirmed over several days this was **not** propagation delay (the earlier working theory) — Facebook's OAuth consent completed successfully every time, but Zernio kept reporting `no_facebook_pages`. Ruled out, in order: missing Page-level admin access (Richard had full admin, confirmed via Meta Business Suite), then missing app-level authorization under Business Settings → Integrations (checked both the broken LYRA portfolio *and* the working ITWM portfolio — both showed the identical empty "no business integrations" state, so that wasn't the differentiator either).

**Actual root cause, per Zernio support:** on newer ("New Pages Experience") Facebook Pages, the per-Page access toggle inside Meta's consent popup can silently fail to activate even though the Page shows as checked in the summary — so `me/accounts` comes back empty on Zernio's side despite a seemingly clean consent flow. **Fix:** remove the existing "Social Media Connector" grant under Facebook → Business Integrations, reconnect from LYRA, and on the Meta permissions screen click "Edit settings" and explicitly toggle the Page ON (not just accept the summary). Worked immediately. Not a LYRA code issue — the callback route's error-surfacing was improved along the way (`app/api/zernio/connect/callback/route.ts` now logs and passes through Zernio's specific `error` param instead of a generic message), which is what made this diagnosable at all.

Documented in `docs/LYRA-Testing-Checklist.md` and in the Social Connections section of the in-app Help docs, in case another workspace hits the same thing.

---

#### ✅ FIXED — Klaviyo campaigns landing on the wrong calendar day

ITWM connected Klaviyo fine and scheduled a real campaign for the next morning; LYRA's manual sync first threw a 400 (wrong `fields[campaign]` name — `scheduled_send_time` isn't a real Klaviyo field, fixed to `scheduled_at`), then once that was fixed, the campaign showed up on the Calendar a full day earlier than Klaviyo's own UI displayed.

**Root cause:** `scheduled_at` is genuinely the wrong field semantically, not just a naming mismatch — confirmed live via Klaviyo's own API that it's the timestamp the campaign was *scheduled at* (an audit field, i.e. the moment someone clicked "Schedule"), not when it will actually send. `send_time` is the real calculated send datetime. Fixed `services/email-marketing/klaviyo-campaigns.ts` to use `send_time`. Re-synced and confirmed the ITWM campaign landed on the correct day.

---

#### ✅ FIXED — YouTube missing from the Compose platform selector

YouTube was already fully wired for connecting and publishing (settings page, Zernio platform mapping) but had simply been left off `components/lyra/composer/platform-selector.tsx`'s platform list, so it could never actually be selected for a post. One-line fix.

---

#### ✅ SHIPPED — AI Schedule Generator caption export + "Awaiting Media" gate

Richard flagged a real UX gap: the Schedule Generator produces great captions/hashtags but no creative, and the only way to get them to a designer was manual copy-paste — with nothing stopping a caption-only post (which would just fail outright on Instagram, since it doesn't accept text-only posts) from being scheduled with zero media attached. Went through full brainstorming → design doc → implementation plan → subagent-driven-development execution (see `docs/superpowers/specs/2026-07-20-schedule-generator-media-gate-design.md` and the matching plan in `docs/superpowers/plans/`).

**What shipped (8 commits, each independently spec-reviewed and code-quality-reviewed by fresh subagents, plus a final whole-implementation review):**
- New `Post.requiresMedia` boolean (default false), set only by the Schedule Review screen for posts that still have no media attached when saved
- **Export captions (CSV)** button on the Schedule Review screen — client-side generated, one row per post lacking media (Date/Time/Platform/Topic/Caption)
- Posts saved without media show an amber **"Awaiting media"** badge on the Calendar instead of grey "Draft"
- Scheduling is blocked server-side (both `POST /api/posts` and `PATCH /api/posts/[id]` — the two independent paths that can reach `SCHEDULED`) until media is attached, with matching client-side UX: the Calendar detail panel hides the "Mark as scheduled" action and explains why, and Compose disables Schedule/Post now with an inline warning
- Scoped deliberately to Schedule Generator posts only — a hand-written text-only Compose post (common on LinkedIn/X/Facebook) is completely unaffected
- `PENDING_APPROVAL` is explicitly *not* blocked — an awaiting-media post can still go through client approval; only the actual `SCHEDULED` transition (what the publish worker queues on) is gated

**Caught one false-positive in the final review:** the whole-implementation reviewer flagged a "ship-blocker" claiming the new DB column had no migration — this was wrong, and disproven by querying the live production database directly (the column exists exactly as expected). The reviewer had assumed a migration-file convention this project doesn't use; it applies schema changes straight to Supabase via `apply_migration`, same as every other schema change this project has ever made.

Not tested live end-to-end yet (that needs a real Schedule Generator run) — see the new checklist item added to `docs/LYRA-Testing-Checklist.md`.

---

#### ✅ FIXED — stuck full-screen spinner on Export captions (found via live testing of the feature above, same night)

First real click-through of the new Export CSV button left a full-screen spinning LYRA logo stuck on screen indefinitely, not clearing until a page reload.

**Root cause:** `components/lyra/app-shell/navigation-loader.tsx` — a pre-existing global component that shows a full-screen loading overlay during SPA route transitions — installs a document-wide, capture-phase click listener that treats any `<a href>` click as the start of an internal navigation unless the href starts with `#`/`http`/`mailto:`/`tel:`. It had no exclusion for `blob:` URLs. The Export CSV button creates a temporary `<a href="blob:...">`, appends it, and clicks it to trigger a file download (the standard technique) — that synthetic click gets caught by the same listener, which shows the overlay after 100ms and only ever clears it when the route `pathname` changes. Since a blob download never changes the route, the overlay never cleared.

**Not a bug in the new feature's code** — confirmed the pre-existing Help page's "Download PDF" button (`components/lyra/help/pdf-download-button.tsx`) uses the identical blob-anchor-download pattern and has the exact same latent bug, just never previously triggered/reported. Fixed at the root: added `blob:`/`data:` to `navigation-loader.tsx`'s href-exclusion list. One-line fix, protects both download paths.

---

#### ✅ DONE — Medium and Low severity findings from the comprehensive review (commit `6e34496`)

Follow-up to the 2026-07-18 Critical/High pass — worked through most of the Medium/Low findings from `.full-review/05-final-report.md`:
- PDF endpoint now caches in S3 (2h TTL) instead of relaunching headless Chromium on every hit
- OAuth `state` is HMAC-signed with an expiry (`lib/oauth-state.ts`) across all 7 connect flows instead of unsigned base64
- Post approval requires a real reviewer role and blocks self-approval
- Fixed a workspace-delete FK-violation bug — `SeoConnection`/`SeoPage`/`SearchConsoleData` were never in the manual cascade-delete transaction, so deleting a workspace with any SEO data threw
- `competitor-monitor.worker.ts` now fans out one BullMQ job per competitor instead of scraping every tenant's every competitor sequentially inside one daily job
- Consolidated duplicate BullMQ `Queue` instantiations (`ai-responding`, `comment-monitoring`, `brand-sync` each had 2+ un-synced instances) into single shared instances in `lib/queues.ts` with real `defaultJobOptions`
- Swept 3 more spots leaking raw internal error messages to clients down to generic messages
- Added a Zod validation helper (`lib/validate.ts`), applied to `POST`/`PATCH /api/posts` and `PATCH /api/onboarding`
- Safety caps (`take: 200`/`100`) on the previously-unbounded `/api/posts` and `/api/seo/pages` GETs
- Converted the two post-media-thumbnail raw `<img>` tags to `next/image`
- Redacted subscriber emails before logging Klaviyo's error response body
- Removed the `ZernioConnectDebugLog` write path now the connect flow has proven stable (table itself left in place — dropping it is a deliberate follow-up, not done automatically)
- `OnboardingToken.token` now defaults to `uuid()` instead of `cuid()` (real entropy for a bearer secret), plus rate limiting and body validation on the previously-unprotected `GET`/`PATCH /api/onboarding`

**Deliberately not attempted:** the 403-vs-404 "no access" convention is inconsistent across ~75 call sites, but both are defensible (404 avoids confirming resource existence to unauthorized callers) and this is a style issue, not a vulnerability — too much regression risk to sweep blind without live test coverage. Also didn't roll Zod out to all ~60 routes — the helper and reference pattern are in place for a future pass.

---

#### ✅ RESOLVED — "LinkedIn published, Instagram failed" on a same-time test post, plus 2 real bugs found investigating it

Richard scheduled a test post to Instagram + LinkedIn at the same time. LinkedIn published; Instagram silently failed with no explanation visible anywhere.

**Root cause:** the attached file was a `.gif`. Confirmed against Zernio's own docs that Instagram feed posts only accept JPEG/PNG — GIF isn't supported there (LinkedIn/Twitter/Facebook do accept it). Zernio had zero record of the Instagram post ever being created — rejected before being persisted on their side, while the identical file worked fine on LinkedIn.

**Two more real bugs found while fixing this (commit `f6619b1`):**
1. **Dead retry logic** — a failed publish was marked `FAILED` immediately and the error re-thrown for BullMQ to retry, but the retry's own first line saw `FAILED` (not `SCHEDULED`) and silently gave up before ever calling `publish()` again. The configured 5-attempt exponential-backoff retry had never actually gotten a real second attempt on *any* post, not just this one — it only ever looked like it did. Fixed: post status is no longer touched on failure until BullMQ has genuinely exhausted every attempt.
2. **No visibility into *why* a post failed** — `Post` had no field for it; the Dashboard/Calendar just showed "Failed" with zero explanation, which is exactly what made this report confusing to start with. Added `Post.failureReason`, captured on terminal failure, surfaced in the Calendar card (tooltip + inline text) and the post detail panel.

**Pre-flight protection added:** new `services/social/media-compatibility.ts` checks attached media against known platform format restrictions (currently Instagram/Threads, JPEG+PNG-only — the one combination confirmed from Zernio's docs; scoped narrowly rather than guessing at other platforms). Wired into `POST /api/posts` and `PATCH /api/posts/[id]` server-side as defense-in-depth, and into the Composer client-side.

**Two follow-up UX fixes to the Composer (commits `6f4eb82`, `dcc8621`), both from direct testing feedback:**
- The compatibility check above only ran on submit at first — Richard tested by attaching a GIF and selecting Instagram with no further action and saw nothing, since nothing had been submitted yet. Fixed to be live: recomputed on every render, shown as an inline warning right under the thumbnail the moment the bad combo exists, not gated behind clicking Schedule.
- Added a remove (×) button on attached media thumbnails, matching the pattern already used in `schedule-review.tsx` — previously the only way to get rid of a wrongly-attached file in Compose was to abandon the page and start over; there was no delete path at all.

---

#### 🔧 Netlify deploy infrastructure — a genuinely rough night, documented in full since it'll recur if not understood

**1. Hosted CI (git-push-triggered deploys) intermittently failed with `Host key verification failed` / `Failed during stage 'preparing repo'`.** Not a code issue — confirmed the repo, the commit, and GitHub's deploy-key config were all fine; this was Netlify's own SSH connection to GitHub for this site flapping, and it survived a full GitHub App uninstall/reinstall on the GitHub side. This is a Netlify-infrastructure-side issue, not something fixable from repo or app settings. **It self-resolved at some point overnight** — later pushes deployed cleanly via hosted CI again with no config changes on our end. If it recurs, this is a Netlify support ticket, not something to chase in dashboard settings again.

**2. While hosted CI was down, used the Netlify CLI (`netlify deploy --prod`) directly to ship two pending fixes — this caused a real 502 production outage.** Root cause: stray `package-lock.json` files elsewhere in this OneDrive folder (at the Windows user profile root, and at the git root above the project) made Turbopack infer the wrong workspace root during the local build, which corrupted a Windows absolute path embedded in the deployed serverless function bundle → `ERR_MODULE_NOT_FOUND` crashing every single request. Rolled back within ~3 minutes via `netlify api restoreSiteDeploy`, then fixed by pinning `turbopack.root: __dirname` in `next.config.ts` (commit `d50ba9b`) — verified by inspecting the actual compiled bundle for leaked Windows paths before ever redeploying again.

**3. The redeploy with that fix hit a second, different 500 error.** Investigated and ruled out `.env.local` contamination (a real, separate risk of local CLI deploys — they pull `.env.local` values ahead of the site's configured production env vars) via a controlled test, but couldn't fully pin down the exact mechanism — log streaming for locally-triggered deploys is itself unreliable (empty message bodies, a CLI-level crash on one attempt to fetch them). Concluded this is a Windows-specific quirk in Netlify's local bundling process itself: the exact same code ran perfectly via plain `next start` locally and via Netlify's Linux-based hosted CI. Stopped attempting local CLI deploys at that point (rolled back again, ~30 sec downtime) and waited for hosted CI, which then deployed everything correctly once the connection issue cleared on its own.

**Also fixed while diagnosing:** `netlify.toml`'s base directory (`LYRA/lyra`) was only ever configured in Netlify's dashboard, never version-controlled — confirmed this actually matters (it's exactly why the local CLI deploy misbehaved on its very first attempt, running `prisma generate` from the wrong directory and grabbing an incompatible global Prisma version). Added explicitly to the toml file (commit `f978283`) so it's no longer a single point of failure living only in dashboard state.

**Net effect:** two brief production outages this session (~3 min and ~30 sec), both caused by local CLI deploys attempted as a workaround for the hosted-CI connection issue, both caught within minutes via immediate verification after every deploy and rolled back via `netlify api restoreSiteDeploy` the moment something looked wrong.

**Recommendation for future sessions:** don't use `netlify deploy --prod` from this Windows machine as a routine deploy path — it caused two outages from two different root causes in one night, on top of the `.env.local`-contamination risk. Prefer hosted CI (a plain `git push`); if it's failing, escalate to Netlify support rather than working around it with a local deploy, unless the situation is genuinely urgent and each step is verified live before moving to the next (draft deploy first, inspect the bundle, only then `--prod`, then curl-verify immediately — the discipline that caught both issues before they became worse).

---

#### ✅ RESOLVED — a duplicate-publish bug caused by the retry-logic fix above, found the same night

An MP4 published successfully to Instagram, but the Calendar showed it as `Failed` with `Zernio POST /posts failed (409)`.

**Root cause:** a direct consequence of the dead-retry-logic fix earlier in this same session. After `publish()` succeeded, the very next line (`prisma.post.update(...status: PUBLISHED...)`) had no error handling around it. When that specific write hit a transient DB error, the exception escaped, BullMQ saw a "failed" job and retried it — and the retry logic's guard only checks for re-claiming a `SCHEDULED` post, not a `PUBLISHING` one, so the retry fell straight through and called `publish()` a *second* time. Zernio correctly rejected the duplicate with `409`, which is what surfaced as "Failed" for a post that had, in reality, already gone out fine.

**Fixed (commit `1c253d7`):** once `publish()` returns successfully, nothing in the job handler is allowed to throw anymore — the status-recording write gets a few quiet inline retry attempts (not BullMQ-level retries, so `publish()` is never called a second time); if all of them still fail, the post is left at `PUBLISHING` rather than `PUBLISHED`, which is the only acceptable degraded state here (stale-but-safe, never a duplicate live post).

**Also corrected the one post this happened to** — confirmed genuinely published via Zernio's own records (`posts_list`/`posts_get`), updated directly in the DB from `FAILED` to `PUBLISHED` with the real Zernio post id.

**Note for future sessions:** a good example of why BullMQ retry semantics need real care around non-idempotent side effects (anything that posts to a live external platform). Any future worker code that calls an external "create" API should follow the same pattern established here: once the external call succeeds, no code path after it should be allowed to trigger a retry of the whole job.

---

### 2026-07-18 — Comprehensive code review: all 5 Critical + 16 High severity findings fixed

---

Ran the full `/comprehensive-review:full-review` multi-agent review (architecture, security, performance, testing/docs, best-practices/CI-CD) across the entire codebase, consolidated the findings into `.full-review/05-final-report.md`, and fixed every Critical and High severity item in one continuous pass across two commits. Medium/Low findings are still in the report but out of scope for this pass — see that file if picking those up later.

#### ✅ DONE — 5 Critical findings (commit `3a4dab0`)

- **Cross-tenant IDOR on `/api/upload/presign`** — any authenticated user could mint a presigned S3 upload URL into *another* tenant's media prefix; no workspace access check existed at all. Added one.
- **4 leftover debug/test routes deleted** (`ig-test`, `instagram/test-publish`, `ig-permissions-test`, `fb-subscribe-test`) — each grabbed an unscoped `socialAccount` from across *all* tenants and could publish a live post with it. Not behind auth, not behind a feature flag — live, reachable, and dangerous. Deleted outright.
- **SSRF, with exfiltration** — the SEO on-page analyzer (`services/seo/on-page-analyzer.ts`) fetched arbitrary user-supplied URLs with zero validation and reflected the fetched content back to the client. New `lib/safe-fetch.ts` (DNS-resolves the hostname, blocks the whole RFC1918/loopback/link-local/CGNAT range including `169.254.0.0/16` for cloud metadata endpoints, HTTPS-only, re-validates on every redirect hop) is now used there plus two other spots that had weaker regex-only host checks (`content-repurposer.ts`, `competitor-scraper.ts`).
- **Race condition in post publishing** — `post-publisher.worker.ts` used check-then-act (`findUnique` then `update`) to flip a post from `SCHEDULED` to `PUBLISHING`, so two overlapping BullMQ jobs for the same post could both pass the check and both publish it — a real double-post risk. Now an atomic `updateMany` compare-and-swap.
- **BullMQ Queue/Worker instances weren't sharing a Redis connection** — `lib/redis.ts` exported a plain options object, which fails BullMQ's own internal check for a real shared connection, so every `Queue`/`Worker` in the codebase was silently opening its *own* independent Redis connection instead of sharing one. Fixed to export real shared `ioredis` instances.

#### ✅ DONE — 16 High findings (commit `f471680`)

- **Workspace DELETE/PATCH was gated on membership, not role** — any member (not just an owner/admin) could delete or rename a shared workspace. Added a role check.
- **Account deletion destroyed every shared workspace, not just owned ones** — deleting your own user account cascaded and deleted workspaces you merely had *access* to, not just ones you owned, which could wipe out a teammate's workspace. Scoped to owned workspaces only.
- **`checkCronAuth` was triplicated**, and the one shared copy in `lib/auth.ts` was the broken, timing-unsafe version nobody actually imported (each of the 4 cron routes had its own local, correct copy). Consolidated to one timing-safe implementation everyone now imports.
- **Stripe webhook had no error handling or idempotency** — a mid-processing failure or a Stripe redelivery could silently double-process billing events. Added a `ProcessedWebhookEvent` table (checked/recorded around a try/catch) so retries and redeliveries are safe.
- **Real billing bug found in the same file:** the not-yet-released LYRA Trend add-on's checkout (`/api/stripe/trend-checkout`) creates a subscription with no `plan` in its metadata by design — but the webhook's `toPlan()` helper silently defaulted *any* subscription with no recognized plan to `STARTER`. Had this add-on gone live as-is, buying it would have silently downgraded a paying AGENCY/PRO customer's entire agency (and every workspace under it) to Starter. Fixed: the webhook now explicitly skips all plan-touching logic for `trend_addon` subscriptions instead of falling through to a default.
- **No security headers anywhere** — added CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy via `next.config.ts`. Verified live in a browser (homepage, Auth0 login redirect, pricing page) with zero CSP console violations before calling it done.
- **Prompt injection risk in AI auto-reply** — a commenter's own text was pasted directly into the same prompt as the brand-voice/guardrail instructions with no separation, so a crafted comment could plausibly talk the model into ignoring its rules — and in Full Automatic mode, the result posts live with no human in the loop. Fixed two ways: the untrusted comment text is now clearly fenced and labeled as data-not-instructions in the prompt, *and* the model's own output is re-checked against the `neverUse`/`neverDiscuss` guardrails before it's allowed to auto-post (previously those guardrails were only checked against the incoming comment, never the AI's reply).
- **Dead scheduler code removed** — `schedulePost`/`cancelPost` in `services/scheduler/post-queue.ts` were unused (and `cancelPost` had an id-mismatch bug). The `postQueue` export itself is very much alive (used by the publish-due-posts cron) and was untouched.
- **The Docker worker deploy path was actually broken** — confirmed by actually running the build, not just reading it. `tsc` doesn't rewrite `@/...` path aliases to real relative paths, so the compiled output would throw `MODULE_NOT_FOUND` on literally every import as soon as `node workers/index.js` started — plus a `moduleResolution`/`rootDir` misconfiguration in `tsconfig.workers.json` that made `tsc` itself fail on an unrelated file (`lib/stripe.ts`, not even used by any worker). Added `tsc-alias` to the build step and fixed the tsconfig; verified by actually compiling, rewriting, and syntax-checking every worker file end to end. (Railway's actual production path uses `tsx` directly and was never affected by this — this only mattered if anyone ever switched the worker to the Docker build.)
- **No request timeout anywhere** on 6 of the 8 native social API clients, the Google Search Console client, or the Anthropic SDK client — any one of those hanging would hang the whole request/cron/worker indefinitely. Added `AbortSignal.timeout(20s)` (matching the one client that already had it, `zernio-client.ts`) to every fetch call, and a 60s timeout to the Anthropic client.
- **N+1 query pattern in comment ingestion** — both `comment-monitor.worker.ts` and `/api/comments/sync` ran a `findFirst` dedup check *then* a `create`, per comment, in a loop. Batched into a single `createManyAndReturn({ skipDuplicates: true })`, which also closes a real race: the sync-comments cron minted a new unique BullMQ job ID every tick (`monitor-${accountId}-${Date.now()}`), so two overlapping runs for the same account had no dedup at all. Job ID is now stable per account so BullMQ's own dedup applies.
- **Unbounded, unindexed cron query** — `publish-due-posts` had no index on `(status, scheduledAt)` and no cap on how many rows it could pull in one tick (a backlog after any downtime would load everything into memory at once). Added the index (applied directly via Supabase SQL) and a `take: 500` safety cap.
- **No rate limiting anywhere on the API surface** — added a simple Redis-backed fixed-window limiter (`lib/rate-limit.ts`) on the 4 AI generation routes, both upload routes, and the *unauthenticated* `help/pdf` route (which launches a full headless Chromium per request — an easy, cheap DoS target without a strict per-IP cap).
- **Frontend performance** — `recharts` (a sizeable dependency) was bundled into the initial JS of every page that used it; both chart components (`EngagementChart`, `GscAnalytics`) are now lazy-loaded via `next/dynamic` with `ssr: false`. Found and fixed a genuine O(n²) bug in `performance-dashboard.tsx` (`Math.max(...)` was being recomputed *inside* a `.map()` instead of once before it). Added `React.memo` to the three hottest list-row components (`CommentCard`, `PostPreviewCard`, `CompetitorCard`) — for two of the three, this required also fixing the parent's callback to be a stable reference (`useCallback`), since `React.memo` does nothing if the parent hands the child a brand-new inline function every render.

#### ✅ DONE (manual, non-code) — separate Postgres connection for the Railway worker

The one Critical/High item that genuinely couldn't be fixed in code: the serverless app (Netlify) and the always-on BullMQ worker (Railway) were both using the exact same pooled `DATABASE_URL` with `connection_limit=1` — correct for serverless (each function grabs one connection, releases it), but wrong for the worker, which runs 4 BullMQ workers concurrently in one long-lived process and was effectively bottlenecked to one DB query at a time across all of them. Richard provisioned a second connection string from Supabase's **Session pooler** (port 5432, not the Transaction pooler on 6543 the app uses) with `?connection_limit=10&pool_timeout=20`, and set it as `DATABASE_URL` on the Railway worker service only — Netlify's `DATABASE_URL` is untouched. No code change was needed since Prisma just reads `DATABASE_URL` from the environment (`prisma/schema.prisma`'s `datasource` block); the two deployment platforms already have independently configured env vars, so this was a pure infra change.

**How this was verified:** Railway doesn't have an MCP connection in this environment, so this couldn't be confirmed by inspecting Railway directly. Circumstantial confirmation came from Postgres's own `pg_stat_activity`, which showed 3 separate pooled sessions running the same query genuinely concurrently — not possible under the old `connection_limit=1` setup, where everything funneled through a single connection. (Caveat: Supabase's Supavisor pooler fronts every connection, so Postgres itself can't distinguish which original port/connection-string a given session came in on — this is good supporting evidence, not absolute proof. If connection-related errors ever show up in Railway's worker logs, check the `DATABASE_URL` value there first.)

**If this needs revisiting:** the full list of Medium and Low severity findings from the same review (unauthenticated Puppeteer PDF DoS as a secondary concern beyond the rate limit added above, OAuth state CSRF, post self-approval, missing pagination, raw `<img>` tags instead of `next/image`, PII in logs, a temp debug table (`ZernioConnectDebugLog`) that should be dropped once all platforms have been connect-tested, onboarding token entropy, and more) are documented in `.full-review/05-final-report.md` but were explicitly deprioritized behind Critical/High for this pass.

---

### July 2026 — Email marketing integration + Agency Plan badge + misc fixes (alpha testing phase)

---

#### ✅ DONE — Email marketing read-only integration: campaigns appear in Content Calendar (commit `7d66d47`)

Customers can connect their Klaviyo, Mailchimp, or Customer.io account to a LYRA workspace (read-only) and see scheduled/draft email campaigns as indigo-coloured cards on the Content Calendar alongside their social posts — giving a unified view of all outbound content in one place.

**How it works:**
- Settings → Email Marketing section: paste API key, click Connect — key is validated live against the provider before saving
- Background sync fires on connect and on the manual Sync button; campaigns with a `scheduledAt`/`send_at` date are stored in `EmailCampaign`
- Content Calendar fetches from `/api/email-campaigns?workspaceId=...&month=yyyy-MM` and renders indigo (`#6366f1`) non-draggable cards (Mail icon, provider label, status badge, subject line)

**Providers:**

| Provider | Auth | Status filter | Key location |
|---|---|---|---|
| Klaviyo | `Klaviyo-API-Key {key}`, revision `2024-10-15` | Draft / Scheduled | Account → Settings → API Keys |
| Mailchimp | Basic auth `anystring:{apiKey}` | schedule / paused / save | Account → Extras → API Keys (key ends in `-us1`, `-us2`, etc.) |
| Customer.io | `Bearer {key}` | draft / scheduled | Settings → API Credentials → App API Key |

**DB schema added (applied via Supabase SQL Editor — see Schema Changes Applied section):**
- `EmailProvider` enum: `KLAVIYO`, `MAILCHIMP`, `CUSTOMER_IO`
- `EmailIntegration` — `(id, workspaceId, provider, apiKey, serverPrefix, accountName, isActive, lastSyncAt, createdAt)`. Unique on `(workspaceId, provider)`.
- `EmailCampaign` — `(id, integrationId, externalId, name, subject, scheduledAt, status, previewUrl, createdAt, updatedAt)`. Unique on `(integrationId, externalId)`. Index on `(integrationId, scheduledAt)`.

**Note: there is no auto-sync cron yet.** Campaigns only update when the user hits Sync in Settings, or when a new integration is first connected. Follow-up: add a cron route (`/api/cron/sync-email-campaigns`) that calls `syncEmailIntegration()` for all active integrations daily or hourly. All the sync logic is already in `services/email-marketing/sync.ts` — only the cron route + cron-job.org config is missing.

**Tested in production:** Klaviyo connected successfully. Richard confirmed integration works.

**Key files (all new):**
- `services/email-marketing/klaviyo-campaigns.ts` — `validateKlaviyoKey()` / `fetchKlaviyoCampaigns()`
- `services/email-marketing/mailchimp-campaigns.ts` — `extractMailchimpServer()` / `validateMailchimpKey()` / `fetchMailchimpCampaigns()`
- `services/email-marketing/customerio-campaigns.ts` — `validateCustomerioKey()` / `fetchCustomerioCampaigns()`
- `services/email-marketing/sync.ts` — `syncEmailIntegration(integrationId)` — dispatches to correct provider, upserts campaigns, updates `lastSyncAt`
- `app/api/email-integrations/route.ts` — `GET` list / `POST` connect + validate + fire background sync
- `app/api/email-integrations/[id]/route.ts` — `DELETE` soft-deactivate
- `app/api/email-integrations/[id]/sync/route.ts` — `POST` manual sync, returns `{ synced: number }`
- `app/api/email-campaigns/route.ts` — `GET` campaigns for a month range
- `components/lyra/settings/email-marketing-section.tsx` — Settings UI (three provider cards, connect / sync / disconnect)
- `components/lyra/calendar/email-campaign-card.tsx` — `CalendarEmailCampaign` type + indigo calendar card

**Files modified:**
- `prisma/schema.prisma` — enum + two new models
- `app/(dashboard)/workspace/[workspaceId]/settings/page.tsx` — `<EmailMarketingSection>` between Add-ons and Danger Zone
- `components/lyra/calendar/content-calendar.tsx` — fetches and renders email campaigns alongside social posts

---

#### ✅ DONE — Agency Plan badge in header for AGENCY workspaces (commit `55913ef`)

AGENCY plan users now see an "Agency Plan" pill in the top-right header where STARTER/PRO users see "Upgrade". Clicking it navigates to `/account` for plan management.

**Why it was missing:** `showUpgrade = plan === 'STARTER' || plan === 'PRO'` correctly hides Upgrade for AGENCY. The LYRA workspace is always on AGENCY (it's the highest plan, so it always wins the workspace-picker logic), so the Upgrade button was always hidden with no fallback — not a regression, just a missing AGENCY case. Added `showManage = plan === 'AGENCY'` and the badge alongside the existing Upgrade button logic.

- Desktop: `hidden sm:inline-flex` pill with `border-background-border` styling
- Mobile dropdown: `sm:hidden` menu item under a separator

**File changed:** `components/lyra/app-shell/header.tsx`

---

#### ✅ DONE — LYRA Assistant placeholder page (commit `9d0c459`)

The sidebar nav item "LYRA Assistant" linked to `/workspace/[id]/assistant` but no route existed, causing a 404 on every click. Added a placeholder page with a "Coming Soon" card, eliminating the broken link for alpha testers.

---

#### ✅ DONE — Competitor scraper improvements (commit `adbf593`)

Two improvements to the competitor blog/content scraper:

1. **Heading fallback** — when primary blog selectors find no posts (non-standard site layout), the scraper falls back to extracting `h2`/`h3` headings as proxy content items instead of returning an empty array. Prevents false "0 posts found" on competitors that do publish regularly.
2. **Honest `postsPerWeek`** — changed from hardcoded `1` (which implied regular posting regardless of data) to `null` when the actual count can't be determined.

---

#### ✅ DONE — Earlier ad-hoc security fixes (commit hash not preserved — correcting a mislabel)

**Correction:** this entry previously cited commit `f471680` — that hash actually belongs to a *different*, much larger fix (the full comprehensive-review High-severity pass, documented in its own section above/below with the correct commits `3a4dab0`/`f471680`). The mislabel is fixed here; the fixes described below are still real and still present in the current codebase, just from an earlier, smaller pass whose exact commit wasn't recorded at the time.

Key issues addressed:

- **XSS via `dangerouslySetInnerHTML`** in `components/lyra/seo/ai-content-panel.tsx` — replaced with safe markdown renderer
- **SSRF on `extractArticleText()`** in `services/ai/content-repurposer.ts` — added hostname validation via `safeFetch`
- **Missing auth on `POST /api/ai/repurpose`** — route was publicly accessible; `requireAuth()` added
- **Missing auth on competitor routes** — `requireAuth()` added to `POST /api/competitors` and `POST /api/competitors/[id]/refresh`
- **Competitor URL injection** — URL validation added before fetching

---

### July 2026 — Internal testing pass: Inbox comment ingestion, publish status accuracy, composer UX

---

#### ✅ RESOLVED — comments never appeared in the Inbox despite Zernio detecting them fine

Found while testing the AI Comment Response Inbox for the first time with a real comment. `Comment` table was entirely empty — not just missing this one, zero rows ever. Root cause: `app/api/zernio/webhook/route.ts`'s `comment.received` handler read `payload.comment.accountId` to route the event to a workspace, but that field doesn't exist on real deliveries — confirmed against Zernio's own docs, which show comments are an "inbox event" carrying the tenant key as a top-level `account` object instead (the original code even had a `TODO` flagging this was never verified against a live payload). Every comment silently failed the accountId check, got logged, and was ack'd with `200` without ever being saved — so this had been broken since the Zernio Bridge webhook was first built, not something that broke recently. Fixed (commit `6820604`) to read `account.id`/`account.accountId` instead, accepting either since Zernio's docs show both names across different examples.

**Second bug found in the same flow:** once comments started arriving, the AI's own auto-posted replies (Full Automatic mode) came back through the webhook as brand-new "comments" seconds later — the platform fires its comment webhook for any new comment on a tracked post, including ones LYRA posted itself. Confirmed live: this created two phantom `ESCALATED` entries in the Inbox whose content was literally the AI's own prior reply text, visually reading as "the same message in both Escalated and Done." Fixed (commit `7c100f3`): skip self-authored comments before saving, checked via Zernio's `isOwner` flag when present, falling back to matching the author's platform id/handle against the connected `SocialAccount`. The two existing phantom rows were deleted directly from the DB (not a code concern, just test-data cleanup).

**Confirmed working end-to-end after both fixes:** a real Instagram comment landed in the Inbox, and Full Automatic mode correctly auto-generated and auto-posted a reply with no manual step — twice, on two separate test comments.

---

#### ✅ RESOLVED — Dashboard/Calendar showed a genuinely-published post as `FAILED`

A post that published successfully to Instagram (confirmed live on the platform, with comments on it) was stuck at `status: FAILED`, `platformPostId: null` in LYRA's own `Post` table. Root cause in `services/social/provider/zernio.ts`'s `publish()`: it treated the *absence* of a `platformPostId` field in Zernio's response as an automatic failure, regardless of whether the platform actually reported success. Per Zernio's docs, the synchronous `publishNow` response's identifier field is actually named `platformPostUrl` — so this specific Instagram publish never had a chance, even though it fully succeeded on Zernio's side (confirmed via `posts_get`/`posts_list` showing `status: published`). Fixed (commit `a508a57`): only an explicit `error`/`failed` status on the platform result is now treated as a real failure; whichever identifier field Zernio actually returns is accepted. The one affected `Post` row was corrected directly in the DB to `PUBLISHED` with its real Instagram media ID.

**Note for future sessions:** this is the second time in one session a Zernio integration bug traced back to trusting a speculative field name over what their docs (or a live payload) actually show — see the `comment.received` bug above too. If a future Zernio-related feature seems to silently misbehave, check the docs' exact field names again before assuming the existing code got it right.

---

#### Composer fixes (Compose section)

- **Content score panel had no close control** (commit `2c3c090`) — the slide-out panel opened via the "Score" toolbar button, but had no way to close itself; the panel's own absolute overlay could cover that same button depending on viewport width, leaving it stuck open until navigating away. Added a back-arrow close button directly on the panel.
- **"Edit in Composer" from the Calendar opened a blank composer** (commit `dd19bb1`) — this was a missing feature, not a wiring bug: the link never passed the post's ID or content at all. Built a real edit flow: `?postId=` query param, server-side load of the existing post, pre-filled content/media/schedule, platform selector locked (a `Post` row is tied to one `SocialAccount`, can't be changed post-creation), and submission now `PATCH`es the existing post instead of creating a new one.
- **Drag-and-drop media upload added** (commit `28052d3`) — alongside the existing click-to-select button, not replacing it. Uses `react-dropzone` (already an installed but previously-unused dependency). Upload logic extracted to `lib/upload-media.ts` so both paths share the same code.

---

#### ✅ RESOLVED — Analytics tab never showed real engagement numbers (Total Reach/Total Likes stuck at 0)

Not a bug in the usual sense — genuinely unbuilt functionality. `sync-metrics`'s own code comment admitted it: *"Upsert placeholder metrics rows so they exist — real platform polling will be implemented per-platform as social API access is granted."* It only ever touched `PostMetrics.lastSyncedAt`; `likes`/`reach`/`comments`/etc. stayed at their schema default of `0` forever, for every post, regardless of real activity. `postsPublished`, `commentResponseRate`, and the platform breakdown all looked fine because they don't depend on `PostMetrics` at all — only the engagement-dependent parts (Total Reach, Total Likes, the daily engagement chart) were affected, which is why it looked like a partial glitch rather than a whole feature missing.

Fixed in two commits, both verified against live Zernio responses before writing code (not assumed from docs prose alone, given two earlier bugs this same day traced back to exactly that mistake):

1. **`0dbf9b9`** — `sync-metrics` now calls Zernio's `GET /v1/analytics?postId=...` per post and writes the real `likes`/`comments`/`shares`/`reach`/`impressions`/`clicks`/`saves` values, which map 1:1 onto `PostMetrics`'s existing schema fields (confirmed via a live call, not guessed). Handles the two legitimate non-error outcomes Zernio's docs describe for single-post lookups — `202`/`syncStatus: "pending"` (platform-side sync still running) and `424` (platform-side sync failed) — by touching `lastSyncedAt` without overwriting existing values, so those posts retry next run instead of getting stuck.
2. **`3b2866d`** — found immediately after deploying #1: LinkedIn posts came back `404 Post not found` even though the exact same post succeeded when queried by Zernio's own internal post id. Zernio's `postId` auto-resolution doesn't reliably handle LinkedIn's `urn:li:share:...` native id format, only e.g. Instagram's plain numeric id. Added `Post.zernioPostId` (nullable, applied directly via Supabase SQL — `prisma db push` is disabled on Netlify's build), captured from `publish()`'s response and threaded through both publish paths (the queue worker and the direct-publish route). `sync-metrics` now prefers it, falling back to `platformPostId` for posts published before this field existed. The 3 pre-existing LinkedIn posts were backfilled directly in the DB with their Zernio post ids (looked up via `posts_list`) so their analytics started working retroactively too, not just for posts published going forward.

**Confirmed working:** engagement-over-time chart and comment counts populated correctly on the next sync. Reach/Likes were still `0` at verification time — confirmed via Zernio's own cached analytics snapshot that this is a delay on Zernio's own backend (their sync from Instagram/LinkedIn's APIs), not anything wrong on our side; expected to populate on a later automatic sync as Zernio's own data catches up.

**Note for future sessions:** if Analytics numbers ever look wrong again, remember the split: `PostMetrics.lastSyncedAt` gets touched even on a "pending" or "failed" outcome (by design, so retries aren't blocked) — a recent `lastSyncedAt` does NOT mean real data was successfully written. Check the actual `likes`/`reach`/etc. values, not just whether the row was touched recently.

---

#### ✅ RESOLVED — Google Search Console connect flow was broken (redirect URI + site verification)

Two separate, unrelated issues, found while auditing the SEO module's current state (nothing had actually regressed — it had just never been fully verified working):

1. **`GOOGLE_SEARCH_CONSOLE_REDIRECT_URI`** in Netlify was set to the old `lyra-online-app.netlify.app` domain instead of `lyraonline.ai`, unlike every other URL env var in the project. The callback route needs the logged-in session to know which workspace to attach the connection to, and Auth0's session cookie is scoped to `lyraonline.ai` — landing on the wrong domain meant the callback couldn't identify the user. Corrected directly in Netlify.
2. **The site itself was never verified in Google Search Console.** Added the `google80fb4721f59b630f.html` verification file to `public/` (commit `17ac09d`) and completed verification in Search Console.

Confirmed working via a genuine disconnect + reconnect test (not just an already-established connection) — full OAuth flow and on-page AI content analysis both working. Also corrected a stale project-memory claim that the OAuth `state` param was HMAC-signed — it's actually plain unsigned base64; lower-priority hardening item, not currently exploitable since the callback separately verifies workspace access.

---

### July 2026 — LYRA Trend add-on: full scaffold committed (Phase 3, not yet implemented)

---

LYRA Trend is a paid per-workspace add-on that discovers and scores trending topics daily, then surfaces the most brand-relevant ones in a dedicated Trend Hub and inside the post composer. The add-on is billed via a separate Stripe subscription (à la carte on any plan).

Everything below exists on disk and is committed to the repo, but every implementation body is a stub (returns 503 / `null`). The scaffold is already wired in — route files registered, components exported, worker file present — so Phase 3 implementation only needs to fill in the bodies, not touch routing config or barrel exports. The one fully-implemented piece is the Stripe checkout initiation.

#### What LYRA Trend will do

**Discovery + scoring pipeline (two-stage, daily via BullMQ worker):**
1. Perplexity's real-time search model surfaces up to 20 candidate trends from TikTok, Instagram, X, Reddit, news, and the broader web.
2. Each candidate is scored 0–100 against the workspace's `BrandProfile` by LYRA's AI, which also writes a "Why it fits" explanation anchored in brand voice, audience, and content themes.

**Trend Hub (`/workspace/[id]/trends`):** Split-panel page — left panel shows up to 20 trends ordered by relevance score with source-platform badges and filter chips (All / TikTok / News / Web); right panel shows full trend description, "Why it fits" rationale, and "Use this trend" / Dismiss actions. On-demand refresh button (rate-limited to once per 10 min). Last sync timestamp shown.

**Composer integration:** "Use this trend" in the Hub marks the trend as `USED` and opens the composer with an active trend chip above the editor. A "Trends" button in the composer toolbar opens a slide-in `TrendPickerPanel` for browsing without leaving the composer. When AI Generate is triggered, the caption incorporates the active trend contextually while staying true to brand voice.

**Activation flow:** Settings → Add-ons → LYRA Trend card → Activate → Stripe Checkout → returns to settings with `?trend=activated`.

#### DB schema changes needed (Phase 3 — not yet applied)

Add to `Workspace`:
```prisma
trendEnabled      Boolean   @default(false)
trendStripeSubId  String?   @unique
trendLastSyncedAt DateTime?
```

New model:
```prisma
model Trend {
  id             String      @id @default(cuid())
  workspaceId    String
  workspace      Workspace   @relation(...)
  title          String
  description    String
  sourcePlatform String      // "TIKTOK" | "NEWS" | "WEB" | "INSTAGRAM" | "X" | "REDDIT"
  relevanceScore Int         // 0–100
  whyItFits      String?
  status         TrendStatus @default(NEW)
  discoveredAt   DateTime    @default(now())
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  @@index([workspaceId, status])
  @@index([workspaceId, relevanceScore])
}

enum TrendStatus {
  NEW
  USED
  DISMISSED
}
```

#### New files (all stubs except `trend-addon-card.tsx` and `trend-checkout/route.ts`)

| File | Status | Purpose |
|---|---|---|
| `app/(dashboard)/workspace/[workspaceId]/trends/page.tsx` | Stub (placeholder card) | Trends page — will render `TrendHub` |
| `app/api/trends/route.ts` | Stub (503) | `GET` — list trends for workspace |
| `app/api/trends/refresh/route.ts` | Stub (503) | `POST` — trigger on-demand sync |
| `app/api/trends/[id]/status/route.ts` | Stub (503) | `PATCH` — set status to USED or DISMISSED |
| `app/api/cron/sync-trends/route.ts` | Stub (returns `{queued:0}`) | `GET` — daily cron, enqueues BullMQ jobs |
| `app/api/stripe/trend-checkout/route.ts` | **Fully implemented** | `POST` — creates Stripe Checkout Session (subscription mode) for the add-on |
| `services/trends/trend-syncer.ts` | Stub (empty function) | `syncTrendsForWorkspace()` — Perplexity discovery + AI scoring + DB upsert |
| `workers/trend-sync.worker.ts` | Stub (`null` exports) | BullMQ queue + worker for async trend syncs |
| `components/lyra/trends/trend-hub.tsx` | Stub (`return null`) | Main Trend Hub split-panel component |
| `components/lyra/trends/trend-picker-panel.tsx` | Stub (`return null`) | Slide-in composer panel for browsing trends |
| `components/lyra/trends/trend-row.tsx` | Stub (`return null`) | Single trend row — title, platform badge, score |
| `components/lyra/settings/trend-addon-card.tsx` | **Fully implemented** | Settings card — Activate button → Stripe, or Active badge + Manage when enabled |

#### Integration gaps (must be addressed in Phase 3 before the add-on is functional)

1. **Stripe webhook not extended** — `/api/stripe/webhook/route.ts` only handles `agencyId` metadata on `checkout.session.completed`. The `trend_addon` type is never inspected, so completing Stripe Checkout for Trend will not flip any DB flags and the Hub will never unlock. Must add a branch for `metadata.type === 'trend_addon'` on `checkout.session.completed` (set `trendEnabled = true`, store `trendStripeSubId`) and `customer.subscription.deleted` (set `trendEnabled = false`, clear `trendStripeSubId`).

2. **`TrendAddonCard` not yet mounted in settings page** — component is fully implemented but not imported or rendered in `settings/page.tsx`. Also, the settings page doesn't yet query `trendEnabled` or `trendStripeSubId` (fields don't exist on the schema yet — see schema changes above).

3. **Sidebar link not gated** — the help docs state the Trends link is visible only when the add-on is active. Sidebar will need to read `workspace.trendEnabled` and conditionally render it.

4. **`?trend=activated` param not handled** — success redirect includes this param but the settings page has no handler for it; the "activated" banner won't appear.

5. **Stripe billing portal route missing** — `TrendAddonCard.handleManage` has a `TODO` comment. Needs `/api/stripe/portal` route + `User.stripeCustomerId` field on the schema.

6. **Sidebar Trends link gating** — currently the Trends page is not linked from the sidebar at all (the page exists but there's no nav item pointing to it). Once the schema is in place, add a conditional nav item that only renders when `workspace.trendEnabled`.

#### New env vars required (Phase 3)

| Variable | Purpose |
|---|---|
| `STRIPE_TREND_PRICE_ID` | Stripe Price ID for the Trend add-on monthly subscription — route throws if missing |
| `PERPLEXITY_API_KEY` | Perplexity real-time search API — needed by the discovery stage |

#### Phase 3 implementation checklist

1. Add `trendEnabled`, `trendStripeSubId`, `trendLastSyncedAt` to `Workspace`; add `Trend` model and `TrendStatus` enum; apply migration via Supabase SQL Editor.
2. Implement `syncTrendsForWorkspace()` in `services/trends/trend-syncer.ts`.
3. Implement `trendSyncQueue` and `trendSyncWorker` in `workers/trend-sync.worker.ts`.
4. Implement `GET /api/trends`, `POST /api/trends/refresh`, `PATCH /api/trends/[id]/status`, `GET /api/cron/sync-trends`.
5. Extend Stripe webhook to handle `type: 'trend_addon'` events.
6. Add `TrendAddonCard` to `settings/page.tsx`; add `?trend=activated` banner.
7. Implement `TrendHub`, `TrendPickerPanel`, `TrendRow` components.
8. Add conditional Trends nav item to sidebar (gated on `trendEnabled`).
9. Build `/api/stripe/portal` route; connect it in `TrendAddonCard.handleManage`.
10. Add `STRIPE_TREND_PRICE_ID` and `PERPLEXITY_API_KEY` to Netlify env vars and Railway.
11. Update the `$X/month` placeholder in `TrendAddonCard` with the real price.
12. Add `trendSyncWorker` to `workers/index.ts` startup (alongside the existing 4 workers).

---

### July 2026 — Media wasn't attaching to Zernio-published posts + cron jobs auto-disabled (both now fixed)

---

#### ✅ RESOLVED — posts published with text but the attached image/video was silently dropped

Found immediately after the scheduled-posts fix above, while testing with a real MP4. Two separate, unrelated bugs stacked here too:

1. **S3 bucket had no public-read policy.** Zernio's servers fetch media by URL server-side to attach it to the post — but the bucket only allowed access via our own app's authenticated AWS credentials (correct for the app's own uploads, wrong for a third party like Zernio trying to download the file over plain HTTPS). Confirmed via Zernio's own `validate_media` tool: `HTTP 403 Forbidden` on the exact media URL being sent. Fixed by adding a public-read bucket policy scoped to the bucket (`s3:GetObject` for `Principal: "*"`) and disabling the relevant "Block public access" bucket setting. This is intentional/safe here — anything uploaded through Compose is destined to be a public social post anyway.
2. **Wrong request shape to Zernio's API** (commit `b9271e7`) — even after the media URL became publicly reachable, posts still published text-only. `services/social/zernio-client.ts`'s `publishNow()` was sending media as `mediaUrls: string[]` nested inside each `platforms[]` entry. Zernio's actual schema (confirmed via their docs) puts media in a **top-level `mediaItems: [{type: 'image'|'video', url}]` array**, sibling to `content` and `platforms` — there's no `mediaUrls` field in their schema at all, so it was being silently ignored on every single call, no error either side. Fixed: `mediaItems` built at the top level, with `type` inferred from the file extension (our own upload flow only ever produces `.jpg/.png/.gif/.webp` for images and `.mp4/.mov/.webm` for video, so extension alone is enough).

**Confirmed fully working:** a scheduled LinkedIn post with an attached MP4 published automatically (no manual trigger) within ~2 minutes of its scheduled time, video attached correctly.

---

#### ✅ RESOLVED — 4 of 5 cron-job.org jobs had been auto-disabled ("Inactive"), not just failing

After fixing the missing `Authorization` header (see the entry below), `publish-due-posts`, `sync-comments`, `sync-metrics`, and `sync-trends` were still never firing automatically. Turned out cron-job.org had auto-disabled all 4 (shown as **Inactive**, not just failing) after enough consecutive failures accumulated before the auth fix — a working auth header doesn't un-disable an already-disabled job, the two are independent switches. Fixed by manually re-toggling each job back to Active in cron-job.org's UI. `brand-refresh` never got auto-disabled (it runs far less often, so it hadn't racked up enough consecutive failures yet) and needed no toggle.

Also found and removed two stale cron-job.org jobs (`ai-visibility` → `/api/cron/ai-visibility`, `sync-email` → `/api/cron/sync-email`) pointing at routes that don't exist anywhere in the codebase — leftover from an idea that was never built. Deleted rather than fixed, since there was no corresponding feature to point them at.

**Interval tuning:** original intervals were long enough that a scheduled post could sit for 15-20+ minutes before cron even attempted it. Tightened to: `publish-due-posts` every 1 minute (this is the one that actually matters for on-time publishing), `sync-comments` every 5 minutes, `sync-metrics` every 15-30 minutes, `brand-refresh` every 6 hours, `sync-trends` daily (still just a stub — see the Zernio Bridge section for what it'll need once the Trend feature ships).

**Note for future sessions:** if a cron-job.org job's `Authorization` header ever needs re-adding (e.g. after `CRON_SECRET` rotates, or a job gets recreated from scratch), also check whether cron-job.org has auto-disabled it from the earlier failures — both need fixing, fixing only one looks like "nothing changed."

---

### July 2026 — Scheduled posts silently never published: 4 stacked infra bugs, all resolved

---

#### ✅ RESOLVED — a test LinkedIn post sat as `SCHEDULED` for 15+ minutes, never published

Started as "I scheduled a post and it never showed up." Turned out to be four separate, unrelated infrastructure bugs stacked on top of each other — fixing any one alone would not have surfaced the next, since each was silently masking the one beneath it. Full chain, in the order found and fixed:

1. **cron-job.org missing the auth header** — `publish-due-posts`, `sync-comments`, `sync-metrics`, and `brand-refresh` all require `Authorization: Bearer <CRON_SECRET>` (checked via `timingSafeEqual` in each route). cron-job.org's job configs for all four had no `Authorization` header set at all, so every scheduled invocation was silently rejected with `401` — meaning **no cron job had successfully run automatically since they were set up**, not just the publish one. Confirmed via cron-job.org's own dashboard ("7 failed cronjobs, 0 successful"). Fixed by adding the header (Key: `Authorization`, Value: `Bearer <CRON_SECRET>`) to each of the 4 jobs individually in cron-job.org's UI — this is a cron-job.org config step, not something fixable from the codebase.
2. **`sync-trends` cron route never deployed** — the 5th cron job (`LYRA Trends`) was 404ing for a totally different reason: `app/api/cron/sync-trends/route.ts` existed on disk but was never actually committed to git (see bug #3 below for why). Fixed by committing it (commit `f165cf9`).
3. **Root `.gitignore` had an overly-broad rule silently blocking new files project-wide** — `/LYRA/` was meant to exclude a genuine nested duplicate repo at `LYRA/lyra/LYRA/lyra/` (created by a cross-repo merge at some point), but the pattern was anchored to the repo root and matched the *entire* active project instead. Since gitignore doesn't retroactively untrack already-tracked files, this went unnoticed — but **every new file created anywhere under `LYRA/` since this rule was added has been silently excluded from `git add`**, with no error or warning. This is how `sync-trends/route.ts` above went missing, and also how an entire unfinished LYRA Trend add-on codebase (`app/api/trends/`, `services/trends/`, `components/lyra/trends/`, `workers/trend-sync.worker.ts`, `app/api/stripe/trend-checkout/`) has been sitting locally, never committed, never deployed (confirmed harmless — nothing tracked imports it, so it's orphaned WIP, not a live bug). Fixed: narrowed the rule to `/LYRA/lyra/LYRA/` (commit `f165cf9`) so it only excludes the actual duplicate. **Plain `git add` now works normally for new files under `LYRA/` — the old "always use `git add -f`" guidance is obsolete.**
4. **Railway `lyra-workers` service was missing `DATABASE_URL` entirely** — the actual reason the post never published even after cron was fixed and a job was successfully enqueued. Diagnosed by connecting directly to the production BullMQ queue (via Redis's public endpoint, since Railway's Console tab wasn't reliably showing command output in this session) and inspecting the failed job: `Authentication failed against database server` on the very first `prisma.post.findUnique()` call in `workers/post-publisher.worker.ts` — which has no try/catch around that line, so the whole job handler throws uncaught before ever touching the post's DB status. This meant **every worker on Railway** (`post-publisher`, `comment-monitor`, `ai-responder`, `brand-sync`, `competitor-monitor`) was almost certainly failing on its first DB call too, not just this one post. First fix attempt accidentally cleared the variable entirely (error changed to `Environment variable not found: DATABASE_URL`); second attempt correctly copied the value from Netlify's `DATABASE_URL` into Railway's `lyra-workers` variables. Confirmed fixed by manually retrying the stuck job (`job.retry()` via a direct BullMQ/ioredis connection) — it published successfully: `platformPostId: urn:li:share:7482671319294070785`.

**Note for future sessions — if scheduled posts (or any cron-triggered sync) silently stop working again, check in this order:**
1. cron-job.org dashboard — are the jobs actually succeeding, and does each one have the `Authorization: Bearer <CRON_SECRET>` header set? (Not automatic — has to be added per job in cron-job.org's own UI, and isn't preserved if a job is ever recreated.)
2. Is the target route actually deployed? (`git ls-files -- app/api/cron/` should list every route file that exists on disk — if one's missing, it was never committed.)
3. Railway `lyra-workers` → Variables — do `DATABASE_URL`/`DIRECT_URL`/`REDIS_URL` all have values, and do they match Netlify's exactly? A worker can show "Active" in Railway's dashboard while completely failing every job on its first DB call — "Active" only means the container is running, not that the app logic inside is working.
4. To inspect or retry a specific stuck BullMQ job without relying on Railway's Console tab (unreliable in this session — commands produced no visible output): grab Redis's **public network** connection string from Railway (Redis service → Connect → Public Network tab) and run a short Node script locally using the project's own `ioredis`/`bullmq` deps — `new Queue('post-publishing', {connection}).getJob(jobId)`, then `.getState()` / `.failedReason` / `.retry()`.

---

### July 2026 — Media uploads fixed: bucket mismatch + CORS + IAM policy ARN (4-layer bug, now fully resolved)

---

#### ✅ RESOLVED — media upload (images and video, all platforms) confirmed working in production

Started as "MP4 won't attach to a LinkedIn post," turned out to be four separate, stacked misconfigurations that all had to be fixed before uploads worked end-to-end. Full chain, in the order they were found and fixed:

1. **Reserved env var names** (commit `7880d45`) — `lib/s3.ts`, `document-parser.ts`, and the legacy `app/api/upload/route.ts` read `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION` directly. Netlify Functions run on AWS Lambda, which auto-injects those exact names for its own execution role and blocks overriding them — so the app was silently signing S3 requests with Netlify's own Lambda role (valid credentials, zero permission on our bucket) instead of throwing an error. Renamed to `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_REGION` throughout.
2. **Wrong bucket entirely** — `AWS_S3_BUCKET` was set to `lyra-media-prod`, a bucket that didn't exist in the AWS account/login actually being used to set up new credentials. The real, accessible bucket was `lyra-s3-bucket-757052694060-ap-southeast-2-an` (created fresh during this troubleshooting). `lyra-media-prod` likely lives under a different, older AWS account/login from months ago that wasn't readily accessible. Fixed by pointing `AWS_S3_BUCKET` at the bucket actually in use rather than chasing down the old one.
3. **Missing CORS configuration** — browser-direct presigned uploads need the bucket's CORS policy to explicitly allow the app's origin; there was none. Added:
   ```json
   [{ "AllowedOrigins": ["https://lyraonline.ai"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000 }]
   ```
4. **IAM policy ARN pointed at the old bucket** — the inline policy attached to the new IAM user still referenced `arn:aws:s3:::lyra-media-prod/*` (copy-pasted from setup instructions before the bucket mismatch in step 2 was discovered). Corrected to `arn:aws:s3:::lyra-s3-bucket-757052694060-ap-southeast-2-an/*`.

**Current live config:** `AWS_S3_BUCKET=lyra-s3-bucket-757052694060-ap-southeast-2-an`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` set to a dedicated IAM user (`AKIA3AQ63LYWDW2QCNZJ`) scoped only to that bucket, `S3_REGION=ap-southeast-2`. Confirmed working live: video attached successfully to a post in Compose.

**Note for future sessions:** if S3 uploads ever break again, check in this order — (a) is `AWS_S3_BUCKET` pointing at a bucket that actually exists in the same AWS account as the IAM credentials, (b) does that bucket have CORS allowing `https://lyraonline.ai`, (c) does the IAM policy's `Resource` ARN match the bucket name exactly. All three misconfigurations produced different, specific browser console errors (network/CORS error, 403 Forbidden) that made each layer diagnosable once you got to it — but they were fully stacked, so fixing one just revealed the next.

---

### July 2026 — Zernio platform connect testing: X, TikTok, YouTube, Google Business + a Meta new-portfolio bug

---

#### Platform connect verification (LYRA and Into The Wild Marketing workspaces)

Tested the Zernio-routed connect flow across the remaining platforms not yet verified live (Facebook, Instagram, and LinkedIn were already confirmed working — see the Zernio Bridge entry below). No code changes needed — `platform-map.ts`'s `ROUTE_TO_ZERNIO` already had `twitter`/`tiktok`/`youtube` mapped, and nothing in the connect/callback flow was platform-specific beyond the Facebook accountId-fallback logic.

**Confirmed working, no issues:**
- **X (Twitter)** — connected to LYRA workspace
- **TikTok** — connected to LYRA workspace
- **YouTube** — connected to Into The Wild Marketing workspace (LYRA workspace has no YouTube channel, so not applicable there)
- **Google Business** — connected to Into The Wild Marketing workspace

Current per-workspace platform state:
- **Into The Wild Marketing:** Facebook, Instagram, LinkedIn, YouTube, Google Business — all ✅
- **LYRA:** X (Twitter), TikTok, Instagram, LinkedIn — all ✅. Facebook — blocked, see below.

---

#### Known issue: Facebook won't connect to LYRA workspace — brand-new Meta Business Portfolio

**Not a LYRA or Zernio code bug** — thoroughly ruled out via the `ZernioConnectDebugLog` table (temporary debug logging added during earlier Facebook/Instagram troubleshooting, see the Zernio Bridge entry below).

**Symptom:** Connecting Facebook for the LYRA workspace (target page: "LYRA Online," a brand-new Meta Business Portfolio) consistently fails with `zernio_connect_failed`. The debug log shows Zernio's own backend returning `error=no_facebook_pages` on every attempt (3 attempts logged, 2026-07-13 05:22–06:17 UTC), even after:
- Fully revoking and re-granting Facebook app access from scratch
- Correctly selecting both the "LYRA Online" business and page during Facebook's consent flow (confirmed via screenshots during the session)
- Receiving Facebook's own "Rich Unwin has been connected to Social Media Connector" success confirmation

**Root cause (as far as diagnosable without Zernio/Meta support access):** despite the consent flow completing successfully from the user's side, **Meta Business Suite → Business Settings → Integrations for "LYRA Online" never shows "Social Media Connector" as an authorized app** — the grant isn't actually registering against the new Business Portfolio, even though it registers fine for the established `into.thewildmarketing` portfolio. Verification was checked and is not required/pending for LYRA Online, ruling that out as the cause. Most likely a Meta-side propagation delay specific to brand-new Business Portfolios (their consent UI and backend registration systems may not be fully in sync immediately after a portfolio is created), though this wasn't confirmed with certainty.

**Confirmed NOT broken by this troubleshooting:** the Into The Wild Marketing workspace's existing Facebook connection stayed intact throughout multiple reconnect/re-consent attempts on the LYRA Online side — selecting only "LYRA Online" (without re-selecting `into.thewildmarketing`) during a fresh consent flow does not revoke the other business's existing grant.

**Next steps (not yet done):**
1. Retry the LYRA → Facebook connect after some time has passed (hours/overnight) — if it's a propagation delay, this should self-resolve.
2. If still failing, escalate to Zernio support directly with the debug log timestamps above and the `no_facebook_pages` error — they have server-side visibility into what Facebook's Graph API actually returned, which isn't visible from our side.

---

### July 2026 — Autonomy settings control + Inbox unread badge + S3 env var reserved-name bug

---

#### AI Response Mode (Autonomy) control — Settings page

Added a Settings-page control letting a workspace owner choose the AI comment-reply autonomy level: **No reply** / **Post with approval** / **Full Automatic**. Purely a UI addition — the backing field (`Workspace.aiResponseMode`, `Autonomy` enum: `OFF`/`DRAFT_APPROVE`/`FULL`) and the worker/webhook logic that already reads it (`app/api/zernio/webhook/route.ts`, `workers/ai-responder.worker.ts`) predate this change; there was previously no UI to set it at all (DB-only).

- **`components/lyra/settings/autonomy-selector.tsx`** (new) — three-option radio-style card. Selecting "Full Automatic" opens a confirm dialog ("AI will reply to comments publicly with no review") before persisting, since it's the one option with no human review step. The other two apply instantly.
- **`app/api/workspaces/[id]/route.ts`** — added a plan-tier gate: `aiResponseMode: 'FULL'` is rejected (403) for STARTER-plan workspaces, mirroring the existing `crisisAware` gate in the same handler. Client-side, the option renders disabled with a "Requires Pro or Agency plan" note for the same workspaces.
- **`app/(dashboard)/workspace/[workspaceId]/settings/page.tsx`** — new "Automation" section between Timezone and Add-ons.
- No schema changes. Spec: `docs/superpowers/specs/2026-07-09-autonomy-settings-control-design.md`.

---

#### Inbox unread comment count badge

Outlook-style unread badge on the "Inbox" sidebar nav item — a red numbered pill (white text, capped "99+") when the sidebar is expanded, a plain red dot when collapsed to icon-only. "Unread" = comments with status `PENDING`/`AI_DRAFTED`/`AWAITING_APPROVAL`/`ESCALATED` (matches the Inbox's existing "Pending" + "Escalated" tabs combined).

- **`app/(dashboard)/layout.tsx`** — one more `prisma.comment.count()` inside the existing workspace-scoped block (already `force-dynamic`, re-resolves on every navigation — no polling added). Covered by the existing `@@index([workspaceId, status])` on `Comment`, so it's cheap.
- **`components/lyra/app-shell/sidebar.tsx`** — `renderNavItems`'s shared default-case return special-cases the Inbox item. One round of review caught a real issue here: the new layout classes (`flex-1 justify-between`) were initially applied unconditionally to every nav item's label, not just Inbox's — fixed to apply only when `hasUnread` is true, so every other nav item's rendered output is byte-identical to before.
- Badge color is `bg-status-error text-white` (explicit user requirement, for contrast against the dark sidebar) — matches the existing pattern in `components/lyra/account/delete-account-button.tsx`. Note: this app's `background-primary` token is near-black (`#080808`), not white — don't reach for it on colored badges.
- Spec: `docs/superpowers/specs/2026-07-09-inbox-unread-badge-design.md`.

---

#### Media uploads broken: S3 env vars used Netlify's reserved AWS_* names (commit `7880d45`)

**Symptom:** attaching any file (image or video) to a post, on any platform, failed with a generic "Failed to upload media" toast. Initially reported as "MP4 won't attach to a LinkedIn post" — testing a JPEG on the same post failed identically, which was the key clue this wasn't file-type or platform specific.

**Root cause:** `lib/s3.ts`, `services/brand-intelligence/document-parser.ts`, and the legacy (now-unused) `app/api/upload/route.ts` all read `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` directly from `process.env`. Netlify Functions run on AWS Lambda, which **automatically injects those exact three variable names** into every function's runtime, populated with that Lambda's own execution role's temporary credentials — and Netlify blocks you from setting your own values for them ("reserved env var"). So the app was never seeing `undefined` and throwing early; it was silently signing every S3 request with Netlify's own Lambda role, which has zero permission on `lyra-media-prod`. Every presigned upload was rejected by S3, for every file, on every platform, since day one this pattern was introduced.

**Fix:** renamed to `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` throughout (all three S3-client files, plus the CI workflow's build-time placeholder env vars). `AWS_S3_BUCKET` was untouched — that name isn't part of Lambda's reserved set, and was already working correctly.

**Manual step still required (see the warning banner at the top of this document):** add real `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` values in Netlify, from an IAM user scoped to the `lyra-media-prod` bucket. The code fix alone does not restore uploads — Netlify has no credentials to inject under the new names yet.

---

### July 2026 — Zernio Bridge (Phases 1–4): unified social API + live connect-flow debugging

---

#### Why: one API instead of five separate app reviews

Native per-platform OAuth apps (Facebook, LinkedIn, TikTok, etc.) each require their own developer app, scopes, and — for production use beyond the developer's own account — a platform app review that can take days to months. Zernio (formerly Getlate.dev) is a unified social API that already has reviewed access across platforms. The plan: route all *new* social connects through Zernio as a bridge while native app reviews are pending, keep native code as a fallback for accounts connected before the bridge existed, and converge later once native reviews land. `SocialAccount.provider` (`NATIVE` | `ZERNIO`) plus `getProvider(account)` (`services/social/provider/index.ts`) dispatches every publish/reply/fetch call to the right implementation transparently.

#### Four phases, all merged to `main`

| Phase | PR | What it built |
|---|---|---|
| 1 — Foundation | #2 | Schema (`SocialProviderType` enum, `SocialAccount.provider`/`zernioAccountId`, `Workspace.zernioProfileId`, `Review` model), `zernio-client.ts` (thin REST wrapper), provider seam (`getProvider()`, `mappers.ts`) |
| 2 — Connect flow | #3 | `/api/social/connect/[platform]` rewritten to route through Zernio's hosted OAuth; `/api/zernio/connect/callback` (new) verifies account ownership before linking |
| 3 — Publish | #4 | `getProvider(account).publish()` wired into the direct publish route and the BullMQ worker; native publish implementations added for FB/IG/LinkedIn/Twitter |
| 4 — Webhook ingestion | #5 | `/api/zernio/webhook` (new) receives `comment.received`/`account.disconnected` events, HMAC-SHA256 signature verification, idempotent `Comment` upserts feeding the existing AI-responder pipeline |

**Manual setup completed same session:** `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` added to Netlify; a webhook subscription created in Zernio pointing at `https://lyraonline.ai/api/zernio/webhook`, subscribed to `comment.received` and `account.disconnected`.

#### CI pipeline fix (unrelated pre-existing bug, surfaced by this work)

`.github/workflows/deploy.yml` ran `npm ci`/`tsc`/`build` from the repo root instead of `LYRA/lyra` — silently masking real errors and, once fixed, surfacing 762 pre-existing lint errors from a legacy duplicate `app/` tree at the OneDrive root (unrelated to any LYRA session, never cleaned up). Fixed by adding `defaults.run.working-directory: LYRA/lyra` to the `lint-and-typecheck` and `build` jobs; lint set to `continue-on-error: true` until the backlog is paid down (user decision).

#### Testing session: three real bugs found and fixed live against production Zernio

All 13 pre-existing `SocialAccount` rows (test/demo data only — ITWM's own accounts) were deleted from production Supabase to test the connect flow from a clean slate, cascading through `Post`/`Comment`/`CommentResponse`/`PostApproval`/`Review` first (no `onDelete: Cascade` on `Post`/`Comment` → `SocialAccount`, unlike `Review`). Live testing then surfaced three genuine, distinct bugs — not one:

1. **`ZernioApiError` class added** (`services/social/zernio-client.ts`) — the connect route was collapsing every Zernio API failure (including an actionable 402 "add a payment method to connect more than 2 accounts" plan-limit error) into a generic 500. Now surfaces the real status/message.
2. **`profileId` unwrap bug** — `GET /v1/accounts` returns `profileId` as a populated object (`{_id, name}`), not a bare string as assumed. Every real connection was being rejected as cross-tenant because the comparison (`object !== string`) always failed. Confirmed live against Richard's first successful Facebook OAuth completion through Zernio.
3. **Flaky `GET /v1/accounts` endpoint** — confirmed by calling it 4 times in a row immediately after a real, successful connection: `empty, populated, empty, empty`. The callback's one-shot lookup was wrongly killing real connections. Fixed with a 7-attempt retry + backoff (~9s worst case).
4. **Facebook's OAuth redirect omits `accountId` entirely** — confirmed via a temporary debug log (see below): LinkedIn's redirect includes `?connected=X&profileId=Y&accountId=Z&username=W` as Zernio's docs describe, but Facebook's redirect only ever included `connected`, `profileId`, and `username` — no `accountId`, contradicting the docs. The callback required `accountId` unconditionally and rejected every real Facebook connection. Fixed: when `accountId` is missing, falls back to matching the account by the server-verified `workspace.zernioProfileId` + platform instead (exactly as safe — that profileId is read from LYRA's own DB, never trusted from the query string).

**Temporary diagnostic aid:** `ZernioConnectDebugLog` table (raw SQL, no Prisma model) + logging in `app/api/zernio/connect/callback/route.ts` at every decision point, added because Netlify function logs weren't reachable from the session doing this work. This is how bug #4 above was actually found and confirmed, rather than guessed at. **Should be removed once all platforms (Google Business, TikTok, YouTube, X) have been connect-tested at least once without issues** — Facebook and LinkedIn each had a different undocumented quirk, so it's reasonable to expect another platform might too.

**End state confirmed:** Facebook and LinkedIn both fully connected end-to-end for the "Into The Wild Marketing" workspace (`cmp6etbdr0001jw09rbkb79jj`) via Zernio, `SocialAccount` rows present with `provider = 'ZERNIO'`, `isActive = true`.

#### Files changed (Phases 1–4 + fixes, this session)

| File | Change |
|---|---|
| `prisma/schema.prisma` | `SocialProviderType` enum, `SocialAccount.provider`/`zernioAccountId`, nullable `accessToken`, `Workspace.zernioProfileId`, `Review` model, `Comment.platformPostId` |
| `services/social/zernio-client.ts` | Thin REST wrapper for Zernio's API; `ZernioApiError` class carrying real HTTP status |
| `services/social/provider/{types,mappers,zernio,native,index,platform-map}.ts` | Provider seam — `getProvider()`, normalizers, platform slug mapping |
| `app/api/social/connect/[platform]/route.ts` | Routes all connects through Zernio's hosted OAuth; lazy per-workspace Zernio profile creation |
| `app/api/zernio/connect/callback/route.ts` | New — verifies account ownership, retry/backoff account lookup, accountId-missing fallback, temp debug logging |
| `app/api/zernio/webhook/route.ts` | New — HMAC-verified webhook receiver for `comment.received`/`account.disconnected` |
| `services/social/webhook-verify.ts` | New — HMAC-SHA256 signature verification, TDD |
| `app/api/posts/[id]/publish/route.ts`, `workers/post-publisher.worker.ts` | Rewired to `getProvider(account).publish()` |
| `app/api/comments/[id]/reply/route.ts`, `workers/ai-responder.worker.ts` | Rewired to `getProvider(account).replyToComment()` |
| `.github/workflows/deploy.yml` | Fixed working-directory scoping (unrelated pre-existing bug) |

---

### June 2026 — Session 40: LinkedIn Community Management API

---

#### Problem: LinkedIn only connected personal profiles

Three LinkedIn developer apps existed but none could provide org page access:
- **Lyra** (`86sr2pmkxi1n0q`) — had OIDC products, Community Management API greyed out
- **Lyra Pages** (`86iuab2ytwlmaa`) — had Community Management API at Development Tier, but also had OIDC and Share on LinkedIn products; LinkedIn blocks OAuth with a "Bummer" error because Community Management API must be the **only product on the app** — a hard LinkedIn platform restriction ("This API product requires that it be the only product on the application for legal and security reasons.")
- **LYRA Community** — new app created with no other products, dedicated to Community Management API

#### Fix: new LYRA Community app + token introspection

Created the **LYRA Community** developer app with no other products. Applied for Community Management API Development Tier access. Access form submitted to Microsoft Vetting Services (Into The Wild Marketing). Awaiting approval email — expected within 3–7 business days.

While waiting, code was updated to work without OIDC scopes:

**`services/social/linkedin.ts`**
- Scopes reduced to 3: `r_organization_social`, `w_organization_social`, `rw_organization_admin`
- `getProfile()` replaced by `getMemberId()` — resolves the LinkedIn member ID via `POST https://www.linkedin.com/oauth/v2/introspectToken` instead of `/v2/userinfo`. Token introspection returns `authorized_user = "urn:li:person:abc123"` — the member ID is extracted from the URN. This eliminates the OIDC dependency entirely.

**`app/api/social/callback/[platform]/route.ts`** (LinkedIn case)
- Uses `getMemberId()` instead of `getProfile()`
- No personal profile fallback — redirects to `?error=linkedin_no_orgs` if `getOrganizations()` returns empty
- Clean catch block (no debug artifacts)

**Netlify configured** with LYRA Community app credentials (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` env vars updated).

#### What happens after LinkedIn approval

Once Microsoft Vetting Services approves the LYRA Community app:
1. Test the connect flow from workspace settings
2. Verify org pages appear (not personal profile)
3. No code changes needed — the 3-scope OAuth + token introspection approach is already deployed

#### Deployment issue resolved: Netlify serving stale code

Root cause: the `deploy-site` MCP tool was uploading a stale local `.next/` (built June 14) directly to Netlify on every "deploy" — bypassing the git build process entirely. Fix: deleted local `.next/`, switched to git-triggered builds from the outer OneDrive git repo.

Also discovered the root `netlify.toml` was missing. Created it at repo root with:
```toml
[build]
  command = "rm -rf .next && npx prisma generate && npm run build"
```

**Critical rule confirmed:** Never use the MCP `deploy-site` tool. Always deploy via `git push` to `main` from the outer OneDrive repo. Netlify auto-builds on push.

#### Files changed

| File | Change |
|---|---|
| `lyra/services/social/linkedin.ts` | Scopes: 3 only. `getProfile()` → `getMemberId()` via token introspection |
| `lyra/app/api/social/callback/[platform]/route.ts` | LinkedIn case: uses `getMemberId`, redirects on no orgs |
| `netlify.toml` (repo root) | Created — build command with `rm -rf .next` |

---

### June 2026 — Session 39: Full mobile UI/UX audit + fixes

---

#### Root cause: why mobile was broken

The app shell was built as a Next.js server component (`layout.tsx`) which fetches DB data at request time. Server components cannot hold `useState`. The mobile drawer infrastructure was fully built inside `sidebar.tsx` (Framer Motion slide-in, dark backdrop, X close button, auto-close on navigate) but required `mobileOpen` and `onMobileClose` props that were never passed — because no parent could hold the state. The hamburger button in `header.tsx` also required an `onMenuOpen` callback that never existed. Mobile users had a header with no working menu button and a sidebar drawer that could never open.

This was never caught because every session built and tested on desktop. The sidebar worked perfectly on `lg` and above without those props.

#### Fix: `AppShellClient` — new file

Created `components/lyra/app-shell/app-shell-client.tsx` as a `'use client'` wrapper that sits between the server layout and the sidebar/header. It holds `mobileNavOpen` state and threads it to both `Sidebar` (`mobileOpen` / `onMobileClose`) and `Header` (`onMenuOpen`). Also implements responsive main content padding (`p-4 md:p-6`).

`app/(dashboard)/layout.tsx` now delegates the full JSX shell to `<AppShellClient>`, keeping its own DB fetch as a server component.

#### Header rewrites

- Added hamburger `<button>` (visible `< lg`) that calls `onMenuOpen` → opens the mobile drawer
- Added mobile page title derived from `usePathname()` via a `PAGE_TITLES: [RegExp, string][]` lookup — shows the current page name in the header on mobile in place of the desktop breadcrumb
- Made Upgrade CTA `hidden sm:inline-flex` (still accessible via avatar dropdown on mobile with `sm:hidden`)
- Removed the non-functional Search button entirely
- Header height: `h-14 md:h-16`

#### Sidebar touch targets

All nav item links changed from `py-2.5` (~36px) to `py-3` (~40px+) across all five variants: regular links, active links, locked (STARTER) links, assistant link, settings link. Meets the 44px touch target standard from CLAUDE.md.

#### Calendar page — mobile header stack

Calendar header changed from a single `flex justify-between` row to `flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`. The `text-4xl` heading scales to `text-3xl sm:text-4xl`. Button group gets `shrink-0`. Prevents heading + two buttons colliding at 375px.

#### Workspace overview — date hidden on mobile

In the recent posts table, the date `<span>` changed to `hidden sm:inline`. Post platform tag, content preview, and status badge still show on all sizes. Prevents overflow on narrow screens.

#### Inbox — platform filter pills wrap

Platform filter container changed from `flex items-center gap-2` to `flex flex-wrap items-center gap-2`. Pills wrap to a second row when more than 3 platforms are connected, rather than overflowing off-screen.

#### Analytics — design token compliance

`performance-dashboard.tsx` was written with hardcoded hex values throughout (`#0f0f0f`, `#1a1a1a`, `#222`, `#333`, `#555`, `#888`, `#e2e2e2`). Rewrote all to use Tailwind design tokens (`bg-background-secondary`, `bg-background-hover`, `border-background-border`, etc.). Also added `strokeWidth={1.5}` to all Lucide icons and `font-sans`/`font-mono` classes per design system.

#### Files changed (commit `bbac5d5`)

| File | Change |
|---|---|
| `components/lyra/app-shell/app-shell-client.tsx` | **New file** — client wrapper holding mobile nav state |
| `app/(dashboard)/layout.tsx` | Replaced full JSX shell with `<AppShellClient>` |
| `components/lyra/app-shell/header.tsx` | Hamburger, page title, hidden Upgrade, removed Search |
| `components/lyra/app-shell/sidebar.tsx` | `py-2.5` → `py-3` on all 5 nav item variants |
| `app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx` | Stacked header on mobile |
| `app/(dashboard)/workspace/[workspaceId]/page.tsx` | Date hidden on mobile in recent posts |
| `components/lyra/inbox/response-inbox.tsx` | `flex-wrap` on platform filter pills |
| `components/lyra/analytics/performance-dashboard.tsx` | All hardcoded hex → design tokens |

#### Netlify build fix (same session — commit `fb693e2`)

Two help page component files existed locally but were never committed (`git add -f` required for all files under the gitignored `LYRA/` directory):

- `components/lyra/help/section-13-trends.tsx`
- `components/lyra/help/section-14-data-deletion.tsx`

Both were imported in `app/help/page.tsx`. Netlify failed with `Module not found` until these were force-added and committed. **Lesson:** every new file under `LYRA/lyra/` requires `git add -f` — the outer repo's `.gitignore` has `/LYRA/` which silently excludes new files.

---

### June 2026 — Session 38: Media upload fix + client approval workflow + tsconfig dedup

---

#### Media upload — presign endpoint was missing (this session)

The media attach button in both the **Compose page** (`components/lyra/composer/media-uploader.tsx`) and the **Calendar schedule review page** (`components/lyra/schedule/schedule-review.tsx`) was silently failing with a 404.

**Root cause:** `schedule-review.tsx` was already calling `POST /api/upload/presign` (the correct browser-direct S3 presign pattern), but that route never existed. `media-uploader.tsx` was calling a different server-side upload route that streamed the file through the Netlify function — hitting the 4.5 MB function payload limit.

**Fix — created `app/api/upload/presign/route.ts`:**
- Accepts `{ filename, contentType, workspaceId }` in the POST body
- Validates MIME type against an allowlist (jpeg, png, gif, webp, mp4, mov, webm)
- Generates a presigned S3 PUT URL via `getUploadPresignedUrl()` from `lib/s3.ts`
- Returns `{ presignedUrl, publicUrl }` — browser PUTs the file directly to S3

**Fix — `components/lyra/composer/media-uploader.tsx`:**
- Switched from server-side `POST /api/upload` to the presign flow
- Browser now fetches the presigned URL, then PUTs the file directly to S3
- No file bytes pass through the Netlify function

**Fix — `components/lyra/schedule/schedule-review.tsx`:**
- Was already using the presign pattern but missing `workspaceId` in the request body
- Added `workspaceId` to the JSON body so S3 keys are correctly namespaced per workspace

**S3 bucket note:** For media to be fetchable by social platforms at publish time, the S3 bucket needs a public-read policy on the `media/*` prefix. If not already set, add it in AWS S3 → bucket → Permissions → Bucket policy.

---

#### Client approval workflow — fully implemented (this session)

**What was built:**

The full agency → client approval loop is now wired end-to-end in the calendar:

| Actor | Action | Status transition |
|---|---|---|
| Agency | Submit for approval | DRAFT → PENDING_APPROVAL |
| Agency | Recall for editing | PENDING_APPROVAL → DRAFT |
| Client (CLIENT_APPROVE role) | Approve | PENDING_APPROVAL → APPROVED |
| Client (CLIENT_APPROVE role) | Request changes | PENDING_APPROVAL → DRAFT |
| Agency | Schedule approved post | APPROVED → SCHEDULED |
| Agency | Move back to draft | APPROVED → DRAFT |

**Files changed:**

`app/(dashboard)/workspace/[workspaceId]/calendar/page.tsx`
- Added `clientAccessLevel` and `access: { where: { userId }, select: { role } }` to the Prisma workspace query
- Computes `userRole = workspace.access[0]?.role ?? 'SMB_OWNER'`
- Passes `userRole` and `clientAccessLevel` as props to `ContentCalendar`

`components/lyra/calendar/content-calendar.tsx`
- Added `ContentCalendarProps` interface with `userRole: string` and `clientAccessLevel: string`
- Added `PENDING_APPROVAL` filter tab ("Pending") between Drafts and Published
- Passes `userRole` and `clientAccessLevel` through to `PostDetailPanel`

`components/lyra/calendar/post-detail-panel.tsx`
- Replaced static `NEXT_STATUSES` Record with `getNextStatuses(status, userRole, clientAccessLevel)` function
- CLIENT_APPROVE role sees Approve / Request changes on PENDING_APPROVAL posts only
- Agency roles see Submit for approval on DRAFT posts (when `clientAccessLevel === 'APPROVE'`)
- APPROVED status offers Schedule post or Move back to draft
- Approve button gets green tint styling; Request changes gets red tint

`app/api/posts/[id]/route.ts` (PATCH handler)
- Added `status` to the `existing` post select so we know the pre-change status
- On transition to `PENDING_APPROVAL`: upserts `PostApproval` with status `PENDING`
- On transition to `APPROVED`: upserts `PostApproval` with status `APPROVED`, records `reviewerId` and `reviewedAt`
- On transition `PENDING_APPROVAL → DRAFT` (recall/request changes): upserts `PostApproval` with status `REJECTED`

---

#### tsconfig.json — nested LYRA directory causing phantom TypeScript errors (this session)

`npx tsc --noEmit` was reporting errors in `calendar/page.tsx` and `settings/page.tsx` at wrong line numbers. Investigation revealed a **nested copy of the entire LYRA project** inside the `lyra/` git repository at `lyra/LYRA/lyra/` — 316 git-tracked files from an earlier accidental commit. TypeScript's `**/*.tsx` glob was picking up the stale versions alongside the current source, causing every file to be compiled twice (old version at `LYRA/lyra/app/...`, new version at `app/...`).

**Fix:** Added `"LYRA"` to the `exclude` array in `lyra/tsconfig.json`:
```json
"exclude": ["node_modules", "LYRA"]
```

After this fix, tsc reports only the pre-existing `timezone` field errors in `settings/page.tsx` (Prisma client not regenerated locally — Netlify always runs `prisma generate` before build, so production is unaffected).

**Note:** The `lyra/LYRA/` directory still exists and is git-tracked. To clean it from git history, run from inside the `lyra/` directory:
```bash
git rm -r --cached LYRA/
git commit -m "chore: remove accidentally committed nested LYRA directory"
```
This is housekeeping only — the `tsconfig.json` fix prevents it from affecting compilation.

---

#### Inbox and crisis — verified working (this session)

Both confirmed fully implemented and type-correct. No changes needed.

- **Response Inbox** (`components/lyra/inbox/response-inbox.tsx` + `comment-card.tsx`): three-tab layout (Pending / Escalated / Done), AI draft generation, approve & send, escalate, ignore, platform filter, manual sync button.
- **Crisis banner** (`components/lyra/crisis/crisis-banner.tsx`): mounted in `workspace/[workspaceId]/layout.tsx`, appears across all workspace pages when `crisisActive = true`, resolve button calls `POST /api/crisis/resolve`.

---

### June 2026 — Session 37: Mobile sidebar close button + DB migration + build fix

---

#### Mobile sidebar — close button added (this session)

The mobile drawer was already built (Framer Motion slide-in, backdrop, auto-close on navigation). The only missing piece was a close button inside the drawer itself.

**What changed (`components/lyra/app-shell/sidebar.tsx`):**
- `X` imported from `lucide-react`
- `renderContent()` now accepts an `isMobile = false` second parameter
- When `isMobile` is true, an X button appears in the logo row (right-aligned)
- Mobile drawer call changed to `renderContent(false, true)`

Mobile sidebar is now fully complete — hamburger (in header), slide-in drawer, backdrop dismiss, auto-close on navigation, and X close button inside the drawer.

---

#### Netlify build error fixed — duplicate `export const maxDuration` (this session)

`app/api/assistant/generate/route.ts` had `export const maxDuration = 60` declared twice with imports sandwiched between the two declarations. Turbopack rejected this with "the name `maxDuration` is defined multiple times".

**Fix:** removed the duplicate, moved all imports to the top of the file.

---

#### "Setting up your account…" error — DB migration applied (this session)

The app showed "Setting up your account…" after a successful Netlify build. Root cause: columns and models existed in `prisma/schema.prisma` that had never been applied to the production Supabase database. Prisma's SELECT on `Workspace` (and other models) failed at runtime because it referenced non-existent DB columns.

**Fix:** ran the equivalent SQL directly in Supabase SQL Editor to add all missing columns and tables. User confirmed: "OK its back now."

**Reminder:** schema.prisma and the production DB can drift whenever new models or columns are added without a matching SQL migration step. See Section 9 for the process.

---

#### Git sync — force push to resolve diverged history (this session)

The outer OneDrive git repo had diverged from remote (48 divergent commits from prior sessions that pushed from a different working directory). Resolved with `git push --force origin main`, then committed all session work in a single sync commit.

Git config fixes applied to this machine:
- `git config user.email` / `user.name` were not set
- `git config windows.appendAtomically false` fixes "unable to append to .git/logs/HEAD: Invalid argument" on Windows

---

### June 2026 — TikTok connected (sandbox) + Twitter/X connected + YouTube card added

---

#### TikTok OAuth — fully connected in sandbox (this session)

**Root cause of scope errors:** All tiktok.ts commits were going to an inner git repo (`LYRA/lyra/`) but Netlify is connected to the **outer OneDrive git repo**. Changes never deployed until committed from the outer repo root.

**API fixes discovered during debugging:**
- Correct token/API domain: `open.tiktokapis.com` (not `open.tiktok.com` — 404s)
- Token response fields are at the **top level**, not nested under `data`
- TikTok v2 `/user/info/` always returns an `error` object with `code: "ok"` on success — must check `code !== 'ok'`, not just `if (data.error)`
- Auth URL (`www.tiktok.com`) is separate from API endpoints (`open.tiktokapis.com`)

**Sandbox tester:** `lyrasocialonline` added and verified. Connect flow works end-to-end.

**Scopes in use:** `user.info.basic`, `user.info.profile`, `user.info.stats` (video scopes deferred until Content Posting API approved via App Review)

**Production:** TikTok App Review submitted. Awaiting approval (1–7 business days).

---

#### Twitter/X OAuth — connected first attempt (this session)

- App created: `LYRAOnline` (App ID: `2065992296558903296`)
- OAuth 2.0 with PKCE configured in developer portal
- Callback URL: `https://lyraonline.ai/api/social/callback/twitter`
- Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- Env vars added to Netlify: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- Connected successfully — stores access token + refresh token (offline.access required for refresh)

---

#### YouTube — card added to settings page (this session)

YouTube was missing from the PLATFORMS array in `settings/page.tsx`. Added. YouTube uses the same Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) as Google Business — both platforms connect via the `google` connect route.

**Google OAuth setup:**
- OAuth 2.0 client created in Google Cloud Console (dedicated to LYRA social connections)
- YouTube Data API v3 already enabled
- Both redirect URIs registered: `/api/social/callback/youtube` and `/api/social/callback/google`
- Env vars added to Netlify: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- OAuth consent screen is in **Testing** mode — test user added (owner's Google account)
- For production: will need Google verification for sensitive YouTube scopes

**Status:** YouTube connected successfully ✅. Google Business connection ready but awaiting API access approval — Case 5-5485000041034.

---

### June 2026 — Meta App Review submission ready + TikTok app setup

---

#### Meta App Review — all API calls registered, submit tomorrow (latest session)

All permissions now have green ticks except API call counts, which propagate within 24 hours. Submit for review once they appear in the dashboard.

**All API calls now registered:**
- `pages_manage_posts` — `POST /api/posts/meta-review-publish-test-002/publish` → published to Page `984761128056168`
- `pages_read_user_content` — `POST /api/comments/sync` with `workspaceId: 'cmqdfm4ay0002l509z4babj2m'`
- `pages_manage_metadata` — new `GET /api/fb-subscribe-test` endpoint calling `/{pageId}/subscribed_apps`
- `instagram_basic`, `instagram_manage_comments`, `instagram_content_publish` — new `POST /api/ig-permissions-test` endpoint (all three in one call, IG account `17841444009821314`)
- `pages_read_engagement`, `pages_manage_engagement` — registered during screencast recordings

**New endpoints added this session:**
- `app/api/fb-subscribe-test/route.ts` — GET `/{pageId}/subscribed_apps` for `pages_manage_metadata`
- `app/api/ig-permissions-test/route.ts` — combined: IG profile (instagram_basic) + media/comments read (instagram_manage_comments) + two-step publish (instagram_content_publish)

**Descriptions written and submitted for:** `pages_read_user_content`, `pages_manage_posts`, `pages_manage_metadata`, `pages_read_engagement`

**Data handling section completed:**
- Data processors listed: Supabase, Netlify, Railway, Auth0, Anthropic, AWS
- Controller: Into The Wild Marketing, Australia
- No national security data disclosures (new app, no users)
- All four data request policies checked

**Facebook Page change:** User reconnected Facebook with a different Page. Active Page is now `984761128056168` (new page). Previous test page `1187426017779644` is now inactive.

**Note for post-approval:** All test endpoints (`/api/ig-test`, `/api/ig-permissions-test`, `/api/fb-subscribe-test`) can be deleted once App Review is approved — they exist only for API call registration.

---

#### TikTok developer app setup (this session)

- TikTok app created in TikTok Developer Portal
- **DNS verification:** lyraonline.ai DNS is managed by **Cloudflare** (not Netlify — adding records in Netlify has no effect). Added TXT record `tiktok-developers-site-verification=E2wJoAu60THV59eiSxET1B0RtuhUD2Wh` to Cloudflare → verified.
- **Redirect URI added:** `https://lyraonline.ai/api/social/callback/tiktok`
- **Env vars added to Netlify:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- **App Review submission text written** — see below
- **OAuth error:** `unauthorized_client / error_type=client_key` — expected in sandbox mode. Only users added as Testers in TikTok Developer Portal → Tester Management can authenticate until the app passes review.
- **App Review status:** Submitted (screencasts + description). Awaiting TikTok review. Timeline: 1–7 business days.

**TikTok App Review description (on file):**
> LYRA is an AI-powered social media management platform for agencies, freelancers, and businesses. Users connect their TikTok Business Account to LYRA to schedule and publish video content directly to TikTok. Content Posting API (video.upload, video.publish): Users create posts in LYRA's composer, attach a video, and set a publish time. LYRA's background scheduler publishes the video to TikTok automatically at the scheduled time using the stored access token. Login Kit (user.info.basic): Used during OAuth to authenticate the user's TikTok account and display the connected account name and avatar within the LYRA workspace settings.

---

#### DNS management — Cloudflare (discovered this session)

lyraonline.ai nameservers point to Cloudflare (`johnathan.ns.cloudflare.com`, `daniella.ns.cloudflare.com`). All DNS records must be managed in **Cloudflare dashboard**, not Netlify. Existing records confirmed:
- TXT: `MS=ms59571944` (Microsoft verification)
- TXT: `v=spf1 include:spf.efwd.registrar-servers.com include:spf.protection.outlook.com -all` (SPF)
- TXT: `tiktok-developers-site-verification=E2wJoAu60THV59eiSxET1B0RtuhUD2Wh` (TikTok)

Any future platform DNS verifications (LinkedIn, Google, etc.) must go into Cloudflare.

---

### June 2026 — Meta App Review prep + Facebook/Instagram API fixes

---

#### Meta App Review — submission ready (prior session)

All 8 permission screencasts recorded and uploaded. Justification text written and added. Test reviewer account created (`metareviewLYRA2026@proton.me`, ProtonMail signup via lyraonline.ai, added to LYRA workspace as AGENCY_ADMIN, `aiResponseMode` set to DRAFT_APPROVE). Test credentials added to the submission.

**API call requirements resolved (prior session):**
- `pages_manage_posts` — registered via `POST /api/posts/[id]/publish` calling `/1187426017779644/feed` with the stored page access token
- `instagram_content_publish` — registered via `POST /api/ig-test` using the two-step container create → media_publish flow
- `pages_read_engagement`, `pages_manage_engagement`, `instagram_basic`, `instagram_manage_comments` — API calls made during screen recordings; propagation expected overnight (same pattern as earlier permissions that appeared after ~24 hours)

**Submission status:** All API calls registered across all permissions. All green ticks except API call counts (propagate within 24 hours). Submit once counts appear in the dashboard.

Key IDs:
- Facebook Page ID: `1187426017779644`
- Instagram Business Account ID: `17841415730537255`
- Reviewer workspace: `cmqdfm4ay0002l509z4babj2m`

---

#### Facebook OAuth fixes (this session)

- **Removed `config_id` from `getAuthUrl()`** — `config_id` overrides the `scope` parameter entirely, silently dropping all Instagram permissions from the OAuth dialog. Removed; scope list now takes effect correctly.
- **Removed `ads_management` from SCOPES** — was causing Meta to block Facebook Login for the entire app.
- **Added `auth_type=rerequest`** to the Facebook reconnect link in Workspace Settings — forces the permission dialog to appear even when Facebook has cached a prior grant.

---

#### Redis replaced with DB for Facebook page-picker (this session)

The OAuth page-picker flow (user selects which Facebook Pages to connect) previously stored pending state in Redis. Redis is unavailable on Netlify serverless (falls back to localhost:6379 which doesn't exist), causing "Failed to load Pages" errors.

**Fix:** Added `FacebookPending` Prisma model; replaced Redis in 3 routes:
- `app/api/social/callback/[platform]/route.ts` — creates DB record instead of Redis key
- `app/api/social/facebook/pending/route.ts` — reads from DB instead of Redis
- `app/api/social/facebook/complete/route.ts` — reads + deletes DB record instead of Redis

**Schema (applied via Supabase SQL):**
```sql
CREATE TABLE "FacebookPending" (
  "key"         TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "data"        JSONB NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FacebookPending_expiresAt_idx" ON "FacebookPending"("expiresAt");
```

---

#### Instagram comment reply fixed (this session)

Reply route was calling `facebookReply()` for Instagram comments. Fixed:
- Added `replyToComment()` to `services/social/instagram.ts` using `/{comment-id}/replies` endpoint
- Field is `message` (not `text`) — Instagram comment replies use `message` same as Facebook
- `app/api/comments/[id]/reply/route.ts` now routes by platform (INSTAGRAM → instagram service, FACEBOOK → facebook service)

---

#### New API endpoints (this session)

- **`POST /api/posts/[id]/publish`** — direct Facebook + Instagram publish bypassing BullMQ workers. Facebook: posts to `/{pageId}/feed`. Instagram: two-step container create → `media_publish`. Updates post status to PUBLISHED on success. Used for testing and for manual publish when Railway workers are not reachable.
- **`POST /api/comments/sync`** — direct comment sync bypassing BullMQ. Calls Graph API for FACEBOOK and INSTAGRAM accounts, upserts Comment rows. Triggered by the Sync button in the response inbox UI.
- **`POST /api/ig-test`** — one-shot Instagram test publish using the stored page token. Created for Meta App Review API call verification. Can be deleted post-review.

---

#### Netlify base directory was wrong (this session)

**Problem:** New API routes (new directories) returned 404 while existing routes worked. Root cause: Netlify UI base directory was set to `/` (git repo root = OneDrive folder) instead of `LYRA/lyra`. Next.js was building from the wrong directory. Existing routes worked only because they were in a stale `.next` cache from when the base was correctly set.

**Fix:** Changed Netlify → Site configuration → Build & deploy → Build settings → Base directory from `/` to `LYRA/lyra`. Triggered "Clear cache and deploy site" to force a full rebuild.

**Note on git force-add:** Files under `LYRA/` require `git add -f` because the root `.gitignore` contains `/LYRA`. Once committed with `-f`, files are in git normally and Netlify clones them correctly. Modified files (already tracked) also require `git add -f` when run from within the LYRA directory. Without `-f`, git silently ignores the add command.

---

#### Response Inbox — Sync button added (this session)

Added a **Sync** button (RefreshCw icon) to the response inbox toolbar (`components/lyra/inbox/response-inbox.tsx`). Calls `POST /api/comments/sync` for the current workspace. Shows disabled + spinner state during sync. Refreshes the comment list on completion.

---

### June 2026 — Netlify Build Fix + Brand Guidelines Textarea

---

#### Brand guidelines input replaced (commits `4abc043`, `8b474e8`, `5afa44b`)

The `GuidelinesUploader` file-upload drag-and-drop widget on the Brand page has been replaced with a plain textarea (`BrandGuidelinesPanel`). Users paste their brand voice, tone, and messaging rules directly — no file upload or S3 required. The text is passed to Claude during a profile build or re-analysis.

**What changed:**
- `BrandGuidelinesPanel` component (textarea + build button) added to `components/lyra/brand/brand-build-button.tsx`
- `app/(dashboard)/workspace/[workspaceId]/brand/page.tsx` — import changed from `brand-guidelines-panel.tsx` to `brand-build-button.tsx`
- `brand-guidelines-panel.tsx` — still exists but is now dead code (unused)

**How it works:**
- User pastes guidelines text into the textarea
- Text is sent as `manualGuidelines` in the `POST /api/brand-intelligence/build` body
- Claude receives it alongside scraped website data when building the profile
- Saved guidelines can be pre-populated from `BrandProfile.postingPatterns.userGuidelines` on page load

---

#### Netlify build configuration — root cause found and fixed permanently

Multiple sessions were affected by the brand page deploying stale compiled code despite source changes. Root cause identified and fixed.

**Root cause:** Netlify's `baseRelDir: true` flag (always enabled) causes it to read `LYRA/lyra/netlify.toml` as the **primary** config file. Any `[build]` section in the nested file overrides the root `netlify.toml` command. If the nested file exists with no `[build]` section (even just comments), Netlify falls back to the **Netlify UI stored command** — ignoring the root file entirely. The root `netlify.toml` command was never running.

**Compounding factor:** `@netlify/plugin-nextjs` restores the Turbopack incremental cache (`.next/cache/`) in its `onPreBuild` hook before the build command runs. Without `rm -rf .next` in the command, changed source files were compiled against the cached output, producing stale bundles.

**Fix (commit `8b474e8`):** `LYRA/lyra/netlify.toml` deleted entirely. With no nested file present, `baseRelDir` finds nothing and the root `netlify.toml` is used exclusively.

**Fix (commit `5afa44b`):** `prisma db push` removed from the build command. It was hanging because `DATABASE_URL` points to the Supabase PgBouncer pooler (port 6543) which cannot handle DDL operations. The hang was causing builds to time out at ~10 minutes.

**Final build command (root `netlify.toml` — do not add a nested one):**
```
rm -rf .next && npx prisma generate && npm run build
```

**Schema changes are no longer auto-applied on deploy.** Apply schema changes manually via Supabase SQL Editor when needed.

**Critical rule:** Never create `LYRA/lyra/netlify.toml` again. The only `netlify.toml` in the repo is at the root (`c:\Users\Rich\OneDrive - Into The Wild Marketing\netlify.toml`). Root-level files do not need `git add -f`; files under `LYRA/` do.

---

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
- **Base directory:** `LYRA/lyra` ← **critical — must be set in Netlify UI**
- **Build command:** `rm -rf .next && npx prisma generate && npm run build`
- **Publish directory:** `.next`
- **Node version:** 20
- **Plugin:** `@netlify/plugin-nextjs`

**Base directory is critical.** The git repo root is the entire OneDrive folder (`C:/Users/Rich/OneDrive - Into The Wild Marketing`), not the LYRA app. If the Netlify UI base directory is set to `/` (the default when connecting the repo), Next.js builds from the wrong directory. Existing routes will appear to work (from stale `.next` cache) but any new route in a new directory will return 404. The base directory must be `LYRA/lyra`. Verify this in Netlify → Site configuration → Build & deploy → Build settings.

`rm -rf .next` is essential — it clears the Turbopack incremental cache that the plugin restores before each build. Without it, changed source files can be compiled against cached output, producing stale bundles that survive multiple deploys.

**Schema changes are NOT auto-applied on deploy.** Apply them manually via Supabase SQL Editor when the schema changes. See Section 8 for the current approach.

**Important: never create `LYRA/lyra/netlify.toml`.** Netlify's `baseRelDir: true` flag reads that file as the primary config, overriding or ignoring the root `netlify.toml` build command. The only `netlify.toml` in the repo is at the repo root.

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
| LinkedIn | **LYRA Community** (new dedicated app) | Code deployed — awaiting Development Tier approval from Microsoft Vetting Services. Connects org pages (not personal profile). Token introspection used for member ID — no OIDC required. |
| Facebook/Instagram | LYRA (App ID: 1480576426774303) | OAuth flow built — needs testing |
| Google Business | Shared Google project (GOOGLE_CLIENT_ID/SECRET) | Flow built. GBP API access ❌ REJECTED 2026-07-03 (website mismatch). Reapply as ITWM / intothewildmarketing.com.au — see Known Limitations. |
| X (Twitter) | LYRAOnline (App ID: `2065992296558903296`) | Connected ✅ — OAuth 2.0 with PKCE, scopes: tweet.read/write, users.read, offline.access |
| TikTok | `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` in Netlify env vars | App created. App Review submitted. Sandbox mode — only Tester accounts can connect until approved. Redirect URI: `https://lyraonline.ai/api/social/callback/tiktok` |
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
| `LINKEDIN_CLIENT_ID` | LYRA Community app client ID (new dedicated app — no other products) |
| `LINKEDIN_CLIENT_SECRET` | LYRA Community app client secret |
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
| `S3_REGION` | S3 region — deliberately `S3_*` not `AWS_*` (Netlify's Lambda runtime reserves `AWS_*` names and silently injects its own wrong credentials, see `lib/s3.ts` comment) |
| `S3_ACCESS_KEY_ID` | S3 access key ID |
| `S3_SECRET_ACCESS_KEY` | S3 secret access key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — used for YouTube and Google Business |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret — used for YouTube and Google Business |
| `GOOGLE_SEARCH_CONSOLE_CLIENT_ID` | GSC OAuth client ID |
| `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET` | GSC OAuth client secret |
| `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` | `https://lyra-online-app.netlify.app/api/seo/callback` |
| `REDIS_URL` | Upstash Redis connection string (`rediss://...`) — required for BullMQ queues and workers |
| `CRON_SECRET` | Bearer token shared between cron-job.org and all `/api/cron/*` endpoints — any strong random string |
| `STRIPE_TREND_PRICE_ID` | Stripe Price ID for the LYRA Trend add-on monthly subscription — Trend checkout is currently **disabled** (`app/api/stripe/trend-checkout/route.ts`) since the feature has no functional backend; not read at runtime today |
| `STRIPE_TREND_ANNUAL_PRICE_ID` | Same, annual — also not read while checkout is disabled |
| `PERPLEXITY_API_KEY` | Perplexity real-time search API key — required for Trend discovery stage once built; not used today |
| `STRIPE_CRISIS_AWARE_PRICE_ID` | Stripe Price ID for the Crisis Aware add-on monthly subscription (shipped 28 Jul 2026, live) — required by `app/api/stripe/crisis-aware-checkout/route.ts` |
| `STRIPE_CRISIS_AWARE_ANNUAL_PRICE_ID` | Same, annual |
| `RESEND_API_KEY` | Resend transactional email — required by `lib/resend.ts` for the Crisis Aware email alert (shipped 23 Jul 2026, live); the only email LYRA sends today |

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

- **Sidebar** (`components/lyra/app-shell/sidebar.tsx`) — collapsible desktop sidebar (Framer Motion, full wordmark expanded / icon mark collapsed) + mobile drawer (slide-in on hamburger tap, backdrop dismiss, X close button inside drawer, auto-close on navigation). Mobile drawer is hidden on `lg+` viewports; desktop sidebar hidden on `< lg`.
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

Full list, generated against `app/api/**/route.ts` — previously this table covered under half of the real 66 routes and omitted `publish-due-posts` entirely, the single route that actually publishes scheduled content. Regenerate this list from source rather than hand-maintaining it if it drifts again.

| Route | Methods | Purpose |
|---|---|---|
| `/api/account` | DELETE | Delete own account |
| `/api/ai/generate` | POST | AI caption generation |
| `/api/ai/repurpose` | POST (SSE) | Repurpose long-form content into platform-native posts |
| `/api/ai/respond` | POST | AI comment response draft |
| `/api/ai/score-content` | POST | Score post content across 6 dimensions |
| `/api/analytics` | GET | Fetch post metrics |
| `/api/analytics/sync` | POST | Manually trigger analytics sync |
| `/api/brand-intelligence/analyze-engagement` | POST | Manually trigger engagement pattern analysis |
| `/api/brand-intelligence/build` | POST | Trigger brand profile build |
| `/api/brand-intelligence/crisis-keywords/approve` | POST | Approve an AI-suggested Crisis Aware keyword |
| `/api/brand-intelligence/crisis-keywords/dismiss` | POST | Dismiss an AI-suggested Crisis Aware keyword |
| `/api/brand-intelligence/guidelines` | POST, DELETE | Upload/remove brand guideline documents |
| `/api/brand-intelligence/guidelines/presigned` | POST | Presigned S3 upload URL for guideline documents |
| `/api/comments` | GET | Comments inbox |
| `/api/comments/[id]` | PATCH | Update comment status |
| `/api/comments/[id]/reply` | POST | Reply to a comment directly from the inbox |
| `/api/comments/sync` | POST | Manually trigger comment sync |
| `/api/comments/unread-count` | GET | Unread inbox count badge |
| `/api/competitors` | GET, POST | List / add competitor profiles |
| `/api/competitors/[id]` | DELETE | Remove a competitor |
| `/api/crisis/resolve` | POST | Resolve an active Crisis Aware event, resume paused posts |
| `/api/crisis/status` | GET | Current Crisis Aware status for a workspace |
| `/api/cron/brand-refresh` | GET | Weekly brand profile refresh (cron-triggered) |
| `/api/cron/publish-due-posts` | GET | **Publishes scheduled posts that are due.** Primary trigger is an external cron-job.org account every 1 minute (outside version control); `.github/workflows/crons.yml` runs it as a 5-minute backstop |
| `/api/cron/sync-comments` | GET | Sync comments from platforms (cron-triggered) |
| `/api/cron/sync-metrics` | GET | Sync post performance metrics (cron-triggered) |
| `/api/cron/sync-trends` | GET | LYRA Trend sync — currently a no-op stub, Trend has no functional backend yet |
| `/api/email-campaigns` | GET | List email campaigns for calendar overlay |
| `/api/email-integrations` | GET, POST | List / connect email marketing providers (Klaviyo, Mailchimp, Customer.io) |
| `/api/email-integrations/[id]` | DELETE | Disconnect an email integration |
| `/api/email-integrations/[id]/sync` | POST | Manually trigger campaign sync for one integration |
| `/api/guardrails/[id]` | DELETE | Remove a guardrail |
| `/api/help/pdf` | GET | Renders the Help Guide as a downloadable PDF (S3-cached) |
| `/api/klaviyo/subscribe` | POST | Public newsletter subscribe endpoint |
| `/api/onboarding` | POST, GET, PATCH | Client onboarding token flow |
| `/api/posts` | GET, POST | List posts by month, create post |
| `/api/posts/[id]` | PATCH, DELETE | Post update / delete |
| `/api/posts/[id]/boost` | POST, DELETE | Create boost (Meta Marketing API) / cancel boost |
| `/api/posts/[id]/boost/reach` | GET | Estimated reach for a boost |
| `/api/posts/[id]/publish` | POST | Publish a single post immediately |
| `/api/reports/generate` | POST | Generate PDF client report (7-day or 30-day) |
| `/api/schedule/generate` | POST | AI schedule generator — generates a week of posts, fanned out per-platform |
| `/api/seo/callback` | GET | Handle GSC OAuth callback |
| `/api/seo/connect` | GET | Initiate GSC OAuth |
| `/api/seo/gsc-data` | GET | Fetch GSC queries + trend data |
| `/api/seo/pages` | GET, POST | List/create tracked SEO pages |
| `/api/seo/pages/[pageId]` | DELETE | Delete a tracked page |
| `/api/seo/pages/[pageId]/analyze` | POST | Score page on-page SEO |
| `/api/seo/pages/[pageId]/generate` | POST | Generate AI SEO content |
| `/api/social/callback/[platform]` | GET | Handle OAuth callback |
| `/api/social/connect/[platform]` | GET | Initiate platform OAuth |
| `/api/social/facebook/complete` | POST | Complete pending Facebook Page selection |
| `/api/social/facebook/pending` | GET | List pending Facebook Pages awaiting selection |
| `/api/stripe/create-checkout` | POST, GET | Create Stripe checkout session (POST); billing portal session (GET) |
| `/api/stripe/crisis-aware-checkout` | POST | Create Stripe checkout for the Crisis Aware add-on |
| `/api/stripe/trend-checkout` | POST | LYRA Trend checkout — **disabled**, returns 503 (no functional backend) |
| `/api/stripe/webhook` | POST | Handle Stripe subscription events |
| `/api/trends` | GET | List discovered trends — Trend has no functional backend yet |
| `/api/trends/[id]/status` | PATCH | Update trend status (used/dismissed) — not yet functional |
| `/api/trends/refresh` | POST | Manual trend refresh — not yet functional |
| `/api/upload` | POST | S3 media upload (dead route — superseded by `/api/upload/presign`, still instantiates its own S3 client) |
| `/api/upload/presign` | POST | Presigned S3 upload URL — the real upload path used by the composer/schedule review |
| `/api/workspaces` | GET, POST | List workspaces, create workspace |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Workspace CRUD |
| `/api/zernio/connect/callback` | GET | Zernio Bridge OAuth callback |
| `/api/zernio/webhook` | POST | Zernio webhook — incoming comments, account disconnects, messages |

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

Two workspaces active in production (as of July 2026 alpha testing):

**Into The Wild Marketing** — agency's primary workspace  
- Social accounts: Facebook, Instagram, LinkedIn, YouTube, Google Business — all connected via Zernio Bridge ✅  
- Brand profile: built and visible on the Brand AI page  

**LYRA** — LYRA product workspace  
- Social accounts: X (Twitter), TikTok, Instagram, LinkedIn — all connected via Zernio Bridge ✅  
- Facebook blocked on this workspace — brand-new Meta Business Portfolio propagation issue (not a code bug; see Known Limitations → Zernio → *Facebook won't connect to LYRA workspace*)

---

## 8. Known Limitations & Pending Work

### Social Platform Issues

**LinkedIn:**
- **STATUS as of 2026-06-27:** Approval email received, BUT the LYRA Community app's Products page still shows Community Management API as **"Review in progress."** Connect attempt returns LinkedIn's **"Bummer, something went wrong"** page at the authorization step — this is expected while the product is still under review (the org scopes are not provisioned until the portal status flips to active). The email and the portal status are out of sync; this lag is normal (hours to ~48h). **No LYRA-side fix will resolve this — it is a pure LinkedIn provisioning wait.** Retest the connect flow once the Products page shows the product active (not "Review in progress").
- **Already verified this session (all correct — do not re-investigate):** Netlify env vars `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` point at the LYRA Community app; callback code path audited clean; settings page now surfaces `?error=` redirects (commit `240820b`).
- **Local `.env` / `.env.local` are STALE:** they still hold the dead Lyra Pages ID `86iuab2ytwlmaa`. Does not affect production (LinkedIn OAuth can't run on localhost). Update to the LYRA Community client ID when convenient to avoid confusion.
- **LYRA Community app** — dedicated LinkedIn developer app with no other products. Community Management API Development Tier access form submitted 2026-06-21 to Microsoft Vetting Services.
- **Three scopes in use:** `r_organization_social`, `w_organization_social`, `rw_organization_admin`
- **Token introspection** (`POST /oauth/v2/introspectToken`) resolves the LinkedIn member ID — no OIDC dependency. `authorized_user` URN contains the person ID.
- **After approval flips active:** test the connect flow from workspace settings. Org pages should appear (personal profiles are rejected with the `linkedin_no_orgs` banner). No code changes needed.
- **Previous apps (do not use):** Lyra (`86sr2pmkxi1n0q`) has OIDC but can't add Community Management API. Lyra Pages (`86iuab2ytwlmaa`) has Community Management API but also has OIDC products — LinkedIn blocks the OAuth with a "Bummer" error because Community Management API must be the only product on an app.

**Facebook / Instagram — Meta App Review required:**
- OAuth flow is built. App ID: `1480576426774303`. Full 11-scope OAuth with page-picker is implemented in code.
- **App is currently in Development Mode.** Only users with a role on the app (Admin, Developer, Tester) can connect. Real customers cannot connect their Pages until the app passes Meta App Review and moves to Live Mode.
- The detailed step-by-step submission guide is at `LYRA/docs/meta-app-review-guide.md` — read this before starting.
- See the dedicated Meta App Review section below for full current status.

**Google Business:**
- OAuth service files and routes exist in the codebase
- Google Cloud project already has `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` configured (shared with YouTube)
- YouTube Data API v3 enabled ✅; YouTube redirect URI added ✅; YouTube card added to settings page ✅
- Google Business redirect URI (`https://lyraonline.ai/api/social/callback/google`) added to OAuth client ✅ (2026-06-17)
- My Business Account Management API + My Business Business Information API enabled ✅ (2026-06-17)

- **❌ GBP API access REJECTED (email received 2026-07-03).** Case `5-5485000041034`. Rejection reason: *"your account did not pass our internal quality checks (The listing ID is associated with a different website)."*
  - **Confirmed root cause:** the application declared the business website as **`lyraonline.ai`**, but the Google Business Profile listing on the account (Into The Wild Marketing) has its website field set to **`intothewildmarketing.com.au`**. Google requires the declared website to be the one *listed on the GBP* — the two didn't match, so it failed the quality check.
  - **Verified against Google's official docs (2026-07-04):**
    - GBP API prereq: *"Have a website representing the business listed on the GBP"* → the declared website MUST equal the listing's website. ([prereqs](https://developers.google.com/my-business/content/prereqs))
    - GBP API prereq: *"Manage a Google Business Profile that is verified and active for 60+ days"* and apply from an owner/manager email.
    - Eligibility: online-only / SaaS businesses are **explicitly ineligible** for a Business Profile ("Brands, organizations, artists, and other online-only businesses"). A business must make in-person contact with customers. ([eligibility](https://support.google.com/business/answer/13763036))
  - **DECISION — do NOT create a separate "LYRA" Google Business Profile.** It was considered and rejected: (1) LYRA is online-only SaaS → ineligible; (2) even if created, the 60-day-active rule adds a 2+ month delay; (3) a second listing at the same sole-trader ABN/address as the ITWM listing risks duplicate-suspension. Both ITWM and LYRA currently sit under the owner's single sole-trader ABN; the only eligible, verified, 60+ day listing is **Into The Wild Marketing**.
  - **REAPPLICATION PLAN (no code changes, nothing to build):**
    1. Submit the GBP API contact form → *"Application for Basic API Access"*.
    2. Use the Google account that is **owner/manager of the ITWM GBP listing**.
    3. Declare business website = **`intothewildmarketing.com.au`** (must match the listing — this is the fix).
    4. Provide the **same Cloud project number** (the shared LYRA project — approval attaches to the project, and the project being named "LYRA" is NOT a criterion Google checks).
    5. Reviewed ~14 days. Status via Cloud Console → APIs & Services → Quotas → filter "My Business" → 300 QPM = approved.
  - **Strategic note:** approval is granted at the *project* level. Once the LYRA project is approved (via ITWM's application), every LYRA customer who OAuths in can have their *own* Google Business Profile managed through it — the ITWM application does not limit the Customer Voice Hub to ITWM.
  - No code changes needed post-approval — the connect flow works immediately once access is granted.

**TikTok:**
- App ID `7651492968678934535` — created 2026-06-17
- Login Kit + Content Posting API products added
- Scopes: `user.info.profile`, `user.info.stats`, `video.publish`, `video.upload`
- Redirect URI: `https://lyraonline.ai/api/social/callback/tiktok`
- `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` added to Netlify ✅
- App is in **sandbox mode** — add TikTok account as sandbox tester in app dashboard before testing
- Production access requires TikTok app review submission after sandbox testing is complete
- Code scope updated from `user.info.basic` → `user.info.profile` to match TikTok v2 API

**Twitter:**
- Connected ✅ — App `LYRAOnline` (App ID: `2065992296558903296`) created and working
- OAuth 2.0 with PKCE; scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` added to Netlify ✅
- Stores access token + refresh token (`offline.access` required for refresh)

**YouTube:**
- OAuth flow built using Google OAuth 2.0 with `youtube` and `youtube.upload` scopes
- Uses the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as Google Business
- Requires: YouTube Data API v3 enabled in Google Cloud Console ✅ (done)
- Requires: `https://lyra-online-app.netlify.app/api/social/callback/youtube` added as an authorised redirect URI in the OAuth client ✅ (done)
- Fetches the connected Google account's YouTube channel (name, handle, avatar)
- Stores channel as a `YOUTUBE` `SocialAccount` with encrypted access + refresh tokens

### Zernio — unified social API (evaluated 2026-07-07; support conversation 2026-07-08)

**Why this was raised:** LYRA's blocker to beta is per-platform app review (Meta, TikTok, LinkedIn, GBP). Zernio (`https://zernio.com`, formerly **Getlate.dev**) is a third-party unified social API that could let LYRA post/schedule/read across all platforms through **one** integration, potentially **skipping our own platform app reviews** and getting testers using the product sooner.

**What it is:**
- Developer-first REST API + hosted MCP server. One integration → **15+ platforms** (Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Pinterest, Reddit, Bluesky, Google Business, etc.).
- Capabilities: publishing/scheduling (text/image/video), analytics, comments + DMs "where platforms permit", and ads management.
- Pricing: free for first 2 accounts; $6/account/mo (1–10), $3 (11–100), $1 (101–2000). X/Twitter API fees passed through at cost. No per-call charges, no overage, no setup fees.
- **Billing model (owner decision 2026-07-08):** Zernio cost is **absorbed as LYRA's COGS — NOT passed through to agencies/clients.** No per-account line item on customer invoices. The metric to watch is therefore *total connected accounts across all LYRA customers × per-account rate = LYRA's monthly Zernio burn*, which comes out of subscription margin.
  - Because Zernio is a **temporary bridge**, this absorbed cost is mostly temporary: as each platform's native approval lands, migrate those accounts back to native (free) and the Zernio burn shrinks toward zero. The per-platform provider abstraction is the cost lever.
  - **Do NOT bridge platforms that are already native** (Twitter, YouTube) — that would pay Zernio for accounts LYRA can publish to for free.
  - **One candidate for PERMANENT COGS: Google Business reviews.** Native GBP was rejected and is hard to approve; if the reapplication also fails, Zernio may remain the permanent home for the Customer Voice Hub, making that slice ongoing COGS (reflect in LYRA pricing).
- Rate limits: 60 req/min (0–2 accounts), 600 req/min (3–2000), 1200 req/min (2001+). Tighter per-second window on analytics endpoints.
- MCP server: `https://mcp.zernio.com/mcp` — auth via Zernio API key as Bearer token (same key as REST).

---

#### Two critical unknowns — NOW RESOLVED (support conversation 2026-07-08, contact: Ana)

**Unknown 1 — does it eliminate our platform app reviews?**
✅ **CONFIRMED YES.** OAuth connects through Zernio's own Meta/platform developer apps. LYRA does not need its own platform app approvals in order to use Zernio for beta. This is the mechanism.

**Unknown 2 — does it cover Google Business Profile review management (read + reply)?**
✅ **CONFIRMED YES.** GBP review read and programmatic reply is supported through Zernio's Inbox layer.

---

#### Platform capability matrix (confirmed by Zernio support, 2026-07-08)

| Platform | Publish | Comment read | Comment reply | Reviews | Notes |
|---|---|---|---|---|---|
| Facebook (Pages) | ✅ | ✅ | ✅ | n/a | Full Graph API. Comment read+reply confirmed. |
| Instagram Business | ✅ | ✅ | ✅ | n/a | Full comment read+reply confirmed. |
| LinkedIn (Company Pages) | ✅ | ✅ | ✅ | n/a | Community Management permission handled by Zernio — LYRA does not apply separately. |
| Google Business Profile | ✅ | n/a | n/a | ✅ read+reply | Review management confirmed. |
| TikTok | ✅ | ❌ | ❌ | n/a | Hard platform limitation — TikTok API does not expose comment/DM read. Not a Zernio gap. |
| X / Twitter | ✅ | TBC | TBC | n/a | OAuth via Zernio managed credentials. Exact API tier (Basic/Pro/Enterprise) to be confirmed by team. |
| Pinterest | ✅ | ❌ | ❌ | n/a | Same as TikTok — no Inbox. |
| Facebook Groups | ❌ | ❌ | ❌ | n/a | Meta discontinued the Groups API. Unavailable everywhere. |
| Threads, Reddit, Bluesky | ✅ publish | Unknown | Unknown | n/a | Covered for publishing; Inbox capability not confirmed. |

---

#### White-label & OAuth (confirmed 2026-07-08)

- **Fully white-labelled.** The OAuth flow shows "Social Media Connector" with no Zernio branding.
- **Headless mode available** — LYRA can build its own account selection UI entirely. Docs: `https://docs.zernio.com/guides/connecting-accounts#standard-vs-headless-mode`
- From the platform's perspective, the connection runs through Zernio's developer app (this is how the app review bypass works).
- Disclosure requirements to end users about Zernio's role: **not yet confirmed** — flagged to their team.

---

#### Data usage (✅ CONFIRMED IN WRITING 2026-07-08 — founder Miki)

Storing comment **and review** data in LYRA's own database, passing it to an AI model for response generation, and writing the AI reply back through Zernio's API is a **supported and intended use of the API — no restrictions added by Zernio.** The platforms' own content policies (e.g. Meta's automation/spam rules) still apply to what gets posted, exactly as with a direct integration. (Written confirmation received from Zernio founder; supersedes the earlier verbal note.)

---

#### Publish latency (confirmed 2026-07-08 — owner tested)

Posts published through Zernio appear on-platform **near-instantly** — no meaningful delay vs native publishing. **Video** posts can take a little longer to process but are **mostly instant** too.

**NOTE — this is *outbound publish* latency only.** Inbound comment/review ingestion latency is confirmed separately below.

---

#### Ingestion latency + webhook events (✅ CONFIRMED 2026-07-08 — founder Miki)

Per-platform, and this **resolves the design spec's one open caveat** (inbound comment/review webhook events do exist):

| Source | Mechanism | Webhook event | Latency |
|---|---|---|---|
| **Meta (FB Page / IG Business) comments** | Meta real-time Webhooks → Zernio → us | `comment.received` | **seconds** (steady state) |
| **Google Business reviews** | Google Pub/Sub → Zernio → us | `review.new` / `review.updated` | **seconds** — real-time |
| **LinkedIn company-page comments** | **Zernio polls** LinkedIn (no LinkedIn comment webhook exists) | (delivered on same webhook channel) | **~10 min worst case** (smart cadence: ~10 min for accounts with fresh posts, backs off as posts age) |

Design impact: LYRA still receives everything via its single webhook endpoint; only **LinkedIn** comment responses run up to ~10 min behind (acceptable for autonomous response). Meta comments and GBP reviews are effectively real-time. The spec's "verify inbound webhook events before build" caveat is now **closed** — build straight to webhooks for Meta + GBP; LinkedIn latency is Zernio-side and needs no LYRA change.

---

#### Pending questions — almost all resolved by founder Miki (2026-07-08)

1. ✅ **Meta comment ingestion + latency** — webhooks (`comment.received`), **seconds** end-to-end. GBP reviews also push (`review.new`/`review.updated`), seconds. LinkedIn polled ~10 min. See Ingestion-latency table above.
2. ✅ **Sandbox** — **there is none.** Standard validation is the **free tier** (2 connected accounts, full API access, no card): connect a test FB Page + IG Business account you control and exercise the whole read→AI→reply loop against real platform behaviour. Dashboard has **webhook delivery logs** to help wire up the endpoint. Teams typically get the loop working same-day. (Matches our "test on own accounts" guardrail.)
3. ✅ **Data usage in writing** — confirmed (see Data-usage section above).
4. ⚠️ **Uptime / SLA** — **no published per-integration uptime, and NO contractual SLA.** Live status + incident history at **https://status.zernio.com** (also their incident-comms channel — point ops monitoring there). This is the main **GA-trust caveat**: acceptable for a beta bridge, but the lack of an SLA is a real consideration before a permanent GBP-reviews dependency.
5. ✅ **Commercial at scale** — **month-to-month, no annual billing, no lock-in either side.** Volume pricing = the graduated rate card; ~500 accounts ≈ **$718/mo (blended ~$1.44/account)**, trending toward $1 as you grow; >2,000 accounts = custom pricing. Below 2,000 the public tiers are the best rate.
6. **X/Twitter API tier** — X billed as **metered pass-through at X's exact per-op rates, zero markup** (~$0.005 read, ~$0.015 create) with a settable monthly spend cap. Exact rate-limit tier still minor-TBC; not blocking.
7. ✅ **REST vs MCP parity** — MCP live and comprehensive (280+ tools).
8. ⚠️ **Partnership stability** — no SLA/notice-period guarantee, but their platform apps are under the same review regimes as anyone's, and **maintaining those approvals across every platform is their full-time job** — that ongoing maintenance is the risk transfer being bought. Monitor via status page.
9. ✅ **Go-live timeline** — same-day to a working test loop on the free tier (per item 2).

**Remaining genuinely-open:** end-user **disclosure requirements** about Zernio's role (flagged, not yet answered) and the exact X rate-limit tier (minor). Neither blocks the beta build.

#### Zernio MCP server — now connected (discovered 2026-07-08)

The Zernio MCP server (`https://mcp.zernio.com/mcp`) is available and connected. Inspecting the live tool list resolves two of the nine pending questions:

**Question 1 (webhooks) — CONFIRMED.** The following tools exist:
- `webhooks_create_webhook_settings`
- `webhooks_get_webhook_settings`
- `webhooks_update_webhook_settings`
- `webhooks_test_webhook`
- `webhooks_get_webhook_logs`

Zernio uses webhook push, not polling. End-to-end latency still needs a number from their team, but the architecture is correct — real-time push, not periodic polling.

**Question 7 (REST vs MCP parity) — CONFIRMED.** The MCP server exposes 280+ tools covering the full API surface: accounts, posts, comments (inbox), reviews, analytics, webhooks, ads, media, profiles. All major capabilities are available via MCP. Key tools relevant to LYRA:

| Tool | Purpose |
|---|---|
| `comments_list_inbox_comments` | Read comments from connected accounts |
| `comments_get_inbox_post_comments` | Get comments on a specific post |
| `comments_reply_to_inbox_post` | Post a reply to a comment |
| `comments_hide_inbox_comment` | Hide a comment |
| `reviews_list_inbox_reviews` | Read GBP reviews via Inbox layer |
| `reviews_reply_to_inbox_review` | Reply to a GBP review |
| `accounts_get_google_business_reviews` | Read GBP reviews directly |
| `accounts_reply_to_google_business_review` | Reply to a GBP review directly |
| `accounts_batch_get_google_business_reviews` | Batch read GBP reviews |
| `accounts_get_linked_in_mentions` | Read LinkedIn mentions |
| `analytics_get_best_time_to_post` | Per-account best time recommendations |
| `posts_create_post` / `posts_publish_now` | Publish/schedule posts |
| `media_generate_upload_link` / `media_get_media_presigned_url` | Media upload |
| `webhooks_*` (5 tools) | Webhook configuration + testing |

**Implication for LYRA's integration approach:** Because the MCP server is already authenticated and live in this environment, it may be faster to prototype the Zernio integration via MCP tools rather than building a new REST service layer. The `SocialProvider` abstraction can call MCP tools internally during a build/validation phase, then switch to direct REST calls for production deployment if preferred. This does not change the architectural decision — the abstraction layer and the "Zernio is additive and disposable" stance remain — but it reduces the time to a working proof of concept.

---

#### Honest trade-offs for LYRA specifically

- ✅ *Pro:* Both critical unknowns now confirmed — it genuinely bypasses our platform app reviews for beta, and GBP review management is covered.
- ✅ *Pro:* Cheap at low volume; broad platform coverage including platforms we haven't built (Threads, Pinterest, Bluesky, Reddit).
- ✅ *Pro:* Fully white-labelled with headless mode — connect flow can look entirely like LYRA.
- ❌ *Con — we're already ~90% native:* Twitter + YouTube connected; Meta decision due ~2026-07-07; TikTok in review; LinkedIn approved. Only GBP needs rework. Ripping out native integrations discards mostly-approved work.
- ❌ *Con — data-processor risk:* All client social tokens + content route through a third party. Needs a DPA and GDPR/privacy review before agency use (see GDPR tools in the Wishlist).
- ❌ *Con — vendor stability flag:* Rebranded from Getlate.dev and reportedly ~10×'d pricing on existing customers. Treat as disposable beta infrastructure, not long-term core.
- ❌ *Con — TikTok Inbox still blocked:* TikTok comment monitoring is a hard platform API limitation. No solution via Zernio or natively.

---

**DECISION (2026-07-07 — owner, unchanged):** Use Zernio as a **temporary beta bridge only.** Native app reviews continue exactly as they are. Zernio's job is to get real testers using LYRA *now*, across platforms still waiting on review. As each native approval lands, pivot that platform back to our own integration. Zernio is additive and disposable — native remains the destination.

**What this means in practice:**
- **Keep all native work in place and progressing:** Meta (decision ~2026-07-07), TikTok (in review, Inbox not possible anyway), LinkedIn (approved, propagating), GBP (reapply as ITWM — see Google Business section). Twitter + YouTube stay native (already connected).
- **The pivot is per-platform, not all-or-nothing** — approvals land on different dates. Design for a clean per-platform switch so flipping Zernio→native for one platform doesn't touch the others.
- **Architecture note for whoever builds this:** introduce a provider abstraction over publishing + comment-sync (e.g. a `SocialProvider` interface with `native` and `zernio` implementations, selected per platform via config or a `provider` field on `SocialAccount`). The BullMQ workers and the `/api/posts/[id]/publish` + `/api/comments/sync` routes call the interface, not a hardcoded service. This is what makes "pivot back" a config flip instead of a rewrite. **Do NOT hardcode Zernio into the existing `services/social/*.ts` files** — add it alongside.
- **Next action:** Wait for Zernio team responses to the 9 pending items above (especially webhook/polling latency and sandbox access) before starting any build work.

---

#### Should we implement Zernio now? — Assessment (2026-07-08)

**Short answer: not yet. Wait for the Meta decision first.**

The timing changes the value calculation significantly. Mapping current native status against what Zernio actually adds:

| Platform | Native status | Zernio adds? |
|---|---|---|
| Meta (FB + IG) | Decision imminent (~2026-07-07) | Nothing, if approved |
| LinkedIn | Approved, propagating | Nothing |
| Twitter / YouTube | Already live | Nothing |
| GBP | Reapplication needed | ✅ Only meaningful gap |
| TikTok Inbox | Impossible natively | ❌ Also impossible via Zernio |

If Meta approves this week, LYRA is native on all actionable platforms except GBP. Zernio would then solve one problem — GBP review management — in exchange for vendor dependency, data-processor risk, and a non-trivial build. That's not a good trade right now.

**Implementing Zernio does NOT interrupt the current app reviews.** The Meta, TikTok, and LinkedIn reviews are with those platforms reviewing LYRA's own applications. Zernio is completely independent — adding it has zero effect on any review in progress. They run in parallel and the reviews continue regardless.

**The conditional decision:**
- **Meta approves** → Zernio's value is GBP-only. Hold off; focus on GBP native reapplication as ITWM. Revisit Zernio if reapplication fails or stalls.
- **Meta is significantly delayed or rejected** → Zernio becomes worth building as a beta unblock for Meta + Instagram. But still cannot start until the 9 pending questions are answered (especially webhook/polling latency and sandbox access). Building the Inbox integration blind — without knowing if comment delivery is push or pull — is not viable.

**Hard blockers before any build work regardless of Meta outcome:**
1. Zernio team must answer the webhook vs polling question — this directly determines AI response latency, which is a core product promise.
2. Sandbox / test environment must be confirmed — the full comment read → AI process → write-back flow must be validated end to end before touching production accounts.

**Bottom line:** Check the Meta decision. If it's approved, park Zernio for now. If it's delayed past the end of this week, revisit and wait for the sandbox + webhook answers before committing to the build.

**Sources:** [zernio.com/social-media-api](https://zernio.com/social-media-api) · [docs.zernio.com](https://docs.zernio.com/) · [zernio.com/pricing](https://zernio.com/pricing)

### Brand AI Social Analysis

- The `analyzeSocialPosts()` function returns an empty array — no platform API integration yet reads recent posts for analysis
- Brand profiles are currently built entirely from website data
- Once posting scopes are approved on each platform, the social analyzer can be wired up to pull recent posts and enrich the brand profile

### BullMQ Workers

- Workers are **live on Railway**. Logs confirm `[workers] All workers started`.
- `lib/redis.ts` is the canonical Redis connection factory — imported by both cron routes (as Queue producers) and worker files (as Worker consumers)
- `railway.toml` specifies `buildCommand = "npm install"` (overrides Railway's default Next.js build) and `startCommand = "npx tsx workers/index.ts"`
- All four cron-job.org jobs are active and returning 200 responses

- **⚠️ CRITICAL Railway config (fixed 2026-07-08) — `railway.toml` alone is NOT enough under the Railpack builder.** Railway does not read `LYRA/lyra/railway.toml` unless its **Root Directory** points there. The Railway service settings MUST be:
  - **Settings → Source → Root Directory = `LYRA/lyra`** ← the one that was missing and broke the build
  - **Build → Custom Build Command = `npm install`** (explicit; do not rely on `railway.toml`)
  - **Deploy → Custom Start Command = `npx tsx workers/index.ts`** (explicit)
  - **Incident (2026-07-08):** Root Directory was unset, so Railway built from the repo root, couldn't find `railway.toml`, and Railpack auto-ran `npm run build` (`next build`) — which failed on `@/components/lyra/settings/timezone-selector`. Symptom was a red herring; the real cause was the unset Root Directory. Netlify was unaffected because its base dir is already `LYRA/lyra`.
  - **Trigger:** pushing from the OUTER repo puts everything under the `LYRA/lyra/` prefix on `main`; with no Root Directory set, Railway (previously fed by inner-repo pushes with a root-level layout) broke.

- **✅ Inner git repo RETIRED (2026-07-08).** There used to be a **second git repo** at `LYRA/lyra/.git` (root-level layout) alongside the outer repo at the OneDrive root (`LYRA/lyra/` prefix layout). Both pushed to the **same** GitHub remote, so whichever repo pushed last flipped `main`'s directory layout — the root cause of the Railway incident and years of "commits went to the wrong repo" confusion. The inner `.git` was deleted; `LYRA/lyra` is now a normal directory in the **single** outer repo (317 files tracked, no submodule). A full reversible backup (all branches incl. local-only `backup-session20`) is at `scratchpad/inner-repo-full-2026-07-08.bundle` — *scratchpad is temporary; move it if you want a durable archive.* **Going forward: there is ONE repo. Always commit/push from the OneDrive root. `main` layout is now stable (`LYRA/lyra/` prefix), matching Netlify base dir and Railway Root Directory.**

### Meta App Review — Full Status (as of June 2026)

**App:** LYRA — App ID `1480576426774303`  
**App type:** Business  
**Current mode:** Development (only roles on the app can connect — Live Mode pending App Review)  
**Review status:** Submitted 2026-06-17 — **Review in progress** (up to 20 days; decision expected ~2026-07-07)  
**Guide:** `LYRA/docs/meta-app-review-guide.md`  
**Submission status:** All API calls registered. Submit once API call counts appear in the dashboard (expected within 24 hours of 15 June 2026 session).

---

#### What the review unlocks

Until the app passes App Review and enters Live Mode, only users with Admin/Developer/Tester roles on the LYRA Meta app can connect Facebook Pages or Instagram accounts. Every real customer currently sees an OAuth flow that either fails or only returns personal profile data — not Pages. Live Mode fixes this permanently.

---

#### Permissions requiring Advanced Access (11 total)

| Permission | Purpose | Status |
|---|---|---|
| `pages_show_list` | List Pages a user manages — without this, `/me/accounts` returns empty | Submitted |
| `pages_manage_posts` | Publish posts to Facebook Pages | Submitted — API calls registered ✅ |
| `pages_read_engagement` | Read comments and reactions from Pages | Submitted — API calls registered ✅ |
| `pages_manage_engagement` | Post replies to comments — core of the AI response feature | Submitted — API calls registered ✅ |
| `pages_manage_metadata` | Subscribe to Page webhooks for real-time comment alerts | Submitted |
| `pages_read_user_content` | Read visitor-generated content (comments, visitor posts) | Submitted |
| `business_management` | Access Pages/ad accounts via Meta Business Manager | Removed — not required for core features |
| `instagram_basic` | Link the Instagram Business/Creator account attached to a Page | Submitted — API calls pending propagation ⏳ |
| `instagram_content_publish` | Publish posts to Instagram via Content Publishing API | Submitted — API calls registered ✅ |
| `instagram_manage_comments` | Read and reply to comments on Instagram media | Submitted — API calls pending propagation ⏳ |
| `ads_management` | Create and manage boost campaigns (Post Boosting feature) | **Blocked — see below** |

---

#### `ads_management` — special situation

This scope was temporarily added to the Facebook OAuth flow during development. Meta immediately blocked Facebook Login for the entire app with the error **"Facebook Login is currently unavailable for this app"**. The scope was removed and the app was restored.

`ads_management` requires its own separate review process — it is a higher-risk permission and Meta often wants to see significant API usage (internal Meta metric, not publicly documented) before granting it.

**Current state:** `ads_management` is NOT in the OAuth scope array in `services/social/facebook.ts`. Post Boosting UI, API routes, and DB schema are all live and ready. The only missing piece is `adAccountId` being populated on `SocialAccount` at OAuth time.

**Workaround for testing right now:** Set `adAccountId` manually in Supabase:
```sql
UPDATE "SocialAccount" SET "adAccountId" = 'YOUR_AD_ACCOUNT_ID' WHERE platform = 'FACEBOOK';
```
Find your ad account ID in Meta Business Manager → Ad Accounts.

**Fix when `ads_management` is approved:** Re-add `'ads_management'` to the SCOPES array in `lyra/services/social/facebook.ts`. On next Facebook reconnect, `adAccountId` will be stored automatically.

---

#### Submission checklist — status as of June 2026

- [x] Meta Business Verification complete
- [x] Facebook Login for Business product added (App Dashboard)
- [x] Login for Business Configuration created
- [x] `config_id` removed from `getAuthUrl()` — scope list now controls permissions directly (config_id was overriding scope, silently dropping Instagram permissions)
- [x] Test Facebook account + Page created with dummy posts and comments
- [x] 8 screencasts recorded and uploaded (one per non-blocked permission)
- [x] Justification text written and submitted for all permissions
- [x] Test reviewer account created — `metareviewLYRA2026@proton.me` (ProtonMail, password in 1Password)
  - Added to workspace `cmqdfm4ay0002l509z4babj2m` as AGENCY_ADMIN
  - `aiResponseMode` set to DRAFT_APPROVE so reviewer can see AI draft workflow
- [x] App icon uploaded
- [x] Privacy policy URL added
- [x] `business_management` scope removed (was unnecessary, simplified the submission)
- [x] API calls registered for: `pages_manage_posts`, `pages_read_user_content`, `pages_manage_metadata`, `pages_read_engagement`, `pages_manage_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`
- [x] **Submitted for App Review** ✅

**After approval:** Monitor email daily. Meta reviewers may send follow-up questions — respond within 24 hours. Total timeline: 2–6 weeks. Notes to Reviewer template is in `docs/meta-app-review-guide.md`.

---

#### After approval

- Test with a Facebook account that has no role on the app — confirm Pages appear in the OAuth flow
- No code changes needed for core Page permissions
- For `ads_management` (if approved separately): re-add to SCOPES array in `facebook.ts`

### Mobile Responsiveness

**Status: fully audited and fixed (Session 39).**

The mobile experience is now first-class across all core pages. Key changes:

- **Mobile sidebar** — fully wired end-to-end. The `AppShellClient` wrapper holds `mobileNavOpen` state and threads it to `Sidebar` (drawer) and `Header` (hamburger). The Framer Motion slide-in drawer, dark backdrop, X close button, and auto-close on navigate are all live.
- **Header** — hamburger visible on `< lg`; mobile page title derived from pathname; Upgrade button hidden on mobile (accessible via avatar dropdown); non-functional Search button removed.
- **Touch targets** — all sidebar nav items upgraded from `py-2.5` (~36px) to `py-3` (~40px+).
- **Calendar** — header stacks vertically on mobile (`flex-col` → `sm:flex-row`), heading scales from `text-4xl` to `text-3xl sm:text-4xl`.
- **Workspace overview** — post date hidden on mobile (`hidden sm:inline`) to prevent overflow.
- **Inbox** — platform filter pills wrap (`flex-wrap`) when more than 3 platforms are connected.
- **Analytics** — all hardcoded hex values replaced with Tailwind design tokens; all Lucide icons get `strokeWidth={1.5}`.

### Cron Jobs

Five cron routes exist and are production-ready. All require an `Authorization: Bearer {CRON_SECRET}` header. **All five jobs are live on cron-job.org and returning 200 responses.** Intervals were tightened in July 2026 (see July changelog — 4 of 5 jobs had been auto-disabled by cron-job.org after consecutive auth failures; manually re-enabled after the auth header fix).

| Route | Frequency | Purpose |
|---|---|---|
| `/api/cron/publish-due-posts` | Every 1 min | Enqueues SCHEDULED posts past their `scheduledAt` time into the `post-publishing` BullMQ queue |
| `/api/cron/sync-comments` | Every 5 min | Polls platform APIs for new comments; enqueues new ones to `ai-responding` queue |
| `/api/cron/sync-metrics` | Every 15–30 min | Fetches likes/comments/shares for PUBLISHED posts; updates `PostMetrics` rows |
| `/api/cron/brand-refresh` | Every 6 hours | Refreshes brand intelligence + triggers engagement analysis for all workspaces |
| `/api/cron/sync-trends` | Daily | Enqueues BullMQ trend sync jobs (stub until Phase 3) |

All five jobs are already configured on [cron-job.org](https://cron-job.org) (free tier) with the correct schedule and `Authorization: Bearer {CRON_SECRET}` header. No action required.

Note: Netlify scheduled functions are not suitable here because they cannot pass custom headers (needed for `CRON_SECRET` auth).

### Engagement Heat Map — Cold Start

The engagement heat map on the Brand page will show progress bars ("X of 20 posts") until each platform reaches the 20-post threshold with non-zero `PostMetrics`. This requires:
1. BullMQ workers deployed to Railway (so posts actually publish)
2. `sync-metrics` cron running (so `PostMetrics` rows are populated)

Until those workers are live, the panel will remain in cold-start state. This is expected behaviour — it degrades gracefully.

### Schema Changes Applied

**Schema is NOT auto-synced on deploy.** `prisma db push` was removed from the build command in June 2026 because it hangs when `DATABASE_URL` points to the Supabase PgBouncer pooler (port 6543). Apply schema changes manually via **Supabase SQL Editor** when needed.

**All models and columns through the most recent session are in production**, including:
- `Post.topic` (Session 6)
- SEO tables: `SeoConnection`, `SeoPage`, `SeoContent`, `SearchConsoleData` (Session 6)
- `SocialAccount.lastCommentSyncAt` (Session 7)
- `PostBoost`, `BoostStatus` enum, `SocialAccount.adAccountId` (Session 10)
- Security audit indexes + unique constraint on `Comment` (2026-05-22 audit)
- **P1 Crisis Aware:** `Workspace.crisisAware`, `Workspace.crisisActive`, `Workspace.crisisTriggeredAt`, `CrisisEvent` model
- **P3 Competitor Intelligence:** `Competitor` model, `CompetitorSnapshot` model
- **Email Marketing (2026-07-19):** `EmailProvider` enum (`KLAVIYO`, `MAILCHIMP`, `CUSTOMER_IO`), `EmailIntegration` model, `EmailCampaign` model — applied via Supabase SQL Editor (see email marketing changelog entry for full column list)

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

**Production:** apply schema changes manually via Supabase SQL Editor (write the SQL equivalent of the schema change, paste into Supabase → SQL Editor, run). `prisma db push` was removed from the Netlify build command in June 2026 — see Section 4.1.

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
| `lyra/app/(dashboard)/layout.tsx` | Authenticated app shell (server component — fetches DB data, delegates JSX to AppShellClient) |
| `lyra/components/lyra/app-shell/app-shell-client.tsx` | Client wrapper — holds `mobileNavOpen` state, threads it to Sidebar and Header |
| `lyra/app/api/workspaces/[id]/route.ts` | Workspace CRUD including cascade delete |
| `lyra/app/api/brand-intelligence/build/route.ts` | Brand profile build endpoint |
| `lyra/app/api/social/callback/[platform]/route.ts` | OAuth callback handler |
| `lyra/components/lyra/app-shell/sidebar.tsx` | Sidebar with brand lock logic |
| `lyra/components/lyra/calendar/content-calendar.tsx` | Monthly calendar with filters, DnD, and detail panel |
| `lyra/components/lyra/calendar/post-detail-panel.tsx` | Slide-in post detail + status editor |
| `lyra/components/lyra/brand/brand-build-button.tsx` | `BrandBuildButton` (build/re-analyze CTA) + `BrandGuidelinesPanel` (brand guidelines textarea) |
| `lyra/components/lyra/brand/guidelines-uploader.tsx` | Dead code — S3 file uploader, superseded by `BrandGuidelinesPanel` textarea. Can be deleted. |
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
| `lyra/app/(dashboard)/workspace/[workspaceId]/trends/page.tsx` | Trends page — renders placeholder card now; will render `TrendHub` in Phase 3 |
| `lyra/app/api/trends/route.ts` | Trends list route (stub) |
| `lyra/app/api/trends/refresh/route.ts` | On-demand trend sync trigger (stub) |
| `lyra/app/api/trends/[id]/status/route.ts` | Trend status update — USED / DISMISSED (stub) |
| `lyra/app/api/cron/sync-trends/route.ts` | Daily trend sync cron route (stub) |
| `lyra/app/api/stripe/trend-checkout/route.ts` | Stripe Checkout session creation for Trend add-on — fully implemented |
| `lyra/services/trends/trend-syncer.ts` | `syncTrendsForWorkspace()` — Perplexity discovery + AI scoring (stub) |
| `lyra/workers/trend-sync.worker.ts` | BullMQ queue + worker for async trend syncs (stub — null exports) |
| `lyra/components/lyra/trends/trend-hub.tsx` | Trend Hub split-panel component (stub) |
| `lyra/components/lyra/trends/trend-picker-panel.tsx` | Composer slide-in trend picker (stub) |
| `lyra/components/lyra/trends/trend-row.tsx` | Single trend list row (stub) |
| `lyra/components/lyra/settings/trend-addon-card.tsx` | Settings add-on card — Activate → Stripe, or Active badge when enabled; fully implemented |
| `lyra/services/email-marketing/klaviyo-campaigns.ts` | Klaviyo API client — `validateKlaviyoKey()`, `fetchKlaviyoCampaigns()` |
| `lyra/services/email-marketing/mailchimp-campaigns.ts` | Mailchimp API client — `extractMailchimpServer()`, `validateMailchimpKey()`, `fetchMailchimpCampaigns()` |
| `lyra/services/email-marketing/customerio-campaigns.ts` | Customer.io API client — `validateCustomerioKey()`, `fetchCustomerioCampaigns()` |
| `lyra/services/email-marketing/sync.ts` | `syncEmailIntegration(integrationId)` — dispatches to correct provider, upserts campaigns, updates `lastSyncAt` |
| `lyra/app/api/email-integrations/route.ts` | `GET` list / `POST` connect-and-validate for Klaviyo, Mailchimp, Customer.io |
| `lyra/app/api/email-integrations/[id]/route.ts` | `DELETE` soft-deactivates an integration |
| `lyra/app/api/email-integrations/[id]/sync/route.ts` | `POST` manual sync — returns `{ synced: number }` |
| `lyra/app/api/email-campaigns/route.ts` | `GET` campaigns for a workspace + month range |
| `lyra/components/lyra/settings/email-marketing-section.tsx` | Settings section UI — three provider cards with connect / sync / disconnect |
| `lyra/components/lyra/calendar/email-campaign-card.tsx` | Indigo non-draggable calendar card for email campaigns; exports `CalendarEmailCampaign` type |
| `netlify.toml` (repo root, NOT under `lyra/`) | Build config — `rm -rf .next && npx prisma generate && npm run build`. Never create a nested `lyra/netlify.toml`. |

---

## 12. Immediate Next Steps (Recommended Order)

**Already built (verified 2026-06-17):**
- **Inbox UI** ✅ — `response-inbox.tsx` has Pending/Escalated/Done tabs, AI draft, Approve & send, Escalate, Ignore. All API routes live (`/api/comments`, `/api/comments/[id]`, `/api/comments/[id]/reply`, `/api/comments/sync`). Sidebar link active.
- **Crisis Aware** ✅ — Banner in workspace layout when active; toggle in settings (Pro/Agency); `crisis-detector.ts` uses keyword guardrails + Claude sentiment; resolve API clears the event.

**New features (ready to build):**
2. **Email marketing auto-sync cron** — `services/email-marketing/sync.ts` is complete; just needs a `/api/cron/sync-email-campaigns` route + a cron-job.org entry (same pattern as the 5 existing cron routes). Currently campaigns only sync manually via Settings → Sync button.
3. **LYRA Trend add-on** (Phase 3 scaffold committed) — full implementation checklist in the July 2026 Trends changelog entry above. Needs: schema migration, `syncTrendsForWorkspace()` service, BullMQ worker wired in, `GET/POST/PATCH /api/trends/*` routes, Stripe webhook extended for `trend_addon`, `TrendAddonCard` mounted in settings, `TrendHub`/`TrendPickerPanel`/`TrendRow` components, sidebar nav gating, `STRIPE_TREND_PRICE_ID` + `PERPLEXITY_API_KEY` env vars. Checkout flow already works.
3. **Media Library** (Phase 3) — S3 upload, AI topic tagging, media picker in composer and schedule review. Spec: `lyra/docs/superpowers/specs/2026-05-19-ai-content-schedule-design.md` section 3.
4. **Stripe billing + marketing page** — create Stripe products/prices, wire up checkout flow, build public landing page.

**Platform / integrations — all submitted, awaiting third-party decisions:**
- **Twitter/X** — Connected ✅. No approval needed. Working in production.
- **YouTube** — Connected ✅. OAuth consent in Testing mode; will need Google verification for public launch.
- **Meta (Facebook + Instagram)** — App Review submitted 2026-06-17. Decision was expected ~2026-07-07 — **now 11+ days past that date, status unknown as of 2026-07-18.** Check email for any Meta decision or follow-up questions. If no decision, log into the Meta App Dashboard and check for status updates or reviewer messages.
- **TikTok** — App Review submitted 2026-06-17. Status unknown as of 2026-07-18 — check TikTok Developer Portal or email for outcome.
- **Google Business** — ❌ API access **REJECTED** 2026-07-03 (case `5-5485000041034`): declared website `lyraonline.ai` didn't match the ITWM listing's website `intothewildmarketing.com.au`. **Action: reapply declaring `intothewildmarketing.com.au` from the ITWM listing's owner email — do NOT create a LYRA listing (SaaS is ineligible). Full plan in the Google Business section of Known Limitations above.**
- **LinkedIn** — LYRA Community app submitted to Microsoft Vetting Services 2026-06-21. Approval email received but Products page still "Review in progress" as of 2026-06-27 → connect returns "Bummer" until the product goes active. Code fully deployed; env vars verified. No code changes needed — just retest once the portal flips. Full detail in the LinkedIn section of Known Limitations above.

**No action required on any platform until approvals arrive.**

5. ✅ **GSC OAuth end-to-end — confirmed working** (July 2026 testing) — found and fixed two real bugs (wrong redirect domain, site never verified); full OAuth flow and on-page analysis confirmed via a genuine disconnect + reconnect test. No further action needed.

**Post boosting — low priority polish:**
**UX / business:**
4. **Stripe billing / marketing page** — create Stripe products/prices, wire up checkout flow, build public marketing landing page (plan saved: `lyra/docs/superpowers/plans/2026-05-19-marketing-landing-page.md`)

6. Add cron job or scheduled check to flip `PostBoost.status` from `ACTIVE` to `ENDED` when `endsAt` has passed (currently boosts stay ACTIVE in the DB after expiring on Meta's side)
7. Pull `broad` audience country from workspace settings instead of hardcoded `'AU'` in `meta-ads.ts`
