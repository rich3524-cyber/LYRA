'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Draft {
  id: string
  content: string
  createdAt: string
  socialAccount: { platform: string; name: string }
}

const PLATFORM_SHORT: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
}

export function DraftList({ workspaceId }: { workspaceId: string }) {
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/posts?workspaceId=${workspaceId}&status=DRAFT`)
      .then((r) => r.json())
      .then((data: Draft[]) => { setDrafts(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => {
    load()
    window.addEventListener('draft-saved', load)
    return () => window.removeEventListener('draft-saved', load)
  }, [load])

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/posts/${id}`, { method: 'DELETE' })
      setDrafts((prev) => prev.filter((d) => d.id !== id))
      toast.success('Draft deleted')
    } catch {
      toast.error('Failed to delete draft')
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
        ))}
      </div>
    )
  }

  if (drafts.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="font-sans text-xs uppercase tracking-wider text-text-tertiary">Saved drafts</p>
      <div className="space-y-2">
        {drafts.map((d) => (
          <div
            key={d.id}
            className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-accent-silver">
                  {PLATFORM_SHORT[d.socialAccount.platform] ?? d.socialAccount.platform}
                </span>
                <span className="font-sans text-xs text-text-tertiary">
                  {format(new Date(d.createdAt), 'MMM d')}
                </span>
              </div>
              <p className="font-sans text-sm text-text-secondary truncate">
                {d.content.length > 80 ? `${d.content.slice(0, 80)}…` : d.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(d.id)}
              aria-label="Delete draft"
              className="shrink-0 text-text-tertiary hover:text-status-error transition-colors mt-0.5"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
