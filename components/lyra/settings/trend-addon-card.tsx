'use client'

import { useState } from 'react'
import { TrendingUp, CheckCircle2, Loader2 } from 'lucide-react'

interface TrendAddonCardProps {
  workspaceId: string
  enabled: boolean
  subscriptionId: string | null
}

export function TrendAddonCard({ workspaceId, enabled, subscriptionId }: TrendAddonCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleActivate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/trend-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout. Try again.')
        return
      }
      window.location.href = data.url
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleManage = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', { method: 'GET' })
      const data = await res.json() as { url?: string }
      if (data.url) window.location.href = data.url
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 p-5 rounded-xl bg-background-secondary border border-background-border">
      <div className="flex gap-3">
        <TrendingUp className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium font-sans text-text-primary">LYRA Trend</p>
            {enabled && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium font-sans uppercase tracking-[0.1em] text-status-success">
                <CheckCircle2 size={10} strokeWidth={2} /> Active
              </span>
            )}
          </div>
          <p className="text-sm font-sans text-text-secondary mt-1">
            Daily AI-scored trend intelligence matched to your brand. Discover what is gaining traction before your competitors do.
          </p>
          <p className="text-xs font-sans text-text-tertiary mt-1">
            {enabled ? `Subscription ID: ${subscriptionId?.slice(0, 16)}...` : '$X/month — cancel anytime'}
          </p>
          {error && (
            <p className="text-xs font-sans text-status-error mt-1">{error}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0">
        {enabled ? (
          <button
            onClick={handleManage}
            disabled={loading}
            className="text-xs font-sans font-medium text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Manage subscription'}
          </button>
        ) : (
          <button
            onClick={handleActivate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-accent-platinum text-background-primary hover:bg-accent-white transition-all disabled:opacity-40"
            aria-label="Activate LYRA Trend"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : 'Activate'}
          </button>
        )}
      </div>
    </div>
  )
}
