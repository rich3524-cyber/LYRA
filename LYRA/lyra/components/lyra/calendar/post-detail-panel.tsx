'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Trash2, ExternalLink, CalendarIcon, Loader2, Zap } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  CalendarPost,
  PostBoost,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  STATUS_COLORS,
} from './post-preview-card'

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED:         'Approved',
  SCHEDULED:        'Scheduled',
  PUBLISHING:       'Publishing',
  PUBLISHED:        'Published',
  FAILED:           'Failed',
  CANCELLED:        'Cancelled',
}

const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
  DRAFT:      [{ value: 'SCHEDULED', label: 'Mark as scheduled' }],
  SCHEDULED:  [
    { value: 'DRAFT',     label: 'Move back to draft' },
    { value: 'CANCELLED', label: 'Cancel post' },
  ],
  FAILED:     [{ value: 'DRAFT', label: 'Move back to draft' }],
  CANCELLED:  [{ value: 'DRAFT', label: 'Move back to draft' }],
}

const BUDGET_OPTIONS = [1000, 2500, 5000, 10000] // cents
const DURATION_OPTIONS = [3, 7, 14, 30]
const AUDIENCE_OPTIONS: { value: 'followers' | 'followers_lookalike' | 'broad'; label: string }[] = [
  { value: 'followers',           label: 'Page followers' },
  { value: 'followers_lookalike', label: 'Followers + similar' },
  { value: 'broad',               label: 'Broad reach' },
]

function formatBudget(cents: number) {
  return `$${cents / 100}`
}

function daysLeft(endsAt: string) {
  return Math.max(0, differenceInDays(new Date(endsAt), new Date()))
}

interface Props {
  post: CalendarPost | null
  workspaceId: string
  plan: 'STARTER' | 'PRO' | 'AGENCY'
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (updated: CalendarPost) => void
}

