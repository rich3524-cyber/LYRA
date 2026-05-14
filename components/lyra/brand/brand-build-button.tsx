'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, RefreshCw } from 'lucide-react'

interface Props {
  workspaceId: string
  hasProfile: boolean
}

export function BrandBuildButton({ workspaceId, hasProfile }: Props) {
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
        body: JSON.stringify({ workspaceId }),
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
