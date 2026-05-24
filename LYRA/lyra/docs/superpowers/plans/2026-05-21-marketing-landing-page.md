# Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public marketing page at `/` that converts visitors into paying subscribers via a Stripe Checkout trial flow, and move the existing dashboard home from `/` to `/dashboard`.

**Architecture:** The marketing page is a server component at `app/page.tsx` that redirects authenticated users to `/dashboard`; unauthenticated visitors see 6 static sections (Nav, Hero+Carousel, Features, Pricing, CTA, Footer). Clicking a pricing CTA sends the user to `app/onboard/page.tsx` which creates a Stripe Checkout session with a 14-day trial and redirects to Stripe. On completion, the Stripe webhook creates the user's first Workspace and WorkspaceAccess record.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS (LYRA design tokens), Framer Motion not required (CSS transitions only), `@auth0/nextjs-auth0/client` for auth state in client components, Stripe SDK, Prisma.

---

## File Map

**Create:**
- `app/page.tsx` — public marketing page (server component)
- `app/(dashboard)/dashboard/page.tsx` — dashboard home (moved from `(dashboard)/page.tsx`)
- `app/onboard/page.tsx` — Stripe Checkout redirect (server component)
- `app/onboard/success/page.tsx` — post-payment confirmation
- `components/lyra/marketing/marketing-nav.tsx` — sticky top nav
- `components/lyra/marketing/hero-section.tsx` — headline + CTAs + carousel wrapper
- `components/lyra/marketing/hero-carousel.tsx` — 4-slide browser frame carousel (client component)
- `components/lyra/marketing/features-section.tsx` — 3 feature cards
- `components/lyra/marketing/pricing-section.tsx` — billing toggle + 4 pricing cards (client component)
- `components/lyra/marketing/cta-banner.tsx` — bottom CTA + video placeholder
- `components/lyra/marketing/video-placeholder.tsx` — swap-ready video slot
- `components/lyra/marketing/marketing-footer.tsx` — logo + links + copyright

**Modify:**
- `lib/stripe.ts` — add `annualPriceId` + `annualPrice` to each plan
- `app/api/stripe/webhook/route.ts` — extend `checkout.session.completed` to create first Workspace

**Delete:**
- `app/(dashboard)/page.tsx` — content moved to `/dashboard`

---

## Task 1: Extend lib/stripe.ts with annual pricing

**Files:**
- Modify: `lib/stripe.ts`

Context: `PLANS` is `as const` — just add the two new fields to each plan object. `annualPriceId` reads from env vars that already exist in Netlify. `annualPrice` is the per-month display price when billed annually.

- [ ] **Step 1: Replace PLANS in lib/stripe.ts**

Open `lib/stripe.ts` and replace the entire `PLANS` object and `PlanKey` export with:

```typescript
export const PLANS = {
  STARTER: {
    name:          'Starter',
    priceId:       process.env.STRIPE_STARTER_PRICE_ID!,
    annualPriceId: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID!,
    workspaces:    1,
    maxAutonomy:   'OFF' as const,
    price:         49,
    annualPrice:   41,
    description:   'Perfect for solo freelancers managing one client.',
    features:      ['1 workspace', 'AI caption generation', 'Content calendar', 'Comment inbox'],
  },
  PRO: {
    name:          'Pro',
    priceId:       process.env.STRIPE_PRO_PRICE_ID!,
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID!,
    workspaces:    5,
    maxAutonomy:   'DRAFT_APPROVE' as const,
    price:         149,
    annualPrice:   124,
    description:   'For growing agencies managing multiple clients.',
    features:      ['5 workspaces', 'AI draft responses', 'Brand intelligence', 'Approval workflow', 'Analytics'],
  },
  AGENCY: {
    name:          'Agency',
    priceId:       process.env.STRIPE_AGENCY_PRICE_ID!,
    annualPriceId: process.env.STRIPE_AGENCY_ANNUAL_PRICE_ID!,
    workspaces:    -1,
    maxAutonomy:   'FULL' as const,
    price:         399,
    annualPrice:   332,
    description:   'Unlimited clients with full AI autonomy.',
    features:      ['Unlimited workspaces', 'Autonomous AI responses', 'Priority support', 'White-label onboarding', 'Advanced analytics'],
  },
} as const

export type PlanKey = keyof typeof PLANS
```

The rest of the file (the `getStripe` / `stripe` proxy) stays unchanged.

- [ ] **Step 2: Type-check**

```bash
cd lyra && npx tsc --noEmit
```

Expected: no errors on `lib/stripe.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/stripe.ts
git commit -m "feat: add annual pricing fields to PLANS config"
```

---

## Task 2: Move dashboard home to /dashboard

**Files:**
- Create: `app/(dashboard)/dashboard/page.tsx`
- Delete: `app/(dashboard)/page.tsx`

Context: In Next.js App Router, route groups like `(dashboard)` don't affect the URL. So `app/(dashboard)/page.tsx` currently serves `/`. The marketing page needs to claim `/`. Moving the dashboard home to `app/(dashboard)/dashboard/page.tsx` makes it serve `/dashboard` while staying inside the `(dashboard)` layout (auth check, sidebar, header).

- [ ] **Step 1: Create app/(dashboard)/dashboard/page.tsx**

Copy the full content of `app/(dashboard)/page.tsx` verbatim into the new file. Do not change a single line. The file path changes but the content is identical.

