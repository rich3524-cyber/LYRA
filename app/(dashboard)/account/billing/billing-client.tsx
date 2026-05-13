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
        window.location.href = data.url
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
        window.location.href = data.url
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
      <div className="rounded-xl border border-[#333] bg-[#111] p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#555] uppercase tracking-wide mb-0.5">Current plan</p>
          <p className="text-lg font-semibold text-[#e2e2e2]">{currentPlan}</p>
        </div>
        {hasStripeAccount && (
          <button
            onClick={handleManage}
            disabled={loading === 'portal'}
            className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-lg border border-[#333] text-[#888] hover:text-[#e2e2e2] hover:border-[#555] transition-colors disabled:opacity-50"
          >
            {loading === 'portal'
              ? <Loader2 size={12} className="animate-spin" />
              : <ExternalLink size={12} />
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
                  ? 'border-[#e2e2e2]/30 bg-[#141414]'
                  : 'border-[#222] bg-[#0f0f0f] hover:border-[#333]'
              }`}
            >
              {isCurrent && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#e2e2e2]/10 text-[#e2e2e2] border border-[#e2e2e2]/20">
                  <CheckCircle2 size={10} /> Current
                </span>
              )}

              <div>
                <h3 className="text-base font-semibold text-[#e2e2e2]">{plan.name}</h3>
                <p className="text-xs text-[#555] mt-1 leading-relaxed">{plan.description}</p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#e2e2e2]">${plan.price}</span>
                <span className="text-xs text-[#555]">/mo</span>
              </div>

              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-[#888]">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {!isCurrent && isHigher && (
                <button
                  onClick={() => handleUpgrade(key)}
                  disabled={!!loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#e2e2e2] text-[#080808] text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50"
                >
                  {loading === key
                    ? <Loader2 size={12} className="animate-spin" />
                    : <><Zap size={12} /> Upgrade to {plan.name}</>
                  }
                </button>
              )}

              {!isCurrent && !isHigher && (
                <button
                  onClick={() => handleManage()}
                  disabled={!!loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#333] text-xs text-[#555] hover:text-[#888] hover:border-[#555] transition-colors disabled:opacity-50"
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
