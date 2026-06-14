'use client'
import { useState } from 'react'
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

  async function handleUpgrade(plan: PlanKey) {
    setLoading(plan)
    try {
      const res  = await fetch('/api/stripe/create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.assign(data.url)
      } else {
        toast.error(data.error ?? 'Could not start checkout')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  async function handleManage() {
    setLoading('portal')
    try {
      const res  = await fetch('/api/stripe/create-checkout')
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.assign(data.url)
      } else {
        toast.error(data.error ?? 'Could not open billing portal')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  const planOrder: PlanKey[] = ['STARTER', 'PRO', 'AGENCY']

  return (
    <div className="space-y-6">
      {/* Current plan banner */}
      <div className="rounded-xl border border-background-border-mid bg-background-secondary p-4 flex items-center justify-between">
        <div>
          <p className="font-sans text-xs text-text-tertiary uppercase tracking-[0.1em] mb-0.5">Current plan</p>
          <p className="font-sans text-lg font-medium text-text-primary">{currentPlan}</p>
        </div>
        {hasStripeAccount && (
          <button
            onClick={handleManage}
            disabled={loading === 'portal'}
            className="inline-flex items-center gap-2 font-sans text-xs px-4 py-2 rounded-lg border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver transition-colors disabled:opacity-50"
          >
            {loading === 'portal'
              ? <Loader2 size={12} className="animate-spin" />
              : <ExternalLink size={12} strokeWidth={1.5} />
            }
            Manage billing
          </button>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {planOrder.map((key) => {
          const plan      = plans[key]
          const isCurrent = currentPlan === key
          const isHigher  = planOrder.indexOf(key) > planOrder.indexOf(currentPlan as PlanKey)

          return (
            <div
              key={key}
              className={`rounded-xl border p-6 space-y-4 transition-colors ${
                isCurrent
                  ? 'border-accent-platinum/30 bg-background-tertiary'
                  : 'border-background-border bg-background-secondary hover:border-background-border-mid'
              }`}
            >
              {isCurrent && (
                <span className="inline-flex items-center gap-1 font-sans text-xs px-2 py-0.5 rounded-full bg-accent-platinum/10 text-accent-platinum border border-accent-platinum/20">
                  <CheckCircle2 size={10} strokeWidth={1.5} /> Current
                </span>
              )}

              <div>
                <h3 className="font-sans text-base font-medium text-text-primary">{plan.name}</h3>
                <p className="font-sans text-xs text-text-tertiary mt-1 leading-relaxed">{plan.description}</p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="font-mono text-3xl text-text-primary">${plan.price}</span>
                <span className="font-sans text-xs text-text-tertiary">/mo</span>
              </div>

              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 font-sans text-xs text-text-secondary">
                    <CheckCircle2 size={12} strokeWidth={1.5} className="text-status-success shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {!isCurrent && isHigher && (
                <button
                  onClick={() => handleUpgrade(key)}
                  disabled={!!loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium hover:bg-accent-white transition-colors disabled:opacity-50"
                >
                  {loading === key
                    ? <Loader2 size={12} className="animate-spin" />
                    : <><Zap size={12} strokeWidth={1.5} /> Upgrade to {plan.name}</>
                  }
                </button>
              )}

              {!isCurrent && !isHigher && (
                <button
                  onClick={() => handleManage()}
                  disabled={!!loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-background-border-mid font-sans text-xs text-text-tertiary hover:text-text-secondary hover:border-accent-silver transition-colors disabled:opacity-50"
                >
                  Downgrade
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
