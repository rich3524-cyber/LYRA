# LYRA — Claude Code Project Intelligence

> This file is read automatically by Claude Code at the start of every session.
> It is the single source of truth for architecture, design, and coding standards.
> Never contradict or deviate from these standards without explicit user instruction.

---

## What LYRA Is

LYRA (lyraonline.ai) is a premium AI-powered social media intelligence SaaS platform.

**Core purpose:** Agencies, freelancers, and SMBs use LYRA to schedule social content, generate AI captions that match each client's brand voice, and — uniquely — have AI respond to comments and reviews on their behalf, autonomously, 24/7.

**Primary point of difference:** No major competitor responds to comments. LYRA does, with configurable autonomy (fully autonomous / draft + approve / off) and agency-level guardrails.

**Business model:** Self-serve SaaS. Three tiers: Starter (1 workspace, SMBs), Pro (5 workspaces, freelancers), Agency (unlimited workspaces, agencies). Gated by workspace count and feature depth.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Always use App Router, never Pages Router |
| UI Components | shadcn/ui + Tailwind CSS | Radix primitives — never build from scratch |
| Animation | Framer Motion | All transitions, page loads, sidebar collapse |
| Icons | Lucide React ONLY | Never emoji as icons. Never mix icon sets. |
| Charts | Recharts | Analytics dashboards |
| Rich Text | Tiptap | Post composer editor |
| Drag & Drop | @dnd-kit | Content calendar rescheduling |
| Database ORM | Prisma + PostgreSQL | Always use singleton from lib/prisma.ts |
| AI | Anthropic Claude API | Model: claude-sonnet-4-20250514 ALWAYS |
| Job Queue | BullMQ + Redis | Post scheduling, comment monitoring workers |
| Auth | Auth0 (@auth0/nextjs-auth0) | Multi-role, OAuth social connections |
| Payments | Stripe | Subscription billing |
| Storage | AWS S3 | Brand guidelines docs, media assets |
| Deployment | Netlify (app) + Railway (workers) | Netlify Functions; workers on Railway |
| Scraping | Cheerio + native fetch | Brand intelligence website crawler |
| Encryption | Node.js crypto (AES-256-GCM) | Always encrypt social tokens before DB |

---

## Design System — ABSOLUTE RULES

These are not suggestions. Every UI component must follow these standards exactly.

### Colour Tokens (defined in tailwind.config.ts)

```
background-primary:    #080808   ← Main app background. ALL authenticated pages.
background-secondary:  #0f0f0f   ← Card/panel backgrounds
background-tertiary:   #141414   ← Elevated surfaces, dropdowns
background-hover:      #1a1a1a   ← Hover states
background-border:     #222222   ← All card/panel borders (subtle)
background-border-mid: #333333   ← Mid-weight borders

text-primary:    #e2e2e2   ← Platinum — ALL primary UI text
text-secondary:  #888888   ← Secondary labels, metadata
text-tertiary:   #555555   ← Muted, disabled, placeholder

accent-platinum: #d8d8d8   ← Primary accent, active states, CTA backgrounds
accent-white:    #f4f4f2   ← Pure white moments only
accent-silver:   #aaaaaa   ← Mid-level accent

status-success:  #4ade80
status-error:    #f87171
status-warning:  #fbbf24
status-info:     #60a5fa
```

**NEVER hardcode hex values in components. Always use Tailwind tokens.**

### Typography

```
font-display:  "Instrument Serif" — Display headings ONLY (page titles, marketing). Weight 400 only.
font-sans:     "DM Sans"          — ALL UI text (labels, buttons, body, navigation). Weights 300/400/500 only.
font-mono:     "Geist Mono"       — ALL data values (counts, metrics, IDs, code). Weight 400 only.
```

**NEVER use Inter, Arial, Roboto, system-ui, or any other font.**
**NEVER use font-sans for headings. NEVER use font-display for UI text.**
**NEVER use font-weight 700 (bold) anywhere — DM Sans 500 (Medium) is the maximum.**

### Type Scale

| Name | Size | Font | Weight | Line Height | Use |
|---|---|---|---|---|---|
| Display | 32–48px | Instrument Serif | 400 | 1.2 | Page titles, hero headings — at most one per page |
| Heading 1 | 24px | DM Sans | 500 | 1.3 | Section headings |
| Heading 2 | 18px | DM Sans | 500 | 1.4 | Sub-section headings |
| Heading 3 | 14px | DM Sans | 500 | 1.4 | Card titles, labels |
| Body | 14px | DM Sans | 400 | 1.6 | All body copy |
| Small | 12px | DM Sans | 400 | 1.5 | Captions, hints — 12px minimum |
| Label | 11px | DM Sans | 500 | 1.2 | UI labels — UPPERCASE + letter-spacing 0.1em |
| Metric | 20–32px | Geist Mono | 400 | 1.2 | Data values, counters — always Geist Mono |
| Code | 13px | Geist Mono | 400 | 1.5 | Code, IDs, tokens |

