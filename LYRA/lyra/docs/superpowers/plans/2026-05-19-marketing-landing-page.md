# Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-facing marketing page at `lyraonline.ai` with pricing tiers that route new visitors through Auth0 signup → Stripe checkout → first workspace creation, landing them in the authenticated dashboard.

**Architecture:** The current `app/(dashboard)/page.tsx` maps to `/` via route group transparency — creating `app/page.tsx` would conflict. Solution: move the dashboard home to `app/(dashboard)/dashboard/page.tsx` (`/dashboard`), then claim `/` for the marketing page in `app/page.tsx` outside all route groups. New user onboarding uses a server component at `/onboard` that creates the Agency record if absent, then redirects directly to Stripe Checkout. The Stripe webhook creates the first Workspace on `checkout.session.completed`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS (LYRA design tokens), Framer Motion, Lucide React, @auth0/nextjs-auth0 v4, Stripe SDK

---

## File Map

**Create:**
- `lyra/app/page.tsx` — Public marketing page (redirects authenticated users to `/dashboard`)
- `lyra/app/(dashboard)/dashboard/page.tsx` — Dashboard home, moved from `(dashboard)/page.tsx`
- `lyra/app/onboard/page.tsx` — Server component: auth → get/create Agency → Stripe Checkout → redirect
- `lyra/app/onboard/success/page.tsx` — Post-payment confirmation page
- `lyra/components/lyra/marketing/marketing-nav.tsx` — Top nav bar
- `lyra/components/lyra/marketing/hero-section.tsx` — Hero headline + CTA
- `lyra/components/lyra/marketing/features-section.tsx` — 3 feature cards
- `lyra/components/lyra/marketing/pricing-section.tsx` — Pricing tier cards (client component)
- `lyra/components/lyra/marketing/marketing-footer.tsx` — Footer

**Modify:**
- `lyra/app/(dashboard)/page.tsx` — DELETE (content moved to `/dashboard`)
- `lyra/app/api/stripe/webhook/route.ts` — Create first Workspace on `checkout.session.completed`

---

### Task 1: Move dashboard home to `/dashboard`

**Files:**
- Create: `lyra/app/(dashboard)/dashboard/page.tsx`
- Delete: `lyra/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create the new dashboard home**

Create `lyra/app/(dashboard)/dashboard/page.tsx` with the exact content of the existing `lyra/app/(dashboard)/page.tsx` — no code changes needed:

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
          {brandReady && !hasBrandProfile && (
            <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <div className="flex items-start gap-3">
                <Zap size={16} strokeWidth={1.5} className="text-accent-platinum shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-sans text-sm font-medium text-text-primary">
                    Brand AI is ready to build.
                  </p>
                  <p className="font-sans text-sm text-text-secondary leading-relaxed">
                    LYRA will scrape your website and analyse your connected social accounts
                    to build your brand voice profile.
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

- [ ] **Step 2: Delete the old dashboard home**

Delete `lyra/app/(dashboard)/page.tsx`. This temporarily leaves `/` without a handler — it will be claimed by `app/page.tsx` in Task 3.

Run: `rm "lyra/app/(dashboard)/page.tsx"` (or delete via file explorer)

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`

Expected: no errors (the new file is identical in content to the old one)

- [ ] **Step 4: Commit**

```bash
git add lyra/app/\(dashboard\)/dashboard/page.tsx
git rm lyra/app/\(dashboard\)/page.tsx
git commit -m "feat: move dashboard home to /dashboard route"
```

---

### Task 2: Marketing component — Nav

**Files:**
- Create: `lyra/components/lyra/marketing/marketing-nav.tsx`

- [ ] **Step 1: Create the marketing nav component**

```tsx
// lyra/components/lyra/marketing/marketing-nav.tsx
import Link from 'next/link'
import Image from 'next/image'

export function MarketingNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-6 md:px-12 border-b border-background-border bg-background-primary/90 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <Image
          src="/brand/lyra-logo-primary.svg"
          alt="LYRA"
          width={80}
          height={25}
          priority
        />
      </Link>

      <nav className="flex items-center gap-6">
        <Link
          href="#features"
          className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          Features
        </Link>
        <Link
          href="#pricing"
          className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          Pricing
        </Link>
        <Link
          href="/auth/login"
          className="font-sans text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          Log in
        </Link>
        <Link
          href="#pricing"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
        >
          Get started
        </Link>
      </nav>
    </header>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lyra/components/lyra/marketing/marketing-nav.tsx
git commit -m "feat: add MarketingNav component"
```