Create `app/(dashboard)/dashboard/page.tsx` with this content (copied from the existing `app/(dashboard)/page.tsx`):

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Plus, Building2, PenSquare, MessageSquare, Zap, Globe, Share2 } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function DashboardHome() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const workspaces = user.workspaceAccess.map((wa) => wa.workspace)
  const hasWorkspaces = workspaces.length > 0
  const firstName = user.name?.split(' ')[0] ?? null

  // Check brand readiness for the active workspace
  let brandReady = false
  let hasBrandProfile = false
  const activeWorkspaceId = workspaces[0]?.id ?? ''

  if (activeWorkspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: activeWorkspaceId },
      select: {
        websiteUrl: true,
        brandProfile: { select: { id: true } },
        _count: { select: { socialAccounts: { where: { isActive: true } } } },
      },
    }).catch(() => null)

    brandReady = !!(ws?.websiteUrl && (ws._count?.socialAccounts ?? 0) > 0)
    hasBrandProfile = !!ws?.brandProfile
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Display heading */}
      <div className="space-y-1.5">
        <h1 className="font-display text-4xl text-text-primary leading-tight">
          {hasWorkspaces
            ? firstName ? `Good to see you, ${firstName}.` : 'Welcome back.'
            : 'Welcome to LYRA.'}
        </h1>
        <p className="font-sans text-sm text-text-secondary">
          {hasWorkspaces
            ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} under management.`
            : 'Create your first workspace to begin.'}
        </p>
      </div>

      {hasWorkspaces ? (
        <>
          {/* Brand AI unlock banner */}
          {brandReady && !hasBrandProfile && (
            <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <div className="flex items-start gap-3">
                <Zap size={16} strokeWidth={1.5} className="text-accent-platinum shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-sans text-sm font-medium text-text-primary">
                    Brand AI is ready to build.
                  </p>
                  <p className="font-sans text-sm text-text-secondary leading-relaxed">
                    LYRA will now scrape your website and analyse your connected social accounts
                    to build your brand voice profile. The more social accounts you connect, the
                    more accurate and nuanced the profile becomes.
                  </p>
                </div>
              </div>
              <Link
                href={`/workspace/${activeWorkspaceId}/brand`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
              >
                <Zap size={14} strokeWidth={2} />
                Build brand profile
              </Link>
            </div>
          )}

          {/* Setup checklist — shown when brand not yet ready */}
          {!brandReady && (
            <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
              <div className="space-y-0.5">
                <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                  Setup
                </p>
                <p className="font-sans text-sm text-text-secondary">
                  Complete these steps to unlock Brand AI.
                </p>
              </div>
              <div className="space-y-3">
                <SetupStep
                  icon={Globe}
                  label="Add your website URL"
                  done={true}
                  href={`/workspace/${activeWorkspaceId}/settings`}
                />
                <SetupStep
                  icon={Share2}
                  label="Connect at least one social account"
                  done={false}
                  href={`/workspace/${activeWorkspaceId}/settings`}
                />
                <SetupStep
                  icon={Zap}
                  label="Build your brand profile"
                  done={false}
                  href={`/workspace/${activeWorkspaceId}/brand`}
                  locked
                />
              </div>
            </div>
          )}

          {/* Workspaces */}
          <section className="space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Workspaces
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/workspace/${ws.id}`}
                  className="group flex items-center justify-between p-5 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150"
                >
                  <div className="space-y-0.5">
                    <p className="font-sans text-sm font-medium text-text-primary">{ws.name}</p>
                    <p className="font-sans text-xs text-text-tertiary capitalize">
                      {ws.plan.charAt(0) + ws.plan.slice(1).toLowerCase()} plan
                    </p>
                  </div>
                  <ArrowRight size={16} strokeWidth={1.5} className="text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </section>

          {/* Quick actions */}
          <section className="space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Quick actions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href={`/workspace/${workspaces[0].id}/compose`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <PenSquare size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">Compose a post</span>
              </Link>
              <Link
                href={`/workspace/${workspaces[0].id}/inbox`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <MessageSquare size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">View inbox</span>
              </Link>
              <Link
                href="/agency/clients/new"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <Plus size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">Add workspace</span>
              </Link>
            </div>
          </section>
        </>
      ) : (
        /* Empty state */
        <section className="py-12 space-y-6">
          <div className="space-y-2">
            <Building2 size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <p className="font-sans text-sm text-text-secondary">No workspaces yet.</p>
            <p className="font-sans text-sm text-text-tertiary max-w-xs leading-relaxed">
              A workspace represents one client or brand. Connect social accounts, and LYRA
              handles scheduling and AI responses from there.
            </p>
          </div>
          <Link
            href="/agency/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            <Plus size={16} strokeWidth={2} />
            Create workspace
          </Link>
        </section>
      )}
    </div>
  )
}

