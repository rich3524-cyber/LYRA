# Billing Subscription Lifecycle Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two real billing bugs per `docs/superpowers/specs/2026-08-24-billing-subscription-lifecycle-design.md`: account deletion never cancels the deleted user's Agency subscription, and plan upgrades create a second concurrent subscription instead of modifying the existing one.

**Architecture:** Two independent route-handler fixes plus one small UI change, each following TDD against this codebase's existing Vitest conventions. No new files except one new test file for the previously-untested `app/api/account/route.ts`.

**Tech Stack:** Next.js Route Handlers, Prisma, Stripe SDK (apiVersion `2026-07-29.dahlia`), Vitest, React (client component, untested per this codebase's convention — see Task 4).

---

## Task 1: Create the branch

**Files:** none (git operation only)

- [ ] **Step 1: Create and switch to the branch**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
git checkout main
git pull origin main
git checkout -b fix/billing-lifecycle-implementation
```

Expected: branch created from up-to-date `main` (should include PRs #52, #53, #54).

---

## Task 2: Account deletion cancels the Stripe subscription

**Files:**
- Create: `app/api/account/route.test.ts`
- Modify: `app/api/account/route.ts`

### Current state (for reference — read the actual file before editing, this may have shifted)

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const OWNER_ROLES: readonly string[] = ['AGENCY_ADMIN', 'SMB_OWNER']

export async function DELETE() {
  try {
    const user = await requireAuth()

    const ownedWorkspaceIds = user.workspaceAccess
      .filter((wa) => OWNER_ROLES.includes(wa.role))
      .map((wa) => wa.workspaceId)

    await prisma.$transaction([
      prisma.commentResponse.deleteMany({ where: { comment: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.comment.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.postMetrics.deleteMany({ where: { post: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.postApproval.deleteMany({ where: { post: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.post.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.socialAccount.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.brandProfile.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.guardrail.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.onboardingToken.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.seoConnection.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.seoPage.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.searchConsoleData.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.workspace.deleteMany({ where: { id: { in: ownedWorkspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

`requireAuth()` (`lib/auth.ts:93-97`) returns the Prisma `User` with `agency: true` included — `user.agency` is the full `Agency` record (or `null`) with no extra query needed. `Agency.stripeSubId` (`prisma/schema.prisma:48`) is the field to check.

### Step 1: Write the failing tests

Create `app/api/account/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user:              { count: vi.fn(), delete: vi.fn() },
    commentResponse:   { deleteMany: vi.fn() },
    comment:           { deleteMany: vi.fn() },
    postMetrics:       { deleteMany: vi.fn() },
    postApproval:      { deleteMany: vi.fn() },
    post:              { deleteMany: vi.fn() },
    socialAccount:     { deleteMany: vi.fn() },
    brandProfile:      { deleteMany: vi.fn() },
    guardrail:         { deleteMany: vi.fn() },
    onboardingToken:   { deleteMany: vi.fn() },
    seoConnection:     { deleteMany: vi.fn() },
    seoPage:           { deleteMany: vi.fn() },
    searchConsoleData: { deleteMany: vi.fn() },
    workspaceAccess:   { deleteMany: vi.fn() },
    workspace:         { deleteMany: vi.fn() },
    $transaction:      vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    stripe: { subscriptions: { retrieve: vi.fn(), cancel: vi.fn() } },
  }
})

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { DELETE } from './route'

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    role: 'SMB_OWNER',
    workspaceAccess: [],
    agency: { id: 'agency-1', stripeSubId: 'sub_123' },
    ...overrides,
  }
}

describe('DELETE /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.user.count).mockResolvedValue(0)
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: 'active' } as any)
    vi.mocked(stripe.subscriptions.cancel).mockResolvedValue({} as any)
    for (const model of ['commentResponse', 'comment', 'postMetrics', 'postApproval', 'post', 'socialAccount', 'brandProfile', 'guardrail', 'onboardingToken', 'seoConnection', 'seoPage', 'searchConsoleData', 'workspaceAccess', 'workspace'] as const) {
      vi.mocked((prisma as any)[model].deleteMany).mockResolvedValue({ count: 0 })
    }
  })

  it('cancels the Stripe subscription when the deleting user is the last owner-role member of their agency', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { agencyId: 'agency-1', id: { not: 'user-1' }, role: { in: ['AGENCY_ADMIN', 'SMB_OWNER'] } },
    })
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123')
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123')
  })

  it('does not cancel when another owner-role member remains in the same agency', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(prisma.user.count).mockResolvedValue(1)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('does not call Stripe at all when the user has no agency', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({ agency: null }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(prisma.user.count).not.toHaveBeenCalled()
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('does not call Stripe at all when the agency has no stripeSubId', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser({ agency: { id: 'agency-1', stripeSubId: null } }) as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('does not error when the subscription is already canceled, and deletion still proceeds', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ status: 'canceled' } as any)
    const res = await DELETE()
    expect(res.status).toBe(204)
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
    expect(prisma.user.delete).toHaveBeenCalled()
  })

  it('aborts before the deletion transaction runs when Stripe returns a genuine error', async () => {
    vi.mocked(requireAuth).mockResolvedValue(baseUser() as any)
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(new Error('Stripe API error'))
    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(prisma.user.delete).not.toHaveBeenCalled()
    expect(prisma.workspace.deleteMany).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await DELETE()
    expect(res.status).toBe(401)
  })
})
```

### Step 2: Run the tests to verify they fail

```bash
npx vitest run app/api/account/route.test.ts
```

Expected: FAIL — `prisma.user.count` is never called, `stripe.subscriptions.retrieve`/`.cancel` are never called, because the current route has no subscription-cancellation logic at all.

### Step 3: Implement the fix

Modify `app/api/account/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

