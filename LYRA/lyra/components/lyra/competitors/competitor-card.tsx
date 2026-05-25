import { Trash2, Globe, ExternalLink } from 'lucide-react'

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
  snapshots: Snapshot[]
  onRemove: (id: string) => void
}

export function CompetitorCard({ id, name, websiteUrl, twitterHandle, snapshots, onRemove }: CompetitorCardProps) {
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
              <span className="text-xs font-sans text-text-secondary">@{twitterHandle}</span>
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
            <div className="space-y-2">
              <p className="text-xs font-sans text-text-tertiary uppercase tracking-widest">Recent posts</p>
              {recentPosts.slice(0, 3).map((post, i) => (
                <div key={i} className="flex items-start gap-2">
                  <p className="text-xs font-sans text-text-secondary flex-1 leading-relaxed">{post.excerpt}</p>
                  {post.url && (
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-text-tertiary hover:text-text-secondary shrink-0">
                      <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm font-sans text-text-tertiary">No data yet. First scan runs tonight.</p>
      )}
    </div>
  )
}
