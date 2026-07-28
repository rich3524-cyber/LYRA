'use client'

import { useState } from 'react'
import { Shield, Lock, Loader2 } from 'lucide-react'

interface CrisisAwareAddonCardProps {
  workspaceId: string
  isPro: boolean
}

export function CrisisAwareAddonCard({ workspaceId, isPro }: CrisisAwareAddonCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleActivate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/crisis-aware-checkout', {
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

  return (
    <div className="flex items-start justify-between gap-4 p-5 rounded-xl bg-background-secondary border border-background-border">
      <div className="flex gap-3">
        <Shield className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium font-sans text-text-primary">Crisis Aware</p>
          <p className="text-sm font-sans text-text-secondary mt-1">
            Monitors comments for sentiment crises. Auto-pauses scheduled posts and alerts you when triggered.
          </p>
          <p className="text-xs font-sans text-text-tertiary mt-1">
            {isPro ? 'Add-on — cancel anytime' : 'Included on Agency plan · available as an add-on on Pro'}
          </p>
          {error && (
            <p className="text-xs font-sans text-status-error mt-1">{error}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0">
        {isPro ? (
          <button
            onClick={handleActivate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-accent-platinum text-background-primary hover:bg-accent-white transition-all disabled:opacity-40"
            aria-label="Activate Crisis Aware"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : 'Activate'}
          </button>
        ) : (
          <Lock size={14} strokeWidth={1.5} className="text-text-tertiary" />
        )}
      </div>
    </div>
  )
}