function SetupStep({
  icon: Icon,
  label,
  done,
  href,
  locked,
}: {
  icon: React.ElementType
  label: string
  done: boolean
  href: string
  locked?: boolean
}) {
  const content = (
    <div className={`flex items-center gap-3 ${locked ? 'opacity-40' : ''}`}>
      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${done ? 'border-status-success bg-status-success' : 'border-background-border-mid'}`}>
        {done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="#080808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <Icon size={14} strokeWidth={1.5} className={done ? 'text-text-secondary' : 'text-text-tertiary'} />
      <span className={`font-sans text-sm ${done ? 'text-text-secondary' : 'text-text-tertiary'}`}>
        {label}
      </span>
    </div>
  )

  if (locked) return <div>{content}</div>
  return <Link href={href}>{content}</Link>
}
```

- [ ] **Step 2: Delete app/(dashboard)/page.tsx**

```bash
rm "app/(dashboard)/page.tsx"
```

Or delete it via the file explorer / IDE. The file is no longer needed — its content is now at `app/(dashboard)/dashboard/page.tsx`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify routing**

Run `npm run dev` and visit `http://localhost:3000/dashboard` while logged in. Should render the dashboard home (workspace list, quick actions). Visit `http://localhost:3000/` — should 404 for now (marketing page not built yet). That's expected.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx" "app/(dashboard)/page.tsx"
git commit -m "feat: move dashboard home from / to /dashboard route"
```

---

## Task 3: Extend Stripe webhook to create first workspace on checkout

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

Context: The existing `checkout.session.completed` handler only updates `stripeCustomerId` on the Agency. We need to extend it to also create the user's first Workspace and WorkspaceAccess record when the agency has no workspaces yet. `toPlan()` is already defined at the top of the file — reuse it. `WorkspaceAccess.role` is typed as `UserRole` — use `'AGENCY_ADMIN'`.

- [ ] **Step 1: Replace the checkout.session.completed case**

In `app/api/stripe/webhook/route.ts`, find and replace the existing `checkout.session.completed` case:

**Before:**
```typescript
case 'checkout.session.completed': {
  const session = event.data.object
  if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
    await prisma.agency.update({
      where: { id: session.metadata.agencyId },
      data:  { stripeCustomerId: session.customer as string },
    })
  }
  break
}
```

**After:**
```typescript
case 'checkout.session.completed': {
  const session = event.data.object
  if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
    const { agencyId, plan, userId } = session.metadata
    const agency = await prisma.agency.update({
      where:   { id: agencyId },
      data:    { stripeCustomerId: session.customer as string },
      include: { workspaces: { take: 1 } },
    })
    if (agency.workspaces.length === 0 && userId) {
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

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If TypeScript complains about `session.metadata` possibly being null, the `&&` guards above already narrow it.

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: create first workspace in checkout.session.completed webhook"
```

---

## Task 4: MarketingNav component

**Files:**
- Create: `components/lyra/marketing/marketing-nav.tsx`

Context: Sticky top bar with logo, anchor nav links, and CTA button. Pure server component — no client JS needed (sticky uses CSS `position: sticky`, mobile link hiding uses Tailwind responsive classes). The LYRA logo is a platinum square-bordered L mark + "YRA" wordmark per brand guidelines.

- [ ] **Step 1: Create the file**

Create `components/lyra/marketing/marketing-nav.tsx`:

```tsx
import Link from 'next/link'

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 bg-background-primary/90 backdrop-blur-sm border-b border-background-border">
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 border border-accent-silver flex items-center justify-center">
            <span className="font-sans font-light text-text-primary text-sm leading-none select-none">
              L
            </span>
          </div>
          <span className="font-sans font-light text-accent-silver text-sm tracking-[0.25em] select-none">
            YRA
          </span>
        </Link>

        {/* Centre links — hidden on mobile */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Pricing
          </a>
        </div>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            Log in
          </Link>
          <a
            href="#pricing"
            className="px-4 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            Start free trial
          </a>
        </div>
      </nav>
    </header>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/marketing/marketing-nav.tsx
git commit -m "feat: add MarketingNav component"
```

---

## Task 5: HeroCarousel (client component)

**Files:**
- Create: `components/lyra/marketing/hero-carousel.tsx`

Context: 4-slide browser-frame carousel. Client component for tab clicks and auto-advance. Respects `prefers-reduced-motion`. Timer resets when user clicks a tab. Each slide is a static mockup of the corresponding LYRA screen — no real data fetching. The four slide sub-components (CalendarSlide, InboxSlide, BrandSlide, ScheduleSlide) live in the same file.

- [ ] **Step 1: Create the file**

Create `components/lyra/marketing/hero-carousel.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'

const SLIDES = [
  { label: 'Content Calendar', url: '/workspace/calendar' },
  { label: 'AI Inbox',         url: '/workspace/inbox' },
  { label: 'Brand Intelligence', url: '/workspace/brand' },
  { label: 'AI Scheduling',    url: '/workspace/compose' },
]

export default function HeroCarousel() {
  const [active, setActive] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reducedMotion = useRef(false)

  useEffect(() => {
    reducedMotion.current =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!reducedMotion.current) startTimer()
    return () => stopTimer()
  }, [])

  function startTimer() {
    stopTimer()
    intervalRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDES.length)
    }, 4000)
  }

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function goTo(index: number) {
    setActive(index)
    if (!reducedMotion.current) startTimer()
  }

  const slideContents = [
    <CalendarSlide key="calendar" />,
    <InboxSlide key="inbox" />,
    <BrandSlide key="brand" />,
    <ScheduleSlide key="schedule" />,
  ]

  return (
    <div className="w-full max-w-4xl mx-auto mt-12">
      {/* Tab labels */}
      <div className="flex items-center justify-center gap-1 mb-4 flex-wrap">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.label}
            onClick={() => goTo(i)}
            className={`px-3 py-1.5 rounded-md font-sans text-xs transition-colors duration-150 ${
              i === active
                ? 'text-text-primary bg-background-secondary border border-background-border'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {slide.label}
          </button>
        ))}
      </div>

      {/* Browser frame */}
      <div className="rounded-xl border border-background-border bg-background-secondary overflow-hidden shadow-2xl">
        {/* Chrome bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-background-tertiary border-b border-background-border">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-status-error opacity-60" />
            <div className="w-3 h-3 rounded-full bg-status-warning opacity-60" />
            <div className="w-3 h-3 rounded-full bg-status-success opacity-60" />
          </div>
          <div className="flex-1 h-6 bg-background-hover rounded flex items-center px-3 min-w-0">
            <span className="font-mono text-[11px] text-text-tertiary truncate">
              lyraonline.ai{SLIDES[active].url}
            </span>
          </div>
        </div>

        {/* Slide content */}
        <div className="p-6 min-h-[340px]">
          {slideContents[active]}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 mt-5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active
                ? 'w-6 bg-accent-platinum'
                : 'w-1.5 bg-background-border-mid hover:bg-text-tertiary'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/* ─── Slide 1: Content Calendar ─────────────────────────────────────────── */

function CalendarSlide() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const cells = [
    { day: 19, chips: [{ label: 'FB · Caption', cls: 'bg-status-info/20 text-status-info' }] },
    { day: 20, chips: [{ label: 'IG · Reel', cls: 'bg-purple-500/20 text-purple-400' }, { label: 'LI · Article', cls: 'bg-status-success/20 text-status-success' }] },
    { day: 21, chips: [] },
    { day: 22, chips: [{ label: 'FB · Story', cls: 'bg-status-info/20 text-status-info' }] },
    { day: 23, chips: [{ label: 'IG · Post', cls: 'bg-purple-500/20 text-purple-400' }] },
    { day: 24, chips: [] },
    { day: 25, chips: [{ label: 'LI · Update', cls: 'bg-status-success/20 text-status-success' }] },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-sans text-sm font-medium text-text-primary">May 2026</span>
        <div className="flex gap-2">
          <span className="font-sans text-xs px-2 py-1 rounded-md bg-background-tertiary border border-background-border text-text-secondary">
            All
          </span>
          <span className="font-sans text-xs px-2 py-1 text-text-tertiary">Scheduled</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div key={d} className="text-center font-sans text-[10px] text-text-tertiary py-1">
            {d}
          </div>
        ))}
        {cells.map(({ day, chips }) => (
          <div
            key={day}
            className="bg-background-tertiary border border-background-border rounded-md p-1.5 min-h-[72px]"
          >
            <div className="font-mono text-[10px] text-text-tertiary mb-1.5">{day}</div>
            <div className="space-y-1">
              {chips.map((c) => (
                <div
                  key={c.label}
                  className={`font-sans text-[9px] rounded px-1 py-0.5 truncate ${c.cls}`}
                >
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Slide 2: AI Inbox ──────────────────────────────────────────────────── */

function InboxSlide() {
  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-background-border pb-2">
        <span className="font-sans text-xs text-text-primary border-b-2 border-accent-platinum pb-2 -mb-2.5 flex items-center gap-1.5">
          Pending
          <span className="font-mono text-[9px] bg-background-tertiary text-text-tertiary px-1.5 py-0.5 rounded-full">
            5
          </span>
        </span>
        <span className="font-sans text-xs text-text-tertiary">Escalated</span>
        <span className="font-sans text-xs text-text-tertiary">Done</span>
      </div>

      {/* Comment — Positive */}
      <div className="p-3 rounded-lg bg-background-tertiary border border-background-border space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-background-hover flex items-center justify-center font-sans text-[11px] text-text-tertiary shrink-0">
            S
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-[10px] text-text-tertiary">Sarah M. · Facebook</span>
              <span className="font-sans text-[9px] px-1.5 py-0.5 rounded-full bg-status-success/15 text-status-success">
                Positive
              </span>
            </div>
            <p className="font-sans text-xs text-text-primary mb-2">
              "Absolutely love the new menu — best coffee in town!"
            </p>
            <div className="bg-background-secondary border-l-2 border-purple-500 pl-2 py-1.5 rounded-r-md">
              <p className="font-sans text-[9px] text-purple-400 mb-1">✦ AI draft</p>
              <p className="font-sans text-[10px] text-text-secondary leading-relaxed">
                Thank you so much, Sarah! That means the world to us. See you again soon ☕
              </p>
            </div>
            <button className="mt-2 font-sans text-[10px] px-2.5 py-1 bg-accent-platinum text-background-primary rounded-md">
              Approve &amp; send →
            </button>
          </div>
        </div>
      </div>

      {/* Comment — Negative */}
      <div className="p-3 rounded-lg bg-background-tertiary border border-background-border space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-background-hover flex items-center justify-center font-sans text-[11px] text-text-tertiary shrink-0">
            J
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-[10px] text-text-tertiary">James K. · Instagram</span>
              <span className="font-sans text-[9px] px-1.5 py-0.5 rounded-full bg-status-error/15 text-status-error">
                Negative
              </span>
            </div>
            <p className="font-sans text-xs text-text-primary mb-2">
              "Waited 20 mins for my order, won't be back."
            </p>
            <div className="bg-background-secondary border-l-2 border-purple-500 pl-2 py-1.5 rounded-r-md">
              <p className="font-sans text-[9px] text-purple-400 mb-1">✦ AI draft</p>
              <p className="font-sans text-[10px] text-text-secondary leading-relaxed">
                Hi James, we're sorry about the wait — that's not the experience we aim for. We'd love to make it right.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Slide 3: Brand Intelligence ───────────────────────────────────────── */

function BrandSlide() {
  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-success/10 border border-status-success/20">
        <div className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
        <span className="font-sans text-xs text-status-success">Brand profile active</span>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Tone of Voice */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Tone of Voice
          </p>
          <div className="flex flex-wrap gap-1">
            {['Professional', 'Warm', 'Confident', 'Clear'].map((t) => (
              <span
                key={t}
                className="font-sans text-[9px] px-1.5 py-0.5 rounded-full bg-background-hover text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Voice Profile */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Voice Profile
          </p>
          <div className="space-y-1.5">
            {[{ label: 'Formal', pct: 70 }, { label: 'Friendly', pct: 85 }, { label: 'Concise', pct: 60 }].map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="font-sans text-[9px] text-text-tertiary w-12 shrink-0">{b.label}</span>
                <div className="flex-1 h-1 bg-background-hover rounded-full">
                  <div
                    className="h-1 rounded-full bg-accent-platinum"
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content Themes */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Content Themes
          </p>
          <div className="space-y-1.5">
            {['Product launches', 'Customer stories', 'Behind the scenes', 'Seasonal offers'].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-accent-silver shrink-0" />
                <span className="font-sans text-[9px] text-text-secondary">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Audience */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Audience
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Avg age', val: '28–40' },
              { label: 'Top city', val: 'Sydney' },
              { label: 'Gender', val: '62% F' },
              { label: 'Intent', val: 'Local' },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono text-xs text-text-primary">{s.val}</p>
                <p className="font-sans text-[9px] text-text-tertiary">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Slide 4: AI Scheduling ─────────────────────────────────────────────── */

function ScheduleSlide() {
  const posts = [
    {
      platform: 'Facebook',
      platformCls: 'bg-status-info/20 text-status-info',
      day: 'Mon 19',
      time: '9:00 AM',
      preview: 'Summer sale kicks off today! Shop our new collection and save up to 30%...',
      status: 'Scheduled',
      statusCls: 'bg-status-info/15 text-status-info',
    },
    {
      platform: 'Instagram',
      platformCls: 'bg-purple-500/20 text-purple-400',
      day: 'Wed 21',
      time: '12:30 PM',
      preview: 'Behind the scenes: how we craft every batch with care ✨',
      status: 'Draft',
      statusCls: 'bg-background-hover text-text-tertiary',
    },
    {
      platform: 'LinkedIn',
      platformCls: 'bg-status-success/20 text-status-success',
      day: 'Fri 23',
      time: '8:00 AM',
      preview: "We're hiring — join a team redefining what great customer experience looks like.",
      status: 'Scheduled',
      statusCls: 'bg-status-info/15 text-status-info',
    },
  ]

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {posts.map((p) => (
          <div
            key={p.day}
            className="flex items-start gap-3 p-3 rounded-lg bg-background-tertiary border border-background-border"
          >
            <div className="shrink-0 text-center w-14">
              <p className="font-mono text-[10px] text-text-tertiary">{p.day}</p>
              <p className="font-mono text-[10px] text-text-tertiary">{p.time}</p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-sans text-[9px] px-1.5 py-0.5 rounded-full ${p.platformCls}`}>
                  {p.platform}
                </span>
                <span className={`font-sans text-[9px] px-1.5 py-0.5 rounded-full ${p.statusCls}`}>
                  {p.status}
                </span>
                <span className="font-sans text-[9px] text-purple-400 ml-auto">✦ AI</span>
              </div>
              <p className="font-sans text-[10px] text-text-secondary leading-relaxed truncate">
                {p.preview}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-background-border text-text-secondary font-sans text-xs hover:border-background-border-mid hover:text-text-primary transition-colors duration-150">
        <span className="text-purple-400">✦</span>
        Generate next week
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/marketing/hero-carousel.tsx
git commit -m "feat: add HeroCarousel component with 4 product slides"
```

---

## Task 6: HeroSection component

**Files:**
- Create: `components/lyra/marketing/hero-section.tsx`

Context: Centred content with CSS radial gradient glow behind the headline. Server component. Renders the eyebrow chip, H1, subheadline, CTA buttons, trial note, then the `<HeroCarousel />` client component below.

- [ ] **Step 1: Create the file**

Create `components/lyra/marketing/hero-section.tsx`:

```tsx
import HeroCarousel from './hero-carousel'

export default function HeroSection() {
  return (
    <section
      className="relative px-6 pt-24 pb-16 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.30) 0%, rgba(59,130,246,0.15) 35%, transparent 65%)',
      }}
    >
      {/* Centred content */}
      <div className="max-w-3xl mx-auto text-center space-y-6">
        {/* Eyebrow chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-background-border bg-background-secondary">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="font-sans text-xs text-text-secondary tracking-wide">
            AI-Powered Social Intelligence
          </span>
        </div>

        {/* H1 */}
        <h1 className="font-display text-5xl md:text-6xl text-text-primary leading-tight">
          Social media that runs itself.
        </h1>

        {/* Subheadline */}
        <p className="font-sans text-[15px] text-text-secondary leading-relaxed max-w-xl mx-auto">
          Comments answered. Posts scheduled. Brand voice preserved — across every platform,
          24 hours a day.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="#pricing"
            className="px-6 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            Start free trial →
          </a>
          <a
            href="#features"
            className="px-6 py-3 rounded-lg border border-background-border text-text-secondary font-sans text-sm hover:border-background-border-mid hover:text-text-primary transition-colors duration-150"
          >
            See how it works
          </a>
        </div>

        {/* Trial note */}
        <p className="font-sans text-xs text-text-tertiary">
          14-day free trial. Card required. Cancel any time.
        </p>
      </div>

      {/* Carousel */}
      <HeroCarousel />
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/marketing/hero-section.tsx
git commit -m "feat: add HeroSection with gradient glow and carousel"
```

---

## Task 7: FeaturesSection component

**Files:**
- Create: `components/lyra/marketing/features-section.tsx`

Context: Server component. Three feature cards with Lucide icons, `id="features"` anchor. Section label + display heading + 3 cards in a responsive grid.

- [ ] **Step 1: Create the file**

Create `components/lyra/marketing/features-section.tsx`:

```tsx
import { Zap, MessageSquare, Calendar } from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    title: 'Brand Intelligence',
    body: 'LYRA scrapes your website and social history to build a precise brand voice profile. Every caption and response reflects the brand — not a template.',
  },
  {
    icon: MessageSquare,
    title: 'Autonomous AI Responses',
    body: 'Every comment and review across 7 platforms is monitored and responded to on your behalf — 24 hours a day. You set the guardrails. LYRA handles the rest.',
  },
  {
    icon: Calendar,
    title: 'Intelligent Scheduling',
    body: 'Generate platform-optimised captions with one click and schedule across Facebook, Instagram, LinkedIn, TikTok, X, YouTube, and Google Business.',
  },
]

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="py-24 px-6 border-t border-background-border"
    >
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Heading */}
        <div className="text-center space-y-3">
          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
            What LYRA does
          </p>
          <h2 className="font-display text-4xl text-text-primary">
            Intelligence that works while you sleep.
          </h2>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="p-6 rounded-xl bg-background-secondary border border-background-border space-y-4"
            >
              <Icon size={24} strokeWidth={1.5} className="text-accent-platinum" />
              <div className="space-y-2">
                <h3 className="font-sans text-sm font-medium text-text-primary">{title}</h3>
                <p className="font-sans text-sm text-text-secondary leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/marketing/features-section.tsx
