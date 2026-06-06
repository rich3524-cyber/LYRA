'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow, formatDistance } from 'date-fns'
import { Shield, AlertTriangle } from 'lucide-react'

interface CrisisEventData {
  id:          string
  triggeredAt: string
  resolvedAt:  string | null
  triggerType: string
  commentIds:  string[]
}

const TRIGGER_LABELS: Record<string, string> = {
  SENTIMENT_SPIKE: 'Sentiment spike',
  KEYWORD_MATCH:   'Crisis keyword',
}

export function CrisisHistory({ workspaceId }: { workspaceId: string }) {
  const [events, setEvents]   = useState<CrisisEventData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/crisis/history?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((data: CrisisEventData[]) => { setEvents(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-background-secondary border border-background-border">
        <Shield size={16} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
        <p className="font-sans text-sm text-text-secondary">No crisis events recorded.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.map(event => {
        const isActive   = !event.resolvedAt
        const triggerLabel = TRIGGER_LABELS[event.triggerType] ?? event.triggerType
        const triggeredAgo = formatDistanceToNow(new Date(event.triggeredAt), { addSuffix: true })
        const duration     = event.resolvedAt
          ? formatDistance(new Date(event.triggeredAt), new Date(event.resolvedAt))
          : null

        return (
          <div key={event.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-background-secondary border border-background-border">
            <AlertTriangle
              size={14}
              strokeWidth={1.5}
              className={isActive ? 'text-status-error shrink-0' : 'text-text-tertiary shrink-0'}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-sans text-sm text-text-primary">{triggerLabel}</span>
                <span className={`font-sans text-[11px] font-medium uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? 'bg-status-error/10 text-status-error'
                    : 'bg-background-hover text-text-tertiary'
                }`}>
                  {isActive ? 'Active' : 'Resolved'}
                </span>
              </div>
              <p className="font-sans text-xs text-text-tertiary mt-0.5">
                {event.commentIds.length} comment{event.commentIds.length !== 1 ? 's' : ''} · {triggeredAgo}
                {duration && ` · resolved in ${duration}`}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
