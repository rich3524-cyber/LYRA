'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { Video, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MediaUploader } from './media-uploader'
import { checkPlatformCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'
import type { Platform } from '@prisma/client'

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK:        'Facebook',
  INSTAGRAM:       'Instagram',
  LINKEDIN:        'LinkedIn',
  TIKTOK:          'TikTok',
  TWITTER:         'X',
  GOOGLE_BUSINESS: 'Google',
  YOUTUBE:         'YouTube',
}

const ASPECT_RATIO_HINTS: Record<string, string> = {
  FACEBOOK:        'Flexible — 1.91:1 landscape or 1:1 square',
  INSTAGRAM:       '1:1 square or 4:5 portrait',
  TIKTOK:          '9:16 vertical',
  TWITTER:         '16:9 landscape or 1:1 square',
  LINKEDIN:        '1.91:1 landscape or 1:1 square',
  YOUTUBE:         '16:9 landscape',
  GOOGLE_BUSINESS: '1:1 square or 4:3 landscape',
}

function isVideoUrl(url: string): boolean {
  const clean = url.split(/[?#]/)[0]
  return /\.(mp4|mov|webm)$/i.test(clean)
}

interface PlatformMediaTabsProps {
  selectedPlatforms: string[]
  platformMedia: Record<string, string[]>
  workspaceId: string
  activeTab: string
  onActiveTabChange: (platform: string) => void
  onPlatformMediaChange: (platform: string, urls: string[]) => void
}

export function PlatformMediaTabs({
  selectedPlatforms,
  platformMedia,
  workspaceId,
  activeTab,
  onActiveTabChange,
  onPlatformMediaChange,
}: PlatformMediaTabsProps) {
  const resolvedTab = selectedPlatforms.includes(activeTab) ? activeTab : (selectedPlatforms[0] ?? '')

  useEffect(() => {
    if (resolvedTab !== activeTab) onActiveTabChange(resolvedTab)
  }, [resolvedTab, activeTab, onActiveTabChange])

  if (selectedPlatforms.length === 0) return null

  const urls = platformMedia[resolvedTab] ?? []
  const issues = resolvedTab ? checkPlatformCompatibility(urls, resolvedTab as Platform) : []
  const hint = ASPECT_RATIO_HINTS[resolvedTab]

  return (
    <div>
      <div className="flex items-center overflow-x-auto scrollbar-none border-b border-background-border px-5">
        {selectedPlatforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onActiveTabChange(p)}
            className={cn(
              'font-sans text-xs px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap -mb-px',
              resolvedTab === p
                ? 'border-accent-silver text-text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            )}
          >
            {PLATFORM_LABELS[p] ?? p}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 space-y-3">
        {hint && (
          <p className="font-sans text-[11px] text-text-tertiary">
            Recommended: {hint}
          </p>
        )}

        {urls.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {urls.map((url, i) => (
              <div key={i} className="relative group">
                {isVideoUrl(url) ? (
                  <div className="h-16 w-16 rounded-md border border-background-border bg-background-tertiary flex items-center justify-center">
                    <Video size={20} strokeWidth={1.5} className="text-text-tertiary" />
                  </div>
                ) : (
                  <Image
                    src={url}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 object-cover rounded-md border border-background-border"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onPlatformMediaChange(resolvedTab, urls.filter((_, idx) => idx !== i))}
                  aria-label="Remove media"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background-tertiary border border-background-border-mid flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={8} strokeWidth={2} className="text-text-secondary" />
                </button>
              </div>
            ))}
          </div>
        )}

        {issues.length > 0 && (
          <div className="space-y-1">
            {issues.map((issue, i) => (
              <p key={i} className="font-sans text-xs text-status-error leading-relaxed">
                {formatCompatibilityIssue(issue)}
              </p>
            ))}
          </div>
        )}

        <MediaUploader
          workspaceId={workspaceId}
          onUpload={(url) => onPlatformMediaChange(resolvedTab, [...urls, url])}
        />
      </div>
    </div>
  )
}
