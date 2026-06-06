'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, AlertTriangle, CheckCheck, EyeOff, Sparkles, Loader2, Send } from 'lucide-react'
import type { CommentData } from './response-inbox'

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
}

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  FACEBOOK: 2000, INSTAGRAM: 2200, LINKEDIN: 1250,
  GOOGLE_BUSINESS: 4096, TWITTER: 280, TIKTOK: 150,
}

const SENTIMENT_TOKENS: Record<string, string> = {
  POSITIVE: 'text-status-success',
  NEUTRAL:  'text-text-secondary',
  NEGATIVE: 'text-status-error',
  URGENT:   'text-status-warning',
}

// Platforms where LYRA can post a live reply via Graph API
const LIVE_REPLY_PLATFORMS = new Set(['FACEBOOK', 'INSTAGRAM'])

interface Props {
  comment:        CommentData
  plan:           string
  aiResponseMode: string
  onUpdate:       (id: string, nextStatus: string) => void
}

export function CommentCard({ comment, plan, aiResponseMode, onUpdate }: Props) {
  const [draft, setDraft]         = useState(comment.aiDraftResponse ?? '')
  const [generating, setGen]      = useState(false)
  const [approving, setApproving] = useState(false)

  const platform     = comment.socialAccount.platform
  const charLimit    = PLATFORM_CHAR_LIMITS[platform] ?? 280
  const canPostLive  = LIVE_REPLY_PLATFORMS.has(platform)
  const isStarterPlan = plan === 'STARTER'

  async function handleGenerate() {
    setGen(true)
    try {
      const res  = await fetch('/api/ai/respond', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ commentId: comment.id }),
      })
      const data = await res.json()
      if (data.shouldEscalate) {
        toast.error(`Escalated: ${data.escalationReason}`)
        onUpdate(comment.id, 'ESCALATED')
      } else {
        setDraft(data.response ?? '')
        toast.success('AI draft generated')
      }
    } catch {
      toast.error('Failed to generate response')
    } finally {
      setGen(false)
    }
  }

  async function handleApprove() {
    if (!draft.trim()) return
    setApproving(true)
    try {
      if (canPostLive) {
        // Post the reply live to the platform and mark as RESPONDED in the DB
        const res = await fetch(`/api/comments/${comment.id}/reply`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ response: draft.trim() }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Failed to send reply')
        }
        toast.success(`Reply posted to ${PLATFORM_LABELS[platform]}`)
      } else {
        // Platform not yet supported for live replies — log as manually sent
        await fetch(`/api/comments/${comment.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'RESPONDED', finalResponse: draft.trim(), respondedAt: new Date().toISOString() }),
        })
        toast.success('Logged as sent')
      }
      onUpdate(comment.id, 'RESPONDED')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply')
    } finally {
      setApproving(false)
    }
  }

  async function handleEscalate() {
    await fetch(`/api/comments/${comment.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'ESCALATED', isEscalated: true }),
    })
    toast('Escalated to team')
    onUpdate(comment.id, 'ESCALATED')
  }

  async function handleIgnore() {
    await fetch(`/api/comments/${comment.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'IGNORED' }),
    })
    onUpdate(comment.id, 'IGNORED')
  }

  const sentimentClass = comment.sentiment
    ? (SENTIMENT_TOKENS[comment.sentiment] ?? 'text-text-secondary')
    : ''

  const timestamp = formatDistanceToNow(new Date(comment.platformCreatedAt), { addSuffix: true })

  const isActionable = comment.status !== 'ESCALATED' && comment.status !== 'IGNORED' && comment.status !== 'RESPONDED'

  return (
    <div className="rounded-xl border border-background-border bg-background-secondary p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-background-hover border border-background-border-mid flex items-center justify-center font-sans text-xs font-medium text-text-primary shrink-0">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-sans text-sm font-medium text-text-primary truncate">{comment.authorName}</p>
            {comment.authorHandle && (
              <p className="font-sans text-xs text-text-tertiary truncate">{comment.authorHandle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {comment.sentiment && (
            <span className={`font-sans text-xs font-medium ${sentimentClass}`}>
              {comment.sentiment}
            </span>
          )}
          <span className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-background-hover border border-background-border-mid text-text-secondary">
            {PLATFORM_LABELS[platform] ?? platform}
          </span>
          <span className="font-sans text-xs text-text-tertiary">{timestamp}</span>
        </div>
      </div>

      {/* Comment content */}
      <p className="font-sans text-sm text-text-primary leading-relaxed">{comment.content}</p>

      {/* Escalation reason */}
      {comment.status === 'ESCALATED' && comment.escalationReason && (
        <p className="font-sans text-xs text-text-secondary bg-background-hover border border-background-border-mid rounded-lg px-3 py-2">
          {comment.escalationReason}
        </p>
      )}

      {/* Final response (Done tab) */}
      {comment.status === 'RESPONDED' && comment.finalResponse && (
        <div className="rounded-lg bg-background-hover border border-background-border px-3 py-2">
          <p className="font-sans text-xs text-text-tertiary mb-1">Sent response</p>
          <p className="font-sans text-sm text-text-secondary leading-relaxed">{comment.finalResponse}</p>
        </div>
      )}

      {/* AI draft textarea — only for actionable non-Starter items */}
      {isActionable && !isStarterPlan && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-sans text-xs text-text-tertiary flex items-center gap-1">
              <Sparkles size={11} strokeWidth={1.5} /> AI draft
            </span>
            <span className={`font-mono text-xs ${draft.length > charLimit ? 'text-status-error' : 'text-text-tertiary'}`}>
              {draft.length}/{charLimit}
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Generate or write a response."
            className="w-full rounded-lg bg-background-hover border border-background-border-mid px-3 py-2 font-sans text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent-silver transition-colors"
          />
        </div>
      )}

      {/* Action buttons */}
      {isActionable && (
        <div className="flex items-center gap-2 flex-wrap">
          {!isStarterPlan && (
            <>
              {!draft && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 font-sans text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-primary hover:border-accent-silver transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={12} strokeWidth={1.5} />}
                  Generate
                </button>
              )}
              {draft && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={approving || draft.length > charLimit}
                    className="inline-flex items-center gap-1.5 font-sans text-xs px-3 py-1.5 rounded-lg bg-status-success/10 border border-status-success/30 text-status-success hover:bg-status-success/20 transition-colors disabled:opacity-50"
                  >
                    {approving
                      ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                      : canPostLive
                        ? <Send size={12} strokeWidth={1.5} />
                        : <CheckCheck size={12} strokeWidth={1.5} />
                    }
                    {canPostLive ? 'Send reply' : 'Mark as sent'}
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 font-sans text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver transition-colors disabled:opacity-50"
                  >
                    <MessageSquare size={12} strokeWidth={1.5} /> Re-generate
                  </button>
                </>
              )}
            </>
          )}
          <button
            onClick={handleEscalate}
            className="inline-flex items-center gap-1.5 font-sans text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-status-warning hover:bg-status-warning/10 transition-colors"
          >
            <AlertTriangle size={12} strokeWidth={1.5} /> Escalate
          </button>
          <button
            onClick={handleIgnore}
            className="inline-flex items-center gap-1.5 font-sans text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-tertiary hover:text-text-secondary transition-colors"
            aria-label="Ignore comment"
          >
            <EyeOff size={12} strokeWidth={1.5} /> Ignore
          </button>
        </div>
      )}

      {/* Status badges */}
      {comment.status === 'ESCALATED' && (
        <p className="font-sans text-xs text-status-warning flex items-center gap-1.5">
          <AlertTriangle size={12} strokeWidth={1.5} /> Escalated to team
        </p>
      )}
      {comment.status === 'RESPONDED' && (
        <p className="font-sans text-xs text-status-success flex items-center gap-1.5">
          <CheckCheck size={12} strokeWidth={1.5} />
          {canPostLive ? 'Reply posted' : 'Logged as sent'}
        </p>
      )}
      {comment.status === 'IGNORED' && (
        <p className="font-sans text-xs text-text-tertiary flex items-center gap-1.5">
          <EyeOff size={12} strokeWidth={1.5} /> Ignored
        </p>
      )}
    </div>
  )
}
