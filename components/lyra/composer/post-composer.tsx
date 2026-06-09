'use client'

import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Sparkles, CalendarIcon, Send, BarChart2, TrendingUp, X } from 'lucide-react'
import { PlatformSelector } from './platform-selector'
import { MediaUploader } from './media-uploader'
import { ContentScorePanel } from './content-score-panel'
import type { ScoringResult } from '@/services/ai/content-scorer'
import { TrendPickerPanel } from '@/components/lyra/trends/trend-picker-panel'
import type { TrendItem } from '@prisma/client'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface PostComposerProps {
  workspaceId: string
  connectedPlatforms: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postingPatterns?: any
  onContentChange?: (content: string) => void
  onPlatformsChange?: (platforms: string[]) => void
  trendEnabled?: boolean
  initialTrend?: { trendId: string; title: string; sourcePlatform: string } | null
}

export function PostComposer({ workspaceId, connectedPlatforms, onContentChange, onPlatformsChange, trendEnabled, initialTrend }: PostComposerProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>()
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [content, setContent] = useState('')
  const [scoreOpen, setScoreOpen] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [scoreResult, setScoreResult] = useState<ScoringResult | null>(null)
  const scoreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [trendOpen, setTrendOpen]     = useState(false)
  const [activeTrend, setActiveTrend] = useState<Pick<TrendItem, 'id' | 'title' | 'sourcePlatform'> | null>(
    initialTrend ? { id: initialTrend.trendId, title: initialTrend.title, sourcePlatform: initialTrend.sourcePlatform } : null
  )

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your post, or let LYRA AI generate it…' }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[160px] text-sm text-text-primary leading-relaxed outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText()
      setContent(text)
      onContentChange?.(text)
    },
  })

  useEffect(() => {
    if (!scoreOpen || content.length < 10) return
    if (scoreDebounceRef.current) clearTimeout(scoreDebounceRef.current)
    scoreDebounceRef.current = setTimeout(async () => {
      setScoring(true)
      try {
        const platform = selectedPlatforms[0] ?? 'INSTAGRAM'
        const res = await fetch('/api/ai/score-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, content, platform }),
        })
        if (res.ok) setScoreResult(await res.json() as ScoringResult)
      } catch {
        // silent fail — score panel stays at last result
      } finally {
        setScoring(false)
      }
    }, 1500)
    return () => { if (scoreDebounceRef.current) clearTimeout(scoreDebounceRef.current) }
  }, [content, scoreOpen, selectedPlatforms, workspaceId])

  const handleAIGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Select at least one platform first')
      return
    }
    setIsGenerating(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, platforms: selectedPlatforms, trendContext: activeTrend?.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      editor?.commands.setContent(data.content)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate content')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async (status: 'DRAFT' | 'SCHEDULED') => {
    const content = editor?.getText()
    if (!content?.trim()) { toast.error('Post content is required'); return }
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return }
    if (status === 'SCHEDULED' && !scheduledAt) { toast.error('Set a schedule time'); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content, platforms: selectedPlatforms, scheduledAt, mediaUrls, status }),
      })
      if (!res.ok) throw new Error('Failed to save post')
      toast.success(status === 'SCHEDULED' ? 'Post scheduled!' : 'Draft saved!')
      editor?.commands.clearContent()
      setSelectedPlatforms([])
      setScheduledAt(undefined)
      setMediaUrls([])
    } catch {
      toast.error('Failed to save post')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex rounded-xl overflow-hidden border border-background-border">
      <div className="flex-1 relative bg-background-secondary">
      {/* Platform selector */}
      <div className="px-5 py-4 border-b border-background-border">
        <p className="text-xs text-text-tertiary mb-3 tracking-wider uppercase">Post to</p>
        <PlatformSelector
          connectedPlatforms={connectedPlatforms}
          selected={selectedPlatforms}
          onChange={(platforms) => {
            setSelectedPlatforms(platforms)
            onPlatformsChange?.(platforms)
          }}
        />
      </div>

      {/* Editor */}
      <div className="px-5 py-4">
        {activeTrend && (
          <div className="flex items-center gap-2 pb-3">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-background-hover border border-background-border text-xs font-sans text-text-secondary">
              <TrendingUp size={10} strokeWidth={1.5} />
              {activeTrend.title} ({activeTrend.sourcePlatform.charAt(0) + activeTrend.sourcePlatform.slice(1).toLowerCase()})
              <button
                onClick={() => setActiveTrend(null)}
                aria-label="Remove trend"
                className="ml-1 text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Media previews */}
      {mediaUrls.length > 0 && (
        <div className="px-5 pb-4">
          <div className="flex gap-2 flex-wrap">
            {mediaUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                className="h-16 w-16 object-cover rounded-md border border-background-border"
              />
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-background-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={handleAIGenerate}
            disabled={isGenerating}
            className="text-text-secondary hover:text-text-primary gap-2 text-xs"
          >
            <Sparkles size={14} className={cn(isGenerating && 'animate-pulse')} />
            {isGenerating ? 'Generating…' : 'AI Generate'}
          </Button>
          <MediaUploader
            workspaceId={workspaceId}
            onUpload={(url) => setMediaUrls((prev) => [...prev, url])}
          />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              const newOpen = !scoreOpen
              setScoreOpen(newOpen)
              if (newOpen && content.length >= 10) setScoring(true)
            }}
            className={cn('gap-2 text-xs', scoreOpen ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary')}
          >
            <BarChart2 size={14} strokeWidth={1.5} />
            Score
          </Button>
          {trendEnabled && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setTrendOpen(prev => !prev)}
              className={cn('gap-2 text-xs', trendOpen ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary')}
              aria-label="Toggle trends panel"
            >
              <TrendingUp size={14} strokeWidth={1.5} />
              Trends
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Schedule picker — PopoverTrigger styled directly (no asChild — @base-ui limitation) */}
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors h-8 px-2 rounded-md hover:bg-background-hover bg-transparent border-0 cursor-pointer"
              aria-label="Set schedule time"
            >
              <CalendarIcon size={14} />
              {scheduledAt ? format(scheduledAt, 'MMM d, h:mm a') : 'Schedule'}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-background-tertiary border-background-border">
              <Calendar mode="single" selected={scheduledAt} onSelect={setScheduledAt} />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => handleSubmit('DRAFT')}
            disabled={isSubmitting}
            className="text-text-tertiary hover:text-text-primary text-xs"
          >
            Save draft
          </Button>

          <Button
            size="sm"
            type="button"
            onClick={() => handleSubmit('SCHEDULED')}
            disabled={isSubmitting || !scheduledAt}
            className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
          >
            <Send size={12} />
            {isSubmitting ? 'Scheduling…' : 'Schedule'}
          </Button>
        </div>
      </div>

      <ContentScorePanel open={scoreOpen} onClose={() => setScoreOpen(false)} scoring={scoring} result={scoreResult} />
      </div>
      <TrendPickerPanel
        open={trendEnabled ? trendOpen : false}
        workspaceId={workspaceId}
        onClose={() => setTrendOpen(false)}
        onSelectTrend={(trend) => {
          setActiveTrend({ id: trend.id, title: trend.title, sourcePlatform: trend.sourcePlatform })
          setTrendOpen(false)
        }}
      />
    </div>
  )
}
