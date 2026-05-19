# LYRA — Project Handover Document

**Date:** May 2026 (updated May 2026)  
**Prepared by:** Claude Code (Anthropic)  
**Project owner:** Richard Unwin, Into The Wild Marketing

---

## Changelog

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
| Worker deployment | Railway (not yet set up) | — |

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

- **Sidebar** (`components/lyra/app-shell/sidebar.tsx`) — collapsible with Framer Motion animation, shows LYRA logo (full wordmark expanded, icon mark collapsed), workspace navigation, workspace switcher
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

| Route | Methods | Purpose |
|---|---|---|
| `/api/workspaces` | GET, POST | List workspaces, create workspace |
| `/api/workspaces/[id]` | GET, PATCH, DELETE | Workspace CRUD |
| `/api/posts` | GET, POST | List posts by month, create post |
| `/api/posts/[id]` | GET, PATCH, DELETE | Post CRUD |
| `/api/comments` | GET | Comments inbox |
| `/api/comments/[id]` | PATCH | Update comment status |
| `/api/brand-intelligence/build` | POST | Trigger brand profile build |
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
Post → PostApproval, PostMetrics, Comment (many)
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

- Worker files exist in `/workers/` for post publishing, comment monitoring, AI responding, and brand syncing
- These have **not been deployed** to Railway yet
- Without workers: posts cannot be automatically published at scheduled times, comments are not monitored, and AI responses are not auto-generated
- To deploy workers: create a Railway project, connect the same GitHub repo, and set the start command to `node workers/post-publisher.worker.js` (etc.) with all the same environment variables

### Mobile Responsiveness

- The sidebar is not yet optimised for mobile — it does not collapse to a bottom nav or hamburger menu on small screens
- All other pages use responsive Tailwind classes and work acceptably on mobile

### Cron Jobs

- Three cron routes exist (`sync-comments`, `sync-metrics`, `brand-refresh`) but are not yet wired to an external scheduler
- On Netlify, scheduled functions can be added in `netlify.toml` or via Netlify dashboard
- Alternatively, an external service (Upstash, Cronhooks) can hit the cron API routes on schedule

### SEO DB Tables Not Yet Applied

The SEO v1 schema changes (`SeoConnection`, `SeoPage`, `SeoContent`, `SearchConsoleData`) are committed and deployed but the tables do not yet exist in the Supabase database. The SEO page currently shows a DB error.

To apply the tables, run in **Command Prompt** (not PowerShell) with your Supabase credentials:

```cmd
set DATABASE_URL=postgresql://postgres.votuufwukkhojunzrjoa:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
set DIRECT_URL=postgresql://postgres.votuufwukkhojunzrjoa:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
set NODE_OPTIONS=--use-system-ca
cd "c:\Users\Rich\OneDrive - Into The Wild Marketing\LYRA\lyra"
npx prisma db push
```

The Supabase database password is in Supabase → Settings → Database. No redeploy is needed after the push — the tables just need to exist.

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
| `lyra/services/social/facebook.ts` | Facebook Graph API helpers |
| `lyra/services/social/linkedin.ts` | LinkedIn API helpers |
| `lyra/services/social/youtube.ts` | YouTube OAuth + channel fetch |
| `lyra/app/(dashboard)/layout.tsx` | Authenticated app shell |
| `lyra/app/api/workspaces/[id]/route.ts` | Workspace CRUD including cascade delete |
| `lyra/app/api/brand-intelligence/build/route.ts` | Brand profile build endpoint |
| `lyra/app/api/social/callback/[platform]/route.ts` | OAuth callback handler |
| `lyra/components/lyra/app-shell/sidebar.tsx` | Sidebar with brand lock logic |
| `lyra/components/lyra/calendar/content-calendar.tsx` | Monthly calendar with filters, DnD, and detail panel |
| `lyra/components/lyra/calendar/post-detail-panel.tsx` | Slide-in post detail + status editor |
| `lyra/components/lyra/brand/brand-build-button.tsx` | Brand profile build trigger |
| `lyra/components/lyra/brand/guidelines-uploader.tsx` | Drag-and-drop brand guidelines uploader |
| `lyra/components/lyra/settings/delete-workspace-button.tsx` | Delete with confirmation |
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

---

## 12. Immediate Next Steps (Recommended Order)

**New features (designed, ready to build):**
1. **Post Now button** — add to `components/lyra/composer/post-composer.tsx`; sets `scheduledAt = now`, `status = SCHEDULED`. Spec: `lyra/docs/superpowers/specs/2026-05-19-ai-content-schedule-design.md`. Implementation plan: `lyra/docs/superpowers/plans/` (to be written).
2. **AI Content Schedule Generator** — new API route `POST /api/schedule/generate`, config panel UI, SSE progress stream, review screen, bulk post creation to calendar. Text-only (no media). Spec as above.
3. **Media Library** (Phase 3, after schedule generator) — S3 upload, AI topic tagging, media picker in composer and schedule review. Spec section 3 covers design intent.

**Infrastructure / platform:**
4. **Apply SEO DB tables** — run `prisma db push` in Command Prompt against Supabase (see Section 8 — SEO DB Tables). This unblocks the SEO page immediately with no redeploy needed.
5. **Test GSC OAuth end-to-end** — once tables exist: navigate to SEO → connect Search Console → verify property auto-selects → add a page → Analyse → Generate
6. **Test YouTube connection** — connect a Google account in Settings → YouTube, verify the channel saves correctly and shows in the connected list
7. **Complete Facebook OAuth testing** — connect a Facebook Page, verify it saves correctly and shows in Settings
8. **Apply for LinkedIn company page access** — submit LinkedIn Community Management API application so pages (not personal profiles) can be connected
9. **Apply for LinkedIn app verification** — enables `w_member_social` scope for posting
10. **Create Google Business, Twitter, TikTok developer apps** — add credentials to Netlify env vars so those OAuth flows work
11. **Set up Railway workers** — deploy the four BullMQ worker files so scheduled posts actually publish
12. **Wire up cron jobs** — configure Netlify scheduled functions or an external cron service to hit the sync routes
13. **Build the Post Composer UI** — the API exists (`/api/posts`), the UI page at `/workspace/[id]/compose` needs building
14. **Build the Inbox UI** — comments API exists, the inbox page needs building
15. **Mobile sidebar** — add a hamburger menu / bottom nav for mobile viewports
16. **Stripe billing / marketing page** — create Stripe products/prices, wire up checkout flow, build public marketing landing page (plan saved: `lyra/docs/superpowers/plans/2026-05-19-marketing-landing-page.md`)
