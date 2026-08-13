'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { TrendingUp, MessageSquare, BarChart2, Eye, Heart, Share2, CheckCheck, Play, RefreshCw } from 'lucide-react'
import type { Platform } from '@prisma/client'
import { getPlatformShortLabel } from '@/lib/platform-labels'

// recharts is a sizeable dependency that only this chart needs -- load it lazily
// (client-only, no SSR) so the rest of the analytics dashboard's JS isn't blocked
// on it, and pages that never render this chart don't pay for it at all.
const EngagementChart = dynamic(
  () => import('./engagement-chart').then(m => m.EngagementChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse bg-background-hover rounded-lg" /> }
)

interface Summary {
  postsPublished:      number
  totalReach:          number
  totalViews:          number
  totalLikes:          number
  totalComments:       number
  totalShares:         number
  commentResponseRate: number
  inboxPending:        number
}

interface DataPoint  { date: string; likes: number; comments: number; shares: number; reach: number; views: number }
interface PlatformStat { platform: string; count: number }
interface TopPost    { id: string; content: string; platform: string; reach: number; views: number; likes: number; comments: number; publishedAt: string }

interface AnalyticsData {
  summary:           Summary
  series:            DataPoint[]
  platformBreakdown: PlatformStat[]
  topPosts:          TopPost[]
}

// Computed once at module load — getTimezoneOffset() returns the *negative* of
// the UTC offset, so we negate it (e.g. Brisbane UTC+10 → +600).
const TZ_OFFSET = -new Date().getTimezoneOffset()

const PERIODS = [
  { label: '7d',  value: 7  },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-background-border bg-background-secondary p-4 space-y-3">
      <div className="flex items-center gap-2 text-text-tertiary">
        <Icon size={14} strokeWidth={1.5} />
        <span className="font-sans text-xs font-medium uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className="font-mono text-2xl text-text-primary">{value.toLocaleString()}</p>
      {sub && <p className="font-sans text-xs text-text-tertiary">{sub}</p>}
    </div>
  )
}

function PlatformBreakdownList({ breakdown }: { breakdown: PlatformStat[] }) {
  // Computed once per render, not once per row -- the previous version called
  // Math.max(...breakdown.map(...)) inside the .map() callback itself, making
  // the whole list O(n^2) for what should be an O(n) render.
  const max = Math.max(...breakdown.map(p => p.count))
  return (
    <div className="space-y-3">
      {breakdown.map(({ platform, count }) => (
        <div key={platform} className="space-y-1">
          <div className="flex items-center justify-between font-sans text-xs">
            <span className="text-text-secondary">{getPlatformShortLabel(platform as Platform)}</span>
            <span className="font-mono text-text-tertiary">{count}</span>
          </div>
          <div className="h-1.5 bg-background-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-background-border-mid rounded-full transition-all duration-500"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PerformanceDashboard({ workspaceId }: { workspaceId: string }) {
  const [data, setData]           = useState<AnalyticsData | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [period, setPeriod]       = useState(30)
  const [syncing, setSyncing]     = useState(false)
  const [refreshTick, setRefresh] = useState(0)
  const loading = data === null && error === null

  useEffect(() => {
    let active = true
    setError(null)
    fetch(`/api/analytics?workspaceId=${workspaceId}&period=${period}&tzOffset=${TZ_OFFSET}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load analytics (${r.status})`)
        return r.json() as Promise<AnalyticsData>
      })
      .then((d) => { if (active) setData(d) })
      // Previously fell back to `setData({})` here, which left later renders
      // reading `data.summary.postsPublished` off an empty object and
      // crashing the whole route. A real error state instead of a malformed
      // `data` lets the render path fail gracefully.
      .catch((err: Error) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [workspaceId, period, refreshTick])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/analytics/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId }),
      })
      setRefresh(t => t + 1)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Period selector + sync */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg font-sans text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-background-hover border border-background-border-mid text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-xs text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} strokeWidth={1.5} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-background-border bg-background-secondary p-6 text-center space-y-1">
          <p className="font-sans text-sm text-status-error">Couldn&apos;t load analytics — try refreshing</p>
          <p className="font-sans text-xs text-text-tertiary">{error}</p>
        </div>
      ) : (
      <>
      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={TrendingUp} label="Posts published"   value={data.summary.postsPublished} />
          <StatCard icon={Eye}        label="Total reach"       value={data.summary.totalReach} />
          {/* Reach is often still 0 in the hours/first day after publish --
              platforms report it more slowly than views. Shown alongside reach
              (not instead of it) so real activity isn't hidden while reach
              catches up. */}
          <StatCard icon={Play}       label="Total views"       value={data.summary.totalViews} />
          <StatCard icon={Heart}      label="Total likes"       value={data.summary.totalLikes} />
          <StatCard icon={CheckCheck} label="Response rate"     value={`${data.summary.commentResponseRate}%`} sub={`${data.summary.inboxPending} pending`} />
        </div>
      ) : null}

      {/* Engagement chart */}
      <div className="rounded-xl border border-background-border bg-background-secondary p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} strokeWidth={1.5} className="text-text-tertiary" />
          <h3 className="font-sans text-sm font-medium text-text-primary">Engagement over time</h3>
        </div>
        {loading ? (
          <div className="h-64 animate-pulse bg-background-hover rounded-lg" />
        ) : (
          <EngagementChart data={data?.series ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Platform breakdown */}
        <div className="rounded-xl border border-background-border bg-background-secondary p-5 space-y-4">
          <h3 className="font-sans text-sm font-medium text-text-primary">Posts by platform</h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 rounded bg-background-hover animate-pulse" />
              ))}
            </div>
          ) : (data?.platformBreakdown.length ?? 0) === 0 ? (
            <p className="font-sans text-sm text-text-secondary">No published posts yet</p>
          ) : (
            <PlatformBreakdownList breakdown={data!.platformBreakdown} />
          )}
        </div>

        {/* Top posts */}
        <div className="rounded-xl border border-background-border bg-background-secondary p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} strokeWidth={1.5} className="text-text-tertiary" />
            <h3 className="font-sans text-sm font-medium text-text-primary">Top posts by reach</h3>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-background-hover animate-pulse" />
              ))}
            </div>
          ) : (data?.topPosts.length ?? 0) === 0 ? (
            <p className="font-sans text-sm text-text-secondary">No posts with metrics yet</p>
          ) : (
            <div className="space-y-3">
              {data?.topPosts.map(post => (
                <div key={post.id} className="rounded-lg border border-background-border bg-background-tertiary p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-background-hover border border-background-border-mid text-text-tertiary">
                      {getPlatformShortLabel(post.platform as Platform)}
                    </span>
                    <div className="flex items-center gap-3 font-sans text-xs text-text-tertiary">
                      <span className="flex items-center gap-1"><Eye size={12} strokeWidth={1.5} />{post.reach.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Play size={12} strokeWidth={1.5} />{post.views.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Heart size={12} strokeWidth={1.5} />{post.likes}</span>
                      <span className="flex items-center gap-1"><Share2 size={12} strokeWidth={1.5} />{post.comments}</span>
                    </div>
                  </div>
                  <p className="font-sans text-xs text-text-secondary line-clamp-2 leading-relaxed">{post.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
