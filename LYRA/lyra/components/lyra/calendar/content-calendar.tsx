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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PostPreviewCard, CalendarPost, PLATFORM_COLORS, PLATFORM_LABELS } from './post-preview-card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function DayCell({
  day,
  posts,
  isCurrentDay,
  onSelectPost,
}: {
  day: Date
  posts: CalendarPost[]
  isCurrentDay: boolean
  onSelectPost: (post: CalendarPost) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.toISOString() })

  // Unique platforms scheduled this day — for the quick-reference dot strip
  const platforms = Array.from(
    new Set(posts.map((p) => p.socialAccount.platform))
  )

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bg-background-secondary min-h-[120px] p-2 space-y-1 transition-colors',
        isCurrentDay && 'bg-background-tertiary',
        isOver && 'bg-background-hover'
      )}
    >
      {/* Date row with platform dot strip */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span
          className={cn(
            'text-xs',
            isCurrentDay ? 'text-accent-platinum font-medium' : 'text-text-tertiary'
          )}
        >
          {format(day, 'd')}
        </span>
        {platforms.length > 0 && (
          <div className="flex items-center gap-0.5" aria-label={`Platforms: ${platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}`}>
            {platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-full shrink-0"
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: PLATFORM_COLORS[platform] ?? PLATFORM_COLORS['TWITTER'],
                }}
                title={PLATFORM_LABELS[platform] ?? platform}
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>
      {posts.map((post) => (
        <PostPreviewCard key={post.id} post={post} onSelect={onSelectPost} />
      ))}
    </div>
  )
}

export function ContentCalendar({ workspaceId }: { workspaceId: string }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [posts, setPosts] = useState<CalendarPost[]>([])
  const [activePost, setActivePost] = useState<CalendarPost | null>(null)
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const loadPosts = useCallback(() => {
    fetch(`/api/posts?workspaceId=${workspaceId}&month=${format(currentMonth, 'yyyy-MM')}`)
      .then((r) => r.json())
      .then((data: CalendarPost[]) => setPosts(Array.isArray(data) ? data : []))
      .catch(() => setPosts([]))
  }, [workspaceId, currentMonth])

  useEffect(() => { loadPosts() }, [loadPosts])

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })
  const startDay = startOfMonth(currentMonth).getDay()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActivePost(null)
    if (!over || active.id === over.id) return

    const post = posts.find((p) => p.id === active.id)
    if (!post) return

    // over.id is the ISO string of the target day
    const targetDay = new Date(over.id as string)
    const originalDate = post.scheduledAt ? new Date(post.scheduledAt) : new Date()
    const newScheduledAt = setDate(originalDate, targetDay.getDate())

    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, scheduledAt: newScheduledAt.toISOString() } : p
      )
    )

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newScheduledAt.toISOString() }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      toast.success('Post rescheduled')
    } catch {
      toast.error('Failed to reschedule post')
      loadPosts() // revert
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
            <div
              key={d}
              className="bg-background-secondary px-3 py-2 text-xs text-text-tertiary text-center tracking-widest"
            >
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
            return (
              <DayCell
                key={day.toISOString()}
                day={day}
                posts={dayPosts}
                isCurrentDay={isToday(day)}
                onSelectPost={setSelectedPost}
              />
            )
          })}
        </div>
      </div>

      <DragOverlay>
        {activePost ? (
          <div className="opacity-90 rotate-1 scale-105">
            <PostPreviewCard post={activePost} onSelect={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
