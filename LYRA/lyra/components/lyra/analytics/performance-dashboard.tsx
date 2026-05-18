'use client'
import { useState, useEffect } from 'react'
import { EngagementChart } from './engagement-chart'
import { TrendingUp, MessageSquare, BarChart2, Eye, Heart, Share2, CheckCheck } from 'lucide-react'

interface Summary {
  postsPublished:      number
  totalReach:          number
  totalLikes:          number
  totalComments:       number
  totalShares:         number
  commentResponseRate: number
  inboxPending:        number
}

interface DataPoint  { date: string; likes: number; comments: number; shares: number; reach: number }
interface PlatformStat { platform: string; count: number }
interface TopPost    { id: string; content: string; platform: string; reach: number; likes: number; comments: number; publishedAt: string }

interface AnalyticsData {
  summary:           Summary
  series:            DataPoint[]
  platformBreakdown: PlatformStat[]
  topPosts:          TopPost[]
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
}

const PERIODS = [
  { label: '7d',  value: 7  },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#222] bg-[#0f0f0f] p-4 space-y-3">
      <div className="flex items-center gap-2 text-[#555]">
        <Icon size={14} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-[#e2e2e2] font-mono">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-[#555]">{sub}</p>}
    </div>
  )
}

export function PerformanceDashboard({ workspaceId }: { workspaceId: string }) {
  const [data, setData]     = useState<AnalyticsData | null>(null)
  const [period, setPeriod] = useState(30)
  const loading = data === null

  useEffect(() => {
    let active = true
    fetch(`/api/analytics?workspaceId=${workspaceId}&period=${period}`)
      .then(r => r.json())
      .then((d: AnalyticsData) => { if (active) setData(d) })
      .catch(() => { if (active) setData({} as AnalyticsData) })
    return () => { active = false }
  }, [workspaceId, period])

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              period === p.value
                ? 'bg-[#1a1a1a] border border-[#333] text-[#e2e2e2]'
                : 'text-[#555] hover:text-[#888]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-[#0f0f0f] border border-[#222] animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp}    label="Posts published"   value={data.summary.postsPublished} />
          <StatCard icon={Eye}           label="Total reach"       value={data.summary.totalReach} />
          <StatCard icon={Heart}         label="Total likes"       value={data.summary.totalLikes} />
          <StatCard icon={CheckCheck}    label="Response rate"     value={`${data.summary.commentResponseRate}%`} sub={`${data.summary.inboxPending} pending`} />
        </div>
      ) : null}

      {/* Engagement chart */}
      <div className="rounded-xl border border-[#222] bg-[#0f0f0f] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-[#555]" />
          <h3 className="text-sm font-medium text-[#e2e2e2]">Engagement over time</h3>
        </div>
        {loading ? (
          <div className="h-64 animate-pulse bg-[#1a1a1a] rounded-lg" />
        ) : (
          <EngagementChart data={data?.series ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Platform breakdown */}
        <div className="rounded-xl border border-[#222] bg-[#0f0f0f] p-5 space-y-4">
          <h3 className="text-sm font-medium text-[#e2e2e2]">Posts by platform</h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 rounded bg-[#1a1a1a] animate-pulse" />
              ))}
            </div>
          ) : (data?.platformBreakdown.length ?? 0) === 0 ? (
            <p className="text-sm text-[#555]">No published posts yet</p>
          ) : (
            <div className="space-y-3">
              {data?.platformBreakdown.map(({ platform, count }) => {
                const max = Math.max(...(data.platformBreakdown.map(p => p.count)))
                return (
                  <div key={platform} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#888]">{PLATFORM_LABELS[platform] ?? platform}</span>
                      <span className="text-[#555] font-mono">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#333] rounded-full transition-all duration-500"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top posts */}
        <div className="rounded-xl border border-[#222] bg-[#0f0f0f] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[#555]" />
            <h3 className="text-sm font-medium text-[#e2e2e2]">Top posts by reach</h3>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-[#1a1a1a] animate-pulse" />
              ))}
            </div>
          ) : (data?.topPosts.length ?? 0) === 0 ? (
            <p className="text-sm text-[#555]">No posts with metrics yet</p>
          ) : (
            <div className="space-y-3">
              {data?.topPosts.map(post => (
                <div key={post.id} className="rounded-lg border border-[#1a1a1a] bg-[#111] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-[#555] font-mono">
                      {PLATFORM_LABELS[post.platform] ?? post.platform}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-[#555]">
                      <span className="flex items-center gap-1"><Eye size={10} />{post.reach.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Heart size={10} />{post.likes}</span>
                      <span className="flex items-center gap-1"><Share2 size={10} />{post.comments}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#888] line-clamp-2 leading-relaxed">{post.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
