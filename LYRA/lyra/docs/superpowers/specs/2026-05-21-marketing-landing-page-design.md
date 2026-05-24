# Marketing Landing Page Design

**Date:** 2026-05-21
**Status:** Approved

---

## Goal

Build a public-facing marketing page at `lyraonline.ai` that converts visitors into paying subscribers. Visitors land on the page, understand what LYRA does, choose a plan, and flow through Auth0 signup → Stripe Checkout (14-day trial) → first workspace in the dashboard.

---

## Architecture

### Routing Change

The dashboard home currently lives at `/` via `app/(dashboard)/page.tsx`. The marketing page must claim `/`, so the dashboard home moves to `/dashboard`.

| Before | After |
|---|---|
| `/` → `app/(dashboard)/page.tsx` (dashboard home) | `/` → `app/page.tsx` (marketing page) |
| — | `/dashboard` → `app/(dashboard)/dashboard/page.tsx` (dashboard home, moved) |

- Authenticated users visiting `/` are redirected to `/dashboard` server-side via `getCurrentUser()` check
- All internal app links already use workspace-specific paths — none point to `/`
- `app/onboard/[token]/page.tsx` (existing client onboarding) is unaffected — the new `app/onboard/page.tsx` only matches `/onboard` with no additional segment

### Files

**Create:**
- `app/page.tsx` — public marketing page
- `app/(dashboard)/dashboard/page.tsx` — dashboard home (moved from `(dashboard)/page.tsx`)
- `app/onboard/page.tsx` — checkout redirect (server component)
- `app/onboard/success/page.tsx` — post-payment confirmation
- `components/lyra/marketing/marketing-nav.tsx`
- `components/lyra/marketing/hero-section.tsx`
- `components/lyra/marketing/hero-carousel.tsx` — 4-slide browser frame carousel
- `components/lyra/marketing/features-section.tsx`
- `components/lyra/marketing/pricing-section.tsx` — client component (monthly/annual toggle)
- `components/lyra/marketing/cta-banner.tsx`
- `components/lyra/marketing/video-placeholder.tsx`
- `components/lyra/marketing/marketing-footer.tsx`

**Delete:**
- `app/(dashboard)/page.tsx` — content moved to `/dashboard`

**Modify:**
- `lib/stripe.ts` — add `annualPriceId` and `annualPrice` fields to each plan in `PLANS`
- `app/api/stripe/webhook/route.ts` — create first Workspace on `checkout.session.completed`

### Stripe Env Vars Required

These slots already exist in Netlify. Annual prices already exist in Stripe. Confirm the IDs are populated:
- `STRIPE_STARTER_ANNUAL_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_AGENCY_ANNUAL_PRICE_ID`

---

## Page Sections

### 1 — Nav (sticky)

Fixed top bar, `bg-background-primary/90` with `backdrop-blur-sm`, `border-b border-background-border`.

**Left:** LYRA logo (framed L mark + wordmark)
**Centre:** `Features` · `Pricing` (anchor links, `text-text-secondary`)
**Right:** `Log in` (→ `/auth/login`) · `Start free trial` (primary button, → `#pricing`)

On mobile: centre nav links hidden, logo + CTA only.

### 2 — Hero

Full-width section with purple-to-blue radial gradient glow behind the headline (CSS only, no images).

```
background: radial-gradient(ellipse at 50% 0%,
  rgba(139, 92, 246, 0.30) 0%,
  rgba(59, 130, 246, 0.15) 35%,
  transparent 65%)
```

**Content (centred):**
- Eyebrow chip: `AI-Powered Social Intelligence`
- H1 (Instrument Serif, 52px): `Social media that runs itself.`
- Subheadline (DM Sans, 15px, `text-text-secondary`): `Comments answered. Posts scheduled. Brand voice preserved — across every platform, 24 hours a day.`
- CTAs: `Start free trial →` (primary, → `#pricing`) + `See how it works` (secondary, → `#features`)
- Trial note (12px, `text-text-tertiary`): `14-day free trial. Card required. Cancel any time.`

**Hero Carousel** (below CTAs):

Browser chrome frame (traffic light dots + URL bar showing the active route). Four slides with clickable tab labels above the frame. Auto-advances every 4 seconds. Clicking a tab resets the timer.

