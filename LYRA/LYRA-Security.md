# LYRA — Security Reference Document

**Prepared:** 2026-08-13
**Purpose:** A single reference for a security review / penetration test ahead of LYRA's beta launch. Covers architecture, controls already in place, what was verified in the pre-beta hardening pass, and — just as important — what's explicitly *not* covered and should get the most attention.

**Codebase state this document describes:** `main` @ `8229c45`

---

## 1. What LYRA is

LYRA is a multi-tenant B2B SaaS platform for social media agencies: AI-assisted content creation, scheduling, publishing, comment/review response automation, and client approval workflows across multiple client accounts ("workspaces") per agency.

The security-critical property of this system is **tenant isolation** — an agency managing 20 client workspaces must never be able to see or act on data belonging to a workspace they don't have access to, and within a workspace, role boundaries (e.g. a client's read-only viewer vs. an agency admin) must hold.

---

## 2. Architecture

| Layer | Technology | Notes |
|---|---|---|
| Web app | Next.js 16 (App Router), TypeScript | Hosted on **Netlify** (hosted CI/CD build + serverless functions) |
| Database | PostgreSQL via **Supabase**, accessed through **Prisma ORM** | All queries go through Prisma's query builder — no raw SQL string concatenation anywhere in the app |
| Background jobs | **BullMQ** workers (post publishing, comment sync, AI response generation, notification delivery), hosted on **Railway** | Backed by Redis |
| Cache / queue / rate limiting | **Redis** (Upstash), shared between the Netlify app and the Railway worker fleet | |
| Object storage | **AWS S3** | User-uploaded and AI-generated media |
| Authentication | **Auth0** (OAuth 2.0/OIDC), via `@auth0/nextjs-auth0` v4 SDK | Session-cookie based for the web app; separate bearer-JWT flow for the MCP server (§13) |
| Billing | **Stripe** | Hosted Checkout, webhook-driven fulfillment |
| Social platform integration | **Zernio** — a third-party unified social media API that LYRA uses instead of maintaining native integrations with every platform (Facebook, Instagram, LinkedIn, TikTok, X, YouTube, Google Business, Pinterest, Threads, Bluesky, Slack) | LYRA does not hold direct OAuth tokens for most platforms — Zernio does, and proxies API calls. A small number of legacy "native" integrations still exist for platforms LYRA connected before adopting Zernio. |
| AI | **Anthropic Claude API** | Content generation, scoring, brand intelligence, AI-assisted comment responses |
| Transactional email | **Resend** | Currently used only for Crisis Aware alert emails |
| Separate service | **LYRA MCP** (`mcp.lyraonline.ai`), hosted on Railway | A Model Context Protocol server letting AI agents (Claude, etc.) act on a LYRA account via natural language. Shares the main app's Auth0 tenant and database. See §13 — this is a distinct attack surface. |

No mobile app exists. No self-hosted infrastructure (no VMs to patch, no network to segment) — everything is PaaS.

---

## 3. Multi-tenancy & data model

```
Agency (1) ──< Workspace (many) ──< WorkspaceAccess (many) >── User (many)
```

- A **User** can have access to multiple **Workspaces** via **WorkspaceAccess** rows, each carrying a **role**.
- **UserRole** enum: `PLATFORM_OWNER`, `AGENCY_ADMIN`, `AGENCY_MEMBER`, `SMB_OWNER`, `CLIENT_APPROVE`, `CLIENT_VIEW`.
- `CLIENT_VIEW` is the read-only tier — the product's whole client-facing value proposition depends on this role never being able to write. It's the role every authorization check treats as the default-deny case.
- `Workspace.clientAccessLevel` (`NONE` / `VIEW` / `APPROVE`) controls whether client-role users can approve posts, separate from their `WorkspaceAccess` role.

**Two authorization patterns are used consistently across the codebase** (confirmed via a fresh audit of all 82 API routes, see §11):
1. **Scoped resource lookup** — the Prisma query for the target resource includes a nested relation filter, e.g. `prisma.post.findFirst({ where: { id: postId, workspace: { access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } } } })`. A non-member's query simply returns `null`/404 — the row is never loaded into scope.
2. **Explicit access check before proceeding** — `prisma.workspaceAccess.findFirst({ where: { workspaceId, userId } })`, then a role check (`canWrite()`, `APPROVER_ROLES`, or a route-specific allowlist) before any read/write.

