'use client'

import { useState } from 'react'
import { Shield } from 'lucide-react'

interface CrisisAwareToggleProps {
  workspaceId: string
  enabled: boolean
  isPro: boolean
}

export function CrisisAwareToggle({ workspaceId, enabled, isPro }: CrisisAwareToggleProps) {
  const [active, setActive] = useState(enabled)
  const [saving, setSaving] = useState(false)

  const handleToggle = async () => {
    if (!isPro) return
    setSaving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crisisAware: !active }),
      })
      if (res.ok) setActive(!active)
    } finally {
      setSaving(false)
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
          {!isPro && (
            <p className="text-xs font-sans text-text-tertiary mt-1">Requires Pro or Agency plan.</p>
          )}
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={!isPro || saving}
        aria-label={active ? 'Disable Crisis Aware' : 'Enable Crisis Aware'}
        className={`relative h-6 w-11 rounded-full transition-colors shrink-0 mt-0.5 disabled:opacity-40 ${
          active ? 'bg-status-success' : 'bg-background-border-mid'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-text-primary transition-transform ${
            active ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