### Spacing System

Base unit is **4px**. Only multiples of 4 are permitted.

```
p-1  =  4px  — Micro: icon-to-label, tag padding
p-2  =  8px  — Tight: related elements
p-3  = 12px  — Compact: dense data tables
p-4  = 16px  — Standard: default internal component padding
p-5  = 20px  — Comfortable: card padding
p-6  = 24px  — Generous: section spacing
p-8  = 32px  — Spacious: major section breaks
p-12 = 48px  — Hero: large section dividers
p-16 = 64px  — Maximum: page-level breathing room
```

### Border Radius

```
rounded-md   =  6px  — Badges, tags, chips, inline code
rounded-lg   = 10px  — Input fields, small cards, tooltips
rounded-xl   = 14px  — Cards, panels, dropdowns
rounded-2xl  = 20px  — Modal dialogs, sheets, large containers
rounded-full        — Pills, avatar images, toggle switches
```

### Animation Standards

```
Duration:  150ms (fast/hover) — 200ms (standard) — 300ms (slow/page)
Easing:    cubic-bezier(0.16, 1, 0.3, 1)  — always this curve
Page entry: fadeIn + slideUp (translateY 8px → 0, 200ms)
Modal open: scaleIn (scale 0.96 → 1, 200ms) + fade
Sidebar:   Framer Motion width animation, 250ms
Skeletons: shimmer keyframe on data-loading states
```

**Always respect prefers-reduced-motion.**
**Never use CSS transitions on width/height directly — use max-height or Framer Motion.**

### Icons

**Lucide React only. No other icon library. No emoji as icons under any circumstances.**

```
strokeWidth default:  1.5
strokeWidth active:   2
Size — standard UI:   16px
Size — empty state:   24px
Size — marketing:     48px max
Icon-only buttons:    MUST have aria-label
```

### Logo

The LYRA mark is a platinum square-bordered L + "YRA" in DM Sans Light, weight 200, tracking +250.
- **Primary:** platinum `#aaaaaa` border + `#e2e2e2` L on `#080808` — always this in the app
- **Favicon / app icon:** framed L alone, no wordmark
- **Never** recolour, rotate, skew, add effects, or place on busy/light backgrounds
- **Never** remove the square frame from the L — it is integral
- **Never** use the wordmark without the framed L (except favicon)

### Voice & Tone

LYRA is precise, intelligent, and quietly confident. It is not friendly, casual, or playful.

**Writing rules:**
- Lead with the outcome, not the feature
- One idea per sentence — split anything with two clauses
- Active voice only: "The AI drafted three responses." not "Three responses were drafted."
- No exclamation marks in product copy, tooltips, or error messages
- Numbers over words: "Manage 15 clients" not "Manage many clients"
- Never apologise for limitations — state them confidently: "This feature launches in Phase 2."
- Six words, not twelve. Assume intelligence. Never over-explain.

**Copy patterns:**
```
Buttons:     "Schedule post"          NOT "Click here to schedule your post"
Errors:      "Instagram connection expired. Reconnect to continue posting."
             NOT "Oops! Something went wrong with your Instagram!"
Empty state: "No posts scheduled yet."  NOT "Looks like nothing here yet!"
Loading:     "LYRA is building your brand profile. This takes about 2 minutes."
```

### Pre-Delivery UI Checklist

Before any UI PR is merged, verify:

**Visual**
- [ ] No emoji as icons — Lucide only, strokeWidth 1.5
- [ ] No hardcoded hex values — tokens only
- [ ] Near-black `#080808` background on all authenticated pages
- [ ] Correct text hierarchy: primary `#e2e2e2`, secondary `#888`, muted `#555`
- [ ] Border radius uses token values (rounded-xl for cards, rounded-2xl for modals)
- [ ] Subtle `#222` borders on all cards and panels

**Typography**
- [ ] DM Sans for all UI text (weights 300/400/500 only — never 700)
- [ ] Instrument Serif for display headings only — at most one per page
- [ ] Geist Mono for all data values and metrics
- [ ] No font sizes below 12px