git commit -m "feat: add FeaturesSection component"
```

---

## Task 8: PricingSection component

**Files:**
- Create: `components/lyra/marketing/pricing-section.tsx`

Context: Client component (`'use client'`) for the monthly/annual billing toggle. Uses `useUser()` from `@auth0/nextjs-auth0/client` to determine whether the CTA should redirect directly to `/onboard` or via `/auth/login`. `Loader2` from Lucide for the button spinner. The Enterprise card uses `mailto:` and never triggers the spinner.

- [ ] **Step 1: Create the file**

Create `components/lyra/marketing/pricing-section.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useUser } from '@auth0/nextjs-auth0/client'

type Billing = 'monthly' | 'annual'

const CARDS = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyPrice: 49,
    annualPrice: 41,
    annualTotal: 490,
    highlight: false,
    workspaces: '1 workspace',
    features: [
      'Post scheduling',
      'AI captions',
      'Brand intelligence',
      'Comment inbox',
      '7 platforms',
    ],
    cta: 'trial' as const,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 149,
    annualPrice: 124,
    annualTotal: 1490,
    highlight: true,
    workspaces: '5 workspaces',
    features: [
      'Everything in Starter',
      'AI draft responses',
      'Client approvals',
      'Analytics',
      'Post boosting',
    ],
    cta: 'trial' as const,
  },
  {
    key: 'agency',
    name: 'Agency',
    monthlyPrice: 399,
    annualPrice: 332,
    annualTotal: 3990,
    highlight: false,
    workspaces: 'Unlimited workspaces',
    features: [
      'Everything in Pro',
      'Full AI autonomy',
      'Guardrail controls',
      'Client onboarding',
      'Team members',
    ],
    cta: 'trial' as const,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: null,
    annualPrice: null,
    annualTotal: null,
    highlight: false,
    workspaces: 'Custom',
    features: [
      'Everything in Agency',
      'Dedicated account manager',
      'Custom AI training',
      'SLA guarantee',
      'Priority onboarding',
    ],
    cta: 'contact' as const,
  },
] as const

