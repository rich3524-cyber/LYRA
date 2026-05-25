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
  const [error, setError] = useState<string | null>(null)

  if (resolved) return null

  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    return isNaN(d.getTime()) ? '' : d.toLocaleString()
  }

  const handleResolve = async () => {
    setError(null)
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
      } else {
        setError('Could not resolve. Try again.')
      }
    } finally {
      setResolving(false)
    }
  }

  return (
    <div role="alert" className="flex items-center gap-3 px-4 py-3 bg-background-secondary border-b border-status-error/30">
      <AlertTriangle className="h-4 w-4 text-status-error shrink-0" strokeWidth={1.5} />
      <div className="flex-1">
        <p className="text-sm text-status-error font-sans font-medium">
          Crisis detected — scheduled posts paused.
          {triggeredAt && (
            <span className="text-text-secondary font-normal ml-2">
              Triggered {formatDate(triggeredAt)}
            </span>
          )}
        </p>
        {error && (
          <span className="text-xs font-sans text-status-error mt-1 block">{error}</span>
        )}
      </div>
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
