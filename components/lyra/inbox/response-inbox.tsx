'use client'

import { useState, useEffect } from 'react'
import { CommentCard } from './comment-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

export interface CommentData {
  id:                string
  authorName:        string
  authorHandle?:     string | null
  content:           string
  sentiment?:        string | null
  status:            string
  aiDraftResponse:   string | null
  finalResponse:     string | null
  escalationReason:  string | null
  platformCreatedAt: string
  createdAt:         string
  socialAccount:     { platform: string; name: string }
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok', TWITTER: 'X', GOOGLE_BUSINESS: 'Google Business',
}

interface Props {
  workspaceId:    string
  plan:           string
  aiResponseMode: string
}

export function ResponseInbox({ workspaceId, plan, aiResponseMode }: Props) {
  const [comments, setComments]           = useState<CommentData[]>([])
  const [loading, setLoading]             = useState(true)
  const [platformFilter, setPlatformFilter] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/comments?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((data: CommentData[]) => { setComments(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId])

  function handleUpdate(id: string, nextStatus: string) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: nextStatus } : c))
  }

  const filtered = platformFilter
    ? comments.filter(c => c.socialAccount.platform === platformFilter)
    : comments

  const pending   = filtered.filter(c => c.status === 'PENDING' || c.status === 'AI_DRAFTED' || c.status === 'AWAITING_APPROVAL')
  const escalated = filtered.filter(c => c.status === 'ESCALATED')
  const responded = filtered.filter(c => c.status === 'RESPONDED' || c.status === 'IGNORED')

  // Platforms that have at least one comment
  const activePlatforms = Array.from(new Set(comments.map(c => c.socialAccount.platform)))

  const skeletons = Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-28 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
  ))

  return (
    <div className="space-y-4">
      {/* Stats + platform filter row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-5 w-32 rounded bg-background-secondary animate-pulse" />
          ) : (
            <>
              <span className="font-mono text-sm text-text-secondary">
                {comments.filter(c => c.status === 'PENDING' || c.status === 'AI_DRAFTED').length} pending
              </span>
              {comments.filter(c => c.status === 'ESCALATED').length > 0 && (
                <>
                  <span className="text-background-border-mid">·</span>
                  <span className="font-mono text-sm text-status-warning">
                    {comments.filter(c => c.status === 'ESCALATED').length} escalated
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {activePlatforms.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setPlatformFilter(null)}
              className={`px-2.5 py-1 rounded-md font-sans text-xs transition-colors ${
                platformFilter === null
                  ? 'bg-background-tertiary border border-background-border-mid text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              All
            </button>
            {activePlatforms.map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(prev => prev === p ? null : p)}
                className={`px-2.5 py-1 rounded-md font-sans text-xs transition-colors ${
                  platformFilter === p
                    ? 'bg-background-tertiary border border-background-border-mid text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {PLATFORM_LABELS[p] ?? p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI mode notice for Starter */}
      {plan === 'STARTER' && (
        <div className="rounded-lg border border-background-border bg-background-secondary px-4 py-3">
          <p className="font-sans text-xs text-text-secondary">
            AI response generation is available on Pro and Agency plans. You can read comments and escalate or ignore them.
          </p>
        </div>
      )}

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-background-secondary border border-background-border">
          <TabsTrigger value="pending" className="font-sans text-xs gap-2">
            Pending
            {!loading && pending.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0 bg-background-hover text-text-secondary">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="escalated" className="font-sans text-xs gap-2">
            Escalated
            {!loading && escalated.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0 bg-status-warning/20 text-status-warning">
                {escalated.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="responded" className="font-sans text-xs">Done</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {loading ? skeletons : pending.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="font-sans text-sm text-text-secondary">Inbox clear.</p>
              <p className="font-sans text-xs text-text-tertiary">New comments appear here within 5 minutes.</p>
            </div>
          ) : (
            pending.map(c => (
              <CommentCard
                key={c.id}
                comment={c}
                plan={plan}
                aiResponseMode={aiResponseMode}
                onUpdate={handleUpdate}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="escalated" className="space-y-3">
          {loading ? skeletons : escalated.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-sans text-sm text-text-secondary">No escalated comments.</p>
            </div>
          ) : (
            escalated.map(c => (
              <CommentCard
                key={c.id}
                comment={c}
                plan={plan}
                aiResponseMode={aiResponseMode}
                onUpdate={handleUpdate}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="responded" className="space-y-3">
          {loading ? skeletons : responded.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-sans text-sm text-text-secondary">No responses sent yet.</p>
            </div>
          ) : (
            responded.map(c => (
              <CommentCard
                key={c.id}
                comment={c}
                plan={plan}
                aiResponseMode={aiResponseMode}
                onUpdate={handleUpdate}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
