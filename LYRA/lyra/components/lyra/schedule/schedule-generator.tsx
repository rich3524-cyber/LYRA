'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Calendar, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import type { GeneratedPost } from '@/services/ai/schedule-generator'

type PostEntry = GeneratedPost & { id: string; weekNum: number }
type Phase = 'config' | 'generating' | 'review'

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
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editContent, setEditContent]     = useState('')
  const [isSaving, setIsSaving]           = useState(false)
  const abortRef                          = useRef<AbortController | null>(null)

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

    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, durationWeeks, platforms }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      let eventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'progress') {
              setProgress(Math.round((data.week / data.total) * 100))
              setProgressLabel(data.status)
            } else if (eventType === 'week_posts') {
              const incoming: PostEntry[] = (data.posts as GeneratedPost[]).map(p => ({
                ...p,
                id: crypto.randomUUID(),
                weekNum: data.week,
              }))
              setPosts(prev => [...prev, ...incoming])
            } else if (eventType === 'done') {
              setPhase('review')
            } else if (eventType === 'error') {
              throw new Error(data.message)
            }
          }
        }
      }
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

  const handleDelete = (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  const handleEditSave = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, content: editContent } : p))
    setEditingId(null)
  }

  const handleAddToCalendar = async () => {
    setIsSaving(true)
    try {
      const results = await Promise.all(
        posts.map(post =>
          fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              content: post.content,
              platforms: [post.platform],
              scheduledAt: post.scheduledAt,
              status: 'DRAFT',
            }),
          })
        )
      )
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        toast.error(`${failed} posts failed to save. The rest were added.`)
      } else {
        toast.success(`${posts.length} posts added to your calendar as drafts.`)
      }
      window.dispatchEvent(new CustomEvent('draft-saved'))
      setOpen(false)
    } catch {
      toast.error('Failed to save posts. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const postsByWeek = posts.reduce<Record<number, PostEntry[]>>((acc, post) => {
    if (!acc[post.weekNum]) acc[post.weekNum] = []
    acc[post.weekNum].push(post)
    return acc
  }, {})

  const sortedWeeks = Object.keys(postsByWeek)
    .map(Number)
    .sort((a, b) => a - b)

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
              {phase === 'review'     && `Review ${posts.length} posts`}
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

          {/* ── REVIEW ── */}
          {phase === 'review' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {sortedWeeks.map(weekNum => (
                <div key={weekNum}>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-widest mb-3">
                    Week {weekNum}
                  </p>
                  <div className="space-y-2">
                    {postsByWeek[weekNum]
                      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                      .map(post => {
                        const isEditing = editingId === post.id
                        return (
                          <div
                            key={post.id}
                            className="rounded-xl bg-background-tertiary border border-background-border p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium text-text-secondary shrink-0">
                                  {PLATFORM_LABELS[post.platform] ?? post.platform}
                                </span>
                                <span className="text-text-tertiary text-xs">·</span>
                                <span className="font-mono text-xs text-text-tertiary truncate">
                                  {format(parseISO(post.scheduledAt), 'EEE MMM d, h:mm a')}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleEditSave(post.id)}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-status-success transition-colors"
                                      aria-label="Save edit"
                                    >
                                      <Check size={13} strokeWidth={1.5} />
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary transition-colors"
                                      aria-label="Cancel edit"
                                    >
                                      <X size={13} strokeWidth={1.5} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingId(post.id)
                                        setEditContent(post.content)
                                      }}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary hover:text-text-secondary transition-colors"
                                      aria-label="Edit post"
                                    >
                                      <Pencil size={13} strokeWidth={1.5} />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(post.id)}
                                      className="p-1.5 rounded-md hover:bg-background-hover text-text-tertiary hover:text-status-error transition-colors"
                                      aria-label="Delete post"
                                    >
                                      <Trash2 size={13} strokeWidth={1.5} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              <textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                rows={4}
                                autoFocus
                                className="w-full bg-background-secondary border border-background-border-mid rounded-lg px-3 py-2 text-sm text-text-primary font-sans resize-none focus:outline-none focus:border-accent-silver transition-colors"
                              />
                            ) : (
                              <p className="text-sm text-text-secondary leading-relaxed">
                                {post.content}
                              </p>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
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
            {phase === 'review' && (
              <>
                <span className="text-xs text-text-tertiary">
                  <span className="font-mono text-text-secondary">{posts.length}</span> posts ready
                </span>
                <Button
                  onClick={handleAddToCalendar}
                  disabled={isSaving || posts.length === 0}
                  size="sm"
                  className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
                >
                  <Calendar size={12} strokeWidth={1.5} />
                  {isSaving ? 'Adding…' : `Add ${posts.length} to calendar`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
