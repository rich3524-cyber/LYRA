'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const [success, setSuccess] = useState(false)
  const router = useRouter()

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
      const data = await res.json() as { url?: string; success?: boolean; error?: string }
      if (data.url) {
        window.location.href = data.url
      } else if (data.success) {
        // Agency already had a subscription -- the route updated it in place
        // instead of returning a Checkout url. Show a confirmation rather
        // than reporting failure. The refresh itself is deferred to
        // handleDone(): this modal is only mounted while
        // `plan === 'STARTER' || plan === 'PRO'` (see header.tsx), so
        // refreshing immediately could flip that condition and unmount the
        // modal out from under the user before they see the confirmation.
        setSuccess(true)
        setLoading(false)
      } else {
        setError(data.error ?? 'Failed to create checkout session.')
        setLoading(false)
      }
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  function handleDone() {
    router.refresh()
    handleClose()
  }

  // Also clears success/error so a stale state from this session doesn't
  // linger and show through the next time the modal is opened (the
  // component isn't unmounted between opens -- it's conditionally rendered
  // by header.tsx, not remounted).
  function handleClose() {
    setSuccess(false)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

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
            onClick={handleClose}
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

        {success ? (
          <>
            <p className="mt-3 flex items-center gap-2 font-sans text-xs text-status-success">
              <Check size={12} strokeWidth={2} />
              Upgraded to {targetPlan.name}.
            </p>
            <button
              onClick={handleDone}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
            >
              Done
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
