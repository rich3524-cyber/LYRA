'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { ScoringResult } from '@/services/ai/content-scorer'

interface ContentScorePanelProps {
  open: boolean
  scoring: boolean
  result: ScoringResult | null
  onClose: () => void
}

const DIMENSION_LABELS: Record<string, string> = {
  hook: 'Hook',
  clarity: 'Clarity',
  cta: 'CTA',
  length: 'Length',
  hashtags: 'Hashtags',
  emotionalResonance: 'Emotional res.',
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-status-success'
  if (score >= 6) return 'text-status-warning'
  return 'text-status-error'
}

function ringColorClass(score: number): string {
  if (score >= 8) return 'stroke-status-success'
  if (score >= 6) return 'stroke-status-warning'
  return 'stroke-status-error'
}

function dotBgClass(score: number): string {
  if (score >= 8) return 'bg-status-success'
  if (score >= 6) return 'bg-status-warning'
  return 'bg-status-error'
}

function DotBar({ score }: { score: number }) {
  const filled = dotBgClass(score)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < score ? filled : 'bg-background-border-mid'}`}
        />
      ))}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const fill = (score / 10) * circumference

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} strokeWidth="4" className="stroke-background-border" fill="none" />
        <circle
          cx="40" cy="40" r={radius} strokeWidth="4"
          className={ringColorClass(score)}
          fill="none"
          strokeDasharray={`${fill} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={`font-mono text-xl ${scoreColor(score)}`}>{score.toFixed(1)}</span>
    </div>
  )
}

export function ContentScorePanel({ open, scoring, result, onClose }: ContentScorePanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-16 right-0 h-[calc(100vh-4rem)] w-72 bg-background-secondary border-l border-background-border overflow-y-auto z-20"
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-sans font-medium text-text-tertiary uppercase tracking-widest">Content score</p>
              <button
                onClick={onClose}
                aria-label="Close score panel"
                className="text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {scoring && (
              <div className="space-y-3">
                <div className="h-20 w-20 rounded-full bg-background-tertiary animate-pulse mx-auto" />
                <p className="text-xs font-sans text-text-tertiary text-center">Scoring…</p>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-6 rounded bg-background-tertiary animate-pulse" />
                ))}
              </div>
            )}

            {!scoring && !result && (
              <p className="text-sm font-sans text-text-tertiary">Start typing to score your content.</p>
            )}

            {!scoring && result && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <ScoreRing score={result.overallScore} />
                </div>

                <div className="space-y-2.5">
                  {Object.entries(result.dimensions).map(([key, dim]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-sans text-text-secondary">{DIMENSION_LABELS[key]}</span>
                        <span className={`font-mono text-xs ${scoreColor(dim.score)}`}>{dim.score}</span>
                      </div>
                      <DotBar score={dim.score} />
                    </div>
                  ))}
                </div>

                {Object.entries(result.dimensions).some(([, d]) => d.suggestion) && (
                  <div className="space-y-2 pt-2 border-t border-background-border">
                    {Object.entries(result.dimensions)
                      .filter(([, d]) => d.suggestion)
                      .map(([key, d]) => (
                        <div key={key}>
                          <p className="text-xs font-medium font-sans text-text-primary">{DIMENSION_LABELS[key]}</p>
                          <p className="text-xs font-sans text-text-secondary leading-relaxed mt-0.5">{d.suggestion}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
