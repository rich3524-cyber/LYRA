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

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK:        'FB',
  INSTAGRAM:       'IG',
  LINKEDIN:        'LI',
  TIKTOK:          'TT',
  TWITTER:         'X',
  GOOGLE_BUSINESS: 'GBP',
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
        <span className="text-[10px] font-mono text-text-tertiary">
          {PLATFORM_LABELS[post.socialAccount.platform] ?? post.socialAccount.platform}
        </span>
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
