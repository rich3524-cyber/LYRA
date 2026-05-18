'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarPost {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  mediaUrls: string[]
  aiGenerated: boolean
  socialAccount: { platform: string; name: string }
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

export function PostPreviewCard({ post, onSelect }: PostPreviewCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const platformColor = PLATFORM_COLORS[post.socialAccount.platform] ?? PLATFORM_COLORS['TWITTER']

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded bg-background-tertiary border border-background-border select-none flex items-start gap-1 p-1',
        isDragging && 'opacity-40 ring-1 ring-accent-silver'
      )}
    >
      {/* Drag handle — ONLY this element has DnD listeners */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing p-0.5 mt-0.5 text-text-tertiary hover:text-text-secondary shrink-0 transition-colors"
        aria-label="Drag to reschedule"
      >
        <GripVertical size={10} strokeWidth={1.5} />
      </button>

      {/* Clickable content area — opens detail panel */}
      <button
        type="button"
        className="flex-1 min-w-0 text-left"
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
              STATUS_COLORS[post.status] ?? 'bg-background-border text-text-tertiary'
            )}
          >
            {post.status.toLowerCase().replace(/_/g, ' ')}
          </span>
        </div>
        <p className="font-sans text-[12px] text-text-secondary leading-tight line-clamp-2">
          {post.content || <span className="text-text-tertiary italic">Media only</span>}
        </p>
      </button>
    </div>
  )
}
