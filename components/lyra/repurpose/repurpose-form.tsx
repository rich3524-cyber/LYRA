'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scissors } from 'lucide-react'

const PLATFORMS = ['INSTAGRAM', 'LINKEDIN', 'TWITTER', 'FACEBOOK', 'TIKTOK', 'GOOGLE_BUSINESS']
const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TWITTER: 'Twitter / X',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  GOOGLE_BUSINESS: 'Google Business',
}

interface PostEntry {
  id: string
  platform: string
  content: string
  scheduledAt: string
  weekNum: number
  mediaUrls: string[]
  uploadingMedia: boolean
}

interface RepurposeFormProps {
  workspaceId: string
}

export function RepurposeForm({ workspaceId }: RepurposeFormProps) {
  const router = useRouter()
  const [sourceType, setSourceType] = useState<'url' | 'text'>('url')
  const [source, setSource] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['INSTAGRAM', 'LINKEDIN'])
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  const handleGenerate = async () => {
    if (!source.trim() || selectedPlatforms.length === 0) return
    setGenerating(true)
    setError(null)
    setProgress([])

    const res = await fetch('/api/ai/repurpose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, sourceType, source, platforms: selectedPlatforms }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      setError(data.error ?? 'Repurposing failed.')
      setGenerating(false)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const accumulated: PostEntry[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6)) as { type: string; platform?: string; content?: string; message?: string; total?: number }
          if (event.type === 'post' && event.platform && event.content) {
            accumulated.push({
              id: crypto.randomUUID(),
              platform: event.platform,
              content: event.content,
              scheduledAt: '',
              weekNum: 0,
              mediaUrls: [],
              uploadingMedia: false,
            })
            setProgress((prev) => [...prev, event.platform!])
          } else if (event.type === 'error') {
            setError(event.message ?? 'Generation failed')
          } else if (event.type === 'done') {
            sessionStorage.setItem(`lyra:schedule-review:${workspaceId}`, JSON.stringify(accumulated))
            router.push(`/workspace/${workspaceId}/schedule/review`)
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    setGenerating(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Source type toggle */}
      <div>
        <label className="block text-xs font-medium font-sans text-text-secondary mb-2 uppercase tracking-widest">Source</label>
        <div className="flex rounded-lg border border-background-border overflow-hidden mb-3">
          {(['url', 'text'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSourceType(t)}
              className={`flex-1 py-2 text-sm font-sans transition-colors ${
                sourceType === t
                  ? 'bg-accent-platinum text-background-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t === 'url' ? 'Blog URL' : 'Paste text'}
            </button>
          ))}
        </div>

        {sourceType === 'url' ? (
          <input
            type="url"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://yourblog.com/post-title"
            className="w-full px-3 py-2.5 rounded-lg bg-background-secondary border border-background-border text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid"
          />
        ) : (
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Paste your article or long-form content here…"
            rows={6}
            className="w-full px-3 py-2.5 rounded-lg bg-background-secondary border border-background-border text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid resize-none"
          />
        )}
      </div>

      {/* Platform toggles */}
      <div>
        <label className="block text-xs font-medium font-sans text-text-secondary mb-2 uppercase tracking-widest">Target platforms</label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const active = selectedPlatforms.includes(p)
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 rounded-full text-sm font-sans transition-colors border ${
                  active
                    ? 'bg-accent-platinum text-background-primary border-accent-platinum'
                    : 'border-background-border text-text-secondary hover:border-background-border-mid hover:text-text-primary'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Progress */}
      {generating && progress.length > 0 && (
        <div className="space-y-2">
          {progress.map((platform, i) => (
            <div key={i} className="h-16 rounded-xl bg-background-secondary border border-background-border flex items-center px-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-status-success" />
                <p className="text-sm font-sans text-text-secondary">{PLATFORM_LABELS[platform] ?? platform} generated</p>
              </div>
            </div>
          ))}
          {generating && (
            <div className="h-16 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
          )}
        </div>
      )}

      {error && <p className="text-sm text-status-error font-sans">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={generating || !source.trim() || selectedPlatforms.length === 0}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary text-sm font-medium font-sans hover:bg-accent-white transition-colors disabled:opacity-50"
      >
        {generating ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-background-primary/30 border-t-background-primary animate-spin" />
            Repurposing…
          </>
        ) : (
          <>
            <Scissors className="h-4 w-4" strokeWidth={1.5} />
            Repurpose content
          </>
        )}
      </button>
    </div>
  )
}