export function PostDetailPanel({ post, workspaceId, plan, onClose, onDeleted, onUpdated }: Props) {
  const [deleting, setDeleting]             = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [boosting, setBoosting]             = useState(false)
  const [cancelling, setCancelling]         = useState(false)
  const [selectedBudget, setSelectedBudget]     = useState(2500)
  const [selectedDuration, setSelectedDuration] = useState(7)
  const [selectedAudience, setSelectedAudience] = useState<'followers' | 'followers_lookalike' | 'broad'>('followers')
  const [boostError, setBoostError]         = useState<string | null>(null)
  const [reach, setReach]                   = useState<number | null>(null)
  const shouldReduceMotion                  = useReducedMotion()

  useEffect(() => {
    setBoostError(null)
    setSelectedBudget(2500)
    setSelectedDuration(7)
    setSelectedAudience('followers')
    setReach(null)
  }, [post?.id])

  useEffect(() => {
    if (!post?.boost || post.boost.status !== 'ACTIVE') return
    const ctrl = new AbortController()
    fetch(`/api/posts/${post.id}/boost/reach`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { reached?: number; error?: string }) => {
        if (d.error) return
        setReach(d.reached ?? null)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [post?.id, post?.boost?.status])

  async function handleDelete() {
    if (!post) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Post deleted')
      onDeleted(post.id)
      onClose()
    } catch {
      toast.error('Failed to delete post')
    } finally {
      setDeleting(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!post) return
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Update failed')
      const updated = await res.json() as CalendarPost
      toast.success('Status updated')
      onUpdated(updated)
    } catch {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleBoost() {
    if (!post) return
    setBoostError(null)
    setBoosting(true)
    try {
      const res = await fetch(`/api/posts/${post.id}/boost`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          budget:      selectedBudget,
          durationDays: selectedDuration,
          audience:    selectedAudience,
        }),
      })
      const data = await res.json() as PostBoost & { error?: string }
      if (!res.ok) {
        setBoostError(data.error ?? 'Boost failed')
        return
      }
      toast.success('Boost started')
      onUpdated({ ...post, boost: data })
    } catch {
      setBoostError('Boost failed. Check your connection and try again.')
    } finally {
      setBoosting(false)
    }
  }

  async function handleCancelBoost() {
    if (!post) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/posts/${post.id}/boost`, { method: 'DELETE' })
      const data = await res.json() as PostBoost & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to cancel boost')
        return
      }
      toast.success('Boost cancelled')
      onUpdated({ ...post, boost: data })
    } catch {
      toast.error('Failed to cancel boost')
    } finally {
      setCancelling(false)
    }
  }

  const date          = post?.scheduledAt
  const platformColor = post ? (PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']) : PLATFORM_COLORS['TWITTER']
  const nextStatuses  = post ? (NEXT_STATUSES[post.status] ?? []) : []

  const canBoost = post &&
    post.status === 'PUBLISHED' &&
    post.platformPostId &&
    (post.socialAccount.platform === 'FACEBOOK' || post.socialAccount.platform === 'INSTAGRAM') &&
    plan !== 'STARTER'

  const boost = post?.boost ?? null
  const boostState: 'none' | 'active' | 'ended' = !boost
    ? 'none'
    : boost.status === 'ACTIVE'
      ? 'active'
      : 'ended'

  return (
    <AnimatePresence>
      {post && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-40 bg-background-primary/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Slide-in panel */}
          <motion.div
            key="panel"
            initial={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={shouldReduceMotion ? { duration: 0.15 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-background-secondary border-l border-background-border flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Post details"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-border">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="rounded-full shrink-0"
                  style={{ width: 8, height: 8, backgroundColor: platformColor }}
                  aria-hidden="true"
                />
                <span className="font-sans text-xs text-text-secondary truncate">
                  {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
                  {' · '}
                  {post.socialAccount.name}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="flex items-center justify-center min-h-[44px] min-w-[44px] text-text-tertiary hover:text-text-secondary transition-colors shrink-0 ml-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary rounded-md"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Status row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'font-sans text-xs px-2 py-0.5 rounded-md font-medium',
                    STATUS_COLORS[post.status] ?? 'bg-background-hover text-text-tertiary'
                  )}
                >
                  {STATUS_LABEL[post.status] ?? post.status}
                </span>
                {post.aiGenerated && (
                  <span className="font-sans text-[10px] text-text-tertiary px-2 py-0.5 rounded-md bg-background-hover border border-background-border uppercase tracking-wide">
                    AI
                  </span>
                )}
              </div>

              {/* Full content */}
              <div className="space-y-1.5">
                <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                  Content
                </p>
                <p className="font-sans text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {post.content || <span className="text-text-tertiary italic">No content</span>}
                </p>
              </div>

              {/* Date */}
              {date && (
                <div className="flex items-center gap-2">
                  <CalendarIcon size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
                  <span className="font-mono text-xs text-text-secondary">
                    {format(new Date(date), "MMM d, yyyy '·' h:mm a")}
                  </span>
                </div>
              )}

              {/* Media count */}
              {post.mediaUrls.length > 0 && (
                <p className="font-sans text-xs text-text-tertiary">
                  {post.mediaUrls.length} media {post.mediaUrls.length === 1 ? 'file' : 'files'} attached
                </p>
              )}

              {/* Status transition actions */}
              {nextStatuses.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                    Actions
                  </p>
                  {nextStatuses.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleStatusChange(value)}
                      disabled={updatingStatus}
                      className="inline-flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg border border-background-border font-sans text-xs text-text-secondary hover:border-background-border-mid hover:text-text-primary transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary"
                    >
                      {updatingStatus && <Loader2 size={10} strokeWidth={1.5} className="animate-spin shrink-0" />}
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* ── Boost section ── */}
              {canBoost && (
                <div className="pt-1">
                  <div className="bg-background-tertiary border border-background-border rounded-xl p-4 space-y-3">

                    {/* State 1: No boost yet */}
                    {boostState === 'none' && (
                      <>
                        <p className="font-sans text-[11px] font-medium text-text-secondary uppercase tracking-[0.1em]">
                          Boost this post
                        </p>

                        {/* No ad account */}
                        {!post.socialAccount.adAccountId ? (
                          <p className="font-sans text-xs text-text-tertiary">
                            Connect a Facebook Ad Account to enable boosting.{' '}
                            <a
                              href="https://business.facebook.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors"
                            >
                              Open Facebook Business Manager
                            </a>
                          </p>
                        ) : (
                          <>
                            {/* Budget chips */}
                            <div className="space-y-1.5">
                              <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Budget</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {BUDGET_OPTIONS.map((b) => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => setSelectedBudget(b)}
                                    className={cn(
                                      'font-sans text-[11px] px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary',
                                      selectedBudget === b
                                        ? 'bg-background-hover border-accent-silver text-text-primary'
                                        : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                                    )}
                                  >
                                    {formatBudget(b)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Duration chips */}
                            <div className="space-y-1.5">
                              <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Duration</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {DURATION_OPTIONS.map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => setSelectedDuration(d)}
                                    className={cn(
                                      'font-sans text-[11px] px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary',
                                      selectedDuration === d
                                        ? 'bg-background-hover border-accent-silver text-text-primary'
                                        : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                                    )}
                                  >
                                    {d} days
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Audience chips */}
                            <div className="space-y-1.5">
                              <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Audience</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {AUDIENCE_OPTIONS.map(({ value, label }) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => setSelectedAudience(value)}
                                    className={cn(
                                      'font-sans text-[11px] px-2 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary',
                                      selectedAudience === value
                                        ? 'bg-background-hover border-accent-silver text-text-primary'
                                        : 'bg-background-secondary border-background-border text-text-secondary hover:border-background-border-mid'
                                    )}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {boostError && (
                              <p className="font-sans text-xs text-status-error">{boostError}</p>
                            )}

                            <button
                              type="button"
                              onClick={handleBoost}
                              disabled={boosting}
                              className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
                            >
                              {boosting
                                ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                                : <Zap size={12} strokeWidth={1.5} />
                              }
                              {boosting ? 'Starting boost…' : `Boost for ${formatBudget(selectedBudget)} · ${selectedDuration} days`}
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {/* State 2: Active boost */}
                    {boostState === 'active' && boost && (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="font-sans text-[11px] font-medium text-text-secondary uppercase tracking-[0.1em]">Boost active</p>
                          <span className="font-sans text-[10px] text-status-success bg-status-success/10 border border-status-success/20 rounded-full px-2 py-0.5">
                            Live
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: formatBudget(boost.budget), label: 'Budget' },
                            { value: String(daysLeft(boost.endsAt)), label: 'Days left' },
                            { value: reach !== null ? String(reach) : '—', label: 'Reached' },
                          ].map(({ value, label }) => (
                            <div key={label} className="bg-background-secondary border border-background-border rounded-lg p-2 text-center">
                              <p className="font-mono text-sm text-text-primary">{value}</p>
                              <p className="font-sans text-[10px] text-text-tertiary mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        <p className="font-sans text-[10px] text-text-tertiary">
                          {AUDIENCE_OPTIONS.find((a) => a.value === boost.audience)?.label ?? boost.audience}
                          {' · ends '}
                          {format(new Date(boost.endsAt), 'MMM d, yyyy')}
                        </p>

                        <button
                          type="button"
                          onClick={handleCancelBoost}
                          disabled={cancelling}
                          className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-background-border-mid text-text-secondary font-sans text-xs transition-colors hover:border-status-error hover:text-status-error disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
                        >
                          {cancelling && <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />}
                          {cancelling ? 'Cancelling…' : 'Cancel boost'}
                        </button>
                      </>
                    )}

                    {/* State 3: Ended/Cancelled boost */}
                    {boostState === 'ended' && boost && (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Previous boost</p>
                          <span className="font-sans text-[10px] text-text-tertiary bg-background-hover border border-background-border rounded-full px-2 py-0.5">
                            {boost.status === 'CANCELLED' ? 'Cancelled' : 'Ended'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: formatBudget(boost.budget), label: 'Spent' },
                            { value: String(boost.durationDays), label: 'Days ran' },
                            { value: '—', label: 'Reached' },
                          ].map(({ value, label }) => (
                            <div key={label} className="bg-background-secondary border border-background-border rounded-lg p-2 text-center">
                              <p className="font-mono text-sm text-text-secondary">{value}</p>
                              <p className="font-sans text-[10px] text-text-tertiary mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        {boostError && (
                          <p className="font-sans text-xs text-status-error">{boostError}</p>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setBoostError(null)
                            onUpdated({ ...post, boost: null })
                          }}
                          className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
                        >
                          <Zap size={12} strokeWidth={1.5} />
                          Boost again
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-background-border flex items-center justify-between">
              <a
                href={`/workspace/${workspaceId}/compose`}
                className="inline-flex items-center gap-1.5 min-h-[44px] font-sans text-xs text-text-tertiary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary rounded-md px-1"
              >
                <ExternalLink size={12} strokeWidth={1.5} />
                Edit in Composer
              </a>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 min-h-[44px] font-sans text-xs text-status-error hover:opacity-80 transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary rounded-md px-1"
              >
                {deleting ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Trash2 size={12} strokeWidth={1.5} />}
                {deleting ? 'Deleting…' : 'Delete post'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
