'use client'

import { useState, useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'

const SLIDES = [
  { label: 'Content Calendar', url: '/workspace/calendar' },
  { label: 'AI Inbox',         url: '/workspace/inbox' },
  { label: 'Brand Intelligence', url: '/workspace/brand' },
  { label: 'AI Scheduling',    url: '/workspace/compose' },
]

const SLIDE_COMPONENTS = [CalendarSlide, InboxSlide, BrandSlide, ScheduleSlide] as const

export default function HeroCarousel() {
  const [active, setActive] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reducedMotion = useRef(false)

  useEffect(() => {
    reducedMotion.current =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!reducedMotion.current) startTimer()
    return () => stopTimer()
  }, [])

  function startTimer() {
    stopTimer()
    intervalRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDES.length)
    }, 4000)
  }

  function stopTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function goTo(index: number) {
    setActive(index)
    if (!reducedMotion.current) startTimer()
  }

  const ActiveSlide = SLIDE_COMPONENTS[active]

  return (
    <div className="w-full max-w-4xl mx-auto mt-12">
      {/* Tab labels */}
      <div
        role="tablist"
        aria-label="Product feature preview"
        className="flex items-center justify-center gap-1 mb-4 flex-wrap"
      >
        {SLIDES.map((slide, i) => (
          <button
            key={slide.label}
            onClick={() => goTo(i)}
            role="tab"
            aria-selected={i === active}
            id={`tab-${i}`}
            aria-controls={`panel-${i}`}
            className={`px-3 py-1.5 rounded-md font-sans text-xs transition-colors duration-150 ${
              i === active
                ? 'text-text-primary bg-background-secondary border border-background-border'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {slide.label}
          </button>
        ))}
      </div>

      {/* Browser frame */}
      <div
        onMouseEnter={stopTimer}
        onMouseLeave={() => { if (!reducedMotion.current) startTimer() }}
        onFocus={stopTimer}
        onBlur={() => { if (!reducedMotion.current) startTimer() }}
        className="rounded-xl border border-background-border bg-background-secondary overflow-hidden shadow-2xl"
      >
        {/* Chrome bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-background-tertiary border-b border-background-border">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-status-error opacity-60" />
            <div className="w-3 h-3 rounded-full bg-status-warning opacity-60" />
            <div className="w-3 h-3 rounded-full bg-status-success opacity-60" />
          </div>
          <div className="flex-1 h-6 bg-background-hover rounded flex items-center px-3 min-w-0">
            <span className="font-mono text-[11px] text-text-tertiary truncate">
              lyraonline.ai{SLIDES[active].url}
            </span>
          </div>
        </div>

        {/* Slide content */}
        <div
          role="tabpanel"
          id={`panel-${active}`}
          aria-labelledby={`tab-${active}`}
          className="p-6 min-h-[340px]"
        >
          <ActiveSlide />
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 mt-5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === active}
            className="p-4 -m-4"
          >
            <div className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active
                ? 'w-6 bg-accent-platinum'
                : 'w-1.5 bg-background-border-mid hover:bg-text-tertiary'
            }`} />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Slide 1: Content Calendar ─────────────────────────────────────────── */

function CalendarSlide() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const cells = [
    { day: 19, chips: [{ label: 'FB · Caption', cls: 'bg-status-info/20 text-status-info' }] },
    { day: 20, chips: [{ label: 'IG · Reel', cls: 'bg-purple-500/20 text-purple-400' }, { label: 'LI · Article', cls: 'bg-status-success/20 text-status-success' }] },
    { day: 21, chips: [{ label: 'X · Post', cls: 'bg-background-hover text-text-secondary' }] },
    { day: 22, chips: [{ label: 'FB · Story', cls: 'bg-status-info/20 text-status-info' }] },
    { day: 23, chips: [{ label: 'IG · Post', cls: 'bg-purple-500/20 text-purple-400' }] },
    { day: 24, chips: [] },
    { day: 25, chips: [{ label: 'LI · Update', cls: 'bg-status-success/20 text-status-success' }] },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-sans text-sm font-medium text-text-primary">May 2026</span>
        <div className="flex gap-2">
          <span className="font-sans text-xs px-2 py-1 rounded-md bg-background-tertiary border border-background-border text-text-secondary">
            All
          </span>
          <span className="font-sans text-xs px-2 py-1 text-text-tertiary">Scheduled</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div key={d} className="text-center font-sans text-[10px] text-text-tertiary py-1">
            {d}
          </div>
        ))}
        {cells.map(({ day, chips }) => (
          <div
            key={day}
            className="bg-background-tertiary border border-background-border rounded-md p-1.5 min-h-[72px]"
          >
            <div className="font-mono text-[10px] text-text-tertiary mb-1.5">{day}</div>
            <div className="space-y-1">
              {chips.map((c) => (
                <div
                  key={c.label}
                  className={`font-sans text-[9px] rounded px-1 py-0.5 truncate ${c.cls}`}
                >
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Slide 2: AI Inbox ──────────────────────────────────────────────────── */

function InboxSlide() {
  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-background-border pb-2">
        <span className="font-sans text-xs text-text-primary border-b-2 border-accent-platinum pb-2 -mb-2.5 flex items-center gap-1.5">
          Pending
          <span className="font-mono text-[9px] bg-background-tertiary text-text-tertiary px-1.5 py-0.5 rounded-full">
            5
          </span>
        </span>
        <span className="font-sans text-xs text-text-tertiary">Escalated</span>
        <span className="font-sans text-xs text-text-tertiary">Done</span>
      </div>

      {/* Comment — Positive */}
      <div className="p-3 rounded-lg bg-background-tertiary border border-background-border space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-background-hover flex items-center justify-center font-sans text-[11px] text-text-tertiary shrink-0">
            S
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-[10px] text-text-tertiary">Sarah M. · Facebook</span>
              <span className="font-sans text-[9px] px-1.5 py-0.5 rounded-full bg-status-success/15 text-status-success">
                Positive
              </span>
            </div>
            <p className="font-sans text-xs text-text-primary mb-2">
              &ldquo;Absolutely love the new menu — best coffee in town!&rdquo;
            </p>
            <div className="bg-background-secondary border-l-2 border-purple-500 pl-2 py-1.5 rounded-r-md">
              <p className="flex items-center gap-1 font-sans text-[9px] text-purple-400 mb-1">
                <Sparkles size={10} strokeWidth={1.5} aria-hidden />
                AI draft
              </p>
              <p className="font-sans text-[10px] text-text-secondary leading-relaxed">
                Thank you so much, Sarah! That means the world to us. See you again soon ☕
              </p>
            </div>
            <button className="mt-2 font-sans text-[10px] px-2.5 py-1 bg-accent-platinum text-background-primary rounded-md">
              Approve &amp; send →
            </button>
          </div>
        </div>
      </div>

      {/* Comment — Negative */}
      <div className="p-3 rounded-lg bg-background-tertiary border border-background-border space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-background-hover flex items-center justify-center font-sans text-[11px] text-text-tertiary shrink-0">
            J
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-sans text-[10px] text-text-tertiary">James K. · Instagram</span>
              <span className="font-sans text-[9px] px-1.5 py-0.5 rounded-full bg-status-error/15 text-status-error">
                Negative
              </span>
            </div>
            <p className="font-sans text-xs text-text-primary mb-2">
              &ldquo;Waited 20 mins for my order, won&apos;t be back.&rdquo;
            </p>
            <div className="bg-background-secondary border-l-2 border-purple-500 pl-2 py-1.5 rounded-r-md">
              <p className="flex items-center gap-1 font-sans text-[9px] text-purple-400 mb-1">
                <Sparkles size={10} strokeWidth={1.5} aria-hidden />
                AI draft
              </p>
              <p className="font-sans text-[10px] text-text-secondary leading-relaxed">
                Hi James, we&apos;re sorry about the wait — that&apos;s not the experience we aim for. We&apos;d love to make it right.
              </p>
            </div>
            <button className="mt-2 font-sans text-[10px] px-2.5 py-1 bg-accent-platinum text-background-primary rounded-md">
              Approve &amp; send →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Slide 3: Brand Intelligence ───────────────────────────────────────── */

function BrandSlide() {
  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-success/10 border border-status-success/20">
        <div className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
        <span className="font-sans text-xs text-status-success">Brand profile active</span>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Tone of Voice */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Tone of Voice
          </p>
          <div className="flex flex-wrap gap-1">
            {['Professional', 'Warm', 'Confident', 'Clear'].map((t) => (
              <span
                key={t}
                className="font-sans text-[9px] px-1.5 py-0.5 rounded-full bg-background-hover text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Voice Profile */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Voice Profile
          </p>
          <div className="space-y-1.5">
            {[{ label: 'Formal', pct: 70 }, { label: 'Friendly', pct: 85 }, { label: 'Concise', pct: 60 }].map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="font-sans text-[9px] text-text-tertiary w-12 shrink-0">{b.label}</span>
                <div className="flex-1 h-1 bg-background-hover rounded-full">
                  <div
                    className="h-1 rounded-full bg-accent-platinum"
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content Themes */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Content Themes
          </p>
          <div className="space-y-1.5">
            {['Product launches', 'Customer stories', 'Behind the scenes', 'Seasonal offers'].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-accent-silver shrink-0" />
                <span className="font-sans text-[9px] text-text-secondary">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Audience */}
        <div className="p-3 rounded-lg bg-background-tertiary border border-background-border">
          <p className="font-sans text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Audience
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Avg age', val: '28–40' },
              { label: 'Top city', val: 'Sydney' },
              { label: 'Gender', val: '62% F' },
              { label: 'Intent', val: 'Local' },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono text-xs text-text-primary">{s.val}</p>
                <p className="font-sans text-[9px] text-text-tertiary">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Slide 4: AI Scheduling ─────────────────────────────────────────────── */

function ScheduleSlide() {
  const posts = [
    {
      platform: 'Facebook',
      platformCls: 'bg-status-info/20 text-status-info',
      day: 'Mon 19',
      time: '9:00 AM',
      preview: 'Summer sale kicks off today! Shop our new collection and save up to 30%...',
      status: 'Scheduled',
      statusCls: 'bg-status-info/15 text-status-info',
    },
    {
      platform: 'Instagram',
      platformCls: 'bg-purple-500/20 text-purple-400',
      day: 'Wed 21',
      time: '12:30 PM',
      preview: 'Behind the scenes: how we craft every batch with care ✨',
      status: 'Draft',
      statusCls: 'bg-background-hover text-text-tertiary',
    },
    {
      platform: 'LinkedIn',
      platformCls: 'bg-status-success/20 text-status-success',
      day: 'Fri 23',
      time: '8:00 AM',
      preview: "We're hiring — join a team redefining what great customer experience looks like.",
      status: 'Scheduled',
      statusCls: 'bg-status-info/15 text-status-info',
    },
  ]

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {posts.map((p) => (
          <div
            key={p.day}
            className="flex items-start gap-3 p-3 rounded-lg bg-background-tertiary border border-background-border"
          >
            <div className="shrink-0 text-center w-14">
              <p className="font-mono text-[10px] text-text-tertiary">{p.day}</p>
              <p className="font-mono text-[10px] text-text-tertiary">{p.time}</p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`font-sans text-[9px] px-1.5 py-0.5 rounded-full ${p.platformCls}`}>
                  {p.platform}
                </span>
                <span className={`font-sans text-[9px] px-1.5 py-0.5 rounded-full ${p.statusCls}`}>
                  {p.status}
                </span>
                <span className="flex items-center gap-1 font-sans text-[9px] text-purple-400 ml-auto">
                  <Sparkles size={10} strokeWidth={1.5} aria-hidden />
                  AI
                </span>
              </div>
              <p className="font-sans text-[10px] text-text-secondary leading-relaxed truncate">
                {p.preview}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-background-border text-text-secondary font-sans text-xs hover:border-background-border-mid hover:text-text-primary transition-colors duration-150">
        <Sparkles size={12} strokeWidth={1.5} className="text-purple-400" aria-hidden />
        Generate next week
      </button>
    </div>
  )
}
