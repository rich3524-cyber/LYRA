'use client'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCheck, EyeOff, Sparkles, Loader2, Star } from 'lucide-react'
import type { Platform } from '@prisma/client'
import { getPlatformShortLabel } from '@/lib/platform-labels'
import { SENTIMENT_COLOURS, SENTIMENT_LABELS } from './sentiment'

// Mirrors comment-card.tsx's CommentData/CommentCard exactly, substituted for
// Review -- see prisma/schema.prisma's Review model for the field source of
// truth. Review differs from Comment in three ways that matter here:
//  - `text` (not `content`) and `authorName` are both nullable -- Google
//    Business reviews can be star-only with no written text, and Zernio
//    doesn't always resolve a reviewer's display name.
//  - `rating` (Int | null) has no Comment equivalent at all.
//  - there is no `authorHandle` field on Review.
interface ReviewData {
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
}

// Renders `rating` stars filled out of 5, using lucide's Star icon (matches
// this codebase's existing icon usage, e.g. comment-card.tsx's Sparkles/
// AlertTriangle) rather than literal '★'/'☆' characters, which render
// inconsistently across fonts/platforms. `rating: null` (a Google review can
// arrive without a star rating resolved) renders nothing rather than 0 or 5
// filled stars, either of which would misrepresent an actually-unknown value.
function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return null
  const clamped = Math.max(0, Math.min(5, rating))
  return (
    <span className="flex items-center gap-0.5" aria-label={`${clamped} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          strokeWidth={1.5}
          className={i < clamped ? 'fill-status-warning text-status-warning' : 'text-text-tertiary'}
        />
      ))}
    </span>
  )
}

export const ReviewCard = memo(function ReviewCard({
  review,
  onUpdate,
  aiResponseMode,
  plan,
}: {
  review:         ReviewData
  // Takes the review id rather than closing over it so parents can pass a
  // single stable callback (e.g. useCallback'd handleUpdate) instead of a new
  // inline arrow per row per render -- required for memo() below to actually
  // skip re-renders instead of seeing a changed prop on every parent update.
  onUpdate:       (reviewId: string, newStatus: string) => void
  aiResponseMode: 'OFF' | 'DRAFT_APPROVE' | 'FULL'
  plan:           'STARTER' | 'PRO' | 'AGENCY'
}) {
  const [draft, setDraft]     = useState(review.aiDraftResponse ?? '')
  const [generating, setGen]  = useState(false)
  const [sending, setSending] = useState(false)

  // Same reasoning as comment-card.tsx: escalated reviews can still be
  // replied to or ignored -- they were only kept out of AI drafting because
  // the AI itself declined (shouldEscalate), not because a human can't act
  // on them.
  const canReply        = review.status !== 'IGNORED' && review.status !== 'RESPONDED'
  const isEscalated      = review.status === 'ESCALATED'
  const showAiControls  = canReply && !isEscalated && plan !== 'STARTER' && aiResponseMode !== 'OFF'

  async function handleGenerate() {
    setGen(true)
    try {
      const res  = await fetch('/api/ai/respond-review', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reviewId: review.id }),
      })
      const data = await res.json()
      // Checked before touching anything -- a failed request (e.g. a 500) must
      // never overwrite `draft`, or it wipes out whatever reply the operator
      // had already typed by hand.
      if (!res.ok) {
        if (data.alreadyResolved) {
          // The generate call took long enough that a concurrent path (the
          // auto-responder worker, an MCP respond_to_item call, or another
          // human's manual Reply) claimed and resolved this review first --
          // the draft this call generated was never persisted. Move the card
          // to wherever it actually landed (data.status) instead of leaving
          // a stale Pending row that would just lose this same race again on
          // the next click.
          toast.error('This review was already handled elsewhere.')
          onUpdate(review.id, data.status ?? 'RESPONDED')
        } else {
          toast.error(data.error ?? 'Failed to generate response')
        }
        return
      }
      if (data.shouldEscalate) {
        toast.error(`Escalated: ${data.escalationReason}`)
        onUpdate(review.id, 'ESCALATED')
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
      const res  = await fetch(`/api/reviews/${review.id}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ response: draft }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.alreadyResolved) {
          // Same race as handleGenerate's equivalent branch above: the send
          // took long enough (or the card's local state was stale enough)
          // that a concurrent path -- the auto-responder worker, an MCP
          // respond_to_item call, or another human's manual Reply -- already
          // claimed and resolved this review first. Move the card to
          // wherever it actually landed instead of leaving a stale Pending
          // row that would just lose this same race again on the next click.
          toast.error('This review was already handled elsewhere.')
          onUpdate(review.id, data.status ?? 'RESPONDED')
        } else {
          toast.error(data.error ?? 'Failed to send reply')
        }
        return
      }
      toast.success('Reply sent.')
      onUpdate(review.id, 'RESPONDED')
    } catch {
      toast.error('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  async function handleEscalate() {
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'ESCALATED', isEscalated: true }),
      })
      if (!res.ok) { toast.error('Failed to escalate review'); return }
      toast.success('Escalated to team')
      onUpdate(review.id, 'ESCALATED')
    } catch {
      toast.error('Failed to escalate review')
    }
  }

  async function handleIgnore() {
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'IGNORED' }),
      })
      if (!res.ok) { toast.error('Failed to ignore review'); return }
      onUpdate(review.id, 'IGNORED')
    } catch {
      toast.error('Failed to ignore review')
    }
  }

  const sentimentClass = review.sentiment
    ? (SENTIMENT_COLOURS[review.sentiment] ?? 'text-text-secondary')
    : 'text-text-secondary'

  const authorInitial = review.authorName?.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="rounded-xl border border-background-border bg-background-secondary p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-background-hover border border-background-border-mid flex items-center justify-center text-xs font-medium text-text-primary shrink-0">
            {authorInitial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{review.authorName ?? 'Anonymous'}</p>
            <StarRating rating={review.rating} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {review.sentiment && (
            <span className={`text-xs font-medium ${sentimentClass}`}>
              {SENTIMENT_LABELS[review.sentiment ?? ''] ?? review.sentiment}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-background-hover border border-background-border-mid text-text-secondary font-mono">
            {getPlatformShortLabel(review.socialAccount.platform as Platform)}
          </span>
        </div>
      </div>

      {/* Review text -- can be null (star-only review, no written text) */}
      <p className="text-sm text-text-primary leading-relaxed">
        {review.text ?? <span className="text-text-tertiary italic">(No written review)</span>}
      </p>

      {/* Escalation context — shown above the reply box so a human knows why AI declined to draft one */}
      {isEscalated && (
        <p className="text-xs text-status-warning flex items-center gap-1.5">
          <AlertTriangle size={12} strokeWidth={1.5} />
          Escalated to team{review.escalationReason ? ` — ${review.escalationReason}` : ''}
        </p>
      )}

      {/* Response textarea — for any review that can still be replied to */}
      {canReply && (
        <div className="space-y-2">
          {showAiControls && (
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
            placeholder={
              showAiControls
                ? 'Generate or write a response.'
                : isEscalated
                ? 'AI declined to draft a reply here — write one manually.'
                : 'Write a reply.'
            }
            className="w-full rounded-lg bg-background-hover border border-background-border-mid px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-text-tertiary transition-colors"
          />
        </div>
      )}

      {/* Auto-sent response — shown in Done tab for FULL auto mode */}
      {review.status === 'RESPONDED' && review.finalResponse && (
        <div className="rounded-lg bg-background-hover border border-background-border-mid px-3 py-2 space-y-1">
          <span className="text-xs text-text-tertiary flex items-center gap-1">
            <Sparkles size={12} strokeWidth={1.5} /> Auto-sent
          </span>
          <p className="text-sm text-text-primary">{review.finalResponse}</p>
        </div>
      )}

      {/* Actions */}
      {canReply && (
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
              {showAiControls ? 'Approve & send' : 'Send reply'}
            </button>
          )}
          {showAiControls && (
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
          {!isEscalated && (
            <button
              onClick={handleEscalate}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-status-warning hover:bg-status-warning/10 transition-colors"
            >
              <AlertTriangle size={12} strokeWidth={1.5} /> Escalate
            </button>
          )}
          <button
            onClick={handleIgnore}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <EyeOff size={12} strokeWidth={1.5} /> Ignore
          </button>
        </div>
      )}

      {review.status === 'RESPONDED' && !review.finalResponse && (
        <p className="text-xs text-status-success flex items-center gap-1.5">
          <CheckCheck size={12} strokeWidth={1.5} /> Response sent
        </p>
      )}
    </div>
  )
})