**Interaction**
- [ ] Skeleton loaders on all data-dependent content — never spinners
- [ ] All async buttons show disabled + spinner during operation
- [ ] Focus rings visible (2px `#888` outline, offset 2px)
- [ ] Touch targets 44×44px minimum
- [ ] ARIA labels on all icon-only buttons
- [ ] Contrast ratio 4.5:1 minimum for body text

---

## File Structure

```
lyra/
├── CLAUDE.md                          ← You are here
├── app/
│   ├── (auth)/                        ← Login, signup, onboarding link flow
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── onboard/[token]/page.tsx   ← Guided client social connect
│   ├── (dashboard)/                   ← All authenticated pages
│   │   ├── layout.tsx                 ← App shell (sidebar + header)
│   │   ├── page.tsx                   ← Dashboard home
│   │   └── workspace/[workspaceId]/
│   │       ├── page.tsx               ← Workspace overview
│   │       ├── calendar/page.tsx      ← Content calendar
│   │       ├── compose/page.tsx       ← Post composer
│   │       ├── inbox/page.tsx         ← AI comment response inbox
│   │       ├── brand/page.tsx         ← Brand intelligence profile
│   │       ├── analytics/page.tsx     ← Performance dashboard
│   │       └── settings/page.tsx      ← Workspace settings
│   ├── agency/
│   │   ├── clients/page.tsx           ← All client workspaces
│   │   ├── clients/new/page.tsx       ← Create new workspace
│   │   └── settings/page.tsx          ← Agency guardrails + team
│   ├── account/
│   │   └── billing/page.tsx           ← Stripe billing portal
│   └── api/
│       ├── auth/[auth0]/route.ts      ← Auth0 callback handler
│       ├── workspaces/route.ts        ← GET list, POST create
│       ├── workspaces/[id]/route.ts   ← GET, PATCH, DELETE
│       ├── posts/route.ts             ← GET list, POST create
│       ├── posts/[id]/route.ts        ← GET, PATCH, DELETE
│       ├── comments/route.ts          ← GET comments inbox
│       ├── brand-intelligence/
│       │   ├── build/route.ts         ← Trigger brand profile build
│       │   └── refresh/route.ts       ← Refresh existing profile
│       ├── ai/
│       │   ├── generate/route.ts      ← AI caption generation
│       │   └── respond/route.ts       ← AI comment response draft
│       ├── social/
│       │   ├── connect/[platform]/route.ts   ← OAuth initiation
│       │   └── callback/[platform]/route.ts  ← OAuth callbacks
│       ├── onboarding/route.ts        ← Token generation
│       ├── stripe/
│       │   ├── webhook/route.ts       ← Stripe events
│       │   └── create-checkout/route.ts
│       └── cron/
│           ├── sync-comments/route.ts ← Every 5 min
│           ├── sync-metrics/route.ts  ← Every hour
│           └── brand-refresh/route.ts ← Weekly
├── components/
│   ├── ui/                            ← shadcn/ui — DO NOT edit
│   └── lyra/
│       ├── app-shell/
│       │   ├── sidebar.tsx
│       │   ├── header.tsx
│       │   └── workspace-switcher.tsx
│       ├── composer/
│       │   ├── post-composer.tsx
│       │   ├── platform-selector.tsx
│       │   ├── media-uploader.tsx
│       │   └── ai-suggest-panel.tsx
│       ├── calendar/
│       │   ├── content-calendar.tsx
│       │   ├── calendar-day.tsx
│       │   └── post-preview-card.tsx
│       ├── inbox/
│       │   ├── response-inbox.tsx
│       │   ├── comment-card.tsx
│       │   └── response-composer.tsx
│       ├── brand/
│       │   ├── brand-profile.tsx
│       │   ├── voice-summary.tsx
│       │   └── intelligence-status.tsx
│       ├── analytics/
│       │   ├── performance-dashboard.tsx
│       │   ├── engagement-chart.tsx
│       │   └── platform-breakdown.tsx
│       └── onboarding/
│           ├── onboarding-flow.tsx
│           └── social-connect-step.tsx
├── lib/
│   ├── design-tokens.ts               ← Master token reference
│   ├── auth.ts                        ← getCurrentUser, requireAuth
│   ├── prisma.ts                      ← Prisma singleton
│   ├── anthropic.ts                   ← Claude API client
│   ├── redis.ts                       ← Redis client for BullMQ
│   ├── stripe.ts                      ← Stripe client + PLANS config
│   ├── s3.ts                          ← S3 upload/download helpers
│   ├── encrypt.ts                     ← AES-256-GCM token encryption
│   └── utils.ts                       ← cn() and shared utilities
├── services/
│   ├── brand-intelligence/
│   │   ├── scraper.ts                 ← Website crawler (Cheerio)
│   │   ├── social-analyzer.ts         ← Social feed data extractor
│   │   ├── document-parser.ts         ← PDF/Word guidelines parser
│   │   └── profile-builder.ts         ← Claude brand profile builder
│   ├── ai/
│   │   ├── caption-generator.ts       ← Post caption via Claude
│   │   ├── response-generator.ts      ← Comment response via Claude
│   │   └── prompt-builder.ts          ← Prompt construction from brand profile
│   ├── social/
│   │   ├── facebook.ts
│   │   ├── instagram.ts
│   │   ├── linkedin.ts
│   │   ├── tiktok.ts
│   │   ├── twitter.ts
│   │   └── google-business.ts
│   └── scheduler/
│       ├── post-queue.ts              ← BullMQ post scheduling
│       └── sync-queue.ts             ← Background sync jobs
├── workers/                           ← Deployed separately on Railway
│   ├── post-publisher.worker.ts
│   ├── comment-monitor.worker.ts
│   ├── ai-responder.worker.ts
│   └── brand-sync.worker.ts
├── prisma/
│   └── schema.prisma                  ← Full database schema
├── types/
│   └── index.ts                       ← Shared TypeScript types
└── middleware.ts                      ← Auth + workspace access control
```

