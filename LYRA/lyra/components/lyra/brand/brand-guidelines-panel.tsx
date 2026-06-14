'use client'

import { useState } from 'react'
import { BrandBuildButton } from './brand-build-button'

interface Props {
  workspaceId: string
  hasProfile: boolean
  savedGuidelines?: string
}

export function BrandGuidelinesPanel({ workspaceId, hasProfile, savedGuidelines }: Props) {
  const [guidelines, setGuidelines] = useState(savedGuidelines ?? '')

  return (
    <div className="space-y-3">
      <textarea
        value={guidelines}
        onChange={(e) => setGuidelines(e.target.value)}
        placeholder="Paste your brand guidelines here — tone of voice, messaging rules, target audience, topics to avoid, example copy, etc."
        rows={8}
        className="w-full rounded-lg bg-background-tertiary border border-background-border-mid font-sans text-sm text-text-primary placeholder:text-text-tertiary p-4 resize-y focus:outline-none focus:ring-2 focus:ring-accent-silver/40 leading-relaxed"
      />
      <BrandBuildButton
        workspaceId={workspaceId}
        hasProfile={hasProfile}
        manualGuidelines={guidelines}
      />
    </div>
  )
}