export default function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly')

  return (
    <section
      id="pricing"
      className="py-24 px-6 bg-background-secondary border-t border-background-border"
    >
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Heading */}
        <div className="text-center space-y-4">
          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
            Pricing
          </p>
          <h2 className="font-display text-4xl text-text-primary">
            Simple, transparent pricing.
          </h2>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-background-border bg-background-primary">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-1.5 rounded-full font-sans text-sm transition-colors duration-150 ${
                billing === 'monthly'
                  ? 'bg-accent-platinum text-background-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-sans text-sm transition-colors duration-150 ${
                billing === 'annual'
                  ? 'bg-accent-platinum text-background-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Annual
              <span className="font-sans text-[10px] text-status-success bg-status-success/15 px-1.5 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {CARDS.map((card) => (
            <PricingCard key={card.key} card={card} billing={billing} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingCard({
  card,
  billing,
}: {
  card: (typeof CARDS)[number]
  billing: Billing
}) {
  const { user } = useUser()
  const [loading, setLoading] = useState(false)

  const displayPrice =
    card.monthlyPrice === null
      ? null
      : billing === 'annual'
      ? card.annualPrice
      : card.monthlyPrice

  function handleTrialClick() {
    if (card.cta !== 'trial') return
    setLoading(true)
    const onboardUrl = `/onboard?plan=${card.key}&billing=${billing}`
    const dest = user
      ? onboardUrl
      : `/auth/login?returnTo=${encodeURIComponent(onboardUrl)}`
    window.location.href = dest
  }

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-6 space-y-6 ${
        card.highlight
          ? 'border-accent-platinum bg-background-primary'
          : 'border-background-border bg-background-secondary'
      }`}
    >
      {/* Most popular badge */}
      {card.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="font-sans text-[10px] font-medium px-3 py-1 rounded-full bg-accent-platinum text-background-primary">
            Most popular
          </span>
        </div>
      )}

      {/* Plan name + workspaces */}
      <div className="space-y-1">
        <h3 className="font-sans text-sm font-medium text-text-primary">{card.name}</h3>
        <p className="font-sans text-xs text-text-tertiary">{card.workspaces}</p>
      </div>

      {/* Price */}
      <div className="space-y-1">
        {displayPrice !== null ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl text-text-primary">${displayPrice}</span>
              <span className="font-sans text-xs text-text-tertiary">/mo</span>
            </div>
            {billing === 'annual' && card.annualTotal && (
              <p className="font-sans text-[11px] text-text-tertiary">
                Billed annually (${card.annualTotal}/yr)
              </p>
            )}
          </>
        ) : (
          <span className="font-mono text-3xl text-text-primary">Custom</span>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-2 flex-1">
        {card.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check size={14} strokeWidth={1.5} className="text-status-success shrink-0 mt-0.5" />
            <span className="font-sans text-xs text-text-secondary">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {card.cta === 'trial' ? (
        <button
          onClick={handleTrialClick}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-sans text-sm font-medium transition-colors duration-150 disabled:opacity-60 ${
            card.highlight
              ? 'bg-accent-platinum text-background-primary hover:bg-accent-white'
              : 'border border-background-border text-text-secondary hover:border-background-border-mid hover:text-text-primary'
          }`}
        >
          {loading && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
          Start free trial
        </button>
      ) : (
        <a
          href="mailto:hello@lyraonline.ai"
          className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg border border-background-border text-text-secondary font-sans text-sm hover:border-background-border-mid hover:text-text-primary transition-colors duration-150"
        >
          Contact us
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/marketing/pricing-section.tsx
git commit -m "feat: add PricingSection with billing toggle and 4 pricing cards"
```

---

## Task 9: VideoPlaceholder and CTABanner components

**Files:**
- Create: `components/lyra/marketing/video-placeholder.tsx`
- Create: `components/lyra/marketing/cta-banner.tsx`

Context: `VideoPlaceholder` is a swap-ready slot — currently renders a placeholder panel; when a real video URL is available, swap the placeholder JSX for an `<iframe>` embed. No prop needed now. `CTABanner` is the bottom-of-page section with the H2, subheadline, CTA button, and `<VideoPlaceholder />` below it.

- [ ] **Step 1: Create video-placeholder.tsx**

Create `components/lyra/marketing/video-placeholder.tsx`:

```tsx
import { Play } from 'lucide-react'

export default function VideoPlaceholder() {
  return (
    <div className="w-full max-w-3xl mx-auto aspect-video rounded-xl border border-background-border bg-background-secondary flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 rounded-full border border-background-border-mid bg-background-tertiary flex items-center justify-center">
        <Play size={20} strokeWidth={1.5} className="text-text-tertiary ml-0.5" />
      </div>
      <p className="font-sans text-sm text-text-tertiary">Watch demo coming soon</p>
    </div>
  )
}
```

- [ ] **Step 2: Create cta-banner.tsx**

Create `components/lyra/marketing/cta-banner.tsx`:

```tsx
import VideoPlaceholder from './video-placeholder'

export default function CTABanner() {
  return (
    <section className="py-24 px-6 border-t border-background-border">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Text + CTA */}
        <div className="text-center space-y-6">
          <h2 className="font-display text-4xl text-text-primary">
            Ready to get your time back?
          </h2>
          <p className="font-sans text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
            Join agencies and freelancers who let LYRA handle the social media — while they
            focus on the work that matters.
          </p>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            Start free trial →
          </a>
        </div>

        {/* Video placeholder */}
        <VideoPlaceholder />
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/lyra/marketing/video-placeholder.tsx components/lyra/marketing/cta-banner.tsx
git commit -m "feat: add VideoPlaceholder and CTABanner components"
```

---

## Task 10: MarketingFooter component

**Files:**
- Create: `components/lyra/marketing/marketing-footer.tsx`

Context: Three-column layout (logo / centre links / copyright). Stacked on mobile, row on desktop. Links to PDF legal docs and mailto contact. Server component.

- [ ] **Step 1: Create the file**

Create `components/lyra/marketing/marketing-footer.tsx`:

```tsx
import Link from 'next/link'

export default function MarketingFooter() {
  return (
    <footer className="border-t border-background-border py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 border border-accent-silver flex items-center justify-center">
            <span className="font-sans font-light text-text-primary text-xs leading-none select-none">
              L
            </span>
          </div>
          <span className="font-sans font-light text-accent-silver text-xs tracking-[0.25em] select-none">
            YRA
          </span>
        </Link>

        {/* Centre links */}
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <a
            href="/docs/legal/LYRA-Privacy-Policy.pdf"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
          >
            Privacy Policy
          </a>
          <a
            href="/docs/legal/LYRA-Terms-of-Service.pdf"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
          >
            Terms of Service
          </a>
          <a
            href="mailto:hello@lyraonline.ai"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
          >
            Contact
          </a>
        </div>

        {/* Copyright */}
        <p className="font-sans text-xs text-text-tertiary">
          © 2026 LYRA. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/lyra/marketing/marketing-footer.tsx
git commit -m "feat: add MarketingFooter component"
```

---

## Task 11: app/page.tsx — root marketing page

**Files:**
- Create: `app/page.tsx`

Context: Server component at the application root. Checks auth via `getCurrentUser()` — if the user is already logged in, redirects them to `/dashboard` so they don't see the marketing page. Otherwise renders all marketing sections. No spinner or skeleton needed — all sections are static (no data fetching).

- [ ] **Step 1: Create the file**

Create `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import MarketingNav from '@/components/lyra/marketing/marketing-nav'
import HeroSection from '@/components/lyra/marketing/hero-section'
import FeaturesSection from '@/components/lyra/marketing/features-section'
import PricingSection from '@/components/lyra/marketing/pricing-section'
import CTABanner from '@/components/lyra/marketing/cta-banner'
import MarketingFooter from '@/components/lyra/marketing/marketing-footer'

export const metadata = {
  title: 'LYRA — Social media that runs itself.',
  description:
    'Comments answered. Posts scheduled. Brand voice preserved — across every platform, 24 hours a day.',
}

export default async function MarketingPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background-primary">
      <MarketingNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
        <CTABanner />
      </main>
      <MarketingFooter />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run dev and verify marketing page**

```bash
npm run dev
```

Visit `http://localhost:3000/` in an incognito window (not logged in). Expected:
- Sticky nav with logo, Features/Pricing links, Log in, Start free trial
- Hero section with gradient glow, headline, CTAs
- 4-slide carousel auto-advancing every 4 seconds; clicking tabs switches slides
- Features section with 3 cards
- Pricing section with billing toggle; switching Annual updates prices
- CTA banner with video placeholder
- Footer with links

Visit `http://localhost:3000/` while logged in. Expected: immediate redirect to `/dashboard`.

Visit `http://localhost:3000/dashboard` while logged in. Expected: dashboard home page renders normally.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add marketing landing page at root route"
```

---

## Task 12: app/onboard/page.tsx — Stripe Checkout redirect

**Files:**
- Create: `app/onboard/page.tsx`

Context: Server component. Reads `?plan` and `?billing` query params. If not authenticated, redirects to `/auth/login?returnTo=…` so Auth0 can bring the user back here after login. Creates the user's Agency record if they don't have one yet (new signup). Creates a Stripe Checkout session with `trial_period_days: 14` and `metadata: { agencyId, plan, userId }`. Redirects to the Stripe-hosted checkout URL. Does NOT conflict with `app/onboard/[token]/page.tsx` — that serves `/onboard/some-token`; this serves `/onboard` with no extra path segment.

- [ ] **Step 1: Create the file**

Create `app/onboard/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, PLANS, type PlanKey } from '@/lib/stripe'

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string }>
}) {
  const { plan: planParam, billing: billingParam } = await searchParams

  const user = await getCurrentUser()
  if (!user) {
    const returnTo = encodeURIComponent(
      `/onboard?plan=${planParam ?? 'pro'}&billing=${billingParam ?? 'monthly'}`
    )
    redirect(`/auth/login?returnTo=${returnTo}`)
  }

  const planKey = ((planParam ?? 'pro').toUpperCase()) as PlanKey
  const billing: 'monthly' | 'annual' = billingParam === 'annual' ? 'annual' : 'monthly'

  if (!PLANS[planKey]) redirect('/?error=invalid-plan')

  const planConfig = PLANS[planKey]
  const priceId = billing === 'annual' ? planConfig.annualPriceId : planConfig.priceId

  // Get or create Agency for this user
  let agency = user.agency
  if (!agency) {
    agency = await prisma.agency.create({
      data: {
        name:    user.name ?? 'My Agency',
        plan:    planKey,
        members: { connect: { id: user.id } },
      },
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    customer:             agency.stripeCustomerId ?? undefined,
    line_items:           [{ price: priceId, quantity: 1 }],
    subscription_data:    { trial_period_days: 14 },
    success_url:          `${process.env.APP_BASE_URL}/onboard/success`,
    cancel_url:           `${process.env.APP_BASE_URL}/?cancelled=1`,
    metadata:             { agencyId: agency.id, plan: planKey, userId: user.id },
  })

  redirect(session.url!)
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Note: TypeScript may warn about `session.url` possibly being null — the `!` assertion is correct here because Stripe always returns a URL for a valid Checkout session.

- [ ] **Step 3: Commit**

```bash
git add app/onboard/page.tsx
git commit -m "feat: add onboard page — creates Stripe Checkout with 14-day trial"
```

---

## Task 13: app/onboard/success/page.tsx — post-payment landing

**Files:**
- Create: `app/onboard/success/page.tsx`

Context: Stripe redirects here after `checkout.session.completed`. The webhook fires asynchronously to create the Workspace — by the time the user clicks "Enter LYRA", the workspace will exist. Static page, no data fetching. At `/onboard/success`, Next.js picks this static route over the dynamic `[token]` route, which is correct.

- [ ] **Step 1: Create the file**

Create `app/onboard/success/page.tsx`:

```tsx
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

export default function OnboardSuccessPage() {
  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <CheckCircle size={48} strokeWidth={1.5} className="text-status-success" />
        </div>

        {/* Heading + body */}
        <div className="space-y-3">
          <h1 className="font-display text-4xl text-text-primary">You&apos;re in.</h1>
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Your 14-day trial has started. LYRA is setting up your first workspace. Connect
            social accounts and build your brand profile to get started.
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
        >
          Enter LYRA
        </Link>

        {/* Footnote */}
        <p className="font-sans text-xs text-text-tertiary">
          No charge until your trial ends. Cancel any time.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: zero TypeScript errors, clean build with no warnings about missing pages or invalid imports.

- [ ] **Step 3: Smoke test the golden path**

1. Open an incognito window and visit `http://localhost:3000/`
2. Click "Start free trial" on the Pro card (monthly)
3. You should be redirected to `/auth/login?returnTo=/onboard?plan=pro&billing=monthly`
4. Complete login/signup
5. You should land at `/onboard?plan=pro&billing=monthly`, which creates a Stripe session and redirects to Stripe
6. In Stripe test mode: use card `4242 4242 4242 4242`, any future expiry, any CVC
7. After Stripe payment: redirected to `/onboard/success`
8. Webhook fires: Workspace + WorkspaceAccess created for the user
9. Click "Enter LYRA" → `/dashboard` with the new workspace visible

- [ ] **Step 4: Commit**

```bash
git add app/onboard/success/page.tsx
git commit -m "feat: add onboard success page after Stripe Checkout"
```

---

## Pre-Launch Checks

Before going live, complete the [Pre-Launch Checklist](../specs/2026-05-21-marketing-landing-page-design.md#pre-launch-checklist) in the spec:

- [ ] Confirm `STRIPE_STARTER_ANNUAL_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_AGENCY_ANNUAL_PRICE_ID` are set in Netlify env vars
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` is set in Netlify env vars
- [ ] Smoke test golden path end-to-end in production (incognito → pricing CTA → Stripe test card → `/onboard/success` → `/dashboard` with workspace)
- [ ] Verify authenticated redirect: visit `lyraonline.ai` while logged in → immediately lands on `/dashboard`
- [ ] Verify Enterprise "Contact us" opens mail client to `hello@lyraonline.ai`
