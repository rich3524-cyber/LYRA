'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { PostingPatterns, PostingSlot } from '@/services/ai/engagement-analyzer'

interface Props {
  workspaceId: string
  postingPatterns: PostingPatterns | null
  connectedPlatforms: string[]
  postCounts: Record<string, number>
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const GRID_DAYS = [1, 2, 3, 4, 5, 6, 0] // Mon–Sun in JS dayOfWeek convention
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am–10pm
const THRESHOLD = 20

function fmtHour(h: number): string {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
}

function scoreCell(score: number | undefined): string {
  if (score === undefined || score === 0)
    return 'bg-background-tertiary text-text-tertiary'
  if (score < 0.4) return 'bg-background-hover text-text-tertiary'
  if (score < 0.7) return 'border border-accent-silver text-accent-silver bg-background-tertiary'
  return 'bg-background-tertiary border border-accent-platinum text-accent-platinum'
}

function HeatMap({ slots }: { slots: PostingSlot[] }) {
  const lookup: Record<string, number> = {}
  for (const s of slots) lookup[`${s.dayOfWeek}:${s.hour}`] = s.score

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="w-10 pb-2" />
            {DAY_LABELS.map((d) => (
              <th key={d} className="pb-2 text-center font-sans text-[11px] text-text-tertiary font-medium tracking-[0.05em] uppercase">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <td className="pr-2 py-0.5 text-right font-mono text-[12px] text-text-tertiary tabular-nums">
                {fmtHour(hour)}
              </td>
              {GRID_DAYS.map((dow) => {
                const score = lookup[`${dow}:${hour}`]
                return (
                  <td key={dow} className="py-0.5 px-0.5">
                    <div className={`h-6 w-full rounded-sm flex items-center justify-center font-mono text-[12px] tabular-nums ${scoreCell(score)}`}>
                      {score !== undefined && score > 0 ? score.toFixed(2) : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function platformLabel(p: string): string {
  return p.charAt(0) + p.slice(1).toLowerCase().replace('_', ' ')
}

export function EngagementInsights({
  workspaceId,
  postingPatterns: initialPatterns,
  connectedPlatforms,
  postCounts,
}: Props) {
  const [patterns, setPatterns] = useState(initialPatterns)
  const [activeTab, setActiveTab] = useState<string>(
    connectedPlatforms.find((p) => initialPatterns?.[p]) ?? connectedPlatforms[0] ?? ''
  )
  const [isRefreshing, setIsRefreshing] = useState(false)

  const hasAnyData = patterns !== null && Object.keys(patterns).length > 0

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/brand-intelligence/analyze-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) throw new Error('Request failed')
      const { postingPatterns: updated } = await res.json() as { postingPatterns: PostingPatterns | null }
      if (updated) {
        setPatterns(updated)
        if (!activeTab || !updated[activeTab]) {
          setActiveTab(Object.keys(updated)[0] ?? '')
        }
        toast.success('Engagement data refreshed.')
      } else {
        toast.error('Not enough data yet. Publish more posts to unlock insights.')
      }
    } catch {
      toast.error('Refresh failed. Try again.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Engagement Insights
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary"
          aria-label="Refresh engagement data"
        >
          <RefreshCw
            size={12}
            strokeWidth={1.5}
            className={isRefreshing ? 'animate-spin mr-1.5' : 'mr-1.5'}
          />
          Refresh
        </Button>
      </div>

      {!hasAnyData ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {connectedPlatforms.map((platform) => {
              const count = postCounts[platform] ?? 0
              const pct = Math.min((count / THRESHOLD) * 100, 100)
              return (
                <div key={platform} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-xs text-text-secondary">{platformLabel(platform)}</span>
                    <span className="font-mono text-xs text-text-tertiary tabular-nums">
                      {count} of {THRESHOLD} posts
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-silver transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="font-sans text-xs text-text-tertiary leading-relaxed">
            LYRA tracks engagement on every published post. Once you reach the threshold, your optimal posting windows appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-1 flex-wrap">
            {connectedPlatforms.map((platform) => {
              const hasData = !!patterns?.[platform]
              const count = postCounts[platform] ?? 0
              const isActive = activeTab === platform
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => hasData && setActiveTab(platform)}
                  disabled={!hasData}
                  className={`px-3 py-1 rounded-md font-sans text-xs transition-colors duration-150 ${
                    isActive
                      ? 'bg-background-tertiary border border-accent-silver text-text-primary'
                      : hasData
                        ? 'border border-background-border text-text-secondary hover:border-background-border-mid hover:text-text-primary'
                        : 'border border-background-border text-text-tertiary cursor-not-allowed opacity-50'
                  }`}
                >
                  {platformLabel(platform)}
                  {!hasData && (
                    <span className="ml-1 text-[10px]">({count}/{THRESHOLD})</span>
                  )}
                </button>
              )
            })}
          </div>

          {activeTab && patterns?.[activeTab] && (() => {
            const pattern = patterns[activeTab]
            const topicEntries = Object.entries(pattern.byTopic)
            return (
              <div className="space-y-5">
                <HeatMap slots={pattern.topSlots} />

                {topicEntries.length > 0 && (
                  <div className="space-y-3">
                    <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                      By Content Theme
                    </p>
                    <div className="space-y-2">
                      {topicEntries.map(([topic, slots]) => (
                        <div key={topic} className="flex items-start gap-3">
                          <span className="font-sans text-xs text-text-secondary shrink-0 pt-0.5 min-w-[140px]">
                            {topic}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {slots.slice(0, 2).map((s, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                              >
                                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfWeek]} {fmtHour(s.hour)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="font-sans text-xs text-text-tertiary">
                  Based on {pattern.totalPostsAnalyzed} posts · Updated {timeAgo(pattern.analyzedAt)}
                </p>
              </div>
            )
          })()}
        </div>
      )}
    </section>
  )
}
