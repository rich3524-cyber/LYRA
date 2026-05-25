'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, Pencil, Trash2, Check, X,
  Loader2, Paperclip, Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import type { GeneratedPost } from '@/services/ai/schedule-generator'

type PostEntry = GeneratedPost & {
  id: string
  weekNum: number
  mediaUrls: string[]
  uploadingMedia: boolean
}

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM:       'Instagram',
  LINKEDIN:        'LinkedIn',
  FACEBOOK:        'Facebook',
  TWITTER:         'Twitter/X',
  TIKTOK:          'TikTok',
  GOOGLE_BUSINESS: 'Google Business',
}

interface Props {
  workspaceId: string
  workspaceName: string
}

export function ScheduleReview({ workspaceId, workspaceName }: Props) {
  const router = useRouter()

  const [posts, setPosts]             = useState<PostEntry[]>([])
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving]       = useState(false)
  const [notFound, setNotFound]       = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const attachingPostId = useRef<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(`lyra:schedule-review:${workspaceId}`)
    if (!raw) {
      setNotFound(true)
      return
    }
    setPosts(JSON.parse(raw) as PostEntry[])
  }, [workspaceId])

  const postsByWeek = posts.reduce<Record<number, PostEntry[]>>((acc, post) => {
    if (!acc[post.weekNum]) acc[post.weekNum] = []
    acc[post.weekNum].push(post)
    return acc
  }, {})
  const sortedWeeks = Object.keys(postsByWeek).map(Number).sort((a, b) => a - b)

  function handleDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  function handleEditSave(id: string) {
    setPosts(prev => prev.map(p =>
      p.id === id ? { ...p, content: editContent } : p
    ))
    setEditingId(null)
  }

  function handleAttachMedia(postId: string) {
    attachingPostId.current = postId
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file   = e.target.files?.[0]
    const postId = attachingPostId.current
    if (!file || !postId) return
    e.target.value = ''

    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, uploadingMedia: true } : p
    ))

    try {
      const presignRes = await fetch('/api/upload/presign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) throw new Error('Failed to get upload URL')

      const { presignedUrl, publicUrl } = await presignRes.json() as {
        presignedUrl: string
        publicUrl: string
      }

      const uploadRes = await fetch(presignedUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!uploadRes.ok) throw new Error('Upload to S3 failed')

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, mediaUrls: [...p.mediaUrls, publicUrl], uploadingMedia: false }
          : p
      ))
    } catch {
      toast.error('Media upload failed. Try again.')
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, uploadingMedia: false } : p
      ))
    }
  }

  function handleRemoveMedia(postId: string, url: string) {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, mediaUrls: p.mediaUrls.filter(u => u !== url) }
        : p
    ))
  }

  async function handleAddToCalendar() {
    setIsSaving(true)
    const BATCH_SIZE  = 10
    const failedIds: string[] = []
    let savedCount = 0

    try {
      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch   = posts.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async post => {
            const res = await fetch('/api/posts', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                workspaceId,
                content:     post.content,
                platforms:   [post.platform],
                scheduledAt: post.scheduledAt,
                mediaUrls:   post.mediaUrls,
                status:      'DRAFT',
                topic:       post.topic ?? null,
              }),
            })
            return { id: post.id, ok: res.ok }
          })
        )
        for (const r of results) {
          if (r.ok) savedCount++
          else failedIds.push(r.id)
        }
      }

      if (failedIds.length > 0) {
        setPosts(prev => prev.filter(p => failedIds.includes(p.id)))
        toast.error(`${failedIds.length} posts failed to save. Review the remaining posts.`)
      } else {
        sessionStorage.removeItem(`lyra:schedule-review:${workspaceId}`)
        toast.success(`${savedCount} posts added to your calendar as drafts.`)
        router.push(`/workspace/${workspaceId}/calendar`)
      }
    } catch {
      toast.error('Failed to save posts. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="font-sans text-sm text-text-secondary">No posts to review.</p>
        <Link
          href={`/workspace/${workspaceId}/calendar`}
          className="font-sans text-xs text-text-tertiary hover:text-text-secondary underline underline-offset-2"
        >
          Back to calendar
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-4xl text-text-primary">Review Schedule</h2>
          <p className="font-sans text-sm text-text-secondary mt-1">{workspaceName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">{posts.length} posts</span>
          <button
            onClick={handleAddToCalendar}
            disabled={isSaving || posts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-platinum text-background-primary font-sans text-xs font-medium hover:bg-accent-white transition-colors disabled:opacity-50"
          >
            {isSaving
              ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
              : <Calendar size={12} strokeWidth={1.5} />
            }
            {isSaving ? 'Saving…' : 'Add all to calendar'}
          </button>
        </div>
      </div>

      {/* ── HIDDEN FILE INPUT — shared across all post cards ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* ── POSTS BY WEEK ── */}
      {sortedWeeks.map(week => (
        <section key={week}>
          <p className="font-sans text-xs font-medium text-text-tertiary uppercase tracking-[0.1em] mb-3">
            Week {week}
          </p>
          <div className="space-y-3">
            {postsByWeek[week].map(post => (
              <div
                key={post.id}
                className="rounded-xl border border-background-border bg-background-secondary p-4 space-y-3"
              >
                {/* Platform badge + edit/delete controls */}
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs px-2 py-0.5 rounded-md bg-background-tertiary border border-background-border-mid text-text-secondary">
                    {PLATFORM_LABELS[post.platform] ?? post.platform}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (editingId === post.id) {
                          setEditingId(null)
                        } else {
                          setEditingId(post.id)
                          setEditContent(post.content)
                        }
                      }}
                      aria-label={editingId === post.id ? 'Cancel edit' : 'Edit post'}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-background-hover transition-colors"
                    >
                      {editingId === post.id
                        ? <X size={13} strokeWidth={1.5} />
                        : <Pencil size={13} strokeWidth={1.5} />
                      }
                    </button>
                    {editingId === post.id && (
                      <button
                        onClick={() => handleEditSave(post.id)}
                        aria-label="Save edit"
                        className="p-1.5 rounded-md text-status-success hover:bg-background-hover transition-colors"
                      >
                        <Check size={13} strokeWidth={1.5} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(post.id)}
                      aria-label="Delete post"
                      className="p-1.5 rounded-md text-text-tertiary hover:text-status-error hover:bg-background-hover transition-colors"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Scheduled date */}
                <p className="font-mono text-xs text-text-tertiary">
                  {format(parseISO(post.scheduledAt), 'EEE d MMM, h:mm a')}
                </p>

                {/* Content or edit textarea */}
                {editingId === post.id ? (
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    autoFocus
                    className="w-full bg-background-tertiary border border-background-border-mid rounded-lg p-3 font-sans text-sm text-text-primary resize-none focus:outline-none focus:border-accent-silver min-h-[80px]"
                  />
                ) : (
                  <p className="font-sans text-sm text-text-primary leading-relaxed">
                    {post.content}
                  </p>
                )}

                {/* Media thumbnails */}
                {post.mediaUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.mediaUrls.map(url => (
                      <div key={url} className="relative group">
                        {/\.(mp4|mov|webm)$/i.test(url) ? (
                          <div className="w-16 h-16 rounded-lg bg-background-tertiary border border-background-border flex items-center justify-center">
                            <Video size={16} strokeWidth={1.5} className="text-text-secondary" />
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt="Attached media"
                            className="w-16 h-16 rounded-lg object-cover border border-background-border"
                          />
                        )}
                        <button
                          onClick={() => handleRemoveMedia(post.id, url)}
                          aria-label="Remove media"
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background-tertiary border border-background-border-mid flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={8} strokeWidth={2} className="text-text-secondary" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Attach media */}
                <div>
                  {post.uploadingMedia ? (
                    <div className="inline-flex items-center gap-1.5 font-sans text-xs text-text-tertiary">
                      <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                      Uploading…
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAttachMedia(post.id)}
                      className="inline-flex items-center gap-1.5 font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      <Paperclip size={12} strokeWidth={1.5} />
                      Attach media
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
