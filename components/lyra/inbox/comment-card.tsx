'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCheck, EyeOff, Sparkles, Loader2 } from 'lucide-react'

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

const SENTIMENT_COLOURS: Record<string, string> = {
  POSITIVE: 'text-status-success',
  NEUTRAL:  'text-text-secondary',
  NEGATIVE: 'text-status-error',
  URGENT:   'text-status-warning',
}

const SENTIMENT_LABELS: Record<string, string> = {
  POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Negative', URGENT: 'Urgent',
}

export function CommentCard({
  comment,
  onUpdate,
  aiResponseMode,
  plan,
}: {
  comment:        CommentData
  onUpdate:       (newStatus: string) => void
  aiResponseMode: 'OFF' | 'DRAFT_APPROVE' | 'FULL'
  plan:           'STARTER' | 'PRO' | 'AGENCY'
}) {
  const [draft, setDraft]     = useState(comment.aiDraftResponse ?? '')
  const [generating, setGen]  = useState(false)
  const [sending, setSending] = useState(false)

  const showAi       = plan !== 'STARTER' && aiResponseMode !== 'OFF'
  const isActionable = comment.status !== 'ESCALATED' && comment.status !== 'IGNORED' && comment.status !== 'RESPONDED'

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
        onUpdate('ESCALATED')
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

  async function handleSend() {
    if (!draft.trim()) return
    setSending(true)
    try {
      const res  = await fetch(`/api/comments/${comment.id}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response: draft }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to send reply')
        return
      }
      toast.success('Reply sent.')
      onUpdate('RESPONDED')
    } catch {
      toast.error('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  async function handleEscalate() {
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'ESCALATED', isEscalated: true }),
      })
      if (!res.ok) { toast.error('Failed to escalate comment'); return }
      toast.success('Escalated to team')
      onUpdate('ESCALATED')
    } catch {
      toast.error('Failed to escalate comment')
    }
  }

  async function handleIgnore() {
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'IGNORED' }),
      })
      if (!res.ok) { toast.error('Failed to ignore comment'); return }
      onUpdate('IGNORED')
    } catch {
      toast.error('Failed to ignore comment')
    }
  }

  const sentimentClass = comment.sentiment
    ? (SENTIMENT_COLOURS[comment.sentiment] ?? 'text-text-secondary')
    : 'text-text-secondary'

  return (
    <div className="rounded-xl border border-background-border bg-background-secondary p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-background-hover border border-background-border-mid flex items-center justify-center text-xs font-medium text-text-primary shrink-0">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{comment.authorName}</p>
            {comment.authorHandle && (
              <p className="text-xs text-text-tertiary truncate">{comment.authorHandle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {comment.sentiment && (
            <span className={`text-xs font-medium ${sentimentClass}`}>
              {SENTIMENT_LABELS[comment.sentiment ?? ''] ?? comment.sentiment}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-background-hover border border-background-border-mid text-text-secondary font-mono">
            {PLATFORM_LABELS[comment.socialAccount.platform] ?? comment.socialAccount.platform}
          </span>
        </div>
      </div>

      {/* Comment content */}
      <p className="text-sm text-text-primary leading-relaxed">{comment.content}</p>

      {/* Response textarea — only for actionable comments */}
      {isActionable && (
        <div className="space-y-2">
          {showAi && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary flex items-center gap-1">
                <Sparkles size={12} strokeWidth={1.5} /> AI draft
              </span>
              <span className="text-xs text-text-tertiary">{draft.length}/280</span>
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={showAi ? 'Generate or write a response.' : 'Write a reply.'}
            className="w-full rounded-lg bg-background-hover border border-background-border-mid px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-text-tertiary transition-colors"
          />
        </div>
      )}

      {/* Auto-sent response — shown in Done tab for FULL auto mode */}
      {comment.status === 'RESPONDED' && comment.finalResponse && (
        <div className="rounded-lg bg-background-hover border border-background-border-mid px-3 py-2 space-y-1">
          <span className="text-xs text-text-tertiary flex items-center gap-1">
            <Sparkles size={12} strokeWidth={1.5} /> Auto-sent
          </span>
          <p className="text-sm text-text-primary">{comment.finalResponse}</p>
        </div>
      )}

      {/* Actions */}
      {isActionable && (
        <div className="flex items-center gap-2 flex-wrap">
          {draft.trim() && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-status-success/10 border border-status-success/30 text-status-success hover:bg-status-success/20 transition-colors disabled:opacity-50"
            >
              {sending
                ? <Loader2 size={12} className="animate-spin" />
                : <CheckCheck size={12} strokeWidth={1.5} />}
              {showAi ? 'Approve & send' : 'Send reply'}
            </button>
          )}
          {showAi && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-text-tertiary transition-colors disabled:opacity-50"
            >
              {generating
                ? <Loader2 size={12} className="animate-spin" />
                : <Sparkles size={12} strokeWidth={1.5} />}
              {draft ? 'Re-generate' : 'Generate'}
            </button>
          )}
          <button
            onClick={handleEscalate}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-status-warning hover:bg-status-warning/10 transition-colors"
          >
            <AlertTriangle size={12} strokeWidth={1.5} /> Escalate
          </button>
          <button
            onClick={handleIgnore}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <EyeOff size={12} strokeWidth={1.5} /> Ignore
          </button>
        </div>
      )}

      {comment.status === 'ESCALATED' && (
        <p className="text-xs text-status-warning flex items-center gap-1.5">
          <AlertTriangle size={12} strokeWidth={1.5} /> Escalated to team
        </p>
      )}
      {comment.status === 'RESPONDED' && !comment.finalResponse && (
        <p className="text-xs text-status-success flex items-center gap-1.5">
          <CheckCheck size={12} strokeWidth={1.5} /> Response sent
        </p>
      )}
    </div>
  )
}
