'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, ExternalLink, Loader2, TrendingUp } from 'lucide-react'
import { TrendRow } from './trend-row'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { TrendItem } from '@prisma/client'

type Filter = 'ALL' | 'TIKTOK' | 'NEWS' | 'WEB'

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All',     value: 'ALL'    },
  { label: 'TikTok',  value: 'TIKTOK' },
  { label: 'News',    value: 'NEWS'   },
  { label: 'Web',     value: 'WEB'    },
]

interface TrendHubProps {
  workspaceId: string
}

export function TrendHub({ workspaceId }: TrendHubProps) {
  const router = useRouter()
  const [trends, setTrends]         = useState<TrendItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected]     = useState<TrendItem | null>(null)
  const [filter, setFilter]         = useState<Filter>('ALL')
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const fetchTrends = useCallback(async () => {
    try {
      const res = await fetch(`/api/trends?workspaceId=${workspaceId}`)
      if (!res.ok) return
      const data = await res.json() as { trends: TrendItem[] }
      setTrends(data.trends)
      if (data.trends.length > 0 && !selected) {
        setSelected(data.trends[0])
      }
    } catch {
      setError('Could not load trends.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, selected])

  useEffect(() => { fetchTrends() }, [fetchTrends])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/trends/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { queued?: boolean; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Refresh failed.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleDismiss = async (trend: TrendItem) => {
    setActionLoading(true)
    try {
      await fetch(`/api/trends/${trend.id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'DISMISSED' }),
      })
      const next = trends.filter(t => t.id !== trend.id)
      setTrends(next)
      setSelected(next[0] ?? null)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUse = async (trend: TrendItem) => {
    setActionLoading(true)
    try {
      await fetch(`/api/trends/${trend.id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'USED' }),
      })
      sessionStorage.setItem('lyra_active_trend', JSON.stringify({
        trendId:        trend.id,
        title:          trend.title,
        sourcePlatform: trend.sourcePlatform,
      }))
      router.push(`/workspace/${workspaceId}/compose`)
    } finally {
      setActionLoading(false)
    }
  }

  const filteredTrends = filter === 'ALL'
    ? trends
    : trends.filter(t => t.sourcePlatform === filter)

  const newestSync = trends[0]?.syncedAt
    ? formatDistanceToNow(new Date(trends[0].syncedAt), { addSuffix: true })
    : null

  if (loading) {
    return (
      <div className="grid grid-cols-[280px_1fr] gap-4 h-[600px]">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-background-secondary border border-background-border animate-pulse" />
          ))}
        </div>
        <div className="rounded-xl bg-background-secondary border border-background-border animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'font-sans text-xs px-3 py-1.5 rounded-full border transition-all duration-150',
                filter === f.value
                  ? 'bg-background-hover border-background-border-mid text-text-primary'
                  : 'border-background-border text-text-tertiary hover:text-text-secondary'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {newestSync && (
            <span className="font-sans text-xs text-text-tertiary">Updated {newestSync}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh trends"
            className="inline-flex items-center gap-1.5 text-xs font-sans text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="font-sans text-xs text-status-error">{error}</p>
      )}

      {filteredTrends.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl bg-background-secondary border border-background-border gap-3">
          <TrendingUp size={24} strokeWidth={1.5} className="text-text-tertiary" />
          <p className="font-sans text-sm text-text-secondary">No trends yet.</p>
          <p className="font-sans text-xs text-text-tertiary">Trends sync daily. Click Refresh to trigger a manual sync.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[280px_1fr] gap-4">
          {/* Left: list */}
          <div className="space-y-1 overflow-y-auto max-h-[600px] pr-1">
            {filteredTrends.map(trend => (
              <TrendRow
                key={trend.id}
                trend={trend}
                active={selected?.id === trend.id}
                onClick={() => setSelected(trend)}
              />
            ))}
          </div>

          {/* Right: detail */}
          {selected ? (
            <div className="p-6 rounded-xl bg-background-secondary border border-background-border space-y-5">
              <div>
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary mb-2">Trend</p>
                <h3 className="font-sans text-base font-medium text-text-primary leading-snug">{selected.title}</h3>
              </div>
              <div>
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary mb-2">Why it fits your brand</p>
                <p className="font-sans text-sm text-text-secondary leading-relaxed">{selected.whyItFits}</p>
              </div>
              <div>
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary mb-2">Source</p>
                <div className="flex items-center gap-2">
                  <span className="font-sans text-[10px] font-medium uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-background-hover border border-background-border text-text-tertiary">
                    {selected.sourcePlatform}
                  </span>
                  <span className="font-mono text-xs text-text-tertiary">
                    Relevance: {selected.relevanceScore}/100
                  </span>
                  {selected.sourceUrl && (
                    <a
                      href={selected.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                      aria-label="View source"
                    >
                      <ExternalLink size={12} strokeWidth={1.5} />
                      Source
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-background-border">
                <button
                  onClick={() => handleUse(selected)}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-sans font-medium bg-accent-platinum text-background-primary hover:bg-accent-white transition-all disabled:opacity-40"
                >
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : 'Use this trend'}
                </button>
                <button
                  onClick={() => handleDismiss(selected)}
                  disabled={actionLoading}
                  className="text-xs font-sans text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-40"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-background-secondary border border-background-border flex items-center justify-center">
              <p className="font-sans text-sm text-text-tertiary">Select a trend to see details.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