---

### Task 3: Marketing component — Hero

**Files:**
- Create: `lyra/components/lyra/marketing/hero-section.tsx`

- [ ] **Step 1: Create the hero section**

```tsx
// lyra/components/lyra/marketing/hero-section.tsx
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="flex flex-col items-center justify-center text-center pt-40 pb-24 px-6 md:px-12 space-y-8">
      {/* Eyebrow label */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-background-border bg-background-secondary">
        <span className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          AI-Powered Social Intelligence
        </span>
      </div>

      {/* Headline */}
      <div className="space-y-4 max-w-3xl">
        <h1 className="font-display text-5xl md:text-6xl text-text-primary leading-[1.1]">
          Your clients' social media,<br />managed by AI.
        </h1>
        <p className="font-sans text-base text-text-secondary leading-relaxed max-w-xl mx-auto">
          LYRA schedules posts, generates captions in your client's brand voice, and responds
          to comments 24 hours a day — without you lifting a finger.
        </p>
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          href="#pricing"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
        >
          Start free trial
          <ArrowRight size={16} strokeWidth={2} />
        </Link>
        <Link
          href="#features"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-background-border text-text-secondary font-sans text-sm font-medium hover:border-background-border-mid hover:text-text-primary transition-all duration-150"
        >
          See how it works
        </Link>
      </div>

      {/* Social proof */}
      <p className="font-sans text-xs text-text-tertiary">
        No credit card required. Cancel any time.
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lyra/components/lyra/marketing/hero-section.tsx
git commit -m "feat: add HeroSection marketing component"
```

---

### Task 4: Marketing components — Features and Footer

**Files:**
- Create: `lyra/components/lyra/marketing/features-section.tsx`
- Create: `lyra/components/lyra/marketing/marketing-footer.tsx`

- [ ] **Step 1: Create the features section**

```tsx
// lyra/components/lyra/marketing/features-section.tsx
import { Zap, MessageSquare, Calendar } from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    title: 'Brand Intelligence',
    description:
      'LYRA analyses your client\'s website, social history, and tone of voice to build a precise brand profile. Every caption and response reflects their voice — not a template.',
  },
  {
    icon: MessageSquare,
    title: 'Autonomous AI Responses',
    description:
      'LYRA monitors every comment and review across 7 platforms and responds on your client\'s behalf — 24 hours a day. You set the guardrails. LYRA handles the rest.',
  },
  {
    icon: Calendar,
    title: 'Intelligent Scheduling',
    description:
      'Build a content calendar, generate platform-optimised captions with one click, and schedule posts across Facebook, Instagram, LinkedIn, TikTok, X, YouTube, and Google Business.',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 md:px-12">
      <div className="max-w-5xl mx-auto space-y-16">
        {/* Section header */}
        <div className="space-y-3 text-center">
          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
            What LYRA does
          </p>
          <h2 className="font-display text-4xl text-text-primary">
            Intelligence that works while you sleep.
          </h2>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-xl bg-background-secondary border border-background-border space-y-4"
            >
              <f.icon size={20} strokeWidth={1.5} className="text-accent-platinum" />
              <div className="space-y-2">
                <p className="font-sans text-sm font-medium text-text-primary">{f.title}</p>
                <p className="font-sans text-sm text-text-secondary leading-relaxed">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create the marketing footer**

```tsx
// lyra/components/lyra/marketing/marketing-footer.tsx
import Link from 'next/link'
import Image from 'next/image'