---

## Architecture Patterns

### Authentication

```typescript
// Server components and API routes — always use:
import { requireAuth } from '@/lib/auth'
const user = await requireAuth()  // throws if not authenticated

// Client components — always use:
import { useUser } from '@auth0/nextjs-auth0/client'
const { user } = useUser()
```

### Database — Always verify workspace access

```typescript
// NEVER trust URL params alone. Always verify access:
const workspace = await prisma.workspace.findFirst({
  where: {
    id: workspaceId,
    access: { some: { userId: user.id } }  // ← ALWAYS include this
  }
})
if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

### Prisma — Always use singleton

```typescript
// lib/prisma.ts — always import from here
import { prisma } from '@/lib/prisma'
// Never: new PrismaClient() — this creates connection leaks
```

### AI — Always use this model and pattern

```typescript
import { anthropic } from '@/lib/anthropic'

const response = await anthropic.messages.create({
  model:      'claude-sonnet-4-6',  // ALWAYS this model
  max_tokens: 1000,                         // Minimum — adjust up as needed
  messages:   [{ role: 'user', content: prompt }]
})
const text = response.content[0].type === 'text' ? response.content[0].text : ''
```

### Social Tokens — Always encrypt/decrypt

```typescript
import { encrypt, decrypt } from '@/lib/encrypt'

// Before storing to DB:
accessToken: encrypt(rawToken)

// Before using in API calls:
const token = decrypt(storedToken)

// NEVER log decrypted tokens. NEVER return them in API responses.
```

### Error handling in API routes

```typescript
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    // ... logic
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Loading states — Always use skeletons

```tsx
// ALWAYS show skeleton loaders, not spinners, for data loading
{isLoading ? (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-20 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
    ))}
  </div>
) : (
  <ActualContent />
)}
```

---

## Database Schema Overview

Key models and their relationships:

```
User → WorkspaceAccess → Workspace
Agency → Workspace (many)
Workspace → SocialAccount (many)
Workspace → Post (many)
Workspace → BrandProfile (one)
Workspace → Guardrail (many)
Workspace → OnboardingToken (one)
Post → PostApproval (one)
Post → PostMetrics (one)
Post → Comment (many)
Comment → CommentResponse (many)
SocialAccount → Post (many)
SocialAccount → Comment (many)
```

Key enums:
- `Plan`: STARTER | PRO | AGENCY
- `Autonomy`: OFF | DRAFT_APPROVE | FULL
- `ClientAccess`: NONE | VIEW | APPROVE
- `Platform`: FACEBOOK | INSTAGRAM | LINKEDIN | TIKTOK | TWITTER | GOOGLE_BUSINESS | YOUTUBE | PINTEREST | THREADS | BLUESKY
- `PostStatus`: DRAFT | PENDING_APPROVAL | APPROVED | SCHEDULED | PUBLISHING | PUBLISHED | FAILED | CANCELLED
- `CommentStatus`: PENDING | AI_DRAFTED | AWAITING_APPROVAL | APPROVED | RESPONDED | ESCALATED | IGNORED
- `GuardrailType`: NEVER_DISCUSS | NEVER_USE_WORD | ALWAYS_ESCALATE | APPROVED_ANSWER

