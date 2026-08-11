'use client'

import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PostBoost {
  id: string
  budget: number
  durationDays: number
  audience: string
  status: string
  adCampaignId: string
  endsAt: string
  startedAt: string
}

export interface CalendarPost {
  id: string
  authorId: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformPostId: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  failureReason: string | null
  requiresMedia: boolean
  // Derived server-side in GET /api/posts from the same rule the SLA cron
  // uses, so the badge and the alert can never disagree. Optional because
  // other producers of this shape (e.g. optimistic client updates) don't set it.
  approvalOverdue?: boolean
  socialAccount: { platform: string; name: string; platformId: string; adAccountId: string | null }
  boost: PostBoost | null
}

export const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK:        'FB',
  INSTAGRAM:       'IG',
  LINKEDIN:        'LI',
  TIKTOK:          'TT',
  TWITTER:         'X',
  GOOGLE_BUSINESS: 'GBP',
  YOUTUBE:         'YT',
  PINTEREST:       'PIN',
  THREADS:         'TH',
  BLUESKY:         'BSky',
}

// Platform brand colours — inline styles are intentional here (external brand identities, not LYRA's design system)
export const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK:        '#1877F2',
  INSTAGRAM:       '#C13584',
  LINKEDIN:        '#0A66C2',
  TIKTOK:          '#FF0050',
  TWITTER:         '#888888',
  GOOGLE_BUSINESS: '#4285F4',
  YOUTUBE:         '#FF0000',
  PINTEREST:       '#E60023',
  THREADS:         '#888888',
  BLUESKY:         '#0085FF',
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT:            'bg-background-border-mid text-text-tertiary',
  SCHEDULED:        'bg-status-info/20 text-status-info',
  PUBLISHED:        'bg-status-success/20 text-status-success',
  FAILED:           'bg-status-error/20 text-status-error',
  PENDING_APPROVAL: 'bg-status-warning/20 text-status-warning',
  CANCELLED:        'bg-background-border-mid text-text-tertiary',
}

interface PostPreviewCardProps {
  post: CalendarPost
  onSelect: (post: CalendarPost) => void
}

export const PostPreviewCard = memo(function PostPreviewCard({ post, onSelect }: PostPreviewCardProps) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const platformColor  = PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']
  const isAwaitingMedia = (post.status === 'DRAFT' || post.status === 'APPROVED') && post.requiresMedia && post.mediaUrls.length === 0
  // Takes the same badge slot as "awaiting media": both answer "why is this
  // post not moving?", and a post can only be in one of the two states
  // (awaiting media applies to DRAFT/APPROVED, overdue only to PENDING_APPROVAL).
  const isApprovalOverdue = post.approvalOverdue === true

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      className={cn(
        'rounded bg-background-tertiary border border-background-border select-none flex items-start gap-1 p-1 cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40 ring-1 ring-accent-silver'
      )}
    >
      {/* Drag handle icon is now purely a visual affordance hint -- the whole
          card is draggable (listeners are on the root div above), not just
          this icon. Confirmed live 2026-07-22: a dedicated ~10px icon as the
          ONLY draggable target was effectively undiscoverable -- Richard
          didn't notice it existed at all when looking for drag-to-reschedule.
          The sensor's 8px activation distance (content-calendar.tsx) already
          exists specifically so a plain click still reaches the button below
          without being hijacked as a drag. `attributes` (which sets
          tabIndex/role for dnd-kit's keyboard support) is deliberately not
          spread here -- only PointerSensor is configured, so making this div
          a redundant keyboard tab stop would add noise with no function. */}
      <GripVertical
        size={10}
        strokeWidth={1.5}
        aria-hidden="true"
        className="p-0.5 mt-0.5 text-text-tertiary shrink-0"
      />

      {/* Clickable content area — opens detail panel */}
      <button
        type="button"
        className="flex-1 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background-tertiary"
        onClick={() => onSelect(post)}
        aria-label={`Open post details — ${PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}, ${post.status.toLowerCase().replace(/_/g, ' ')}`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1">
            <span
              className="shrink-0 rounded-full"
              style={{ width: 6, height: 6, backgroundColor: platformColor }}
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] text-text-tertiary">
              {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
            </span>
          </div>
          <span
            className={cn(
              'font-sans text-[10px] uppercase tracking-wide px-1 rounded-full',
              isAwaitingMedia || isApprovalOverdue
                ? 'bg-status-warning/20 text-status-warning'
                : STATUS_COLORS[post.status] ?? 'bg-background-border text-text-tertiary'
            )}
            title={
              post.status === 'FAILED' && post.failureReason
                ? post.failureReason
                : isApprovalOverdue
                  ? 'This post has been waiting for approval past its deadline.'
                  : undefined
            }
          >
            {isAwaitingMedia
              ? 'awaiting media'
              : isApprovalOverdue
                ? 'approval overdue'
                : post.status.toLowerCase().replace(/_/g, ' ')}
          </span>
        </div>
        <p className="font-sans text-[12px] text-text-secondary leading-tight line-clamp-2">
          {post.content || <span className="text-text-tertiary italic">Media only</span>}
        </p>
        {post.status === 'FAILED' && post.failureReason && (
          <p className="font-sans text-[10px] text-status-error leading-tight line-clamp-2 mt-0.5">
            {post.failureReason}
          </p>
        )}
      </button>
    </div>
  )
})