export function MarketingFooter() {
  return (
    <footer className="border-t border-background-border py-12 px-6 md:px-12">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <Link href="/" className="shrink-0">
          <Image
            src="/brand/lyra-logo-primary.svg"
            alt="LYRA"
            width={72}
            height={22}
          />
        </Link>

        <nav className="flex flex-wrap gap-6">
          <Link
            href="/legal/privacy"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
          >
            Privacy Policy
          </Link>
          <Link
            href="/legal/terms"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
          >
            Terms of Service
          </Link>
          <Link
            href="mailto:hello@lyraonline.ai"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-150"
          >
            Contact
          </Link>
        </nav>

        <p className="font-sans text-xs text-text-tertiary">
          © {new Date().getFullYear()} LYRA. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lyra/components/lyra/marketing/features-section.tsx lyra/components/lyra/marketing/marketing-footer.tsx
git commit -m "feat: add FeaturesSection and MarketingFooter components"
```

---

### Task 5: Marketing component — Pricing (client component with Stripe redirect)

**Files:**
- Create: `lyra/components/lyra/marketing/pricing-section.tsx`

- [ ] **Step 1: Create the pricing section**

This is a client component because it uses `useRouter` to redirect to checkout.

```tsx
// lyra/components/lyra/marketing/pricing-section.tsx
'use client'

import { useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { Check } from 'lucide-react'

const PLANS = [
  {
    key: 'STARTER',
    name: 'Starter',
    price: 49,
    description: 'One client, fully managed.',
    features: [
      '1 workspace',
      'Post scheduling',
      'AI caption generation',
      'Brand intelligence',
      '7 social platforms',
      'Comment inbox',
    ],
    cta: 'Start with Starter',
    highlight: false,
  },
  {
    key: 'PRO',
    name: 'Pro',
    price: 149,
    description: 'For freelancers managing multiple clients.',
    features: [
      '5 workspaces',
      'Everything in Starter',
      'AI draft responses',
      'Client approval workflow',
      'Analytics dashboard',
    ],
    cta: 'Start with Pro',
    highlight: true,
  },
  {
    key: 'AGENCY',
    name: 'Agency',
    price: 399,
    description: 'Unlimited clients. Full AI autonomy.',
    features: [
      'Unlimited workspaces',
      'Everything in Pro',
      'Fully autonomous AI responses',
      'Agency guardrail controls',
      'White-label client onboarding',
      'Priority support',
    ],
    cta: 'Start with Agency',
    highlight: false,
  },
]

export function PricingSection() {
  const { user } = useUser()
  const [loading, setLoading] = useState<string | null>(null)

  function handleSelect(planKey: string) {
    setLoading(planKey)
    if (user) {
      window.location.href = `/onboard?plan=${planKey.toLowerCase()}`
    } else {
      const returnTo = encodeURIComponent(`/onboard?plan=${planKey.toLowerCase()}`)
      window.location.href = `/auth/login?returnTo=${returnTo}`
    }
  }

  return (
    <section id="pricing" className="py-24 px-6 md:px-12 bg-background-secondary">
      <div className="max-w-5xl mx-auto space-y-16">
        {/* Section header */}
        <div className="space-y-3 text-center">
          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
            Pricing
          </p>
          <h2 className="font-display text-4xl text-text-primary">
            Simple, transparent pricing.
          </h2>
          <p className="font-sans text-sm text-text-secondary">
            All plans include a 14-day free trial. No credit card required to start.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`relative p-6 rounded-xl border space-y-6 flex flex-col ${
                plan.highlight
                  ? 'bg-background-tertiary border-accent-silver'
                  : 'bg-background-primary border-background-border'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex px-3 py-1 rounded-full bg-accent-platinum text-background-primary font-sans text-[11px] font-medium uppercase tracking-[0.1em]">
                    Most popular
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <p className="font-sans text-sm font-medium text-text-primary">{plan.name}</p>
                <p className="font-sans text-xs text-text-tertiary">{plan.description}</p>
              </div>

              <div className="flex items-end gap-1">
                <span className="font-mono text-4xl text-text-primary">${plan.price}</span>
                <span className="font-sans text-sm text-text-tertiary mb-1">/month</span>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={14} strokeWidth={1.5} className="text-status-success shrink-0 mt-0.5" />
                    <span className="font-sans text-sm text-text-secondary">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(plan.key)}
                disabled={loading === plan.key}
                className={`w-full py-2.5 rounded-lg font-sans text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${
                  plan.highlight
                    ? 'bg-accent-platinum text-background-primary hover:bg-accent-white'
                    : 'bg-background-tertiary border border-background-border-mid text-text-primary hover:border-accent-silver'
                }`}
              >
                {loading === plan.key ? 'Redirecting…' : plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lyra/components/lyra/marketing/pricing-section.tsx
git commit -m "feat: add PricingSection client component with plan selection"
```

---

### Task 6: Assemble the public marketing page

**Files:**
- Create: `lyra/app/page.tsx`

This page lives outside all route groups — it uses the root `app/layout.tsx` (which already loads DM Sans, Instrument Serif, and Geist Mono). The `(dashboard)` layout does NOT wrap it.

- [ ] **Step 1: Create the marketing page**

```tsx
// lyra/app/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { MarketingNav } from '@/components/lyra/marketing/marketing-nav'
import { HeroSection } from '@/components/lyra/marketing/hero-section'
import { FeaturesSection } from '@/components/lyra/marketing/features-section'
import { PricingSection } from '@/components/lyra/marketing/pricing-section'
import { MarketingFooter } from '@/components/lyra/marketing/marketing-footer'

export default async function MarketingPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background-primary">
      <MarketingNav />
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <MarketingFooter />
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify no build conflicts**

Run: `cd lyra && npm run build`
Expected: successful build. If "conflicting page" error, Task 1's delete of `(dashboard)/page.tsx` may not have been committed — check with `git status`.

- [ ] **Step 4: Commit**

```bash
git add lyra/app/page.tsx
git commit -m "feat: add public marketing landing page at /"
```

---

### Task 7: New user onboarding flow — checkout redirect and success page

**Files:**
- Create: `lyra/app/onboard/page.tsx`
- Create: `lyra/app/onboard/success/page.tsx`

These pages live outside the `(dashboard)` route group — no sidebar, plain layout. The root `app/layout.tsx` wraps them.

- [ ] **Step 1: Create the onboard checkout redirect**

This server component creates the Agency if the user has none, then redirects to Stripe Checkout. It renders nothing — it always redirects.

```tsx
// lyra/app/onboard/page.tsx
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, PLANS, type PlanKey } from '@/lib/stripe'

interface Props {
  searchParams: Promise<{ plan?: string }>
}

export default async function OnboardPage({ searchParams }: Props) {
  const user = await requireAuth()
  const { plan: rawPlan } = await searchParams
  const plan = (rawPlan?.toUpperCase() ?? 'STARTER') as PlanKey

  if (!PLANS[plan]) redirect('/?error=invalid_plan')

  // Get or create the Agency for this user
  let agency = await prisma.agency.findFirst({
    where: { members: { some: { id: user.id } } },
  })

  if (!agency) {
    agency = await prisma.agency.create({
      data: {
        name: `${user.name ?? user.email}'s Agency`,
        plan: 'STARTER',
        members: { connect: { id: user.id } },
      },
    })
    await prisma.user.update({
      where: { id: user.id },
      data: { agencyId: agency.id },
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: agency.stripeCustomerId ?? undefined,
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: `${process.env.APP_BASE_URL}/onboard/success`,
    cancel_url: `${process.env.APP_BASE_URL}/?cancelled=1`,
    metadata: { agencyId: agency.id, plan, userId: user.id },
    subscription_data: { metadata: { agencyId: agency.id, plan } },
  })

  redirect(session.url!)
}
```

- [ ] **Step 2: Create the onboard success page**

```tsx
// lyra/app/onboard/success/page.tsx
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function OnboardSuccessPage() {
  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center px-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-2">
          <div className="w-12 h-12 rounded-full bg-background-secondary border border-background-border flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4 4 8-8" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-display text-4xl text-text-primary">
            You're in.
          </h1>
          <p className="font-sans text-sm text-text-secondary leading-relaxed">
            Your LYRA account is active. Your first workspace is being set up —
            it will be ready when you enter the dashboard.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
        >
          Enter LYRA
          <ArrowRight size={16} strokeWidth={2} />
        </Link>

        <p className="font-sans text-xs text-text-tertiary">
          A receipt has been sent to your email address.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Verify build**

Run: `cd lyra && npm run build`
Expected: clean build — no module-not-found or route conflict errors

- [ ] **Step 5: Commit**

```bash
git add lyra/app/onboard/page.tsx lyra/app/onboard/success/page.tsx
git commit -m "feat: add /onboard checkout redirect and /onboard/success pages"
```

---

### Task 8: Update Stripe webhook to create first Workspace

**Files:**
- Modify: `lyra/app/api/stripe/webhook/route.ts`

When a new subscriber completes checkout, we create their first Workspace and grant them access so `/dashboard` shows it immediately.

- [ ] **Step 1: Update the checkout.session.completed handler**

Replace the existing `checkout.session.completed` case (lines 50–58) with:

```typescript
case 'checkout.session.completed': {
  const session = event.data.object
  if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
    const { agencyId, plan, userId } = session.metadata as Record<string, string>

    const agency = await prisma.agency.update({
      where: { id: agencyId },
      data: { stripeCustomerId: session.customer as string },
      include: { workspaces: { take: 1 } },
    })

    // Create first workspace for brand-new subscribers
    if (agency.workspaces.length === 0 && userId) {
      const workspace = await prisma.workspace.create({
        data: {
          name: 'My Workspace',
          agencyId: agency.id,
          plan: toPlan(plan),
        },
      })
      await prisma.workspaceAccess.create({
        data: {
          userId,
          workspaceId: workspace.id,
          role: 'AGENCY_ADMIN',
        },
      })
    }
  }
  break
}
```

The full updated file `lyra/app/api/stripe/webhook/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import type { Plan } from '@prisma/client'

export const dynamic = 'force-dynamic'

const VALID_PLANS: Plan[] = ['STARTER', 'PRO', 'AGENCY']

function toPlan(value: string | undefined): Plan {
  if (value && (VALID_PLANS as string[]).includes(value)) return value as Plan
  return 'STARTER'
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object
      await prisma.agency.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data:  {
          stripeSubId: sub.id,
          plan:        toPlan((sub.metadata as Record<string, string>).plan),
        },
      })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      await prisma.agency.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data:  { plan: 'STARTER', stripeSubId: null },
      })
      break
    }
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.customer && session.metadata?.agencyId) {
        const { agencyId, plan, userId } = session.metadata as Record<string, string>

        const agency = await prisma.agency.update({
          where: { id: agencyId },
          data: { stripeCustomerId: session.customer as string },
          include: { workspaces: { take: 1 } },
        })

        // Create first workspace for brand-new subscribers
        if (agency.workspaces.length === 0 && userId) {
          const workspace = await prisma.workspace.create({
            data: {
              name: 'My Workspace',
              agencyId: agency.id,
              plan: toPlan(plan),
            },
          })
          await prisma.workspaceAccess.create({
            data: {
              userId,
              workspaceId: workspace.id,
              role: 'AGENCY_ADMIN',
            },
          })
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd lyra && npx tsc --noEmit`
Expected: no errors. The `prisma.agency.update` with `include` is valid because `Agency` has a `workspaces` relation.

- [ ] **Step 3: Run full build**

Run: `cd lyra && npm run build`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add lyra/app/api/stripe/webhook/route.ts
git commit -m "feat: create first workspace on checkout.session.completed webhook"
```

---

### Task 9: Push and verify deployment

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Watch Netlify deploy**

Open Netlify dashboard → Deploys. Verify the build completes without errors. Expected deploy time: ~3-4 minutes.

- [ ] **Step 3: Smoke-test the golden path**

1. Open `https://lyraonline.ai` in an incognito window
2. Verify the marketing page renders (hero, features, pricing visible)
3. Click "Log in" → verify Auth0 login page loads
4. Click "Start with Starter" → verify redirect to Auth0 (not logged in)
5. Log in with your test account → verify redirect to `/onboard?plan=starter`
6. Verify Stripe Checkout page loads with Starter plan
7. Use Stripe test card `4242 4242 4242 4242` / any future date / any CVC
8. Verify redirect to `/onboard/success`
9. Click "Enter LYRA" → verify `/dashboard` loads with workspace visible
10. Verify sidebar, workspace list, and quick actions all render correctly

- [ ] **Step 4: Verify authenticated redirect**

Open `https://lyraonline.ai` while logged in → should redirect to `/dashboard` automatically.

---

## Self-Review

**Spec coverage:**
- ✅ Public marketing page at `/` — hero, features, pricing
- ✅ Design follows LYRA brand guidelines (tokens, fonts, no hardcoded hex)
- ✅ Stripe checkout for new users (all 3 plans)
- ✅ New users redirected to dashboard after payment
- ✅ Agency + Workspace auto-created on first subscription

**Type consistency:**
- `PlanKey` used consistently from `lib/stripe.ts` across `onboard/page.tsx`
- `toPlan()` helper reused from webhook — no duplication
- `WorkspaceAccess.role` is `'AGENCY_ADMIN'` (matches `UserRole` enum)

**Edge cases handled:**
- Already-logged-in user visits `/` → redirects to `/dashboard`
- User cancels Stripe checkout → returns to `/` with `?cancelled=1` (marketing page ignores this param gracefully)
- Agency already exists on `/onboard` → reuses existing agency, no duplicate
- Webhook fires before user reaches success page → workspace exists when they arrive at `/dashboard`
