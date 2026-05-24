'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CommentCard } from './comment-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CommentData {
  id:              string
  authorName:      string
  authorHandle?:   string | null
  content:         string
  sentiment?:      string | null
  status:          string
  aiDraftResponse: string | null
  finalResponse:   string | null
  createdAt:       string
  socialAccount:   { platform: string; name: string }
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
}

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
  const [comments, setComments]             = useState<CommentData[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState<string>('ALL')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/comments?workspaceId=${workspaceId}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load comments')
        return r.json()
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error('Unexpected response shape')
        setComments(data as CommentData[])
      })
      .catch(() => setError('Comments failed to load. Refresh to try again.'))
      .finally(() => setLoading(false))
  }, [workspaceId])

  const platforms = [...new Set(comments.map(c => c.socialAccount.platform))]
  const filtered  = platformFilter === 'ALL'
    ? comments
    : comments.filter(c => c.socialAccount.platform === platformFilter)

  const pending   = filtered.filter(c => ['PENDING', 'AI_DRAFTED', 'AWAITING_APPROVAL'].includes(c.status))
  const escalated = filtered.filter(c => c.status === 'ESCALATED')
  const responded = filtered.filter(c => c.status === 'RESPONDED')

  function handleUpdate(id: string, newStatus: string) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-status-error text-center py-6">{error}</p>
      )}

      {/* Platform filter — reserved height prevents layout shift */}
      <div className="h-7 flex items-center">
        {loading ? (
          <div className="h-7 w-48 rounded-full bg-background-secondary border border-background-border animate-pulse" />
        ) : platforms.length > 1 ? (
          <div className="flex items-center gap-2">
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
                {p === 'ALL' ? 'All' : (PLATFORM_LABELS[p] ?? p)}
              </button>
            ))}
          </div>
        ) : null}
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
            <p className="text-sm text-text-tertiary text-center py-12">All caught up.</p>
          ) : (
            <AnimatePresence>
              {pending.map(c => (
                <motion.div
                  key={c.id}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <CommentCard
                    comment={c}
                    aiResponseMode={aiResponseMode}
                    plan={plan}
                    onUpdate={(s) => handleUpdate(c.id, s)}
                  />
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
            <p className="text-sm text-text-tertiary text-center py-12">No escalated comments.</p>
          ) : (
            <AnimatePresence>
              {escalated.map(c => (
                <motion.div
                  key={c.id}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <CommentCard
                    comment={c}
                    aiResponseMode={aiResponseMode}
                    plan={plan}
                    onUpdate={() => {}}
                  />
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
            <p className="text-sm text-text-tertiary text-center py-12">No responses sent yet.</p>
          ) : (
            <AnimatePresence>
              {responded.map(c => (
                <motion.div
                  key={c.id}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <CommentCard
                    comment={c}
                    aiResponseMode={aiResponseMode}
                    plan={plan}
                    onUpdate={() => {}}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
