# LYRA — Control Verification Register

**Purpose:** Per-control verification status against the ITWM Custom Website Security
Framework v3.1, controls 01–22, at Tier C.

**Codebase state verified:** `main` @ `ab35dee`, plus the fixes recorded in §4.

**Companion documents:** `LYRA-Permissions-Matrix.md` (control 04),
`LYRA-Data-Register.md` (controls 05, 10, 19), `LYRA-Security.md` (control narrative).

---

## 1. How to read this

| Status | Meaning |
|---|---|
| **Verified** | Checked against the code in this review. The evidence column names what was read |
| **Partial** | The control's main requirement holds; a specific named sub-requirement does not |
| **Gap** | A requirement of the control is not met. Each is restated in §3 |
| **Operator** | Not verifiable from the repository — it depends on cloud console, registrar or DNS configuration. Listed with what to check |

A **Verified** status is a statement about the code at the stated commit, not a guarantee of
absence of defects. Every defect in §4 sits in an area that reads as correct from the
security narrative and from the surrounding code comments — which is the argument for
re-running the censuses in each companion document rather than trusting a status column.

---

## 2. Register

| # | Control | Status | Evidence / note |
|---|---|---|---|
| 01 | HTTPS and TLS | **Operator** | HSTS is set (`max-age=63072000; includeSubDomains; preload`, `next.config.ts:80`). Netlify terminates TLS and renews certificates. **Check:** CAA records present (control 18), certificate-expiry alerting routed to a named person |
| 02 | Authentication and account recovery | **Verified** | Fully delegated to Auth0 (`@auth0/nextjs-auth0`). No password is stored, hashed or otherwise — `grep password prisma/schema.prisma` returns nothing. Recovery, MFA reset and breached-password checks are Auth0 tenant configuration, so the control's recovery requirements are met by the provider rather than by this codebase |
| 03 | MFA and step-up | **Gap** | See §3.1. Application MFA is Auth0's; **no step-up re-authentication exists for any of the privileged actions the control enumerates** |
| 04 | Authorisation and least privilege | **Verified** | All 57 mutating route handlers enumerated and each one's predicate read. No global administrator and no tenant-bypass path. Objects are fetched and authorised in a single scoped query, so an unauthorised object is never in scope for a later edit. Middleware is never the only check. Full matrix in `LYRA-Permissions-Matrix.md`; one real gap found and fixed (§4.1) |
| 05 | Input validation and file handling | **Partial** | Zod schemas at route boundaries (`lib/validate.ts` `parseBody`). Uploads: MIME allowlist via `Object.hasOwn` (prototype-safe), S3 presigned POST with `content-length-range` so the size limit is enforced by S3 rather than by a client-reported number, `randomUUID` storage names. Bulk import caps upload bytes, row count, and degrades to 422 on an unreadable file. **Missing:** magic-byte validation and malware scanning (§3.2), and no authorised download handler (§3.3) |
| 06 | Injection and interpreter safety | **Verified** | Three raw-SQL uses total. Two are the literal `SELECT 1` health probe; the third (`brand-intelligence/guidelines:65`) is a Prisma tagged template, so `${key}` and `${workspaceId}` are bound parameters, not interpolated text. No shell execution and no dynamic evaluation anywhere. Spreadsheet formula injection does not apply: XLSX is **imported** only — `lib/xlsx-parser.ts` and the bulk-import routes — and no route exports user data as CSV or XLSX |
| 07 | Cross-site scripting defence | **Verified** | Four `dangerouslySetInnerHTML` uses, all in `app/layout.tsx`, all static analytics bootstraps and JSON-LD with no user data interpolated. React auto-escaping elsewhere. CSP set as defence in depth (control 11) |
| 08 | CSRF and cross-origin | **Verified** | Auth0 session cookies plus Next.js 16's built-in Server Action origin check. No cookie-authenticated state-changing Route Handler relies on CORS for protection |
| 09 | Session and cookie security | **Verified** | Auth0 sets cookie attributes and handles rotation. Bearer tokens are validated by `getUserFromBearerToken` and additionally confined to a 30-route allowlist in `middleware.ts`, so an MCP token cannot act as a general-purpose API key. No token appears in a URL |
| 10 | Encryption, secrets and key management | **Partial** | AES-256-GCM (`lib/encrypt.ts`) on every stored third-party credential; verified at each write path in `LYRA-Data-Register.md` §3.1. Secrets in Netlify and Railway environment variables, none in the repository, gitleaks pinned to a commit SHA in CI. No secret carries a `NEXT_PUBLIC_` name. **Missing:** the cryptographic-use inventory the control mandates at Tier B/C (§3.4), and one field self-heals its encryption lazily (§3.5) |
| 11 | Browser security headers | **Partial** | `next.config.ts` sets CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'`, and `poweredByHeader: false`. **The CSP is allowlist-based with `script-src 'unsafe-inline'`; the control requires a nonce-based CSP for Tier C and authenticated areas** (§3.6) |
| 12 | API, integration and outbound requests | **Verified** | Per-route authentication, authorisation, Zod validation and rate limiting. Webhook signatures verified for Stripe and Zernio, with a `ProcessedWebhookEvent` idempotency ledger for Stripe redelivery. SSRF defence in `lib/safe-fetch.ts` is thorough: https-only, both A and AAAA records resolved and blocklisted against private, link-local and cloud-metadata ranges, IPv4-mapped IPv6 and NAT64 forms normalised, the connection pinned to the validated address to defeat DNS rebinding, each redirect hop re-validated and re-pinned, credential headers stripped across an origin change, one timeout spanning the whole chain. Response-size cap added in this review (§4.3) |
| 13 | Dependencies, CI/CD and supply chain | **Partial** | `.github/workflows/deploy.yml` runs type-check, lint and 911 tests, all blocking, with `permissions: contents: read` and Corepack pinning npm to `packageManager`. No path filter, deliberately, so a required check can never be silently absent. Dependabot weekly with grouped minors and a documented TypeScript-major hold. `CODEOWNERS` on deploy-critical paths. gitleaks pinned to a SHA. **Missing:** SAST and dependency-vulnerability scanning on pull requests (§3.7). **Operator:** confirm branch protection and the Tier C production approval gate |
| 14 | Hosting, deployment and caching | **Operator** | `dynamic = 'force-dynamic'` on authenticated routes keeps user-specific responses out of a shared cache. **Check:** Netlify deploy-preview protection, that previews hold no production secrets, Supabase network restrictions, team roles, and S3 bucket policy scope (§3.3) |
| 15 | Logging, error handling and detection | **Partial** | Every route's catch block returns a generic message and logs server-side; no stack trace or internal detail is returned. `upload/from-url` explicitly refuses to echo `safeFetch`'s error text, which would otherwise make it an internal-network reconnaissance oracle. `McpAuditLog` records MCP tool use. **Missing:** centralised log aggregation with alerting, and a defined log retention period (§3.8) |
| 16 | Security testing, backup and recovery | **Operator** | 911 automated tests, blocking in CI. **Check:** Supabase backup schedule, a rehearsed restore, stated RPO/RTO, and the Tier C requirement that backups be isolated or immutable so compromised production credentials cannot destroy both the live environment and every recoverable copy |
| 17 | Agency access and credential management | **Operator** | Entirely process, outside the repository. **Check:** the access register exists, client ownership of each asset, MFA coverage per account, and the one-business-day offboarding commitment |
| 18 | Domain, DNS and email authentication | **Operator** | **Check:** registrar lock and MFA, CAA records, DNSSEC, no dangling records pointing at decommissioned services, SPF/DKIM for every sender, and DMARC progressed beyond `p=none` |
| 19 | Forms, lead data and outbound email | **Partial** | `POST /api/klaviyo/subscribe` validates the email server-side and is rate-limited per IP at 5 per 10 minutes. No form values appear in URLs. Formula injection does not apply (control 06 — no CSV/XLSX export). **Missing:** bot protection such as Turnstile or a honeypot, and the agreed CRM retention the control requires (`LYRA-Data-Register.md` §5.1) |
| 20 | Third-party scripts, tags and tracking | **Operator** | GTM, GA4 and Meta Pixel load from `app/layout.tsx`. **Check:** a tag inventory exists, Tag Manager publish rights are restricted to named MFA accounts, and no pixel receives form values or personal information |
| 21 | AI features and chat assistants | **Partial** | Strong on the injection boundary, which is the hard part: untrusted content is fenced in named tags and `neutralizeFenceCloser` prevents fence-escape (`services/ai/content-repurposer.ts`, `content-scorer.ts`), model output is never rendered as HTML, and autonomous replies are gated by `Workspace.aiResponseMode`, plan `maxAutonomy`, `Guardrail` rows and `maxAiRepliesPerThread`. API keys are server-side only. All five AI routes are rate-limited per user at 20 per 60 seconds. **Missing:** a global spend limit — the control requires per-user *and* global (§3.9) — and the AI data-flow and retention disclosure the control mandates |
| 22 | Availability, abuse protection and disclosure | **Partial** | Netlify provides CDN and DDoS protection. Rate limiting on auth-adjacent, upload, AI and report routes. `/.well-known/security.txt` is live, RFC 9116-compliant, expiring 2027-11-03. **Two live operational gaps:** the `security@lyraonline.ai` mailbox must actually be monitored — the file itself flags this, and an advertised reporting route that bounces fails the control more visibly than publishing nothing — and cron-job.org failure notifications are still off, which is what let comment ingestion die silently for two months |

