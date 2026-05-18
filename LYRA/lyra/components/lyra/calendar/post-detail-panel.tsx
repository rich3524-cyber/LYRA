'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Trash2, ExternalLink, CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  CalendarPost,
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

interface Props {
  post: CalendarPost | null
  workspaceId: string
  onClose: () => void
  onDeleted: (id: string) => void
  onUpdated: (updated: CalendarPost) => void
}

export function PostDetailPanel({ post, workspaceId, onClose, onDeleted, onUpdated }: Props) {
  const [deleting, setDeleting]             = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const shouldReduceMotion                  = useReducedMotion()

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

  const date          = post?.scheduledAt
  const platformColor = post ? (PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']) : PLATFORM_COLORS['TWITTER']
  const nextStatuses  = post ? (NEXT_STATUSES[post.status] ?? []) : []

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
