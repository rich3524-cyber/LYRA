'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface CrisisBannerProps {
  workspaceId: string
  triggeredAt: string | null
}

export function CrisisBanner({ workspaceId, triggeredAt }: CrisisBannerProps) {
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState(false)

  if (resolved) return null

  const handleResolve = async () => {
    setResolving(true)
    try {
      const res = await fetch('/api/crisis/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (res.ok) {
        setResolved(true)
        window.location.reload()
      }
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-background-secondary border-b border-status-error/30">
      <AlertTriangle className="h-4 w-4 text-status-error shrink-0" strokeWidth={1.5} />
      <p className="text-sm text-status-error font-sans font-medium flex-1">
        Crisis detected — scheduled posts paused.
        {triggeredAt && (
          <span className="text-text-secondary font-normal ml-2">
            Triggered {new Date(triggeredAt).toLocaleString()}
          </span>
        )}
      </p>
      <button
        onClick={handleResolve}
        disabled={resolving}
        className="text-sm font-medium font-sans text-text-primary hover:text-accent-platinum transition-colors disabled:opacity-50 shrink-0"
      >
        {resolving ? 'Resolving…' : 'Resolve'}
      </button>
    </div>
  )
}
