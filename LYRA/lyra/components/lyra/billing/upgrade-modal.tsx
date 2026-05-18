'use client'

import { useState } from 'react'
import { X, Check, Zap } from 'lucide-react'
import { PLANS, type PlanKey } from '@/lib/stripe'

const UPGRADE_MAP: Record<string, PlanKey> = {
  STARTER: 'PRO',
  PRO: 'AGENCY',
}

interface Props {
  open: boolean
  onClose: () => void
  currentPlan: string
}

export function UpgradeModal({ open, onClose, currentPlan }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetPlanKey = UPGRADE_MAP[currentPlan] as PlanKey | undefined
  const targetPlan = targetPlanKey ? PLANS[targetPlanKey] : null

  if (!open || !targetPlan || !targetPlanKey) return null

  async function handleUpgrade() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlanKey }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Failed to create checkout session.')
        setLoading(false)
      }
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md mx-4 p-6 rounded-2xl bg-background-secondary border border-background-border shadow-2xl">
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-1">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Current plan
            </p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border-mid font-mono text-xs text-text-secondary">
              {currentPlan}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close upgrade modal"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 rounded-xl bg-background-tertiary border border-background-border-mid space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-2xl text-text-primary">{targetPlan.name}</p>
              <p className="font-sans text-sm text-text-secondary mt-0.5 leading-relaxed">
                {targetPlan.description}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-2xl text-text-primary">${targetPlan.price}</p>
              <p className="font-sans text-xs text-text-tertiary">/ month</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {targetPlan.features.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Check size={12} strokeWidth={2} className="text-status-success shrink-0" />
                <p className="font-sans text-sm text-text-secondary">{f}</p>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-3 font-sans text-xs text-status-error">{error}</p>
        )}

        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white disabled:opacity-50 transition-colors duration-150"
        >
          <Zap size={14} strokeWidth={2} />
          {loading ? 'Redirecting to checkout…' : `Upgrade to ${targetPlan.name}`}
        </button>
      </div>
    </div>
  )
}
