'use client'

import { cn } from '@/lib/utils'

const PLATFORMS = [
  { id: 'FACEBOOK',        label: 'Facebook' },
  { id: 'INSTAGRAM',       label: 'Instagram' },
  { id: 'LINKEDIN',        label: 'LinkedIn' },
  { id: 'TIKTOK',          label: 'TikTok' },
  { id: 'TWITTER',         label: 'X' },
  { id: 'GOOGLE_BUSINESS', label: 'Google' },
] as const

interface PlatformSelectorProps {
  connectedPlatforms: string[]
  selected: string[]
  onChange: (platforms: string[]) => void
}

export function PlatformSelector({ connectedPlatforms, selected, onChange }: PlatformSelectorProps) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.map((p) => {
        const connected = connectedPlatforms.includes(p.id)
        const isSelected = selected.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => connected && toggle(p.id)}
            disabled={!connected}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${p.label}`}
            aria-pressed={isSelected}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 border',
              isSelected
                ? 'border-accent-silver text-text-primary bg-background-hover'
                : 'border-background-border text-text-tertiary hover:border-background-border-mid hover:text-text-secondary',
              !connected && 'opacity-30 cursor-not-allowed'
            )}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
