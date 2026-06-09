'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrendItem } from '@prisma/client'

const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', X: 'X',
  REDDIT: 'Reddit', NEWS: 'News', WEB: 'Web',
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-status-success'
  if (score >= 50) return 'text-status-warning'
  return 'text-text-tertiary'
}

interface TrendPickerPanelProps {
  open:          boolean
  workspaceId:   string
  onClose:       () => void
  onSelectTrend: (trend: TrendItem) => void
}

export function TrendPickerPanel({ open, workspaceId, onClose, onSelectTrend }: TrendPickerPanelProps) {
  const [trends, setTrends]         = useState<TrendItem[]>([])
  const [loading, setLoading]       = useState(false)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/trends?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((d: { trends?: TrendItem[] }) => setTrends(d.trends ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, workspaceId])

  const handleDismiss = async (trend: TrendItem) => {
    setDismissing(trend.id)
    try {
      await fetch(`/api/trends/${trend.id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'DISMISSED' }),
      })
      setTrends(prev => prev.filter(t => t.id !== trend.id))
      if (expanded === trend.id) setExpanded(null)
    } finally {
      setDismissing(null)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 220, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 overflow-hidden border-l border-background-border bg-background-secondary"
        >
          <div className="w-[220px] h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-background-border">
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                Trends
              </span>
              <button onClick={onClose} aria-label="Close trends panel" className="text-text-tertiary hover:text-text-primary transition-colors">
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-text-tertiary" />
                </div>
              )}
              {!loading && trends.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center px-2">
                  <TrendingUp size={20} strokeWidth={1.5} className="text-text-tertiary" />
                  <p className="font-sans text-xs text-text-tertiary">No trends yet. Check back after the next daily sync.</p>
                </div>
              )}
              {trends.map(trend => (
                <div key={trend.id} className="rounded-lg border border-transparent hover:border-background-border transition-all">
                  <button
                    onClick={() => setExpanded(expanded === trend.id ? null : trend.id)}
                    className="w-full text-left px-2.5 py-2"
                  >
                    <p className="font-sans text-xs font-medium text-text-primary leading-snug line-clamp-2">{trend.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.08em] px-1 py-0.5 rounded bg-background-hover border border-background-border text-text-tertiary">
                        {PLATFORM_LABELS[trend.sourcePlatform] ?? trend.sourcePlatform}
                      </span>
                      <span className={cn('font-mono text-[10px]', scoreColor(trend.relevanceScore))}>
                        {trend.relevanceScore}
                      </span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {expanded === trend.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden px-2.5 pb-2"
                      >
                        <p className="font-sans text-[11px] text-text-secondary leading-relaxed mb-2">
                          {trend.whyItFits}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSelectTrend(trend)}
                            className="text-[11px] font-sans font-medium px-2.5 py-1 rounded-md bg-accent-platinum text-background-primary hover:bg-accent-white transition-all"
                          >
                            Add to post
                          </button>
                          <button
                            onClick={() => handleDismiss(trend)}
                            disabled={dismissing === trend.id}
                            className="text-[11px] font-sans text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-40"
                          >
                            Dismiss
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
