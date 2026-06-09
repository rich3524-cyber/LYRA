import { cn } from '@/lib/utils'
import type { TrendItem } from '@prisma/client'

interface TrendRowProps {
  trend:    TrendItem
  active:   boolean
  onClick:  () => void
}

const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK:    'TikTok',
  INSTAGRAM: 'Instagram',
  X:         'X',
  REDDIT:    'Reddit',
  NEWS:      'News',
  WEB:       'Web',
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-status-success'
  if (score >= 50) return 'text-status-warning'
  return 'text-text-tertiary'
}

export function TrendRow({ trend, active, onClick }: TrendRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 border',
        active
          ? 'bg-background-tertiary border-background-border-mid'
          : 'border-transparent hover:bg-background-hover'
      )}
    >
      <p className="font-sans text-sm font-medium text-text-primary leading-snug line-clamp-2">
        {trend.title}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-background-hover border border-background-border text-text-tertiary">
          {PLATFORM_LABELS[trend.sourcePlatform] ?? trend.sourcePlatform}
        </span>
        <span className={cn('font-mono text-xs', scoreColor(trend.relevanceScore))}>
          {trend.relevanceScore}
        </span>
      </div>
    </button>
  )
}