**Totals:** 7 Verified · 8 Partial · 1 Gap · 6 Operator. Control 04 is verified only because
a defect found during this review was fixed; before that it was a Gap.

---

## 3. Open gaps, restated

Ordered by what a reviewer would most want closed first.

### 3.1 No step-up re-authentication (control 03)

The control enumerates actions that must require re-authentication. LYRA implements step-up
for **none** of them, and several are reachable:

- changing roles (`PATCH /api/workspaces/[id]`, `clientAccessLevel`)
- deleting a tenant or dataset (`DELETE /api/workspaces/[id]`, `DELETE /api/account`)
- changing security or integration settings (`aiResponseMode`, guardrails, OAuth connections)
- approving a consequential AI action (`POST /api/comments/[id]/reply` publishes publicly)

All are correctly **authorised** (control 04) — the gap is that a hijacked session needs no
second proof before taking them. Auth0 supports this via an ACR/`max_age` re-authentication
prompt, so it is a well-trodden integration rather than custom work.

### 3.2 No magic-byte validation or malware scanning on uploads (control 05)

Scanning is mandatory at Tier C *and* for any file "processed by another system". Brand
guideline documents meet that trigger twice: they are parsed and their text is sent to
Claude. Content type is currently asserted by the uploading client and enforced only as an
S3 `Content-Type` equality condition — S3 never inspects the bytes. Both upload routes say
so in place. Noted but deliberately not built in this review: the guideline-document path
has no UI yet (help docs state guidelines are pasted text only), so building scanning into a
dormant path is lower value than recording the requirement.

