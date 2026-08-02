'use client'

import { useState } from 'react'
import { TrendingUp, CheckCircle2, Loader2 } from 'lucide-react'

interface TrendAddonCardProps {
  workspaceId: string
  enabled: boolean
  subscriptionId: string | null
}

export function TrendAddonCard({ workspaceId: _workspaceId, enabled, subscriptionId }: TrendAddonCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleManage = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/create-checkout')
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not open billing portal. Try again.')
        return
      }
      window.location.href = data.url
    } catch {
      setError('Network error. Try again.')
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
              <span className="inline-flex items-center gap-1 text-[11px] font-medium font-sans uppercase tracking-[0.1em] text-status-success">
                <CheckCircle2 size={10} strokeWidth={2} /> Active
              </span>
            )}
          </div>
          <p className="text-sm font-sans text-text-secondary mt-1">
            Daily AI-scored trend intelligence matched to your brand. Discover what is gaining traction before your competitors do.
          </p>
          <p className="text-xs font-sans text-text-tertiary mt-1">
            {enabled
              ? `Subscription ID: ${subscriptionId?.slice(0, 16)}... — not yet functional, manage or cancel below`
              : 'Not yet available — coming soon'}
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
          <span className="text-xs font-sans font-medium text-text-tertiary whitespace-nowrap">
            Coming soon
          </span>
        )}
      </div>
    </div>
  )
}
