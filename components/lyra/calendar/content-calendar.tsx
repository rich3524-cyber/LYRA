'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  setDate,
} from 'date-fns'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PostPreviewCard, CalendarPost, PLATFORM_COLORS, PLATFORM_LABELS } from './post-preview-card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Email campaign types ───────────────────────────────────────────────────────

interface EmailCampaign {
  id:          string
  name:        string
  subjectLine: string
  status:      'DRAFT' | 'SCHEDULED' | 'SENT'
  scheduledAt: string | null
  sentAt:      string | null
  emailConnection: { provider: 'KLAVIYO' | 'MAILCHIMP' }
}

const EMAIL_STATUS_LABEL: Record<EmailCampaign['status'], string> = {
  DRAFT:     'Draft',
  SCHEDULED: 'Scheduled',
  SENT:      'Sent',
}

function EmailCampaignChip({ campaign }: { campaign: EmailCampaign }) {
  const sendTime = campaign.scheduledAt ?? campaign.sentAt
  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-background-primary border-l-2 border-l-violet-500/50 border border-background-border text-[11px] font-sans leading-tight">
      <Mail size={10} strokeWidth={1.5} className="text-violet-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-text-secondary truncate" title={campaign.name}>{campaign.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {sendTime && (
            <span className="text-text-tertiary font-mono">
              {format(new Date(sendTime), 'h:mm a')}
            </span>
          )}
          <span className={cn(
            'font-sans',
            campaign.status === 'SCHEDULED' && 'text-status-info',
            campaign.status === 'SENT'      && 'text-text-tertiary',
            campaign.status === 'DRAFT'     && 'text-text-tertiary',
          )}>
            {EMAIL_STATUS_LABEL[campaign.status]}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── DayCell ───────────────────────────────────────────────────────────────────

function DayCell({
  day,
  posts,
  emailCampaigns,
  isCurrentDay,
}: {
  day:           Date
  posts:         CalendarPost[]
  emailCampaigns: EmailCampaign[]
  isCurrentDay:  boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.toISOString() })

  const platforms = Array.from(new Set(posts.map((p) => p.socialAccount.platform)))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bg-background-secondary min-h-[120px] p-2 space-y-1 transition-colors',
        isCurrentDay && 'bg-background-tertiary',
        isOver && 'bg-background-hover'
      )}
    >
      {/* Date row */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className={cn('text-xs', isCurrentDay ? 'text-accent-platinum font-medium' : 'text-text-tertiary')}>
          {format(day, 'd')}
        </span>
        {platforms.length > 0 && (
          <div className="flex items-center gap-0.5" aria-label={`Platforms: ${platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}`}>
            {platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-full shrink-0"
                style={{ width: 6, height: 6, backgroundColor: PLATFORM_COLORS[platform] ?? '#555555' }}
                title={PLATFORM_LABELS[platform] ?? platform}
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>

      {/* Social post chips */}
      {posts.map((post) => (
        <PostPreviewCard key={post.id} post={post} />
      ))}

      {/* Email campaign chips — non-draggable */}
      {emailCampaigns.map((campaign) => (
        <EmailCampaignChip key={campaign.id} campaign={campaign} />
      ))}
    </div>
  )
}

// ── ContentCalendar ───────────────────────────────────────────────────────────

export function ContentCalendar({ workspaceId }: { workspaceId: string }) {
  const [currentMonth, setCurrentMonth]     = useState(new Date())
  const [posts, setPosts]                   = useState<CalendarPost[]>([])
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([])
  const [activePost, setActivePost]         = useState<CalendarPost | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const monthParam = format(currentMonth, 'yyyy-MM')

  // Keep a revert function for drag-and-drop failures
  const reloadPosts = useCallback(() => {
    fetch(`/api/posts?workspaceId=${workspaceId}&month=${monthParam}`)
      .then(r => r.json())
      .then((data: CalendarPost[]) => setPosts(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [workspaceId, monthParam])

  useEffect(() => {
    let ignore = false
    fetch(`/api/posts?workspaceId=${workspaceId}&month=${monthParam}`)
      .then(r => r.json())
      .then((data: CalendarPost[]) => { if (!ignore) setPosts(Array.isArray(data) ? data : []) })
      .catch(() => { if (!ignore) setPosts([]) })
    return () => { ignore = true }
  }, [workspaceId, monthParam])

  useEffect(() => {
    let ignore = false
    fetch(`/api/email/campaigns?workspaceId=${workspaceId}&month=${monthParam}`)
      .then(r => r.json())
      .then((data: { campaigns: EmailCampaign[] }) => {
        if (!ignore) setEmailCampaigns(Array.isArray(data.campaigns) ? data.campaigns : [])
      })
      .catch(() => { if (!ignore) setEmailCampaigns([]) })
    return () => { ignore = true }
  }, [workspaceId, monthParam])

  const days     = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startDay = startOfMonth(currentMonth).getDay()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActivePost(null)
    if (!over || active.id === over.id) return

    const post = posts.find((p) => p.id === active.id)
    if (!post) return

    const targetDay      = new Date(over.id as string)
    const originalDate   = post.scheduledAt ? new Date(post.scheduledAt) : new Date()
    const newScheduledAt = setDate(originalDate, targetDay.getDate())

    setPosts((prev) =>
      prev.map((p) => p.id === post.id ? { ...p, scheduledAt: newScheduledAt.toISOString() } : p)
    )

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scheduledAt: newScheduledAt.toISOString() }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      toast.success('Post rescheduled')
    } catch {
      toast.error('Failed to reschedule post')
      reloadPosts()
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const post = posts.find((p) => p.id === e.active.id)
        setActivePost(post ?? null)
      }}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary tracking-widest uppercase">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-background-border rounded-xl overflow-hidden">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="bg-background-secondary px-3 py-2 text-xs text-text-tertiary text-center tracking-widest">
              {d}
            </div>
          ))}

          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-background-secondary min-h-[120px]" />
          ))}

          {days.map((day) => {
            const dayPosts = posts.filter(
              (p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day)
            )
            const dayCampaigns = emailCampaigns.filter((c) => {
              const date = c.scheduledAt ?? c.sentAt
              return date && isSameDay(new Date(date), day)
            })
            return (
              <DayCell
                key={day.toISOString()}
                day={day}
                posts={dayPosts}
                emailCampaigns={dayCampaigns}
                isCurrentDay={isToday(day)}
              />
            )
          })}
        </div>
      </div>

      <DragOverlay>
        {activePost ? (
          <div className="opacity-90 rotate-1 scale-105">
            <PostPreviewCard post={activePost} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
