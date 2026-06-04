import Stripe from 'stripe'

let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
  }
  return _stripe
}
export const stripe = new Proxy({} as Stripe, {
  get: (_, prop) => getStripe()[prop as keyof Stripe],
})

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
