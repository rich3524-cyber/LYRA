'use client'

import Link from 'next/link'
import { Lock, Check } from 'lucide-react'

const PRO_FEATURES = [
  'Quarterly performance reports',
  '3-month AI content strategy',
  'Key dates for your region',
  'Co-branded PDF export',
  'Up to 5 workspaces',
]

const AGENCY_FEATURES = [
  'Quarterly performance reports',
  '3-month AI content strategy',
  'Key dates for your region',
  'Co-branded PDF export',
  'Unlimited workspaces',
  'Full AI autonomy',
]

function PlanCard({
  name,
  price,
  features,
}: {
  name: string
  price: string
  features: string[]
}) {
  return (
    <div className="bg-background-secondary border border-background-border rounded-xl p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text-primary font-sans">{name}</span>
        <span className="text-xs font-mono text-text-secondary">{price}</span>
      </div>
      <ul className="mt-4 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check size={12} strokeWidth={1.5} className="text-status-success mt-0.5 shrink-0" />
            <span className="text-xs font-sans text-text-secondary">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AssistantUpsell() {
  return (
    <div className="max-w-2xl mx-auto px-8 py-16">
      <Lock size={24} strokeWidth={1.5} className="text-text-tertiary" />

      <h1 className="font-display text-[32px] leading-tight text-text-primary mt-6">
        LYRA Assistant
      </h1>

      <p className="text-sm font-sans text-text-secondary leading-relaxed mt-3 max-w-xl">
        LYRA Assistant generates a quarterly performance review and a 3-month content strategy —
        automatically, based on your actual data. Export as a co-branded PDF to share with clients.
      </p>

      <div
        className="grid grid-cols-2 gap-3 mt-6 mb-8 opacity-30 blur-[2px] pointer-events-none"
        aria-hidden="true"
      >
        {['Total posts', 'Avg engagement', 'Best platform', 'Top theme'].map((label) => (
          <div
            key={label}
            className="bg-background-secondary border border-background-border rounded-xl p-4"
          >
            <div className="text-xs text-text-tertiary font-sans mb-1">{label}</div>
            <div className="h-6 bg-background-tertiary rounded-md w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PlanCard name="Pro" price="from $49/mo" features={PRO_FEATURES} />
        <PlanCard name="Agency" price="from $149/mo" features={AGENCY_FEATURES} />
      </div>

      <Link
        href="/account/billing"
        className="mt-6 flex w-full min-h-[44px] items-center justify-center bg-accent-platinum text-background-primary text-sm font-medium rounded-lg hover:bg-accent-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary"
      >
        Upgrade to Pro
      </Link>
    </div>
  )
}
