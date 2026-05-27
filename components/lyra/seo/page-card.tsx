'use client'

import { useState } from 'react'
import { ExternalLink, RefreshCw, Sparkles, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { AiContentPanel } from './ai-content-panel'
import { AnalysisOverlay } from '@/components/lyra/shared/analysis-overlay'
import type { SeoPageWithContent } from '@/app/(dashboard)/workspace/[workspaceId]/seo/page'
import type { ScoreDimension } from '@/services/seo/on-page-analyzer'

const SEO_MESSAGES = [
  'Scanning your page…',
  'Checking meta data…',
  'Analysing content structure…',
  'Evaluating heading hierarchy…',
  'Reviewing keyword usage…',
  'Calculating your score…',
]

interface AnalysisResult {
  seoScore: number
  scoreBreakdown: {
    title: ScoreDimension
    metaDescription: ScoreDimension
    h1: ScoreDimension
    headingStructure: ScoreDimension
  }
  currentTitle: string | null
  currentMeta: string | null
  currentH1: string | null
}

interface Props {
  page: SeoPageWithContent
  onDeleted: (pageId: string) => void
  onContentGenerated: (pageId: string) => void
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="font-mono text-xs text-text-tertiary">—</span>
  }
  const color =
    score >= 75 ? 'text-status-success' :
    score >= 50 ? 'text-status-warning' :
    'text-status-error'
  return <span className={`font-mono text-lg font-medium ${color}`}>{score}</span>
}

export function PageCard({ page, onDeleted, onContentGenerated }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [currentScore, setCurrentScore] = useState(page.seoScore)

  const hostname = (() => {
    try { return new URL(page.url).hostname } catch { return page.url }
  })()

  const path = (() => {
    try { return new URL(page.url).pathname } catch { return '' }
  })()

  async function handleAnalyse() {
    setAnalysing(true)
    try {
      const res = await fetch(`/api/seo/pages/${page.id}/analyze`, { method: 'POST' })
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json() as AnalysisResult
      setAnalysis(data)
      setCurrentScore(data.seoScore)
      setExpanded(true)
    } finally {
      setAnalysing(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/seo/pages/${page.id}/generate`, { method: 'POST' })
      if (!res.ok) throw new Error('Generation failed')
      onContentGenerated(page.id)
      setExpanded(true)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete() {
    await fetch(`/api/seo/pages/${page.id}`, { method: 'DELETE' })
    onDeleted(page.id)
  }

  const latestContent = page.content.reduce<Record<string, string>>((acc, c) => {
    if (!acc[c.type]) acc[c.type] = c.content
    return acc
  }, {})

  return (
    <>
      <AnimatePresence>
        {analysing && <AnalysisOverlay messages={SEO_MESSAGES} />}
      </AnimatePresence>

      <div className="rounded-xl bg-background-secondary border border-background-border overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-sans text-xs text-text-tertiary shrink-0">{hostname}</span>
            <span className="font-mono text-xs text-text-secondary truncate">{path || '/'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ScoreBadge score={currentScore} />

          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-background-hover transition-colors"
            aria-label="Open page"
          >
            <ExternalLink size={13} strokeWidth={1.5} />
          </a>

          <button
            onClick={handleAnalyse}
            disabled={analysing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={analysing ? 'animate-spin' : ''} />
            {analysing ? 'Analysing…' : 'Analyse'}
          </button>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent-platinum text-background-primary font-sans text-xs font-medium disabled:opacity-50 hover:bg-accent-white transition-colors"
          >
            <Sparkles size={12} strokeWidth={1.5} />
            {generating ? 'Generating…' : 'Generate'}
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-background-hover transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp size={13} strokeWidth={1.5} />
              : <ChevronDown size={13} strokeWidth={1.5} />}
          </button>

          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
            aria-label="Remove page"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-background-border px-4 py-4 space-y-4">
          {analysis && (
            <div className="space-y-2">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Score breakdown
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(analysis.scoreBreakdown) as [string, ScoreDimension][]).map(
                  ([key, dim]) => (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-2 p-3 rounded-lg bg-background-tertiary"
                    >
                      <div className="space-y-0.5">
                        <p className="font-sans text-xs text-text-secondary capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="font-sans text-xs text-text-tertiary">{dim.note}</p>
                      </div>
                      <span className="font-mono text-sm text-text-primary shrink-0">
                        {dim.score}/{dim.max}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {Object.keys(latestContent).length > 0 && (
            <AiContentPanel content={latestContent} />
          )}

          {Object.keys(latestContent).length === 0 && !analysis && (
            <p className="font-sans text-xs text-text-tertiary">
              Click Analyse to score this page, or Generate to create AI content.
            </p>
          )}
        </div>
      )}
    </div>
    </>
  )
}
