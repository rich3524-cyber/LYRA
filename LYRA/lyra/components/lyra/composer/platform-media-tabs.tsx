'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { Video, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MediaUploader } from './media-uploader'
import { checkPlatformCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'
import { PLATFORM_LABELS } from '@/lib/platform-labels'
import type { Platform } from '@prisma/client'

const ASPECT_RATIO_HINTS: Record<string, string> = {
  FACEBOOK:        'Flexible — 1.91:1 landscape or 1:1 square',
  INSTAGRAM:       '1:1 square or 4:5 portrait',
  TIKTOK:          '9:16 vertical · one video file only',
  TWITTER:         '16:9 landscape or 1:1 square',
  LINKEDIN:        '1.91:1 landscape or 1:1 square · one video file only',
  YOUTUBE:         '16:9 landscape',
  GOOGLE_BUSINESS: '1:1 square or 4:3 landscape',
}

function isVideoUrl(url: string): boolean {
  const clean = url.split(/[?#]/)[0]
  return /\.(mp4|mov|webm)$/i.test(clean)
}

function MediaThumb({ url, onRemove }: { url: string; onRemove?: () => void }) {
  return (
    <div className={cn('relative', onRemove && 'group')}>
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
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove media"
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background-tertiary border border-background-border-mid flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={8} strokeWidth={2} className="text-text-secondary" />
        </button>
      )}
    </div>
  )
}

interface PlatformMediaTabsProps {
  selectedPlatforms: string[]
  platformMedia: Record<string, string[]>
  sharedMedia: string[]
  workspaceId: string
  activeTab: string
  onActiveTabChange: (platform: string) => void
  onPlatformMediaChange: (platform: string, urls: string[]) => void
}

export function PlatformMediaTabs({
  selectedPlatforms,
  platformMedia,
  sharedMedia,
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

  const overrideUrls = platformMedia[resolvedTab] ?? []
  const hasOverride = overrideUrls.length > 0
  const issues = resolvedTab && hasOverride
    ? checkPlatformCompatibility(overrideUrls, resolvedTab as Platform)
    : []
  const hint = ASPECT_RATIO_HINTS[resolvedTab]

  return (
    <div>
      <div className="flex items-center overflow-x-auto scrollbar-none border-b border-background-border px-5">
        {selectedPlatforms.map((p) => {
          const hasTabOverride = (platformMedia[p] ?? []).length > 0
          return (
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
              {PLATFORM_LABELS[p as Platform] ?? p}
              {hasTabOverride && (
                <span className="ml-1.5 inline-block w-1 h-1 rounded-full bg-accent-silver align-middle" />
              )}
            </button>
          )
        })}
      </div>

      <div className="px-5 py-4 space-y-3">
        {hint && (
          <p className="font-sans text-[11px] text-text-tertiary">
            {hint}
          </p>
        )}

        {hasOverride ? (
          <div className="flex gap-2 flex-wrap">
            {overrideUrls.map((url, i) => (
              <MediaThumb
                key={i}
                url={url}
                onRemove={() => onPlatformMediaChange(resolvedTab, overrideUrls.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        ) : sharedMedia.length > 0 ? (
          <div className="space-y-1.5">
            <p className="font-sans text-[11px] text-text-tertiary">
              Using shared media — upload below to use different media for this platform
            </p>
            <div className="flex gap-2 flex-wrap opacity-40 pointer-events-none select-none">
              {sharedMedia.map((url, i) => (
                <MediaThumb key={i} url={url} />
              ))}
            </div>
          </div>
        ) : null}

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
          onUpload={(url) => onPlatformMediaChange(resolvedTab, [...overrideUrls, url])}
        />
      </div>
    </div>
  )
}
