'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
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

// Platform brand colors — used as inline styles (external brand identities)
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT:            'bg-background-border-mid text-text-tertiary',
  SCHEDULED:        'bg-status-info/20 text-status-info',
  PUBLISHED:        'bg-status-success/20 text-status-success',
  FAILED:           'bg-status-error/20 text-status-error',
  PENDING_APPROVAL: 'bg-status-warning/20 text-status-warning',
}

interface PostPreviewCardProps {
  post: CalendarPost
}

export function PostPreviewCard({ post }: PostPreviewCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const platformColor = PLATFORM_COLORS[post.socialAccount.platform] ?? '#555555'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'rounded p-1.5 bg-background-tertiary border border-background-border cursor-grab active:cursor-grabbing select-none',
        isDragging && 'opacity-40 ring-1 ring-accent-silver'
      )}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1">
          <span
            className="shrink-0 rounded-full"
            style={{ width: 6, height: 6, backgroundColor: platformColor }}
            aria-hidden="true"
          />
          <span className="text-[10px] font-mono text-text-tertiary">
            {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
          </span>
        </div>
        <span
          className={cn(
            'text-[9px] px-1 rounded-full',
            STATUS_COLORS[post.status] ?? 'bg-background-border text-text-tertiary'
          )}
        >
          {post.status.toLowerCase().replace('_', ' ')}
        </span>
      </div>
      <p className="text-[11px] text-text-secondary leading-tight line-clamp-2">
        {post.content}
      </p>
    </div>
  )
}
