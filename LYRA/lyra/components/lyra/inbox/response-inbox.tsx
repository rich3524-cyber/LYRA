'use client'
import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'
import { CommentCard } from './comment-card'
import { ReviewCard } from './review-card'

// Stable reference for the Done tab, where CommentCard is genuinely
// non-actionable and never calls onUpdate -- avoids passing a fresh arrow each
// render. Escalated now uses the real handleUpdate below (23 Jul 2026 fix) --
// escalated comments can be replied to or ignored, and need the local state
// update or they'd stay stuck showing under Escalated until a manual refresh.
const NOOP_UPDATE = () => {}
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { Platform } from '@prisma/client'
import { getPlatformShortLabel } from '@/lib/platform-labels'

// GET /api/comments (Task 3, this branch) merges Comment and Review rows into
// one list, each tagged with a `type` discriminant. The two row shapes differ
// (Comment.content/authorName are non-null; Review.text/authorName are
// nullable and Review adds `rating`), so this is a discriminated union rather
// than one shared interface -- CommentRow matches comment-card.tsx's
// (unexported) CommentData shape and ReviewRow matches review-card.tsx's
// (unexported) ReviewData shape structurally.
interface CommentRow {
  id:                string
  authorName:        string
  authorHandle?:     string | null
  content:           string
  sentiment?:        string | null
  status:            string
  aiDraftResponse:   string | null
  finalResponse:     string | null
  escalationReason?: string | null
  createdAt:         string
  socialAccount:     { platform: string; name: string }
  type:              'comment'
}

interface ReviewRow {
  id:                string
  authorName:        string | null
  text:              string | null
  rating:            number | null
  sentiment?:        string | null
  status:            string
  aiDraftResponse:   string | null
  finalResponse:     string | null
  escalationReason?: string | null
  createdAt:         string
  socialAccount:     { platform: string; name: string }
  type:              'review'
}

type CommentData = CommentRow | ReviewRow

function CountBadge({ count, variant }: { count: number; variant?: 'warning' | 'default' }) {
  if (count === 0) {
    return (
      <span className="font-mono text-[10px] text-text-tertiary ml-1">{count}</span>
    )
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-xs px-1.5 py-0',
        variant === 'warning'
          ? 'bg-status-warning/20 text-status-warning'
          : 'bg-background-hover'
      )}
    >
      {count}
    </Badge>
  )
}

