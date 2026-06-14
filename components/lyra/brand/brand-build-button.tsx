'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, RefreshCw } from 'lucide-react'

interface GuidelinesPanelProps {
  workspaceId: string
  hasProfile: boolean
  savedGuidelines?: string
}

export function BrandGuidelinesPanel({ workspaceId, hasProfile, savedGuidelines }: GuidelinesPanelProps) {
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
      <BrandBuildButton workspaceId={workspaceId} hasProfile={hasProfile} manualGuidelines={guidelines} />
    </div>
  )
}

interface Props {
  workspaceId: string
  hasProfile: boolean
  manualGuidelines?: string
}

export function BrandBuildButton({ workspaceId, hasProfile, manualGuidelines }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBuild() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/brand-intelligence/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, manualGuidelines: manualGuidelines || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Build failed')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleBuild}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed bg-accent-platinum text-background-primary hover:bg-accent-white"
      >
        {loading ? (
          <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" />
        ) : hasProfile ? (
          <RefreshCw size={14} strokeWidth={1.5} />
        ) : (
          <Zap size={14} strokeWidth={1.5} />
        )}
        {loading ? 'Analyzing…' : hasProfile ? 'Re-analyze' : 'Build brand profile'}
      </button>
      {error && <p className="text-xs text-status-error mt-1">{error}</p>}
    </div>
  )
}
