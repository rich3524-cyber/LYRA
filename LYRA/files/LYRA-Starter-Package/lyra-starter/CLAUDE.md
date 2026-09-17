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
| Deployment | Vercel (app) + Railway (workers) | Sydney region (syd1) |
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
font-display:  "Instrument Serif" — Display headings ONLY (page titles, marketing)
font-sans:     "DM Sans"          — ALL UI text (labels, buttons, body, navigation)
font-mono:     "Geist Mono"       — ALL data values (counts, metrics, IDs, code)
```

**NEVER use Inter, Arial, Roboto, system-ui, or any other font.**
**NEVER use font-sans for headings. NEVER use font-display for UI text.**

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

### Logo

The LYRA wordmark is: framed L initial + "YRA" in ultralight tracking.
- Favicon / app icon: framed L alone (square border, platinum on near-black)
- Full wordmark: LYRA in ultralight, wide letter-spacing, near-black background
- Never display LYRA on a white or light background in the authenticated app

### Pre-Delivery UI Checklist

Before any UI PR is merged, verify:
- [ ] No emoji as icons — Lucide only
- [ ] No hardcoded hex values — tokens only
- [ ] Near-black background on all authenticated pages
- [ ] DM Sans for UI, Instrument Serif for display only, Geist Mono for data
- [ ] All async buttons show disabled + spinner during operation
- [ ] Skeleton loaders on all data-dependent content
- [ ] Focus rings visible (2px platinum outline-offset-2)
- [ ] ARIA labels on all icon-only buttons
- [ ] Touch targets 44×44px minimum
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
  model:      'claude-sonnet-4-20250514',  // ALWAYS this model
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
