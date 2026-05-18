'use client'

import { useState, useMemo } from 'react'
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
import { Sparkles, CalendarIcon, Send } from 'lucide-react'
import { PlatformSelector } from './platform-selector'
import { MediaUploader } from './media-uploader'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const CHAR_LIMITS: Record<string, number> = {
  TWITTER:          280,
  GOOGLE_BUSINESS:  1500,
  INSTAGRAM:        2200,
  TIKTOK:           2200,
  LINKEDIN:         3000,
  FACEBOOK:         63206,
}

interface PostComposerProps {
  workspaceId: string
  connectedPlatforms: string[]
}

export function PostComposer({ workspaceId, connectedPlatforms }: PostComposerProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [scheduleDate, setScheduleDate]             = useState<Date | undefined>()
  const [scheduleTime, setScheduleTime]             = useState('09:00')
  const [mediaUrls, setMediaUrls]                   = useState<string[]>([])
  const [topic, setTopic]                           = useState('')
  const [isGenerating, setIsGenerating]             = useState(false)
  const [isSubmitting, setIsSubmitting]             = useState(false)

  // Combine date + time into a single Date for the API
  const scheduledAt = useMemo(() => {
    if (!scheduleDate) return undefined
    const [h, m] = scheduleTime.split(':').map(Number)
    const d = new Date(scheduleDate)
    d.setHours(h, m, 0, 0)
    return d
  }, [scheduleDate, scheduleTime])

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
  })

  // Character counter
  const charCount = editor?.getText().length ?? 0
  const charLimit = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map((p) => CHAR_LIMITS[p] ?? 63206))
    : null
  const overLimit = charLimit !== null && charCount > charLimit

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
        body: JSON.stringify({ workspaceId, platforms: selectedPlatforms, topic: topic.trim() || undefined }),
      })
      const data = await res.json()
      editor?.commands.setContent(data.content)
    } catch {
      toast.error('Failed to generate content')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async (status: 'DRAFT' | 'SCHEDULED') => {
    const content = editor?.getText()
    if (!content?.trim()) { toast.error('Post content is required'); return }
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return }
    if (status === 'SCHEDULED' && !scheduledAt) { toast.error('Set a schedule date and time'); return }
    if (overLimit) { toast.error(`Content exceeds the ${charLimit}-character limit`); return }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, content, platforms: selectedPlatforms, scheduledAt, mediaUrls, status }),
      })
      if (!res.ok) throw new Error('Failed to save post')
      toast.success(status === 'SCHEDULED' ? 'Post scheduled' : 'Draft saved')
      editor?.commands.clearContent()
      setSelectedPlatforms([])
      setScheduleDate(undefined)
      setScheduleTime('09:00')
      setMediaUrls([])
      setTopic('')
      // Signal DraftList to refresh
      window.dispatchEvent(new CustomEvent('draft-saved'))
    } catch {
      toast.error('Failed to save post')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-background-secondary border border-background-border rounded-xl overflow-hidden">
      {/* Platform selector */}
      <div className="px-5 py-4 border-b border-background-border">
        <p className="font-sans text-xs text-text-tertiary mb-3 tracking-wider uppercase">Post to</p>
        <PlatformSelector
          connectedPlatforms={connectedPlatforms}
          selected={selectedPlatforms}
          onChange={setSelectedPlatforms}
        />
      </div>

      {/* Topic input */}
      <div className="px-5 pt-4">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic hint for AI (optional) — e.g. spring sale, new product launch…"
          className="w-full bg-transparent text-xs text-text-tertiary placeholder:text-text-tertiary/60 outline-none border-b border-background-border pb-3 focus:border-background-border-mid transition-colors"
        />
      </div>

      {/* Editor */}
      <div className="px-5 py-4">
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
        </div>

        <div className="flex items-center gap-2">
          {/* Character counter */}
          {charLimit !== null && (
            <span className={cn(
              'font-mono text-xs tabular-nums',
              overLimit ? 'text-status-error' : charCount > charLimit * 0.9 ? 'text-status-warning' : 'text-text-tertiary'
            )}>
              {charCount}/{charLimit}
            </span>
          )}

          {/* Schedule picker */}
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors h-8 px-2 rounded-md hover:bg-background-hover bg-transparent border-0 cursor-pointer"
              aria-label="Set schedule time"
            >
              <CalendarIcon size={14} />
              {scheduleDate
                ? `${format(scheduleDate, 'MMM d')} at ${scheduleTime}`
                : 'Schedule'}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-background-tertiary border-background-border">
              <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} />
              <div className="px-3 pb-3 border-t border-background-border pt-3">
                <label className="block font-sans text-xs text-text-tertiary mb-1.5">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-lg bg-background-secondary border border-background-border px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-background-border-mid transition-colors"
                />
              </div>
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
            disabled={isSubmitting || !scheduleDate}
            className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
          >
            <Send size={12} />
            {isSubmitting ? 'Scheduling…' : 'Schedule'}
          </Button>
        </div>
      </div>
    </div>
  )
}
