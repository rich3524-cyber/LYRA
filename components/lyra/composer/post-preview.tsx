'use client'

import { useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM:       'Instagram',
  FACEBOOK:        'Facebook',
  LINKEDIN:        'LinkedIn',
  TWITTER:         'X (Twitter)',
  GOOGLE_BUSINESS: 'Google Business',
  TIKTOK:          'TikTok',
}

interface PostPreviewProps {
  content: string
  selectedPlatforms: string[]
  className?: string
}

function InstagramPreview({ content, mobile }: { content: string; mobile: boolean }) {
  const charCount = content.length
  return (
    <div className={cn(
      'bg-white rounded-xl overflow-hidden',
      mobile ? 'max-w-[320px] mx-auto' : 'max-w-full'
    )}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-gray-900 leading-tight">your_handle</p>
          <p className="text-[10px] text-gray-400">Now</p>
        </div>
      </div>
      <div className={cn(
        'bg-gray-100 flex items-center justify-center',
        mobile ? 'aspect-square' : 'aspect-[4/3]'
      )}>
        <span className="text-xs text-gray-400">Image / video</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[12px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
          {content || <span className="text-gray-400 italic">Your caption will appear here…</span>}
        </p>
        {charCount > 0 && (
          <p className={cn(
            'text-[10px] mt-1.5 text-right',
            charCount > 2200 ? 'text-red-500' : 'text-gray-400'
          )}>
            {charCount} / 2200
          </p>
        )}
      </div>
    </div>
  )
}

function FacebookPreview({ content, mobile }: { content: string; mobile: boolean }) {
  return (
    <div className={cn(
      'bg-white rounded-xl overflow-hidden',
      mobile ? 'max-w-[320px] mx-auto' : 'max-w-full'
    )}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-blue-500 shrink-0 flex items-center justify-center">
          <span className="text-white text-xs font-bold">Y</span>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-gray-900">Your Page</p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">Just now</span>
            <span className="text-[10px] text-gray-400">·</span>
            <span className="text-[10px] text-gray-400">🌐</span>
          </div>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
          {content || <span className="text-gray-400 italic">Your post content will appear here…</span>}
        </p>
      </div>
      <div className="bg-gray-100 mx-3 mb-3 rounded-lg h-24 flex items-center justify-center">
        <span className="text-xs text-gray-400">Link preview / media</span>
      </div>
      <div className="flex items-center gap-6 px-3 py-2 border-t border-gray-100">
        {['Like', 'Comment', 'Share'].map((action) => (
          <span key={action} className="text-[11px] text-gray-500 font-medium">{action}</span>
        ))}
      </div>
    </div>
  )
}

function LinkedInPreview({ content, mobile }: { content: string; mobile: boolean }) {
  const preview = content.length > 200 ? content.slice(0, 200) : content
  const truncated = content.length > 200
  return (
    <div className={cn(
      'bg-white rounded-xl overflow-hidden',
      mobile ? 'max-w-[320px] mx-auto' : 'max-w-full'
    )}>
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <div className="w-9 h-9 rounded-full bg-blue-700 shrink-0 flex items-center justify-center">
          <span className="text-white text-xs font-bold">Y</span>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-gray-900">Your Name</p>
          <p className="text-[10px] text-gray-500">Your Headline · 1st</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Just now · 🌐</p>
        </div>
      </div>
      <div className="px-3 pb-3">
        <p className="text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
          {preview || <span className="text-gray-400 italic">Your post content will appear here…</span>}
          {truncated && (
            <button className="text-blue-600 text-[13px] ml-1">…see more</button>
          )}
        </p>
      </div>
      <div className="flex items-center gap-4 px-3 py-2 border-t border-gray-100">
        {['Like', 'Comment', 'Repost', 'Send'].map((action) => (
          <span key={action} className="text-[11px] text-gray-500">{action}</span>
        ))}
      </div>
    </div>
  )
}

function TwitterPreview({ content, mobile }: { content: string; mobile: boolean }) {
  const charCount = content.length
  return (
    <div className={cn(
      'bg-white rounded-xl overflow-hidden p-3',
      mobile ? 'max-w-[320px] mx-auto' : 'max-w-full'
    )}>
      <div className="flex gap-2.5">
        <div className="w-9 h-9 rounded-full bg-gray-800 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[12px] font-bold text-gray-900">Your Name</span>
            <span className="text-[11px] text-gray-500">@yourhandle</span>
          </div>
          <p className="text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
            {content || <span className="text-gray-400 italic">Your tweet will appear here…</span>}
          </p>
          {charCount > 0 && (
            <p className={cn(
              'text-[10px] mt-1.5 text-right',
              charCount > 280 ? 'text-red-500' : 'text-gray-400'
            )}>
              {charCount} / 280
            </p>
          )}
          <div className="flex items-center gap-6 mt-2">
            {['💬', '🔁', '❤️', '📊'].map((icon) => (
              <span key={icon} className="text-[11px] text-gray-500">{icon} 0</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleBusinessPreview({ content }: { content: string }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-red-500 shrink-0 flex items-center justify-center">
          <span className="text-white text-xs font-bold">G</span>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-gray-900">Your Business</p>
          <p className="text-[10px] text-gray-400">Just now</p>
        </div>
      </div>
      <p className="text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
        {content || <span className="text-gray-400 italic">Your post content will appear here…</span>}
      </p>
      <div className="mt-2 flex gap-2">
        <span className="text-[11px] text-blue-600 cursor-pointer">Learn more</span>
        <span className="text-[11px] text-blue-600 cursor-pointer">Call</span>
      </div>
    </div>
  )
}

function TikTokPreview({ content }: { content: string }) {
  return (
    <div className="relative bg-black rounded-xl overflow-hidden mx-auto" style={{ width: 180, height: 320 }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-[11px] text-white font-semibold mb-1">@yourhandle</p>
        <p className="text-[11px] text-white leading-snug whitespace-pre-wrap break-words">
          {content.slice(0, 100) || <span className="text-white/60 italic">Caption appears here…</span>}
          {content.length > 100 && '…'}
        </p>
      </div>
      <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3">
        {['❤️', '💬', '🔁', '⋯'].map((icon, i) => (
          <span key={i} className="text-lg">{icon}</span>
        ))}
      </div>
    </div>
  )
}

function PlaceholderPreview({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-center px-4">
      <p className="font-sans text-sm text-text-tertiary">{message}</p>
    </div>
  )
}

const PLATFORM_PREVIEW: Record<string, (content: string, mobile: boolean) => React.ReactNode> = {
  INSTAGRAM:       (c, m) => <InstagramPreview content={c} mobile={m} />,
  FACEBOOK:        (c, m) => <FacebookPreview content={c} mobile={m} />,
  LINKEDIN:        (c, m) => <LinkedInPreview content={c} mobile={m} />,
  TWITTER:         (c, m) => <TwitterPreview content={c} mobile={m} />,
  GOOGLE_BUSINESS: (c)    => <GoogleBusinessPreview content={c} />,
  TIKTOK:          (c)    => <TikTokPreview content={c} />,
}

export function PostPreview({ content, selectedPlatforms, className }: PostPreviewProps) {
  const [activePlatform, setActivePlatform] = useState<string>('')
  const [mobileView, setMobileView]         = useState(false)

  const platforms = selectedPlatforms.filter((p) => PLATFORM_PREVIEW[p])
  const currentPlatform = platforms.includes(activePlatform) ? activePlatform : (platforms[0] ?? '')

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Preview header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-background-border shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {platforms.length === 0 ? (
            <p className="font-sans text-xs text-text-tertiary">Preview</p>
          ) : (
            platforms.map((p) => (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={cn(
                  'font-sans text-xs px-2.5 py-1 rounded-md transition-colors whitespace-nowrap',
                  currentPlatform === p
                    ? 'bg-background-hover text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary'
                )}
              >
                {PLATFORM_LABELS[p] ?? p}
              </button>
            ))
          )}
        </div>

        {/* Desktop/Mobile toggle — hidden for TikTok (always vertical) */}
        {currentPlatform && currentPlatform !== 'TIKTOK' && currentPlatform !== 'GOOGLE_BUSINESS' && (
          <div className="flex items-center gap-0.5 ml-2 shrink-0">
            <button
              onClick={() => setMobileView(false)}
              aria-label="Desktop preview"
              className={cn(
                'p-1.5 rounded-md transition-colors',
                !mobileView ? 'text-text-primary bg-background-hover' : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              <Monitor size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setMobileView(true)}
              aria-label="Mobile preview"
              className={cn(
                'p-1.5 rounded-md transition-colors',
                mobileView ? 'text-text-primary bg-background-hover' : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              <Smartphone size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Preview body */}
      <div className="flex-1 overflow-y-auto p-5 bg-background-primary">
        {platforms.length === 0 ? (
          <PlaceholderPreview message="Select a platform to see a preview." />
        ) : !currentPlatform ? (
          <PlaceholderPreview message="Select a platform tab above." />
        ) : (
          PLATFORM_PREVIEW[currentPlatform]?.(content, mobileView) ?? (
            <PlaceholderPreview message="Preview not available for this platform." />
          )
        )}
      </div>
    </div>
  )
}