| Slide | Tab label | URL shown | Content |
|---|---|---|---|
| 1 | Content Calendar | `/workspace/calendar` | Monthly calendar grid with platform-coloured post chips (FB blue, IG purple, LI green, X grey) |
| 2 | AI Inbox | `/workspace/inbox` | Pending tab with 2 comment cards — positive and negative sentiment — each with AI draft response and Approve & send button |
| 3 | Brand Intelligence | `/workspace/brand` | 2×2 grid of brand cards: Tone of Voice (tags), Voice Profile (bars), Content Themes (dot list), Audience (stat grid). Green "Brand profile active" status bar. |
| 4 | AI Scheduling | `/workspace/compose` | Week schedule with 3 AI-generated post rows, platform tags, draft status chips, and "✦ Generate next week" button |

Navigation: dot indicators below the frame. Active dot elongates to a pill.

### 3 — Features

`id="features"` · `py-24` · `border-t border-background-border`

Section label: `What LYRA does`
Section heading (Instrument Serif, 36px): `Intelligence that works while you sleep.`

Three cards (`rounded-xl bg-background-secondary border border-background-border`):

| Icon | Title | Body |
|---|---|---|
| `Zap` | Brand Intelligence | LYRA scrapes your website and social history to build a precise brand voice profile. Every caption and response reflects the brand — not a template. |
| `MessageSquare` | Autonomous AI Responses | Every comment and review across 7 platforms is monitored and responded to on your behalf — 24 hours a day. You set the guardrails. LYRA handles the rest. |
| `Calendar` | Intelligent Scheduling | Generate platform-optimised captions with one click and schedule across Facebook, Instagram, LinkedIn, TikTok, X, YouTube, and Google Business. |

### 4 — Pricing

`id="pricing"` · `py-24` · `bg-background-secondary`

Section label: `Pricing`
Section heading (Instrument Serif, 36px): `Simple, transparent pricing.`

**Billing toggle (client component):**
Two pill buttons — `Monthly` / `Annual`. Annual shows `Save 17%` badge in `text-status-success`. Toggle switches all displayed prices and which Stripe price ID is used on CTA click.

**Annual prices (per month equivalent, billed annually):**
- Starter: $41/mo ($490/yr)
- Pro: $124/mo ($1,490/yr)
- Agency: $332/mo ($3,990/yr)

**4 pricing cards:**

| Plan | Price (monthly) | Highlight | Workspaces | Key features | CTA |
|---|---|---|---|---|---|
| Starter | $49/mo | No | 1 | Post scheduling, AI captions, Brand intelligence, Comment inbox, 7 platforms | Start free trial |
| Pro | $149/mo | Yes — "Most popular" | 5 | Everything in Starter, AI draft responses, Client approvals, Analytics, Post boosting | Start free trial |
| Agency | $399/mo | No | Unlimited | Everything in Pro, Full AI autonomy, Guardrail controls, Client onboarding, Team members | Start free trial |
| Enterprise | Custom | No | Custom | Everything in Agency, Dedicated account manager, Custom AI training, SLA guarantee, Priority onboarding | Contact us |

**CTA behaviour:**
- Starter / Pro / Agency: `onClick` → if not logged in, redirect to `/auth/login?returnTo=/onboard?plan=X&billing=Y`; if logged in, redirect to `/onboard?plan=X&billing=Y`
- Enterprise: `href="mailto:hello@lyraonline.ai"`
- Button shows spinner + `disabled` during redirect

### 5 — CTA Banner

`py-24` · `border-t border-background-border` · centred text

H2 (Instrument Serif, 36px): `Ready to get your time back?`
Sub (DM Sans, 14px, `text-text-secondary`): `Join agencies and freelancers who let LYRA handle the social media — while they focus on the work that matters.`
CTA: `Start free trial →` (primary, → `#pricing`)

**Video Placeholder** (below CTA button):

A `<VideoPlaceholder>` component rendered below the CTA. On launch it shows a clean placeholder panel — `rounded-xl border border-background-border bg-background-secondary` with a play button icon and text `Watch demo coming soon`. When a real video URL is available, swap the placeholder for an `<iframe>` embed (YouTube/Vimeo). No other code changes needed.

### 6 — Footer

`border-t border-background-border` · `py-12` · flex row on desktop, stacked on mobile

**Left:** LYRA logo
**Centre:** `Privacy Policy` (→ `/docs/legal/LYRA-Privacy-Policy.pdf`) · `Terms of Service` (→ `/docs/legal/LYRA-Terms-of-Service.pdf`) · `Contact` (→ `mailto:hello@lyraonline.ai`)
**Right:** `© 2026 LYRA. All rights reserved.`

---

## New User Signup Flow

