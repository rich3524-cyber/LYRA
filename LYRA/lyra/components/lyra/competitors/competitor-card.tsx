'use client'

import { memo } from 'react'
import { Trash2, Globe, ExternalLink } from 'lucide-react'

function formatPostDate(dateStr: string): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 1)  return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7)  return `${diff} days ago`
    return d.toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short',
      ...(diff > 365 ? { year: 'numeric' } : {}),
    })
  } catch { return null }
}

interface Snapshot {
  capturedAt: string
  postsPerWeek: number | null
  recentTopics: string[]
  recentPosts: unknown
}

interface CompetitorCardProps {
  id: string
  name: string
  websiteUrl?: string | null
  twitterHandle?: string | null
  facebookPageId?: string | null
  instagramHandle?: string | null
  linkedinPageId?: string | null
  snapshots: Snapshot[]
  onRemove: (id: string) => void
}

export const CompetitorCard = memo(function CompetitorCard({
  id,
  name,
  websiteUrl,
  twitterHandle,
  facebookPageId,
  instagramHandle,
  linkedinPageId,
  snapshots,
  onRemove,
}: CompetitorCardProps) {
  const latest = snapshots[0]
  const daysSinceScan = latest
    ? Math.floor((Date.now() - new Date(latest.capturedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const recentPosts = (latest?.recentPosts as { date: string; excerpt: string; url?: string; platform: string }[] | null) ?? []

  return (
    <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium font-sans text-text-primary">{name}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            {websiteUrl && (
              <span className="text-xs font-sans text-text-secondary flex items-center gap-1">
                <Globe className="h-3 w-3" strokeWidth={1.5} />
                {new URL(websiteUrl).hostname}
              </span>
            )}
            {twitterHandle && (
              <span className="text-xs font-sans text-text-secondary">X: @{twitterHandle}</span>
            )}
            {instagramHandle && (
              <span className="text-xs font-sans text-text-secondary">IG: @{instagramHandle}</span>
            )}
            {facebookPageId && (
              <span className="text-xs font-sans text-text-secondary">FB: {facebookPageId}</span>
            )}
            {linkedinPageId && (
              <span className="text-xs font-sans text-text-secondary">LI: {linkedinPageId}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRemove(id)}
          aria-label="Remove competitor"
          className="text-text-tertiary hover:text-status-error transition-colors"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {latest ? (
        <div className="space-y-3">
          <div className="flex gap-6">
            <div>
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Posts/week</p>
              <p className="font-mono text-lg text-text-primary mt-0.5">
                {latest.postsPerWeek != null ? `~${latest.postsPerWeek}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Last scanned</p>
              <p className="text-sm font-sans text-text-secondary mt-0.5">
                {daysSinceScan === 0 ? 'Today' : daysSinceScan === 1 ? 'Yesterday' : `${daysSinceScan} days ago`}
              </p>
            </div>
          </div>

          {latest.recentTopics.length > 0 && (
            <div>
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest mb-1.5">Themes</p>
              <div className="flex flex-wrap gap-1.5">
                {latest.recentTopics.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border text-xs font-sans text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {recentPosts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Recent posts</p>
              {recentPosts.slice(0, 3).map((post, i) => {
                const dateLabel = formatPostDate(post.date)
                const inner = (
                  <>
                    <p className="text-xs font-sans text-text-secondary leading-relaxed group-hover:text-text-primary transition-colors line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      {dateLabel && (
                        <span className="font-mono text-[11px] text-text-tertiary">{dateLabel}</span>
                      )}
                      {post.url && (
                        <ExternalLink className="h-3 w-3 shrink-0 text-text-tertiary group-hover:text-text-secondary transition-colors ml-auto" strokeWidth={1.5} />
                      )}
                    </div>
                  </>
                )
                return post.url ? (
                  <a
                    key={i}
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-lg bg-background-tertiary border border-background-border hover:border-background-border-mid p-2.5 transition-colors"
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={i} className="group rounded-lg bg-background-tertiary border border-background-border p-2.5">
                    {inner}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm font-sans text-text-tertiary">No data yet. First scan runs tonight.</p>
      )}
    </div>
  )
})