### 3.3 Media is served from a public bucket with no authorised download handler (control 05)

The control requires private object storage and authorised download handlers. `publicUrl`
(`app/api/upload/presign/route.ts:126`) is a direct `https://{bucket}.s3.{region}.amazonaws.com/{key}`
URL that flows into `Post.mediaUrls` and out to the social platforms, which fetch it
unauthenticated — so the `media/` prefix must be public-read for the product to work.

The consequence is that media is protected only by key unguessability (`randomUUID`), and
anything else in that bucket inherits whatever the policy's scope actually is. Guideline keys
were hardened in this review (§4.4) so they no longer depend on that scope being correct.
**Operator action:** confirm the S3 bucket policy grants public read to `media/*` only, not
to the bucket.

### 3.4 No cryptographic-use inventory (control 10)

Mandatory at Tier B/C: each key's purpose, algorithm, owner, storage, rotation and
revocation process, and recovery needs. `LYRA-Data-Register.md` §3.1 lists what is encrypted
and names the environment keys, which is the raw material, but the inventory itself does not
exist. The rotation question matters most: rotating `ENCRYPTION_KEY` without a re-encryption
pass makes every stored social and SEO token permanently undecryptable.

### 3.5 `EmailIntegration.apiKey` encryption is lazy (control 10)

`services/email-marketing/sync.ts:14` re-encrypts a plaintext key on next sync. An integration
with `isActive: false` never syncs, so it keeps a plaintext key indefinitely. One migration
pass over every row would close it; the lazy fallback should then be removed so a plaintext
key becomes an error rather than a self-healing condition.

### 3.6 CSP is allowlist-based, not nonce-based (control 11)

Tier C requires nonce-based CSP for authenticated areas. `script-src` currently needs
`'unsafe-inline'` for four inline tags in `app/layout.tsx` (GTM, GA4, Meta Pixel, JSON-LD).

