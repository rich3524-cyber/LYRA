'use client'

import { useState } from 'react'
import { PostComposer } from './post-composer'
import { PostPreview } from './post-preview'
import { DraftList } from './draft-list'
import { cn } from '@/lib/utils'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'

interface ComposeClientProps {
  workspaceId: string
  connectedPlatforms: string[]
  postingPatterns: PostingPatterns | null
}

export function ComposeClient({ workspaceId, connectedPlatforms, postingPatterns }: ComposeClientProps) {
  const [content, setContent]             = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [mobileTab, setMobileTab]         = useState<'compose' | 'preview'>('compose')

  return (
    <>
      {/* Mobile tab strip */}
      <div className="md:hidden flex items-center gap-1 p-1 bg-background-secondary border border-background-border rounded-lg w-fit mb-4">
        {(['compose', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              'font-sans text-xs px-3 py-1.5 rounded-md capitalize transition-colors',
              mobileTab === tab
                ? 'bg-background-hover text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Desktop: side-by-side | Mobile: tab-switched */}
      <div className="md:grid md:grid-cols-2 md:gap-6">
        {/* Composer — always visible on desktop, conditional on mobile */}
        <div className={cn('space-y-6', mobileTab === 'preview' ? 'hidden md:block' : '')}>
          <PostComposer
            workspaceId={workspaceId}
            connectedPlatforms={connectedPlatforms}
            postingPatterns={postingPatterns}
            onContentChange={setContent}
            onPlatformsChange={setSelectedPlatforms}
          />
          {connectedPlatforms.length === 0 && (
            <p className="font-sans text-xs text-text-tertiary text-center">
              No social accounts connected yet.{' '}
              <a
                href={`/workspace/${workspaceId}/settings`}
                className="text-accent-silver hover:text-text-primary underline"
              >
                Connect accounts
              </a>{' '}
              to start posting.
            </p>
          )}
          <DraftList workspaceId={workspaceId} />
        </div>

        {/* Preview panel — sticky on desktop, full-screen on mobile tab */}
        <div className={cn(mobileTab === 'compose' ? 'hidden md:block' : '')}>
          <div className="md:sticky md:top-6 bg-background-secondary border border-background-border rounded-xl overflow-hidden">
            <PostPreview
              content={content}
              selectedPlatforms={selectedPlatforms}
            />
          </div>
          {/* Mobile platform selector for preview */}
          {mobileTab === 'preview' && connectedPlatforms.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-3 md:hidden">
              {connectedPlatforms.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPlatforms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                  )}
                  className={cn(
                    'font-sans text-xs px-2.5 py-1 rounded-md border transition-colors',
                    selectedPlatforms.includes(p)
                      ? 'border-accent-silver text-text-primary'
                      : 'border-background-border text-text-tertiary hover:text-text-secondary'
                  )}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase().replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