`lib/authz.ts`:
```ts
export function canWrite(role: UserRole): boolean {
  return role !== 'CLIENT_VIEW'
}
export const APPROVER_ROLES: readonly UserRole[] =
  ['PLATFORM_OWNER', 'AGENCY_ADMIN', 'AGENCY_MEMBER', 'SMB_OWNER', 'CLIENT_APPROVE'] as const
```
`APPROVER_ROLES` is a deliberate allowlist, not derived from `canWrite()`, even though they currently agree — an allowlist fails closed (a new role gets nothing until added), while `canWrite` fails open (a new role gets write access unless it's `CLIENT_VIEW`). The comment in the source is explicit about this being intentional, not an oversight.

**A body/query-supplied `workspaceId` is never trusted on its own.** Every route checked re-derives or cross-checks the actual resource's workspace against the authenticated user's access — e.g. bulk-import's commit route re-validates every caller-supplied `socialAccountId` against the target workspace's actual connected accounts before writing, rather than trusting that a client-side review screen only ever sends legitimate IDs.

---

## 4. Authentication

- **Auth0**, OAuth 2.0/OIDC, via the official `@auth0/nextjs-auth0` v4 SDK. LYRA does not implement its own password storage, session token generation, or login flow — this is fully delegated.
- Session cookie: `SameSite=Lax` (SDK default, not overridden). No custom cookie logic in the app.
- Auth0 also fronts brute-force / credential-stuffing protection on login attempts natively — not something LYRA's own code implements or needs to.
- **MFA status is not verified from the codebase** — it's a tenant-level Auth0 dashboard setting. **This is the one open item from the pre-beta review that needs manual confirmation.**

### Bearer-token auth (MCP / API access)
A separate, additive auth path exists in `lib/auth.ts` for the MCP server and any future API-key-style access: a bearer JWT is verified via `lib/jwt-verify.ts` using `jose`, checking:
- Signature against Auth0's JWKS endpoint (`RS256` only)
- `issuer` matches the Auth0 tenant
- `audience` matches `AUTH0_MCP_AUDIENCE` explicitly — **both env vars are asserted present and the function throws rather than silently skip the audience check**, closing a real bug class (jose treats `audience: undefined` as "don't check," which would let a token issued for a *different* Auth0 API in the same tenant authenticate here)

---

## 5. Session management & CSRF

- No separate CSRF token system exists.
- **Reliance is entirely on `SameSite=Lax` session cookies.** Verified (not just assumed) during the pre-beta review:
  - The cookie's `SameSite` is explicitly set to `Lax` by the Auth0 SDK's own default, not left unset (which matters — some browsers grant unset-`SameSite` cookies a ~2-minute same-site grace period on top-level POST navigations that explicit `Lax` does not get).
  - `middleware.ts`'s matcher excludes `/api/*` — no CSRF-relevant logic happens at the edge layer either; protection is the cookie behavior itself.
  - The two routes accepting `multipart/form-data` (`upload`, `bulk-import/parse`) were specifically checked: both call `requireAuth()` first, and since the session cookie is `SameSite=Lax`, a cross-site HTML form POST to either endpoint arrives without the cookie and fails auth before any processing happens.
- **This is an accepted, verified-adequate design for the current architecture** — not an oversight. It should be re-evaluated if the app ever adds a cross-origin embed/iframe scenario or sets any cookie with `SameSite=None`.

---

## 6. Input validation & injection defense

- **SQL injection**: not applicable in the traditional sense — 100% of database access goes through Prisma's query builder. No raw SQL string interpolation exists in the app.
- **XSS**: React's default JSX escaping handles the general case. Two specific untrusted-content-into-templated-output paths have deliberate additional escaping:
  - Slack notification messages (`services/notifications/slack-formatter.ts`) — `escapeSlack()` escapes `&`, `<`, `>` before untrusted content (comment bodies, post excerpts, failure reasons, workspace/author names) is interpolated into Slack mrkdwn, specifically to stop an untrusted string like `<https://evil.example|Click here>` from rendering as a real, LYRA-branded clickable link.
  - AI prompt construction (`lib/anthropic.ts`'s `neutralizeFenceCloser()`) — every place untrusted content (a comment, a scraped webpage, a competitor post) is fenced between XML-style tags before being sent to Claude has any literal closing-tag-like substring broken, so untrusted text can't prematurely close its own fence and have subsequent "instructions" text be read as trusted. Applied at every Claude call site that touches untrusted content (comment response generation, crisis detection, content scoring, brand intelligence, content repurposing, SEO content generation, competitor theme extraction) — confirmed the tag-name argument is always a hardcoded literal at all 9 call sites, never itself attacker-influenced.
- **Prototype-pollution-adjacent validation bugs**: one real instance found and fixed in the pre-beta pass — `!PLANS[plan]`-style truthiness checks against a plain object literal are bypassable by `Object.prototype` property names (`"__proto__"`, `"constructor"`, etc.). Fixed with `Object.hasOwn()` in the one place it was found (`app/api/stripe/create-checkout`); the equivalent pattern was already correctly implemented elsewhere (`app/api/upload/media-presign`).
- **File upload validation**: content-type allowlists (not extension-based) on direct uploads; the bulk-import media pipeline separately validates fetched content-type before accepting a re-hosted file (see §7).

---

## 7. SSRF protection

Any feature that fetches a URL supplied (directly or indirectly) by a user is a potential SSRF vector — the classic target being cloud metadata endpoints (`169.254.169.254`) or internal services on the same private network as the app's own compute.

**`lib/safe-fetch.ts`** is the single, shared hardened fetch wrapper used everywhere this matters. It:
- Resolves the hostname via DNS itself, then validates the **resolved IP** (not just the hostname string) against a blocklist covering: RFC 1918 private ranges, loopback, link-local (**including the cloud-metadata range**, 169.254.0.0/16), CGNAT (100.64.0.0/10), 0.0.0.0/8, the IETF protocol-assignment block (192.0.0.0/24 — which includes Oracle Cloud's own metadata endpoint at 192.0.0.192), RFC 2544 benchmarking space, multicast, and reserved/broadcast.
- Handles IPv6 explicitly, including addresses with an embedded IPv4 tail (e.g. `::ffff:169.254.169.254`), which is a common bypass technique for IP-based blocklists that only parse IPv4 syntax.
- **Pins the validated IP to the actual connection** (via a custom `undici` dispatcher) rather than re-resolving DNS at fetch time — closing the classic DNS-rebinding TOCTOU gap where a hostname resolves to a safe IP at validation time and a private IP at request time.
- Follows redirects manually (`redirect: 'manual'`, max 3 hops by default), **re-validating the target of every redirect hop** through the same IP-blocklist check — a URL that passes initial validation but redirects to an internal address is still caught.

**Verified during the pre-beta review**: every site in the codebase that fetches a user-influenced URL routes through `safeFetch` — traced ~125 raw `fetch(` call sites; zero bypasses found. Covers: brand intelligence website scraping, competitor website/RSS-feed scraping, SEO on-page analysis, AI content repurposing (article URL extraction), bulk-import media validation (HEAD check) and re-hosting (full fetch), the "import media from URL" upload route, and email-marketing integration API calls. Everywhere else `fetch()` is called, the host is either a hardcoded first-party API (Meta, LinkedIn, Google, Zernio, Auth0, Anthropic, Stripe, Klaviyo, Customer.io) with only a path/query segment interpolated, or a client-side call to LYRA's own relative API routes.

One noted non-issue: `services/social/provider/native.ts`'s Instagram publish flow places a user-controlled `image_url` into a request sent *to Meta's own Graph API* — Meta's servers fetch that URL, not LYRA's infrastructure, so it's outside `safeFetch`'s threat model by design (it's Meta's own SSRF surface to defend, via their Graph API's own image-ingestion handling).

---

## 8. Rate limiting & abuse prevention

`lib/rate-limit.ts` — Redis-backed fixed-window counter (atomic `INCR`+`EXPIRE` via a single Lua script, so a crash between the two operations can't leave a key permanently un-expiring). Keyed by `user.id` for authenticated routes, by best-effort client IP (`x-forwarded-for`) for unauthenticated ones.

**Current coverage** (route key | limit | window in seconds):

| Route | Limit | Window |
|---|---|---|
| `ai-generate` | 20 | 60s |
| `ai-repurpose` | 20 | 60s |
| `ai-respond` | 20 | 60s |
| `ai-score-content` | 20 | 60s |
| `seo-generate` | 20 | 60s |
| `schedule-generate` | 10 | 60s |
| `reports-generate` | 10 | 300s |
| `brand-intelligence-build` | 5 | 300s |
| `comments-sync` | 10 | 60s |
| `mcp-respond` | 20 | 60s |
| `mcp-audit` | 120 | 60s |
| `boost-create` (spends real Meta ad budget) | 10 | 300s |
| `bulk-import-parse` | 10 | 60s |
| `bulk-import-commit` (external fetch + S3 write per row, up to 500 rows/call) | 5 | 300s |
| `upload` | 30 | 60s |
| `upload-presign` | 30 | 60s |
| `upload-media-presign` | 20 | 60s |
| `upload-from-url` | 20 | 60s |
| `help-pdf` (unauthenticated, launches headless Chromium) | 5 | 600s |
| `klaviyo-subscribe` (unauthenticated) | 5 | 600s |
| `oauth-register` (unauthenticated DCR endpoint — see §13) | 5 | 600s |
| `onboarding-get` / `onboarding-patch` (unauthenticated) | 20 | 300s |

**Unauthenticated routes not rate-limited, and why that's correct**: Stripe and Zernio webhook receivers have no IP-based rate limit — signature verification (§9) is the real gate, and rate-limiting by IP would risk dropping legitimate traffic from those providers' own infrastructure. `health` does a DB/Redis ping with no side effects.

All webhook routes, OAuth callbacks, and authenticated-but-workspace-scoped routes are additionally gated by their own authorization checks (§3), which is a stronger barrier than IP-based rate limiting for most of the API surface — rate limiting is specifically for routes that are either unauthenticated or trigger real external cost (LLM calls, ad spend, external fetches, headless browser rendering) even from a legitimately authenticated caller.

---

## 9. Webhook security

Two inbound webhook receivers exist, both verified during the pre-beta review with no findings:

**Stripe** (`app/api/stripe/webhook/route.ts`):
- Uses Stripe's own SDK (`stripe.webhooks.constructEvent(rawBody, signatureHeader, secret)`), which internally does constant-time comparison.
- Reads the **raw, unparsed** request body (`req.text()`) for verification — never parses JSON first (a common real-world bug that breaks signature verification).
- Secret from `STRIPE_WEBHOOK_SECRET` env var.
- Tenant scoping: `checkout.session.completed` reads `agencyId`/`workspaceId`/`userId` from `session.metadata`, which is only ever set server-side (in the authenticated checkout-creation route) — never a client-controllable field on the inbound webhook itself. Subscription events key off Stripe's own customer ID matched against a value LYRA itself wrote after a verified checkout.
- Has idempotency handling (a `ProcessedWebhookEvent` dedupe table) that un-marks on handler failure so Stripe's own retries aren't silently lost.

**Zernio** (`app/api/zernio/webhook/route.ts`):
- Custom HMAC-SHA256 verification (`services/social/webhook-verify.ts`), checked against an `X-Zernio-Signature` header (with a legacy `X-Late-Signature` fallback).
- **Explicitly constant-time**: length-checked first (since `crypto.timingSafeEqual` throws on mismatched lengths rather than returning false), then `timingSafeEqual`.
- Raw body used for the HMAC; JSON parsing happens only after verification succeeds.
- If `ZERNIO_WEBHOOK_SECRET` is unset, the route **fails closed** (500), not silently skips verification.
- Tenant scoping: routes by `SocialAccount.zernioAccountId`, a value LYRA wrote into its own database at connection time — never derived from the webhook payload itself.

---

## 10. Secrets management & encryption

- **No secrets are hardcoded anywhere** — confirmed by a full sweep during the pre-beta review: git history checked for any committed `.env`/credential files (only `.env.example` templates, all placeholders), plus a source-tree grep for AWS keys, live Stripe keys, PEM private key blocks, Slack tokens, and generic `apiKey`/`secret`/`password` literal assignments. All clean.
- All configuration/secrets are environment variables (see §14 for the full inventory of names, no values).
- **At-rest token encryption**: social account access/refresh tokens, SEO connection tokens, and email marketing integration API keys are encrypted with **AES-256-GCM** (`lib/encrypt.ts`) — random 12-byte IV per encryption, authenticated (GCM tag verified on decrypt, so tampering is detected, not just confidentiality protected). The encryption key (`ENCRYPTION_KEY`, 32 bytes hex) is explicitly documented as never-to-be-rotated once accounts are connected, since rotating it would make all previously-encrypted tokens unreadable — a real operational constraint worth knowing if key rotation ever comes up.
- **PKCE `code_verifier`** for OAuth flows is stored server-side in Redis, not in client-visible state (fixed in an earlier hardening pass — previously it sat in the client-visible OAuth `state` parameter).
- **`ZERNIO_API_KEY` is a single master key shared across every LYRA workspace** — meaning any Zernio OAuth callback must independently re-verify that a returned account genuinely belongs to the claiming workspace's own `zernioProfileId`, since redirect query params alone are not tenant-scoped. This pattern is implemented consistently across the Zernio-related callback routes (social connect, notification-channel connect).

---

## 11. Recent adversarial review (2026-08-13, pre-beta)

Four independent audits were run against the live codebase (not a self-report — each was scoped to hunt for a specific bug class and report only confirmed findings with exact file/line and a concrete exploit scenario):

| Audit | Coverage | Result |
|---|---|---|
| Cross-tenant IDOR | All 82 API route files under `app/api/` | **Zero findings.** |
| SSRF / external fetch | ~125 `fetch(` call sites | **Zero findings.** |
| Webhook signatures + CSRF | Both webhook receivers; 53 state-changing routes | **Zero findings.** |
| Rate limiting | 9 unauthenticated + ~23 expensive authenticated routes | **3 gaps found, all fixed** (§8 reflects the post-fix state) |

Additionally, a general SAST pass (`eslint-plugin-security` across every `.ts`/`.tsx` file, plus `npm audit`) the evening before found and fixed one real bug (the Stripe plan-key prototype-bypass in §6) and triaged 116 other automated findings, all confirmed as false positives on manual inspection (mostly `detect-object-injection`, a rule with a well-documented high false-positive rate on typed codebases — every instance checked indexed by an internal enum/loop variable, never attacker-controlled).

**Dependency CVEs addressed:**
- `next` 16.2.6 → 16.3.0 — fixed several HIGH-severity CVEs including two SSRF advisories (Server Actions on custom servers; rewrites via attacker-controlled destination hostname) and a Server Actions DoS.
- `sharp` 0.34.5 → 0.35.3 — fixed 4 inherited libvips CVEs. Semver-major; verified beyond "tests pass" by exercising the native image pipeline directly.
- `brace-expansion` — resolved via `npm audit fix` (non-breaking).
- A moderate `uuid` advisory transitively declared by `exceljs` was investigated and found **unreachable** — `exceljs`'s actual library code never calls `uuid` (only an unused example script does) — so no downgrade was made.

This is the second documented comprehensive security pass in this codebase's history; a prior one (2 Aug 2026) closed RBAC gaps across 44 previously-ungated routes, added SSRF hardening (`safe-fetch.ts` was created in that pass), encrypted `EmailIntegration.apiKey`, moved the PKCE `code_verifier` server-side, extended prompt-injection fencing to every Claude call site, and tightened CSP `connect-src`. The current pass's zero-IDOR-findings result is evidence that work has held up under fresh, independent scrutiny — not just carried forward as an assumption.

---

## 12. Security headers & transport

Set globally via `next.config.ts`:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://www.facebook.com; frame-src 'self' https://js.stripe.com https://www.googletagmanager.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Authenticated dashboard routes (`/workspace`, `/agency`, `/account`, `/dashboard`, `/help`, `/legal`) additionally get `Cache-Control: no-store` to prevent the CDN from caching authenticated pages.

**Known, deliberate gap**: `script-src` uses `'unsafe-inline'` rather than a nonce-based policy, because 4 genuinely-inline `<script>` tags exist in the root layout (GTM bootstrap, GA4 init, Meta Pixel init, JSON-LD). A full nonce-based CSP was researched and a concrete implementation plan exists in `middleware.ts`'s own comments, but was deliberately not implemented without a human decision and live-browser verification — Next.js's nonce mechanism requires forcing dynamic rendering on every page in the root layout's tree (a real performance/cost tradeoff, not a pure security tweak) and risks a silent CSP-header conflict between `middleware.ts` and `next.config.ts` if not done carefully. This is a real, known, documented gap — not an oversight — and would be a reasonable finding for a pentester to independently surface.

**No explicit CORS headers are set anywhere** in the app — confirmed via search. This is a same-origin application with no public cross-origin API surface (the MCP server, §13, has its own separate access model).

---

## 13. LYRA MCP — a distinct attack surface

`mcp.lyraonline.ai`, a separate Railway-hosted service implementing the Model Context Protocol, letting an AI agent (e.g. Claude Desktop) act on a user's LYRA account via natural language — draft/schedule/publish posts, respond to inbox items, read analytics, and more, gated by the same approval/autonomy/guardrail rules the web UI enforces.

- **OAuth 2.1** via the same Auth0 tenant as the main app, with **Dynamic Client Registration (RFC 7591)** — any new MCP client (Claude, or any other MCP-capable tool) self-registers via `POST /api/oauth/register` (unauthenticated by design, rate-limited — see §8).
- Registration is **idempotent**: a client re-registering with the same `(name, redirect_uris)` pair reuses the existing Auth0 Application rather than minting a new one. This was a real fix made in this project's history after a naive always-create implementation exhausted the Auth0 tenant's Application-count cap.
- Bearer-token verification per §4 (JWKS, issuer+audience checked, fails closed on missing config).
- Tool-level authorization: every MCP tool call is checked against the same workspace-access and role rules the web UI uses — confirmed via a dedicated audit trail (`McpAuditLog`) that every call is correctly attributed to the right workspace, closing a previously-found multi-workspace/agency misattribution bug.
- **Known, documented, deliberately-deferred gap**: each MCP capability declares a `requiredScope` field, but scope enforcement is not currently wired into the shared authorization wrapper all 12 (as of last count) MCP tools use — it's declarative-only today. This was found during the capability-registry build, flagged explicitly, and the decision (recorded, made by the project owner) was to defer real enforcement to a future phase rather than touch the shared wrapper under time pressure. **This is a legitimate, real gap worth the pentester's attention** — it's not a secret, it's already known and tracked, but it hasn't been closed.

The `lyra-mcp` service is a **separate deployable** from the main `lyra` app and was **not** in scope for the 82-route IDOR audit in §11 (that covered `app/api/` in the main app only). If a full pentest is being scoped, this service's own route surface should be audited separately.

---

## 14. Environment / secrets inventory (names only)

For reference — no values are included or should ever be requested. Full list lives in `lyra/.env.example`.

| Category | Variables |
|---|---|
| Database | `DATABASE_URL`, `DIRECT_URL` |
| Auth0 (main app) | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` |
| Auth0 (MCP) | `AUTH0_MCP_AUDIENCE`, `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, plus per-plan price IDs |
| Anthropic | `ANTHROPIC_API_KEY` |
| AWS S3 | `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` |
| Redis | `REDIS_URL` |
| Social platform OAuth (legacy native integrations) | `FACEBOOK_APP_ID`/`SECRET`, `FACEBOOK_LOGIN_CONFIG_ID`, `GOOGLE_CLIENT_ID`/`SECRET`, `LINKEDIN_CLIENT_ID`/`SECRET`, `TIKTOK_CLIENT_KEY`/`SECRET`, `TWITTER_CLIENT_ID`/`SECRET` |
| Zernio | `ZERNIO_API_KEY` (single tenant-wide master key — see §10), `ZERNIO_WEBHOOK_SECRET` |
| Encryption | `ENCRYPTION_KEY` (AES-256-GCM key, never rotate post-launch — see §10) |
| Email | `RESEND_API_KEY` |
| Cron auth | `CRON_SECRET` (bearer token shared between external cron triggers and `/api/cron/*` routes) |
| App config | `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL` |
| PDF generation | `CHROME_EXECUTABLE_PATH` (local dev only) |

---

## 15. Known limitations & accepted risk (deliberately out of scope)

These are documented, deliberate decisions — not gaps the team is unaware of:

- **No mobile app** — nothing to test there.
- **No WAF/IDS/IPS or network segmentation** — the app runs entirely on managed PaaS (Netlify, Railway, Supabase); there's no self-managed network layer to configure this way.
- **No SIEM / centralized security monitoring** — production error tracking, structured logging, and uptime monitoring are all unbuilt (tracked as a future roadmap item, not security-specific).
- **No formal SOC 2 / ISO 27001 / HIPAA / PCI-DSS compliance program** — a deliberate, already-made business decision given LYRA's current target customers (agencies/SMBs, not enterprises with formal vendor-security review requirements). Revisit only if a specific deal requires it.
- **MCP tool-level `requiredScope` is declarative, not enforced** (§13) — known, tracked, deferred.
- **CSP uses `'unsafe-inline'` for script-src rather than a nonce** (§12) — known, a concrete fix plan exists, deferred pending a rendering-strategy decision.
- **Auth0 MFA status unconfirmed** from the codebase — needs a manual dashboard check.

---

## 16. Suggested areas of focus for penetration testing

Given everything above, a pentester's time is likely best spent on:

1. **Business logic abuse within a legitimately-owned workspace** — the automated review is strong on cross-tenant boundaries; it's weaker on "can an authenticated user with legitimate access to their own workspace manipulate application state in an unintended way" (e.g. race conditions across concurrent requests, unusual state-machine transitions in the post-approval workflow, edge cases in the Crisis Aware auto-pause/resume logic).
2. **The LYRA MCP server** (§13) as its own target — separate service, separate route surface, not covered by the main-app IDOR audit, and has one known unenforced-scope gap already.
3. **Auth0 tenant configuration** itself — MFA status, Application Access Policy settings, any client secret rotation hygiene — configuration review, not code review.
4. **Third-party integration trust boundaries** — Zernio holds a huge amount of implicit trust (a single master API key across every tenant); worth specifically probing whether any LYRA-side check on Zernio-sourced data (webhook payloads, OAuth callback responses) could be tricked by a compromised or malicious Zernio-side account.
5. **Rate limit bypass** — the current implementation is a straightforward Redis fixed-window counter keyed on user ID or IP; testing for the standard bypass patterns (key manipulation, distributed IPs against IP-keyed routes, race conditions in the check-then-increment window) is worthwhile.
6. **File upload / media pipeline abuse** — bulk-import and direct media upload both ultimately write attacker-influenceable bytes to S3; worth testing content-type spoofing, zip-bomb-style compressed uploads (the `.xlsx` parser is a real attack surface — it's a zip file under the hood), and oversized/malformed file handling beyond what's already size-capped.
7. **The billing/Stripe integration end-to-end**, given real money is involved — webhook replay behavior beyond the idempotency table, checkout session tampering, subscription state edge cases.

---

## 17. Reporting

For any finding, please include: affected route/file, a reproduction request (method, path, auth context, payload), and the actual vs. expected behavior. Findings will be triaged and fixed with regression tests added per the project's existing testing conventions (this codebase has consistent, extensive test coverage — 457 tests passing as of this document — and every fix in the pre-beta pass added a test proving the specific exploit no longer works, not just a patch).