`middleware.ts` already carries a detailed, verified implementation plan and the two reasons
it was not executed: Next 16's nonce mechanism forces dynamic rendering on every page
rendering the nonce (the root layout wraps everything, so the legal pages would lose static
generation), and the nonce header must move from `next.config.ts` to middleware without
leaving the matcher-excluded paths header-less or double-headed. Both failure modes are
silent — no build error, only a console CSP violation in production. **This is a planned,
documented, accepted risk, not an oversight.** Treat the plan in `middleware.ts` as the
specification and verify in a real browser on the marketing home page, a legal page and a
dashboard page before shipping.

### 3.7 No SAST or dependency-vulnerability scanning on pull requests (control 13)

CI runs type-check, lint, tests and build, all blocking, plus gitleaks for secrets. Missing:
static analysis (CodeQL or Semgrep) and a dependency audit, with critical findings blocking
release. Both are additive workflow jobs with no application change. Note also that
`actions/checkout` and `actions/setup-node` are pinned to major tags rather than commit
SHAs; they are first-party GitHub actions, so this is a lesser concern than for gitleaks,
which is correctly SHA-pinned.

### 3.8 Logs are not centralised, and have no defined retention (control 15)

Logging is sound per-request — generic responses, server-side detail, no secrets, and an
explicit refusal to echo SSRF error text. What is missing is the detection half: logs live in
Netlify's and Railway's own retention with no aggregation, no alerting on authentication or
authorisation failures, and no stated retention period. The practical cost was demonstrated
during the comment-ingestion investigation, when 7 workers retrying every 2 seconds hit
Railway's 500 logs/second cap and dropped 19,833 messages in one burst, including the only
line that identified the fault.

### 3.9 No global AI spend limit (control 21)

All five AI routes rate-limit per user at 20 per 60 seconds. There is no account-wide or
platform-wide ceiling, so cost scales linearly with the number of users. The control requires
per-user **and** global limits.

---

## 4. Fixed during this review

Four defects, each found by verifying a control rather than by reading the narrative.

### 4.1 Google Search Console connection was writable by `CLIENT_VIEW` (control 04)

`GET /api/seo/callback` verified workspace access but not role, and `GET /api/seo/connect`
checked nothing, so nothing upstream gated it. A read-only client could repoint a
workspace's Search Console property and overwrite the stored Google refresh token for
everyone else. Both sibling OAuth callbacks already guarded against this. Fixed with
`canWrite` on both sides, 11 tests.

### 4.2 Workspace and account deletion failed outright for some customers (controls 04, 05)

`NotificationChannel` has no `onDelete` rule and was missing from both deletion
transactions, so any workspace with a Slack alert channel connected threw a foreign-key
violation and both routes answered 500. An erasure blocker. Second occurrence of the same
fault — the SEO models caused it first. The regression test now asserts the whole set of
non-cascading children and names any model that is missed.

### 4.3 `safeFetch` had no response-size cap (control 12)

All 14 call sites read whatever the far end sent. `upload/from-url` checked
`content-length`, then re-checked the real size only after `arrayBuffer()` had already
buffered everything — so a server omitting or under-reporting the header could cause
unbounded buffering in a serverless function. Now counted as bytes arrive, 10MB default,
50MB for media, 6 tests.

### 4.4 Brand-guideline S3 keys were guessable (control 05)

`{Date.now()}-{filename}` in a bucket whose `media/` prefix must be public-read. Now
`randomUUID`, matching the media routes, so these documents no longer depend on the bucket
policy being correctly scoped.

### 4.5 `OWNER_ROLES` was duplicated six times (control 04)

Not a defect in itself, but the exact pattern that caused the self-comment incident, where
three hand-rolled copies of one filter drifted. Centralised into `lib/authz.ts`.

---

## 5. Remaining Phase 1 artefacts

Two mandatory artefacts are still outstanding. Neither can be derived from the code, which
is why they are not in this review:

- **STRIDE threat model.** The material now exists — `LYRA-Permissions-Matrix.md` gives the
  trust boundaries and principals, `LYRA-Data-Register.md` gives the assets and data flows,
  and this document gives the controls. The modelling session itself is a human exercise.
- **Vendor security assessment** for the 12 processors inventoried in
  `LYRA-Data-Register.md` §4. Anthropic and Zernio are the priority: Anthropic receives
  brand profiles, guardrails and ingested public comments, and Zernio holds social
  credentials as an intermediary. Control 21 additionally requires documenting where
  conversation data is processed, including offshore, how long it is kept, and whether the
  provider trains on it.
