'use client'

import { motion } from 'framer-motion'
import type { SetupProgressData } from '@/lib/setup-progress'

const MILESTONE_KEYS = ['socialConnected', 'brandBuilt', 'postScheduled', 'aiActive'] as const

// Blue → sky → teal → green arc — maps to status-info through status-success
const MILESTONE_COLORS = ['#60a5fa', '#38bdf8', '#2dd4bf', '#4ade80']

const MESSAGES = [
  'Connect your social accounts.',
  'Build your brand profile next.',
  'Schedule your first post.',
  'Activate AI responses to finish setup.',
  'LYRA is running at full capacity.',
]

interface Props {
  data: SetupProgressData
  collapsed: boolean
}

export function SetupProgress({ data, collapsed }: Props) {
  const { percent, milestones } = data
  const message = MESSAGES[Math.min(Math.floor(percent / 25), 4)]
  const strokeColor = percent === 100 ? '#4ade80' : percent >= 50 ? '#2dd4bf' : '#60a5fa'

  if (collapsed) {
    const radius = 9
    const circumference = 2 * Math.PI * radius
    const offset = circumference * (1 - percent / 100)

    return (
      <div
        className="flex justify-center py-2"
        title={`${percent}% setup complete — ${message}`}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          aria-label={`Setup: ${percent}% complete`}
        >
          <circle cx="14" cy="14" r={radius} stroke="#222222" strokeWidth="2.5" fill="none" />
          <motion.circle
            cx="14"
            cy="14"
            r={radius}
            stroke={strokeColor}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: offset }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            transform="rotate(-90 14 14)"
          />
          <text
            x="14"
            y="14"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="5.5"
            fill="#555555"
            fontFamily="monospace"
          >
            {percent}%
          </text>
        </svg>
      </div>
    )
  }

  return (
    <div className="mx-2 mb-2 px-3 py-3 rounded-xl bg-background-tertiary border border-background-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.12em]">
          Setup
        </span>
        <span className="font-mono text-[11px] text-text-secondary tabular-nums">
          {percent}%
        </span>
      </div>

      {/* Gradient progress bar — gradient defined inline (SVG/CSS gradient, no Tailwind equivalent) */}
      <div className="h-[3px] rounded-full bg-background-border overflow-hidden mb-2.5">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, #60a5fa 0%, #2dd4bf 50%, #4ade80 100%)',
          }}
          initial={{ width: `${percent}%` }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Encouraging message */}
      <p className="font-sans text-[11px] leading-[1.4] text-text-secondary mb-3">
        {message}
      </p>

      {/* Milestone segments */}
      <div className="flex items-center gap-1">
        {MILESTONE_KEYS.map((key, i) => {
          const done = milestones[key]
          return (
            <motion.div
              key={key}
              className="h-[3px] flex-1 rounded-full"
              initial={{ backgroundColor: done ? MILESTONE_COLORS[i] : '#222222' }}
              animate={{ backgroundColor: done ? MILESTONE_COLORS[i] : '#222222' }}
              transition={{ duration: 0.4 }}
            />
          )
        })}
      </div>
    </div>
  )
}