const OWNER_ROLES: readonly string[] = ['AGENCY_ADMIN', 'SMB_OWNER']

export async function DELETE() {
  try {
    const user = await requireAuth()

    // If this user is an owner-role member of an Agency with a live Stripe
    // subscription, and no other owner-role member remains to manage it,
    // cancel it before deleting anything -- otherwise the Agency row survives
    // (nothing else in the codebase deletes Agency rows) as an orphan with a
    // subscription that bills forever with no LYRA user left to stop it.
    if (user.agency && OWNER_ROLES.includes(user.role) && user.agency.stripeSubId) {
      const otherOwners = await prisma.user.count({
        where: { agencyId: user.agency.id, id: { not: user.id }, role: { in: OWNER_ROLES } },
      })
      if (otherOwners === 0) {
        const subscription = await stripe.subscriptions.retrieve(user.agency.stripeSubId)
        if (subscription.status !== 'canceled') {
          await stripe.subscriptions.cancel(user.agency.stripeSubId)
        }
      }
    }

    const ownedWorkspaceIds = user.workspaceAccess
      .filter((wa) => OWNER_ROLES.includes(wa.role))
      .map((wa) => wa.workspaceId)

    await prisma.$transaction([
      prisma.commentResponse.deleteMany({ where: { comment: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.comment.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.postMetrics.deleteMany({ where: { post: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.postApproval.deleteMany({ where: { post: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.post.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.socialAccount.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.brandProfile.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.guardrail.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.onboardingToken.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.seoConnection.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.seoPage.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.searchConsoleData.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.workspace.deleteMany({ where: { id: { in: ownedWorkspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Step 4: Run the tests to verify they pass

```bash
npx vitest run app/api/account/route.test.ts
```

Expected: all 7 tests PASS.

### Step 5: Commit

```bash
git add app/api/account/route.ts app/api/account/route.test.ts
git commit -m "fix: cancel Stripe subscription on account deletion when user is the last agency owner"
```

---

## Task 3: Plan upgrades modify the existing subscription instead of creating a second one

**Files:**
- Modify: `app/api/stripe/create-checkout/route.ts`
- Modify: `app/api/stripe/create-checkout/route.test.ts`

### Current state (for reference — read the actual files before editing)

`app/api/stripe/create-checkout/route.ts`'s `POST` handler (full current content already read during design — see the design doc's Fix 2 section for the behavioral summary). The relevant block to change is:

```typescript
    // Reuse existing Stripe customer or let Checkout create one
    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      customer:           agency.stripeCustomerId ?? undefined,
      line_items:         [{ price: PLANS[plan].priceId, quantity: 1 }],
      success_url:        `${process.env.APP_BASE_URL}/account/billing?success=1`,
      cancel_url:         `${process.env.APP_BASE_URL}/account/billing?cancelled=1`,
      metadata:           { agencyId: agency.id, plan, userId: user.id },
      subscription_data:  { metadata: { agencyId: agency.id, plan, userId: user.id } },
    })

    return NextResponse.json({ url: session.url })
```

The existing test file already mocks `prisma.agency.findFirst` to resolve `{ id: 'agency-1', stripeCustomerId: null }` in its default `beforeEach` — extend that default to also set `stripeSubId: null`, so the existing 8 tests continue exercising the "no existing subscription" path unchanged (this is the design doc's regression-coverage item (a), not a new test).

### Step 1: Write the failing tests

Modify `app/api/stripe/create-checkout/route.test.ts` — update the `vi.mock('@/lib/stripe', ...)` block to add the two new methods, update the default agency mock, and add 3 new test cases:

```typescript
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    stripe: {
      checkout: { sessions: { create: vi.fn() } },
      subscriptions: { retrieve: vi.fn(), update: vi.fn() },
    },
  }
})
```

Update the `beforeEach` default agency mock (currently `{ id: 'agency-1', stripeCustomerId: null }`) to:

```typescript
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: null, stripeSubId: null } as any)
```

Add these test cases inside the existing `describe('POST /api/stripe/create-checkout', ...)` block, after the existing `'creates a checkout session for a real plan key'` test:

```typescript
  it('modifies the existing subscription in place when the agency already has one, instead of creating a new checkout session', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ items: { data: [{ id: 'si_789' }] } } as any)
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    const res = await POST(req({ plan: 'AGENCY' }))

    expect(res.status).toBe(200)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_456')
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_456', expect.objectContaining({
      items: [{ id: 'si_789', price: expect.any(String) }],
      proration_behavior: 'create_prorations',
    }))
  })

  it('sets metadata.plan on the in-place subscription update to the requested plan, so the webhook syncs correctly', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ items: { data: [{ id: 'si_789' }] } } as any)
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    await POST(req({ plan: 'AGENCY' }))

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_456', expect.objectContaining({
      metadata: { agencyId: 'agency-1', plan: 'AGENCY', userId: 'user-1' },
    }))
  })

  it('returns a success response with no url when modifying an existing subscription in place', async () => {
    vi.mocked(prisma.agency.findFirst).mockResolvedValue({ id: 'agency-1', stripeCustomerId: 'cus_123', stripeSubId: 'sub_456' } as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ items: { data: [{ id: 'si_789' }] } } as any)
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({} as any)

    const res = await POST(req({ plan: 'AGENCY' }))
    const body = await res.json()

    expect(body.url).toBeUndefined()
    expect(body.success).toBe(true)
  })
```

### Step 2: Run the tests to verify the 3 new ones fail

```bash
npx vitest run app/api/stripe/create-checkout/route.test.ts
```

Expected: the 3 new tests FAIL (the route always calls `checkout.sessions.create` today, regardless of `stripeSubId`). The existing 8 tests should still PASS at this point since the default mock update (`stripeSubId: null`) doesn't change the current route's behavior yet.

### Step 3: Implement the fix

Modify `app/api/stripe/create-checkout/route.ts`, replacing the checkout-session block:

```typescript
    // Existing subscription -- modify it in place rather than creating a
    // second concurrent one. metadata.plan must be set here too: the webhook's
    // customer.subscription.updated handler (app/api/stripe/webhook/route.ts)
    // reads sub.metadata.plan to decide what to sync to agency.plan, not the
    // price ID -- omitting it would make the webhook silently revert this.
    if (agency.stripeSubId) {
      const subscription = await stripe.subscriptions.retrieve(agency.stripeSubId)
      const itemId = subscription.items.data[0].id
      await stripe.subscriptions.update(agency.stripeSubId, {
        items: [{ id: itemId, price: PLANS[plan].priceId }],
        proration_behavior: 'create_prorations',
        metadata: { agencyId: agency.id, plan, userId: user.id },
      })
      return NextResponse.json({ success: true })
    }

    // No existing subscription yet -- Checkout collects a payment method.
    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      customer:           agency.stripeCustomerId ?? undefined,
      line_items:         [{ price: PLANS[plan].priceId, quantity: 1 }],
      success_url:        `${process.env.APP_BASE_URL}/account/billing?success=1`,
      cancel_url:         `${process.env.APP_BASE_URL}/account/billing?cancelled=1`,
      metadata:           { agencyId: agency.id, plan, userId: user.id },
      subscription_data:  { metadata: { agencyId: agency.id, plan, userId: user.id } },
    })

    return NextResponse.json({ url: session.url })
```

### Step 4: Run the tests to verify they all pass

```bash
npx vitest run app/api/stripe/create-checkout/route.test.ts
```

Expected: all 11 tests PASS (8 existing + 3 new).

### Step 5: Commit

```bash
git add app/api/stripe/create-checkout/route.ts app/api/stripe/create-checkout/route.test.ts
git commit -m "fix: modify existing subscription in place on upgrade instead of creating a second one"
```

---

## Task 4: Billing UI handles the no-redirect success response

**Files:**
- Modify: `app/(dashboard)/account/billing/billing-client.tsx`

No test file exists for this component, and this codebase has exactly one `.test.tsx` file in `app/`/`components/` total — client components aren't unit-tested here as an established convention. This task is a direct code change with no new test, consistent with that convention (matching the "no test harness to extend" pattern already used for other UI-only tasks this session).

### Step 1: Update `handleUpgrade` to handle a no-redirect success response

Modify `app/(dashboard)/account/billing/billing-client.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, ExternalLink, Zap } from 'lucide-react'
import type { PLANS, PlanKey } from '@/lib/stripe'

type PlansType = typeof PLANS

interface Props {
  currentPlan:     string
  hasStripeAccount: boolean
  plans:           PlansType
}

export function BillingClient({ currentPlan, hasStripeAccount, plans }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  async function handleUpgrade(plan: PlanKey) {
    setLoading(plan)
    try {
      const res  = await fetch('/api/stripe/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      })
      const data = await res.json() as { url?: string; success?: boolean; error?: string }
      if (data.url) {
        window.location.assign(data.url)
      } else if (data.success) {
        toast.success('Plan updated')
        router.refresh()
      } else {
        toast.error(data.error ?? 'Could not start checkout')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(null)
    }
  }
```

Only the imports (`useRouter` added) and `handleUpgrade`'s body change — every other line in the file (the JSX, `handleManage`, `planOrder`, and the rest of the render tree) stays exactly as it is today. Do not restructure anything else in this file.

### Step 2: Typecheck

```bash
npx tsc --noEmit
```

Expected: no new errors.

### Step 3: Commit

```bash
git add "app/(dashboard)/account/billing/billing-client.tsx"
git commit -m "fix: handle no-redirect success response from in-place subscription upgrades"
```

---

## Task 5: Full verification, push, and open the PR

**Files:** none (verification and git operations only)

- [ ] **Step 1: Run the full test suite**

```bash
cd "/c/Users/Rich/OneDrive - Into The Wild Marketing/LYRA/lyra"
npx vitest run
```

Expected: all tests pass, including the 7 new account-route tests and the 3 new create-checkout tests (666 + 10 new = 676 or more, depending on what else has landed on `main` since the last full count this session — confirm no failures and no unexpected drop in count, not an exact number match).

- [ ] **Step 2: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
DATABASE_URL="postgresql://placeholder/lyra" \
DIRECT_URL="postgresql://placeholder/lyra" \
REDIS_URL="redis://localhost:6379" \
AUTH0_SECRET="placeholder-secret-32-chars-minimum" \
AUTH0_DOMAIN="placeholder.auth0.com" \
AUTH0_CLIENT_ID="placeholder" \
AUTH0_CLIENT_SECRET="placeholder" \
APP_BASE_URL="https://placeholder.lyraonline.ai" \
ANTHROPIC_API_KEY="sk-ant-placeholder" \
STRIPE_SECRET_KEY="sk_test_placeholder" \
STRIPE_WEBHOOK_SECRET="whsec_placeholder" \
STRIPE_STARTER_PRICE_ID="price_placeholder" \
STRIPE_PRO_PRICE_ID="price_placeholder" \
STRIPE_AGENCY_PRICE_ID="price_placeholder" \
S3_REGION="ap-southeast-2" \
S3_ACCESS_KEY_ID="placeholder" \
S3_SECRET_ACCESS_KEY="placeholder" \
AWS_S3_BUCKET="placeholder" \
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Note on end-to-end verification**

This plan's tests are unit-level only (mocked Stripe/Prisma), matching the existing `create-checkout/route.test.ts` convention — there is no integration test against real Stripe test-mode data in this codebase for either route, and adding one is out of scope for this plan per the design doc. If real end-to-end confidence is wanted before merging, that requires manually exercising a test-mode upgrade and a test-mode account deletion against Stripe's test dashboard — flag this to Richard as an optional manual check, not a blocking automated step.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin fix/billing-lifecycle-implementation
```

- [ ] **Step 6: Open the PR**

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr create --repo rich3524-cyber/LYRA --base main --head fix/billing-lifecycle-implementation \
  --title "fix: billing subscription lifecycle bugs (account deletion + plan upgrade)" \
  --body "Implements docs/superpowers/specs/2026-08-24-billing-subscription-lifecycle-design.md: account deletion now cancels the deleted user's Agency subscription when they're the last owner-role member (previously never touched Stripe at all, leaving an orphaned Agency row billing forever); plan upgrades now modify the existing Stripe subscription in place instead of creating a second concurrent one (previously double-charged on every upgrade). Triage script (PR #53) already confirmed zero customers are currently affected by either bug."
```

- [ ] **Step 7: Watch CI to green**

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" pr checks <PR-number> --repo rich3524-cyber/LYRA
```

Poll until `Lint & type-check`, `Test`, `Build`, and `Secret Scan` all show `pass`. Fix and push any failures before considering this done.

- [ ] **Step 8: Flag the optional manual verification to Richard**

Once CI is green, tell Richard the PR is ready to merge, and separately note Task 5 Step 4's optional manual Stripe test-mode check — his call on whether to do it before or after merging, since no live customers are currently affected either way.
