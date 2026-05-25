'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Calendar, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { GeneratedPost } from '@/services/ai/schedule-generator'

type PostEntry = GeneratedPost & {
  id: string
  weekNum: number
  mediaUrls: string[]
  uploadingMedia: boolean
}
type Phase = 'config' | 'generating' | 'complete'

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM:       'Instagram',
  LINKEDIN:        'LinkedIn',
  FACEBOOK:        'Facebook',
  TWITTER:         'Twitter/X',
  TIKTOK:          'TikTok',
  GOOGLE_BUSINESS: 'Google Business',
}

interface ScheduleGeneratorProps {
  workspaceId: string
  connectedPlatforms: string[]
  hasBrandProfile: boolean
}

export function ScheduleGenerator({
  workspaceId,
  connectedPlatforms,
  hasBrandProfile,
}: ScheduleGeneratorProps) {
  const router = useRouter()

  const [open, setOpen]                   = useState(false)
  const [phase, setPhase]                 = useState<Phase>('config')
  const [durationWeeks, setDurationWeeks] = useState<3 | 6>(6)
  const [selected, setSelected]           = useState<Record<string, boolean>>(
    Object.fromEntries(connectedPlatforms.map(p => [p, true]))
  )
  const [postsPerWeek, setPostsPerWeek]   = useState<Record<string, number>>(
    Object.fromEntries(connectedPlatforms.map(p => [p, 3]))
  )
  const [progress, setProgress]           = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [posts, setPosts]                 = useState<PostEntry[]>([])
  const abortRef                          = useRef<AbortController | null>(null)

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const newId = () =>
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const activePlatforms = connectedPlatforms.filter(p => selected[p])
  const totalPosts = activePlatforms.reduce(
    (sum, p) => sum + postsPerWeek[p] * durationWeeks, 0
  )

  const handleOpen = () => {
    if (!hasBrandProfile) {
      toast.error('Build a brand profile first. LYRA needs your brand context to generate content.')
      return
    }
    if (connectedPlatforms.length === 0) {
      toast.error('Connect at least one social account before generating a schedule.')
      return
    }
    setPhase('config')
    setPosts([])
    setProgress(0)
    setOpen(true)
  }

  const handleGenerate = async () => {
    setPhase('generating')
    setProgress(0)
    setPosts([])

    const platforms: Record<string, number> = {}
    for (const p of activePlatforms) platforms[p] = postsPerWeek[p]

    abortRef.current = new AbortController()

    const baseStart = new Date()
    baseStart.setUTCHours(0, 0, 0, 0)
    const dayOfWeek = baseStart.getUTCDay()
    baseStart.setUTCDate(baseStart.getUTCDate() + (dayOfWeek === 0 ? 1 : 8 - dayOfWeek))

    const accumulated: PostEntry[] = []

    try {
      for (let week = 1; week <= durationWeeks; week++) {
        if (abortRef.current.signal.aborted) return

        setProgressLabel(`Generating week ${week} of ${durationWeeks}…`)
        setProgress(Math.round(((week - 1) / durationWeeks) * 100))

        const weekStartDate = new Date(baseStart)
        weekStartDate.setUTCDate(baseStart.getUTCDate() + (week - 1) * 7)

        const res = await fetch('/api/schedule/generate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            workspaceId,
            weekNumber:    week,
            weekStartDate: weekStartDate.toISOString(),
            platforms,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok) throw new Error(`Week ${week} generation failed`)

        const { posts: weekPosts } = await res.json() as { posts: GeneratedPost[] }
        const newEntries: PostEntry[] = weekPosts.map(p => ({
          ...p,
          id:             newId(),
          weekNum:        week,
          mediaUrls:      [],
          uploadingMedia: false,
        }))
        accumulated.push(...newEntries)
        setPosts([...accumulated])
        setProgress(Math.round((week / durationWeeks) * 100))
      }

      sessionStorage.setItem(
        `lyra:schedule-review:${workspaceId}`,
        JSON.stringify(accumulated)
      )
      setPhase('complete')
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      toast.error('Schedule generation failed. Try again.')
      setPhase('config')
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setPhase('config')
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        variant="ghost"
        size="sm"
        className="gap-2 text-text-secondary hover:text-text-primary text-xs border border-background-border hover:border-background-border-mid transition-all duration-150"
      >
        <Sparkles size={13} strokeWidth={1.5} />
        Generate schedule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background-secondary border-background-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-background-border shrink-0">
            <DialogTitle className="font-sans text-base font-medium text-text-primary">
              {phase === 'config'     && 'Generate content schedule'}
              {phase === 'generating' && 'Generating your schedule…'}
              {phase === 'complete'   && `${posts.length} posts ready`}
            </DialogTitle>
          </DialogHeader>

          {/* ── CONFIG ── */}
          {phase === 'config' && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-widest mb-3">
                  Duration
                </p>
                <div className="flex gap-2">
                  {([3, 6] as const).map(weeks => (
                    <button
                      key={weeks}
                      onClick={() => setDurationWeeks(weeks)}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg text-sm font-sans border transition-colors',
                        durationWeeks === weeks
                          ? 'bg-background-tertiary border-background-border-mid text-text-primary'
                          : 'border-background-border text-text-secondary hover:text-text-primary hover:border-background-border-mid'
                      )}
                    >
                      {weeks} weeks
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-widest mb-3">
                  Platforms &amp; frequency
                </p>
                <div className="space-y-2">
                  {connectedPlatforms.map(platform => (
                    <div
                      key={platform}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-background-tertiary border border-background-border"
                    >
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selected[platform] ?? true}
                          onChange={e =>
                            setSelected(prev => ({ ...prev, [platform]: e.target.checked }))
                          }
                          className="accent-accent-platinum w-4 h-4 cursor-pointer"
                        />
                        <span className="text-sm text-text-primary">
                          {PLATFORM_LABELS[platform] ?? platform}
                        </span>
                      </label>
                      {selected[platform] && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setPostsPerWeek(prev => ({
                                ...prev,
                                [platform]: Math.max(1, prev[platform] - 1),
                              }))
                            }
                            className="w-6 h-6 rounded-md bg-background-hover text-text-secondary hover:text-text-primary flex items-center justify-center text-sm transition-colors"
                            aria-label={`Decrease posts per week for ${platform}`}
                          >
                            −
                          </button>
                          <span className="font-mono text-xs text-text-primary w-4 text-center">
                            {postsPerWeek[platform]}
                          </span>
                          <button
                            onClick={() =>
                              setPostsPerWeek(prev => ({
                                ...prev,
                                [platform]: Math.min(7, prev[platform] + 1),
                              }))
                            }
                            className="w-6 h-6 rounded-md bg-background-hover text-text-secondary hover:text-text-primary flex items-center justify-center text-sm transition-colors"
                            aria-label={`Increase posts per week for ${platform}`}
                          >
                            +
                          </button>
                          <span className="text-xs text-text-tertiary ml-1">/ week</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-text-tertiary">
                <span className="font-mono text-text-secondary">{totalPosts}</span> posts across{' '}
                <span className="font-mono text-text-secondary">{activePlatforms.length}</span>{' '}
                platforms over{' '}
                <span className="font-mono text-text-secondary">{durationWeeks}</span> weeks
              </p>
            </div>
          )}

          {/* ── GENERATING ── */}
          {phase === 'generating' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 space-y-6">
              <div className="w-full max-w-sm space-y-3">
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>{progressLabel}</span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-0.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-platinum rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-text-tertiary text-center">
                  LYRA is building your {durationWeeks}-week content plan. This takes about{' '}
                  {durationWeeks === 3 ? '30' : '60'} seconds.
                </p>
              </div>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {phase === 'complete' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-12">
              <div className="text-center space-y-1">
                <p className="font-sans text-sm text-text-primary">
                  {posts.length} posts generated
                </p>
                <p className="font-sans text-xs text-text-secondary">
                  Review and attach media before adding to your calendar.
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(false)
                  router.push(`/workspace/${workspaceId}/schedule/review`)
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors"
              >
                <Calendar size={14} strokeWidth={1.5} />
                Review posts
              </button>
            </div>
          )}

          {/* ── FOOTER ── */}
          <div className="px-6 py-4 border-t border-background-border shrink-0 flex items-center justify-between gap-3">
            {phase === 'config' && (
              <>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <Button
                  onClick={handleGenerate}
                  disabled={activePlatforms.length === 0 || totalPosts === 0}
                  size="sm"
                  className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  Generate {totalPosts} posts
                </Button>
              </>
            )}
            {phase === 'generating' && (
              <button
                onClick={handleCancel}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
            )}
            {phase === 'complete' && (
              <span className="font-mono text-xs text-text-tertiary">
                {posts.length} posts ready to review
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
