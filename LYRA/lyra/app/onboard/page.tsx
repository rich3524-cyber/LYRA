export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { stripe, PLANS } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

type PlanParam = 'starter' | 'pro' | 'agency'

const PLAN_MAP: Record<PlanParam, keyof typeof PLANS> = {
  starter: 'STARTER',
  pro:     'PRO',
  agency:  'AGENCY',
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string }>
}) {
  const user = await requireAuth()
  const { plan: planParam, billing: billingParam } = await searchParams

  const normalisedPlan = planParam?.toLowerCase()
  // Object.hasOwn, not a plain PLAN_MAP[normalisedPlan] lookup -- PLAN_MAP is a
  // plain object literal, so a plan value like "constructor" would resolve
  // through the prototype chain to a truthy value and bypass the fallback.
  const planKey =
    normalisedPlan && Object.hasOwn(PLAN_MAP, normalisedPlan)
      ? PLAN_MAP[normalisedPlan as PlanParam]
      : 'PRO'
  const billing = billingParam === 'annual' ? 'annual' : 'monthly'
  const plan = PLANS[planKey]
  const priceId = billing === 'annual' ? plan.annualPriceId : plan.priceId
  // Metadata must carry the RESOLVED plan key, never the raw query param --
  // otherwise an unrecognized ?plan= value charges this price but leaves the
  // Stripe webhook unable to resolve a plan from metadata, silently leaving
  // the new Agency on its schema default instead of the plan actually charged.
  const planMeta = planKey.toLowerCase()

  // Find the user's existing agency, or create one and link this user to it.
  let agency = user.agency
  if (!agency) {
    agency = await prisma.agency.create({
      data: {
        name:    `${user.name ?? user.email}'s Agency`,
        members: { connect: { id: user.id } },
      },
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lyraonline.ai'

  const session = await stripe.checkout.sessions.create({
    mode:       'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 30,
      metadata: { agencyId: agency.id, plan: planMeta, userId: user.id },
    },
    success_url: `${baseUrl}/onboard/success`,
    cancel_url:  `${baseUrl}/?cancelled=1`,
    ...(agency.stripeCustomerId ? { customer: agency.stripeCustomerId } : {}),
    metadata: {
      agencyId: agency.id,
      plan:     planMeta,
      userId:   user.id,
    },
  })

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL')
  }

  redirect(session.url)
}