---

## Social Platform API Notes

| Platform | Comment API | Notes for Claude Code |
|---|---|---|
| Facebook | Strong ✅ | Use Graph API v19.0. Pages, not personal profiles. |
| Instagram | Strong ✅ | Via Facebook Graph API. Business accounts only. |
| Google Business | Strong ✅ | Review response is a killer feature — prioritise. |
| LinkedIn | Moderate ⚠️ | Comment access restricted. Use ugcPosts endpoint. |
| X (Twitter) | Limited ⚠️ | API costs elevated. Implement last. Rate limit carefully. |
| TikTok | Limited ⚠️ | Comment API maturing. Implement last. |

---

## BullMQ Workers

Workers run as a separate process on Railway (not Vercel). They import from the same codebase but are started with:

```bash
node workers/post-publisher.worker.js
node workers/comment-monitor.worker.js
node workers/ai-responder.worker.js
node workers/brand-sync.worker.js
```

Queue names:
- `post-publishing` — processes scheduled posts at their publish time
- `comment-monitoring` — polls platforms for new comments every 5 min
- `ai-responding` — generates AI draft/auto responses for new comments
- `brand-sync` — refreshes brand intelligence data on schedule

---

## Stripe Plan Configuration

```typescript
// lib/stripe.ts
export const PLANS = {
  STARTER: {
    name: 'Starter',
    workspaces: 1,
    maxAutonomy: 'OFF',        // No AI responses
    features: ['Basic brand profile', 'Post scheduling', '6 platforms']
  },
  PRO: {
    name: 'Pro',
    workspaces: 5,
    maxAutonomy: 'DRAFT_APPROVE',  // AI drafts, human approves
    features: ['Full brand intelligence', 'AI captions', 'AI response drafts', 'Client approvals']
  },
  AGENCY: {
    name: 'Agency',
    workspaces: -1,  // Unlimited
    maxAutonomy: 'FULL',      // Full autonomous mode available
    features: ['Everything in Pro', 'Unlimited workspaces', 'Full AI autonomy', 'Team members', 'Guardrail controls']
  }
}
```

---

## Common Commands

```bash
# Start development
npm run dev

# Database management
npx prisma generate          # After schema changes
npx prisma db push           # Apply schema to DB (dev)
npx prisma migrate dev       # Create migration (prod-ready)
npx prisma studio            # Visual DB browser at localhost:5555

# Type checking
npm run type-check           # npx tsc --noEmit

# Linting
npm run lint                 # eslint

# Testing
npm test                     # Jest
npm run test:watch           # Watch mode

# Workers (separate terminal)
npx ts-node workers/post-publisher.worker.ts

# Build
npm run build
npm run start
```

---

## Implementation Order

Always build in this order — each phase depends on the previous:

**Phase 1 (Months 1–4) — Foundation**
1. Project setup + design system + all deps
2. Database schema + Auth0 integration
3. App shell (sidebar, header, workspace switcher)
4. Workspace CRUD API + management UI
5. Social OAuth connection flows (all 6 platforms)
6. Post composer (Tiptap editor + platform selector + scheduling)
7. Content calendar (monthly grid + drag-to-reschedule)

**Phase 2 (Months 5–8) — Intelligence**
8. Brand Intelligence Engine (scraper + Claude profiler)
9. AI caption generation
10. AI comment response engine + inbox UI
11. Guided client onboarding flow
12. Client approval workflow
13. Stripe billing integration
14. Analytics dashboard Phase 1

**Phase 3 (Months 9–12) — Autonomy & Scale**
15. BullMQ workers (post publisher + comment monitor + AI responder)
16. Full autonomous AI response posting
17. Phase 2 platforms (YouTube, Pinterest, Threads, Bluesky)
18. Advanced analytics + AI insights
19. PDF export reports
20. Production deployment hardening

---

## What Makes LYRA Premium

When building any feature, ask: does this feel like Bloomberg Terminal or Apple? 
- **Precision over decoration** — every element has a purpose
- **Whitespace is not empty space** — it is the product breathing
- **Data is beautiful** — metrics displayed in Geist Mono, elegant and precise
- **Motion is intentional** — nothing moves without reason
- **Near-black is the canvas** — platinum is the signal

If a screen looks like it could be any SaaS product, it is not ready.

> **The Final Rule:** When in doubt — subtract. The LYRA brand is defined as much by what is absent as by what is present. Remove before you add.
