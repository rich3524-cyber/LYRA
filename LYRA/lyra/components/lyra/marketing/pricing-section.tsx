'use client'

import { useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { Check, Loader2 } from 'lucide-react'
import { PLANS } from '@/lib/stripe'

type Billing = 'monthly' | 'annual'

const ENTERPRISE_FEATURES = [
  'Everything in Agency',
  'Dedicated account manager',
  'Custom AI training',
  'SLA guarantee',
  'Priority onboarding',
]

export default function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const { user } = useUser()

  function handlePlanCta(planKey: 'STARTER' | 'PRO' | 'AGENCY') {
    const planParam = planKey.toLowerCase()
    const billingParam = billing
    setLoading(planKey)
    if (user) {
      window.location.href = `/onboard?plan=${planParam}&billing=${billingParam}`
    } else {
      window.location.href = `/auth/login?returnTo=${encodeURIComponent(`/onboard?plan=${planParam}&billing=${billingParam}`)}`
    }
  }

  const plans = [
    {
      key: 'STARTER' as const,
      name: PLANS.STARTER.name,
      price: billing === 'monthly' ? PLANS.STARTER.price : PLANS.STARTER.annualPrice,
      annualNote: billing === 'annual' ? 'billed as $490/yr' : null,
      highlight: false,
      workspaces: '1 workspace',
      features: [...PLANS.STARTER.features],
      ctaLabel: 'Start free trial',
    },
    {
      key: 'PRO' as const,
      name: PLANS.PRO.name,
      price: billing === 'monthly' ? PLANS.PRO.price : PLANS.PRO.annualPrice,
      annualNote: billing === 'annual' ? 'billed as $1,490/yr' : null,
      highlight: true,
      workspaces: '5 workspaces',
      features: [...PLANS.PRO.features],
      ctaLabel: 'Start free trial',
    },
    {
      key: 'AGENCY' as const,
      name: PLANS.AGENCY.name,
      price: billing === 'monthly' ? PLANS.AGENCY.price : PLANS.AGENCY.annualPrice,
      annualNote: billing === 'annual' ? 'billed as $3,990/yr' : null,
      highlight: false,
      workspaces: 'Unlimited workspaces',
      features: [...PLANS.AGENCY.features],
      ctaLabel: 'Start free trial',
    },
  ]

  return (
    <section id="pricing" className="py-24 bg-background-secondary px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section label */}
        <p className="font-sans text-xs text-text-tertiary uppercase tracking-[0.1em] text-center mb-3">
          Pricing
        </p>

        {/* Section heading */}
        <h2 className="font-display text-[36px] leading-[1.2] text-text-primary text-center mb-10">
          Simple, transparent pricing.
        </h2>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-1 mb-12">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background-tertiary border border-background-border">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-1.5 rounded-md font-sans text-sm transition-colors duration-150 ${
                billing === 'monthly'
                  ? 'bg-background-secondary text-text-primary border border-background-border'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-sans text-sm transition-colors duration-150 ${
                billing === 'annual'
                  ? 'bg-background-secondary text-text-primary border border-background-border'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Annual
              <span className="font-sans text-[10px] text-status-success">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Starter, Pro, Agency */}
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`relative rounded-xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-accent-silver bg-background-primary'
                  : 'border-background-border bg-background-primary'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="font-sans text-[10px] text-background-primary bg-accent-platinum px-3 py-1 rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-sans text-sm font-medium text-text-primary mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-3xl text-text-primary">${plan.price}</span>
                  <span className="font-sans text-xs text-text-tertiary">/mo</span>
                </div>
                {plan.annualNote && (
                  <p className="font-sans text-[10px] text-text-tertiary mt-1">{plan.annualNote}</p>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={14} strokeWidth={1.5} className="text-status-success mt-0.5 shrink-0" />
                    <span className="font-sans text-xs text-text-secondary">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePlanCta(plan.key)}
                disabled={loading === plan.key}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium transition-opacity duration-150 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === plan.key ? (
                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                ) : null}
                {plan.ctaLabel}
              </button>
            </div>
          ))}

          {/* Enterprise card */}
          <div className="rounded-xl border border-background-border bg-background-primary p-6 flex flex-col">
            <div className="mb-4">
              <h3 className="font-sans text-sm font-medium text-text-primary mb-1">Enterprise</h3>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-3xl text-text-primary">Custom</span>
              </div>
              <p className="font-sans text-[10px] text-text-tertiary mt-1">Custom workspaces</p>
            </div>

            <ul className="space-y-2 mb-6 flex-1">
              {ENTERPRISE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check size={14} strokeWidth={1.5} className="text-status-success mt-0.5 shrink-0" />
                  <span className="font-sans text-xs text-text-secondary">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href="mailto:hello@lyraonline.ai"
              className="w-full flex items-center justify-center py-2.5 rounded-lg border border-background-border text-text-secondary font-sans text-sm transition-colors duration-150 hover:border-background-border-mid hover:text-text-primary"
            >
              Contact us
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
