'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface CrisisBannerProps {
  workspaceId:            string
  triggeredAt:            string | null
  triggerType:            string | null
  triggeringCommentCount: number
}

const TRIGGER_LABELS: Record<string, string> = {
  SENTIMENT_SPIKE: 'Sentiment spike',
  KEYWORD_MATCH:   'Crisis keyword',
}

export function CrisisBanner({ workspaceId, triggeredAt, triggerType, triggeringCommentCount }: CrisisBannerProps) {
  const router = useRouter()
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  if (resolved) return null

  const triggerLabel = triggerType ? (TRIGGER_LABELS[triggerType] ?? triggerType) : 'Crisis'
  const commentNote  = triggeringCommentCount > 0
    ? `${triggeringCommentCount} triggering comment${triggeringCommentCount !== 1 ? 's' : ''}`
    : null
  const timeAgo = triggeredAt ? formatDistanceToNow(new Date(triggeredAt), { addSuffix: true }) : null

  const handleResolve = async () => {
    setError(null)
    setResolving(true)
    try {
      const res = await fetch('/api/crisis/resolve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId }),
      })
      if (res.ok) {
        setResolved(true)
        router.refresh()
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
      <div className="flex-1 min-w-0">
        <p className="font-sans text-sm font-medium text-status-error">
          {triggerLabel} detected — scheduled posts paused.
        </p>
        <p className="font-sans text-xs text-text-secondary mt-0.5">
          {[commentNote, timeAgo].filter(Boolean).join(' · ')}
          {' '}
          <a
            href={`/workspace/${workspaceId}/inbox`}
            className="text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors"
          >
            View in Inbox
          </a>
        </p>
        {error && (
          <p className="font-sans text-xs text-status-error mt-1">{error}</p>
        )}
      </div>
      <button
        onClick={handleResolve}
        disabled={resolving}
        className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-text-primary hover:text-accent-platinum transition-colors disabled:opacity-50 shrink-0"
      >
        {resolving && <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />}
        {resolving ? 'Resolving…' : 'Resolve'}
      </button>
    </div>
  )
}