export function ResponseInbox({
  workspaceId,
  aiResponseMode,
  plan,
}: {
  workspaceId:     string
  aiResponseMode:  'OFF' | 'DRAFT_APPROVE' | 'FULL'
  plan:            'STARTER' | 'PRO' | 'AGENCY'
}) {
  const [platformFilter, setPlatformFilter] = useState<string>('ALL')
  const [syncing, setSyncing] = useState(false)

  // useSWR replaces the previous fetch-on-mount effect. Comments are keyed on
  // workspaceId the same way the old effect's dependency array was, and
  // revalidateOnFocus (SWRConfig default, see swr-provider.tsx) means
  // tabbing back into the browser now refreshes the inbox for free, which
  // the old effect never did on its own.
  const {
    data: comments = [],
    isLoading: loading,
    error,
    mutate,
  } = useSWR<CommentData[]>(
    `/api/comments?workspaceId=${workspaceId}`,
    async (url: string) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error('Failed to load comments')
      const data: unknown = await r.json()
      if (!Array.isArray(data)) throw new Error('Unexpected response shape')
      return data as CommentData[]
    },
  )

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/comments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json() as { synced?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success(data.synced ? `${data.synced} new comment${data.synced !== 1 ? 's' : ''} synced.` : 'No new comments.')
      // Reload comments straight into the SWR cache (mutate with an explicit
      // value, no revalidation) rather than `mutate()`'s revalidate-via-fetcher
      // -- a failed reload here should silently keep showing the list from
      // before the sync, exactly like the original's plain `if (r2.ok)` check,
      // not surface the "Comments failed to load" error banner over data
      // that's still perfectly valid.
      try {
        const r2 = await fetch(`/api/comments?workspaceId=${workspaceId}`)
        if (r2.ok) {
          const d2 = await r2.json() as unknown
          if (Array.isArray(d2)) await mutate(d2 as CommentData[], false)
        }
      } catch {
        // Silently ignore -- keep showing the list from before the sync
      }
    } catch (err) {
      // Was a hardcoded "check your Facebook connection" regardless of what
      // actually failed or which platform was involved -- confirmed live
      // 2026-07-22 when a LinkedIn-related sync failure showed this same
      // Facebook-specific message, discarding whatever the real error was.
      // Show the real error text (thrown above from the backend's `error`
      // field) so an actual cause is visible instead of a misleading guess.
      toast.error(err instanceof Error ? err.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const platforms = [...new Set(comments.map(c => c.socialAccount.platform))]
  const filtered  = platformFilter === 'ALL'
    ? comments
    : comments.filter(c => c.socialAccount.platform === platformFilter)

  const pending   = filtered.filter(c => ['PENDING', 'AI_DRAFTED'].includes(c.status))
  const escalated = filtered.filter(c => c.status === 'ESCALATED')
  const responded = filtered.filter(c => c.status === 'RESPONDED')

  // Local-only cache patch (no revalidation) when a child CommentCard finishes
  // an action -- same as the original's setComments updater, just against the
  // SWR cache instead of local state so this list and any other reader of the
  // same `/api/comments?workspaceId=...` key stay in sync.
  const handleUpdate = useCallback((id: string, newStatus: string) => {
    mutate(
      (current) => current?.map(c => c.id === id ? { ...c, status: newStatus } : c),
      false,
    )
  }, [mutate])

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-status-error text-center py-6">Comments failed to load. Refresh to try again.</p>
      )}

      {/* Platform filter + sync */}
      <div className="flex items-center justify-between gap-3">
      <div className="h-7 flex items-center">
        {loading ? (
          <div className="h-7 w-48 rounded-full bg-background-secondary border border-background-border animate-pulse" />
        ) : platforms.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', ...platforms] as string[]).map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                aria-pressed={platformFilter === p}
                className={`text-xs px-3 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-silver focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary ${
                  platformFilter === p
                    ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                    : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                }`}
              >
                {p === 'ALL' ? 'All' : getPlatformShortLabel(p as Platform)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        aria-label="Sync comments from connected accounts"
        className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50 shrink-0"
      >
        <RefreshCw size={13} strokeWidth={1.5} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : 'Sync'}
      </button>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-background-secondary border border-background-border">
          <TabsTrigger value="pending" className="text-xs gap-2">
            Pending
            <CountBadge count={pending.length} />
          </TabsTrigger>
          <TabsTrigger value="escalated" className="text-xs gap-2">
            Escalated
            <CountBadge count={escalated.length} variant="warning" />
          </TabsTrigger>
          <TabsTrigger value="responded" className="text-xs gap-2">
            Done
            <CountBadge count={responded.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
            ))
          ) : pending.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-12">All caught up.</p>
          ) : (
            <AnimatePresence>
              {pending.map(c => (
                <motion.div
                  key={c.id}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  {c.type === 'review' ? (
                    <ReviewCard
                      review={c}
                      aiResponseMode={aiResponseMode}
                      plan={plan}
                      onUpdate={handleUpdate}
                    />
                  ) : (
                    <CommentCard
                      comment={c}
                      aiResponseMode={aiResponseMode}
                      plan={plan}
                      onUpdate={handleUpdate}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="escalated" className="space-y-3">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
            ))
          ) : escalated.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-12">No escalated comments.</p>
          ) : (
            <AnimatePresence>
              {escalated.map(c => (
                <motion.div
                  key={c.id}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  {c.type === 'review' ? (
                    <ReviewCard
                      review={c}
                      aiResponseMode={aiResponseMode}
                      plan={plan}
                      onUpdate={handleUpdate}
                    />
                  ) : (
                    <CommentCard
                      comment={c}
                      aiResponseMode={aiResponseMode}
                      plan={plan}
                      onUpdate={handleUpdate}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="responded" className="space-y-3">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
            ))
          ) : responded.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-12">No responses sent yet.</p>
          ) : (
            <AnimatePresence>
              {responded.map(c => (
                <motion.div
                  key={c.id}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  {c.type === 'review' ? (
                    <ReviewCard
                      review={c}
                      aiResponseMode={aiResponseMode}
                      plan={plan}
                      onUpdate={NOOP_UPDATE}
                    />
                  ) : (
                    <CommentCard
                      comment={c}
                      aiResponseMode={aiResponseMode}
                      plan={plan}
                      onUpdate={NOOP_UPDATE}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