```
Visitor clicks "Start free trial" on a pricing card
  │
  ├─ Not logged in
  │   └─ Redirect to /auth/login?returnTo=/onboard?plan=pro&billing=monthly
  │       └─ Auth0 login/signup
  │           └─ Auth0 redirects back to /onboard?plan=pro&billing=monthly
  │
  └─ Already logged in
      └─ Redirect directly to /onboard?plan=pro&billing=monthly
          │
          └─ app/onboard/page.tsx (server component)
              ├─ requireAuth() — redirects to login if session lost
              ├─ Read ?plan and ?billing params
              ├─ get or create Agency for this user
              ├─ stripe.checkout.sessions.create({
              │     mode: 'subscription',
              │     trial_period_days: 14,
              │     line_items: [{ price: PLANS[plan][billingPriceId] }],
              │     success_url: /onboard/success,
              │     cancel_url: /?cancelled=1,
              │     metadata: { agencyId, plan, userId }
              │   })
              └─ redirect(session.url)
                  │
                  └─ Stripe Checkout (card required, 14-day trial)
                      │
                      ├─ User cancels → /?cancelled=1 (marketing page, param ignored)
                      │
                      └─ User completes → /onboard/success
                          │
                          └─ Stripe webhook fires checkout.session.completed
                          │   └─ Create first Workspace + WorkspaceAccess for userId
                          │
                          └─ "Enter LYRA" button → /dashboard
```

### `lib/stripe.ts` changes

Add `annualPriceId` and `annualPrice` (per-month display) to each plan:

```typescript
STARTER: {
  // ... existing fields
  annualPriceId: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID!,
  annualPrice: 41,   // display price (billed as $490/yr)
},
PRO: {
  annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID!,
  annualPrice: 124,
},
AGENCY: {
  annualPriceId: process.env.STRIPE_AGENCY_ANNUAL_PRICE_ID!,
  annualPrice: 332,
},
```

### `app/api/stripe/webhook/route.ts` changes

Add `checkout.session.completed` handler that creates the first Workspace when `agency.workspaces.length === 0`:

```typescript
case 'checkout.session.completed': {
  const session = event.data.object
  if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
    const { agencyId, plan, userId } = session.metadata
    const agency = await prisma.agency.update({
      where: { id: agencyId },
      data: { stripeCustomerId: session.customer as string },
      include: { workspaces: { take: 1 } },
    })
    if (agency.workspaces.length === 0 && userId) {
      // toPlan: helper that maps metadata string ('starter'|'pro'|'agency') → Plan enum ('STARTER'|'PRO'|'AGENCY')
      const workspace = await prisma.workspace.create({
        data: { name: 'My Workspace', agencyId: agency.id, plan: toPlan(plan) },
      })
      await prisma.workspaceAccess.create({
        data: { userId, workspaceId: workspace.id, role: 'AGENCY_ADMIN' },
      })
    }
  }
  break
}
```

---

## Design Rules

All components follow LYRA design system exactly:
- Background: `bg-background-primary` (#080808) on alternating sections, `bg-background-secondary` on pricing
- No hardcoded hex values — tokens only
- DM Sans for all UI text (300/400/500 only)
- Instrument Serif for all section headings and H1
- Geist Mono for price amounts
- Lucide icons only, `strokeWidth={1.5}`
- `rounded-xl` for cards, `rounded-2xl` for modals
- Skeleton loaders not required (static marketing page — no data fetching)
- `prefers-reduced-motion` respected on carousel auto-advance

---

## Pre-Launch Checklist

- [ ] Confirm `STRIPE_STARTER_ANNUAL_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_AGENCY_ANNUAL_PRICE_ID` are set in Netlify env vars
- [ ] Add `STRIPE_WEBHOOK_SECRET` to Netlify env vars if not already present (required for webhook signature verification)
- [ ] Set up `hello@lyraonline.ai` in Microsoft 365 ✅ (done)
- [ ] Smoke-test golden path: visit `/` incognito → click "Start free trial" on Pro → sign up → Stripe test card → `/onboard/success` → `/dashboard` with workspace visible
- [ ] Verify authenticated redirect: visit `/` while logged in → lands on `/dashboard`
- [ ] Verify Enterprise "Contact us" opens mail client to `hello@lyraonline.ai`

---

## Out of Scope

- Demo video (VideoPlaceholder component ships on launch; real video drops in later with no code change)
- Testimonials / social proof section (no real customer quotes yet)
- Blog / content marketing pages
- A/B testing
- Analytics events (can add later)
- Mobile app download links
