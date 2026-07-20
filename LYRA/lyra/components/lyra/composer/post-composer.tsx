'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
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
import { Sparkles, CalendarIcon, Send, Zap, BarChart2, Pencil, ImagePlus, Loader2, X } from 'lucide-react'
import { PlatformSelector } from './platform-selector'
import { MediaUploader } from './media-uploader'
import { ContentScorePanel } from './content-score-panel'
import type { ScoringResult } from '@/services/ai/content-scorer'
import type { EditingPost } from './compose-client'
import { uploadMediaFile } from '@/lib/upload-media'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Platform } from '@prisma/client'
import { checkMediaCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'

interface PostComposerProps {
  workspaceId: string
  connectedPlatforms: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postingPatterns?: any
  editingPost?: EditingPost | null
  onContentChange?: (content: string) => void
  onPlatformsChange?: (platforms: string[]) => void
}

export function PostComposer({ workspaceId, connectedPlatforms, editingPost, onContentChange, onPlatformsChange }: PostComposerProps) {
  const router = useRouter()
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(editingPost ? [editingPost.platform] : [])
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(
    editingPost?.scheduledAt ? new Date(editingPost.scheduledAt) : undefined
  )
  const [mediaUrls, setMediaUrls] = useState<string[]>(editingPost?.mediaUrls ?? [])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [content, setContent] = useState(editingPost?.content ?? '')
  const [scoreOpen, setScoreOpen] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [scoreResult, setScoreResult] = useState<ScoringResult | null>(null)
  const [isDropUploading, setIsDropUploading] = useState(false)
  const scoreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live, not just submit-time: recomputed every render off existing state, so
  // the warning shows the moment an incompatible platform/media combo exists
  // (e.g. GIF + Instagram) rather than only when the user tries to submit.
  const mediaCompatibilityIssues = checkMediaCompatibility(
    mediaUrls,
    (editingPost ? [editingPost.platform] : selectedPlatforms) as Platform[]
  )

  const isAwaitingMedia = !!editingPost?.requiresMedia && mediaUrls.length === 0

  const onDropFiles = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    setIsDropUploading(true)
    try {
      const urls = await Promise.all(acceptedFiles.map((file) => uploadMediaFile(file, workspaceId)))
      setMediaUrls((prev) => [...prev, ...urls])
    } catch {
      toast.error('Failed to upload media')
    } finally {
      setIsDropUploading(false)
    }
  }, [workspaceId])

  const removeMedia = useCallback((index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const { getRootProps, isDragActive } = useDropzone({
    onDrop: onDropFiles,
    accept: { 'image/*': [], 'video/*': [] },
    noClick: true,
    noKeyboard: true,
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your post, or let LYRA AI generate it…' }),
    ],
    content: editingPost?.content ?? '',
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
        body: JSON.stringify({ workspaceId, platforms: selectedPlatforms }),
      })
      const data = await res.json()
      editor?.commands.setContent(data.content)
    } catch {
      toast.error('Failed to generate content')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async (status: 'DRAFT' | 'SCHEDULED', dateOverride?: Date) => {
    const content = editor?.getText()
    if (!content?.trim()) { toast.error('Post content is required'); return }
    if (selectedPlatforms.length === 0) { toast.error('Select at least one platform'); return }
    const publishAt = dateOverride ?? scheduledAt
    if (status === 'SCHEDULED' && !publishAt) { toast.error('Set a schedule time'); return }

    // Backstop for the live warning shown near the media thumbnails below --
    // that one's visible the moment the incompatible combo exists; this catches
    // it too in case content/platforms changed in a way the user didn't notice.
    if (mediaCompatibilityIssues.length > 0) {
      mediaCompatibilityIssues.forEach((issue) => toast.error(formatCompatibilityIssue(issue)))
      return
    }

    if (status === 'SCHEDULED' && isAwaitingMedia) {
      toast.error('This post needs media before it can be scheduled.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(
        editingPost ? `/api/posts/${editingPost.id}` : '/api/posts',
        {
          method: editingPost ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editingPost
              ? { content, scheduledAt: publishAt, mediaUrls, status }
              : { workspaceId, content, platforms: selectedPlatforms, scheduledAt: publishAt, mediaUrls, status }
          ),
        }
      )
      if (!res.ok) throw new Error('Failed to save post')

      if (editingPost) {
        toast.success('Post updated.')
        router.push(`/workspace/${workspaceId}/calendar`)
        return
      }

      toast.success(status === 'SCHEDULED' ? (dateOverride ? 'Post queued for publishing.' : 'Post scheduled.') : 'Draft saved.')
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
    <div
      {...getRootProps()}
      className={cn(
        'relative bg-background-secondary border rounded-xl overflow-hidden transition-colors',
        isDragActive ? 'border-accent-silver' : 'border-background-border'
      )}
    >
      {(isDragActive || isDropUploading) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-background-secondary/95 backdrop-blur-sm border-2 border-dashed border-accent-silver rounded-xl pointer-events-none">
          {isDropUploading ? (
            <>
              <Loader2 size={16} className="animate-spin text-text-secondary" />
              <p className="font-sans text-sm text-text-secondary">Uploading…</p>
            </>
          ) : (
            <>
              <ImagePlus size={16} strokeWidth={1.5} className="text-text-secondary" />
              <p className="font-sans text-sm text-text-secondary">Drop to attach</p>
            </>
          )}
        </div>
      )}
      {editingPost && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-background-hover border-b border-background-border">
          <Pencil size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
          <p className="font-sans text-xs text-text-secondary">Editing scheduled post</p>
        </div>
      )}
      {/* Platform selector */}
      <div className="px-5 py-4 border-b border-background-border">
        <p className="text-xs text-text-tertiary mb-3 tracking-wider uppercase">Post to</p>
        <PlatformSelector
          connectedPlatforms={connectedPlatforms}
          selected={selectedPlatforms}
          disabled={!!editingPost}
          onChange={(platforms) => {
            setSelectedPlatforms(platforms)
            onPlatformsChange?.(platforms)
          }}
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
              <div key={i} className="relative group">
                <Image
                  src={url}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 object-cover rounded-md border border-background-border"
                />
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  aria-label="Remove media"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background-tertiary border border-background-border-mid flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={8} strokeWidth={2} className="text-text-secondary" />
                </button>
              </div>
            ))}
          </div>
          {mediaCompatibilityIssues.length > 0 && (
            <div className="mt-2 space-y-1">
              {mediaCompatibilityIssues.map((issue, i) => (
                <p key={i} className="font-sans text-xs text-status-error leading-relaxed">
                  {formatCompatibilityIssue(issue)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toolbar — row 1: content tools */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-background-border">
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
          onClick={() => setScoreOpen(!scoreOpen)}
          className={cn('gap-2 text-xs', scoreOpen ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary')}
        >
          <BarChart2 size={14} strokeWidth={1.5} />
          Score
        </Button>
      </div>

      {isAwaitingMedia && (
        <p className="px-5 pt-2 font-sans text-xs text-status-warning leading-relaxed">
          This post needs media before it can be scheduled — it was generated by the AI Schedule Generator without artwork.
        </p>
      )}

      {/* Toolbar — row 2: publish actions */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-background-border">
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

        <div className="flex items-center gap-2">
          {/* Schedule picker */}
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors h-8 px-2 rounded-md hover:bg-background-hover bg-transparent border-0 cursor-pointer"
              aria-label="Set schedule time"
            >
              <CalendarIcon size={14} />
              {scheduledAt ? format(scheduledAt, 'MMM d, h:mm a') : 'Pick date & time'}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-background-tertiary border-background-border">
              <Calendar mode="single" selected={scheduledAt} onSelect={setScheduledAt} />
              <div className="px-4 pb-4 pt-3 border-t border-background-border space-y-1.5">
                <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Time</p>
                <input
                  type="time"
                  value={scheduledAt ? format(scheduledAt, 'HH:mm') : ''}
                  onChange={(e) => {
                    if (!e.target.value) return
                    const [hours, minutes] = e.target.value.split(':').map(Number)
                    const base = scheduledAt ?? new Date()
                    const updated = new Date(base)
                    updated.setHours(hours, minutes, 0, 0)
                    setScheduledAt(updated)
                  }}
                  className="w-full bg-background-secondary border border-background-border rounded-lg px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-silver/40"
                />
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => handleSubmit('SCHEDULED', new Date())}
            disabled={isSubmitting || isAwaitingMedia}
            className="text-text-secondary hover:text-text-primary text-xs gap-1.5"
          >
            <Zap size={12} strokeWidth={1.5} />
            Post now
          </Button>

          <Button
            size="sm"
            type="button"
            onClick={() => handleSubmit('SCHEDULED')}
            disabled={isSubmitting || !scheduledAt || isAwaitingMedia}
            className="bg-accent-platinum text-background-primary hover:bg-accent-white text-xs gap-2"
          >
            <Send size={12} />
            {isSubmitting ? 'Saving…' : editingPost ? 'Save changes' : 'Schedule'}
          </Button>
        </div>
      </div>

      <ContentScorePanel open={scoreOpen} scoring={scoring} result={scoreResult} onClose={() => setScoreOpen(false)} />
    </div>
  )
}
