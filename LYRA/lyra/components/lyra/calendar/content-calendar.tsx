'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
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
import { PostDetailPanel } from './post-detail-panel'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type FilterValue = 'ALL' | 'SCHEDULED' | 'DRAFT' | 'PUBLISHED' | 'FAILED'

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: 'ALL',       label: 'All' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'DRAFT',     label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'FAILED',    label: 'Failed' },
]

function SkeletonCell() {
  return (
    <div className="bg-background-secondary min-h-[120px] p-2 space-y-2">
      <div className="h-3 w-4 rounded bg-background-hover animate-pulse" />
      <div className="h-8 rounded bg-background-hover animate-pulse" />
      <div className="h-8 rounded bg-background-hover animate-pulse" />
    </div>
  )
}

function DayCell({
  day,
  posts,
  isCurrentDay,
  onSelect,
}: {
  day: Date
  posts: CalendarPost[]
  isCurrentDay: boolean
  onSelect: (post: CalendarPost) => void
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
      <div className="flex items-center justify-between gap-1 mb-1">
        <span
          className={cn(
            'font-sans text-xs',
            isCurrentDay ? 'text-accent-platinum font-medium' : 'text-text-tertiary'
          )}
        >
          {format(day, 'd')}
        </span>
        {platforms.length > 0 && (
          <div
            className="flex items-center gap-0.5"
            aria-label={`Platforms: ${platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}`}
          >
            {platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-full shrink-0"
                style={{ width: 6, height: 6, backgroundColor: PLATFORM_COLORS[platform] ?? PLATFORM_COLORS['TWITTER'] }}
                title={PLATFORM_LABELS[platform] ?? platform}
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>
      {posts.map((post) => (
        <PostPreviewCard key={post.id} post={post} onSelect={onSelect} />
      ))}
    </div>
  )
}

export function ContentCalendar({ workspaceId, plan }: { workspaceId: string; plan: 'STARTER' | 'PRO' | 'AGENCY' }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [posts, setPosts]               = useState<CalendarPost[]>([])
  const [loading, setLoading]           = useState(true)
  const [activePost, setActivePost]     = useState<CalendarPost | null>(null)
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>('ALL')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const fetchPosts = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(
      `/api/posts?workspaceId=${workspaceId}&month=${format(currentMonth, 'yyyy-MM')}`,
      { signal }
    )
    const data: CalendarPost[] = await res.json()
    return Array.isArray(data) ? data : []
  }, [workspaceId, currentMonth])

  const loadPosts = useCallback(() => {
    setLoading(true)
    fetchPosts()
      .then((data) => setPosts(data))
      .catch(() => {
        setPosts([])
        toast.error('Failed to load posts')
      })
      .finally(() => setLoading(false))
  }, [fetchPosts])

  useEffect(() => {
    const controller = new AbortController()
    fetchPosts(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setPosts(data)
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPosts([])
        setLoading(false)
        toast.error('Failed to load posts')
      })
    return () => controller.abort()
  }, [fetchPosts])

  const filteredPosts = activeFilter === 'ALL'
    ? posts
    : posts.filter((p) => p.status === activeFilter)

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
    const newScheduledAt = new Date(
      targetDay.getFullYear(),
      targetDay.getMonth(),
      targetDay.getDate(),
      originalDate.getHours(),
      originalDate.getMinutes(),
    )

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, scheduledAt: newScheduledAt.toISOString() } : p
      )
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
      loadPosts()
    }
  }

  function handlePostDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id))
    setSelectedPost(null)
  }

  function handlePostUpdated(updated: CalendarPost) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setSelectedPost(updated)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          const post = posts.find((p) => p.id === e.active.id)
          setActivePost(post ?? null)
        }}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-sm font-medium text-text-secondary uppercase tracking-[0.1em]">
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

          {/* Status filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {FILTER_TABS.map(({ value, label }) => {
              const count = value === 'ALL'
                ? posts.length
                : posts.filter((p) => p.status === value).length
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveFilter(value)}
                  aria-pressed={activeFilter === value}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-md font-sans text-xs transition-colors',
                    activeFilter === value
                      ? 'bg-background-hover text-text-primary border border-background-border-mid'
                      : 'text-text-tertiary hover:text-text-secondary border border-transparent'
                  )}
                >
                  {label}
                  {count > 0 && (
                    <span className="font-mono text-[10px] text-text-tertiary">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-background-border rounded-xl overflow-hidden">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div
                key={d}
                className="bg-background-secondary px-3 py-2 font-sans text-xs text-text-tertiary text-center uppercase tracking-[0.1em]"
              >
                {d}
              </div>
            ))}

            {Array.from({ length: startDay }).map((_, i) =>
              loading
                ? <SkeletonCell key={`empty-skel-${i}`} />
                : <div key={`empty-${i}`} className="bg-background-secondary min-h-[120px]" />
            )}

            {loading
              ? days.map((day) => <SkeletonCell key={day.toISOString()} />)
              : days.map((day) => {
                  const dayPosts = filteredPosts.filter(
                    (p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day)
                  )
                  return (
                    <DayCell
                      key={day.toISOString()}
                      day={day}
                      posts={dayPosts}
                      isCurrentDay={isToday(day)}
                      onSelect={setSelectedPost}
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

      {/* Detail panel — outside DndContext to avoid z-index conflicts */}
      <PostDetailPanel
        post={selectedPost}
        workspaceId={workspaceId}
        plan={plan}
        onClose={() => setSelectedPost(null)}
        onDeleted={handlePostDeleted}
        onUpdated={handlePostUpdated}
      />
    </>
  )
}
