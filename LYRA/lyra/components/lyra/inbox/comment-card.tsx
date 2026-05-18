'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, AlertTriangle, CheckCheck, EyeOff, Sparkles, Loader2 } from 'lucide-react'

interface CommentData {
  id:              string
  authorName:      string
  authorHandle?:   string | null
  content:         string
  sentiment?:      string | null
  status:          string
  aiDraftResponse: string | null
  createdAt:       string
  socialAccount:   { platform: string; name: string }
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'FB', INSTAGRAM: 'IG', LINKEDIN: 'LI',
  TIKTOK: 'TT', TWITTER: 'X', GOOGLE_BUSINESS: 'GBP',
}

const SENTIMENT_COLOURS: Record<string, string> = {
  POSITIVE: 'text-emerald-400',
  NEUTRAL:  'text-[#888]',
  NEGATIVE: 'text-red-400',
  URGENT:   'text-amber-400',
}

export function CommentCard({ comment, onUpdate }: { comment: CommentData; onUpdate: () => void }) {
  const [draft, setDraft]       = useState(comment.aiDraftResponse ?? '')
  const [generating, setGen]    = useState(false)
  const [approving, setApproving] = useState(false)

  async function handleGenerate() {
    setGen(true)
    try {
      const res = await fetch('/api/ai/respond', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ commentId: comment.id }),
      })
      const data = await res.json()
      if (data.shouldEscalate) {
        toast.error(`Escalated: ${data.escalationReason}`)
        onUpdate()
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
      await fetch(`/api/comments/${comment.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'RESPONDED', finalResponse: draft, respondedAt: new Date().toISOString() }),
      })
      toast.success('Response marked as sent')
      onUpdate()
    } catch {
      toast.error('Failed to update comment')
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
    onUpdate()
  }

  async function handleIgnore() {
    await fetch(`/api/comments/${comment.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'IGNORED' }),
    })
    onUpdate()
  }

  const sentimentClass = comment.sentiment ? (SENTIMENT_COLOURS[comment.sentiment] ?? 'text-[#888]') : 'text-[#888]'

  return (
    <div className="rounded-xl border border-[#222] bg-[#0f0f0f] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-xs font-medium text-[#e2e2e2] shrink-0">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e2e2e2] truncate">{comment.authorName}</p>
            {comment.authorHandle && (
              <p className="text-xs text-[#555] truncate">{comment.authorHandle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {comment.sentiment && (
            <span className={`text-xs font-medium ${sentimentClass}`}>{comment.sentiment}</span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-[#888] font-mono">
            {PLATFORM_LABELS[comment.socialAccount.platform] ?? comment.socialAccount.platform}
          </span>
        </div>
      </div>

      {/* Comment content */}
      <p className="text-sm text-[#ccc] leading-relaxed">{comment.content}</p>

      {/* AI draft */}
      {comment.status !== 'ESCALATED' && comment.status !== 'IGNORED' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#555] flex items-center gap-1">
              <Sparkles size={11} /> AI draft
            </span>
            <span className="text-xs text-[#555]">{draft.length}/280</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Generate or write a response…"
            className="w-full rounded-lg bg-[#1a1a1a] border border-[#333] px-3 py-2 text-sm text-[#e2e2e2] placeholder:text-[#444] resize-none focus:outline-none focus:border-[#555] transition-colors"
          />
        </div>
      )}

      {/* Actions */}
      {comment.status !== 'ESCALATED' && comment.status !== 'IGNORED' && comment.status !== 'RESPONDED' && (
        <div className="flex items-center gap-2 flex-wrap">
          {!draft && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#e2e2e2] hover:border-[#555] transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Generate
            </button>
          )}
          {draft && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {approving ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
              Approve &amp; send
            </button>
          )}
          {!draft && generating && null}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#888] hover:text-[#e2e2e2] hover:border-[#555] transition-colors disabled:opacity-50 ${!draft ? 'hidden' : ''}`}
          >
            <MessageSquare size={12} /> Re-generate
          </button>
          <button
            onClick={handleEscalate}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <AlertTriangle size={12} /> Escalate
          </button>
          <button
            onClick={handleIgnore}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#555] hover:text-[#888] transition-colors"
          >
            <EyeOff size={12} /> Ignore
          </button>
        </div>
      )}

      {comment.status === 'ESCALATED' && (
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Escalated to team
        </p>
      )}
      {comment.status === 'RESPONDED' && (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCheck size={12} /> Response sent
        </p>
      )}
    </div>
  )
}
