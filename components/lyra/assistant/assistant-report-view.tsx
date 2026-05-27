'use client'

import { useState } from 'react'
import { Sparkles, Download, RefreshCw, ChevronDown } from 'lucide-react'
import type { ReportData } from '@/services/assistant/report-types'

interface SerializedReport {
  id: string
  quarter: string
  status: string
  generatedAt: string
  reportData: unknown
  pdfS3Key: string | null
}

interface AssistantReportViewProps {
  workspaceId: string
  workspaceName: string
  initialReports: SerializedReport[]
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-[0.12em] mb-0.5">
        {label}
      </p>
      <p className="font-mono text-sm text-text-primary tabular-nums">{value}</p>
    </div>
  )
}

function GeneratingSkeleton() {
  return (
    <div className="space-y-4 pt-6">
      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        Analysing the last 90 days across all connected platforms. This takes about 30 seconds.
      </p>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="h-24 rounded-xl bg-background-secondary border border-background-border animate-pulse"
        />
      ))}
    </div>
  )
}

export function AssistantReportView({ workspaceId, workspaceName, initialReports }: AssistantReportViewProps) {
  const [reports, setReports] = useState<SerializedReport[]>(initialReports)
  const [activeReportId, setActiveReportId] = useState<string | null>(
    initialReports.find(r => r.status === 'READY')?.id ?? null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showQuarterDropdown, setShowQuarterDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeReport = reports.find(r => r.id === activeReportId)
  const reportData = activeReport?.reportData as ReportData | null
  const readyReports = reports.filter(r => r.status === 'READY')
  const currentQuarter = activeReport?.quarter
  const isReady = activeReport?.status === 'READY'
  const hasGenerated = readyReports.some(r => r.quarter === currentQuarter)

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/assistant/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? data.error ?? 'Generation failed.')
        return
      }
      const newReport: SerializedReport = {
        ...data.report,
        generatedAt: data.report.generatedAt,
      }
      setReports(prev => [newReport, ...prev.filter(r => r.quarter !== newReport.quarter)])
      setActiveReportId(newReport.id)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleExport() {
    if (!activeReportId) return
    setIsExporting(true)
    try {
      const res = await fetch(`/api/assistant/${activeReportId}/export-pdf`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Export failed.')
        return
      }
      window.open(data.url, '_blank')
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const QuarterDropdown = ({ mobile = false }: { mobile?: boolean }) =>
    readyReports.length > 1 ? (
      <div className="relative">
        <button
          onClick={() => setShowQuarterDropdown(!showQuarterDropdown)}
          className={`flex items-center gap-1.5 px-3 py-2 bg-background-secondary border border-background-border rounded-lg font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150 ${mobile ? '' : 'w-full justify-between'}`}
        >
          <span className="truncate">{currentQuarter ?? 'Quarter'}</span>
          <ChevronDown size={12} strokeWidth={1.5} className="shrink-0" />
        </button>
        {showQuarterDropdown && (
          <div className={`absolute top-full mt-1 bg-background-tertiary border border-background-border rounded-xl overflow-hidden z-10 min-w-[130px] ${mobile ? 'right-0' : 'left-0 w-full'}`}>
            {readyReports.map(r => (
              <button
                key={r.id}
                onClick={() => { setActiveReportId(r.id); setShowQuarterDropdown(false) }}
                className={`w-full text-left px-4 py-2.5 font-sans text-sm transition-colors duration-150 ${
                  r.id === activeReportId
                    ? 'text-text-primary bg-background-hover'
                    : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                }`}
              >
                {r.quarter}
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null

  return (
    <div className="flex items-start gap-8 pb-16">
      {/* Left panel — sticky controls, desktop only */}
      <aside className="hidden lg:flex flex-col gap-5 w-[200px] shrink-0 sticky top-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={13} strokeWidth={1.5} className="text-purple-400" />
            <span className="font-display text-xl text-text-primary">LYRA Assistant</span>
          </div>
          <p className="font-sans text-xs text-text-secondary truncate">{workspaceName}</p>
        </div>

        <QuarterDropdown />

        <div className="space-y-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-purple-500/10 border border-purple-500/30 hover:border-purple-500/60 text-purple-300 hover:text-purple-200 rounded-lg font-sans text-sm font-medium transition-colors duration-150 disabled:opacity-50"
          >
            {isGenerating ? (
              <RefreshCw size={13} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Sparkles size={13} strokeWidth={1.5} />
            )}
            {hasGenerated ? 'Regenerate' : 'Generate Report'}
          </button>

          {isReady && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-background-secondary border border-background-border rounded-lg font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150 disabled:opacity-50"
            >
              {isExporting ? (
                <RefreshCw size={13} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <Download size={13} strokeWidth={1.5} />
              )}
              Export PDF
            </button>
          )}
        </div>

        {reportData && (
          <div className="pt-4 border-t border-background-border space-y-3">
            <StatMini label="Total Posts" value={String(reportData.performance.totalPosts)} />
            <StatMini
              label="Avg Engagement"
              value={(reportData.performance.avgEngagementRate * 100).toFixed(1) + '%'}
            />
            <StatMini label="Best Platform" value={reportData.performance.bestPlatform ?? '—'} />
            <StatMini label="Top Theme" value={reportData.performance.topContentTheme ?? '—'} />
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={15} strokeWidth={1.5} className="text-purple-400" />
                <h1 className="font-display text-2xl text-text-primary">LYRA Assistant</h1>
              </div>
              <p className="font-sans text-sm text-text-secondary">{workspaceName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <QuarterDropdown mobile />
              {isReady && (
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-background-secondary border border-background-border rounded-lg font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150 disabled:opacity-50"
                  aria-label="Export PDF"
                >
                  {isExporting ? (
                    <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" />
                  ) : (
                    <Download size={14} strokeWidth={1.5} />
                  )}
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 border border-purple-500/30 hover:border-purple-500/60 text-purple-300 hover:text-purple-200 rounded-lg font-sans text-sm font-medium transition-colors duration-150 disabled:opacity-50"
              >
                {isGenerating ? (
                  <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <Sparkles size={14} strokeWidth={1.5} />
                )}
                {hasGenerated ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-background-secondary border border-status-error/30 rounded-xl p-4 mb-6">
            <p className="font-sans text-sm text-status-error">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!isGenerating && reports.length === 0 && (
          <div className="text-center py-20">
            <Sparkles size={24} strokeWidth={1.5} className="mx-auto text-purple-400/50 mb-5" />
            <h2 className="font-display text-3xl text-text-primary mb-3">No report yet.</h2>
            <p className="font-sans text-sm text-text-secondary max-w-sm mx-auto leading-relaxed mb-7">
              Generate your first quarterly report to see performance insights and a 3-month content strategy.
            </p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-500/10 border border-purple-500/30 hover:border-purple-500/60 text-purple-300 hover:text-purple-200 rounded-lg font-sans text-sm font-medium transition-colors duration-150"
            >
              <Sparkles size={14} strokeWidth={1.5} />
              Generate your first report
            </button>
          </div>
        )}

        {isGenerating && <GeneratingSkeleton />}

        {!isGenerating && reportData && (
          <div className="space-y-10">
            {/* Quarterly Review */}
            <section>
              <h2 className="font-display text-3xl text-text-primary mb-1">Quarterly Review</h2>
              <p className="font-sans text-xs text-text-tertiary mb-6">{reportData.period.label}</p>

              <p className="font-sans text-sm text-text-secondary leading-relaxed mb-8">
                {reportData.performance.insightNarrative}
              </p>

              {reportData.performance.byPlatform.length > 0 && (
                <div className="bg-background-secondary border border-background-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-3 px-4 py-2.5 border-b border-background-border">
                    {['Platform', 'Posts', 'Avg Engagement'].map(h => (
                      <span key={h} className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
                        {h}
                      </span>
                    ))}
                  </div>
                  {reportData.performance.byPlatform.map(p => (
                    <div
                      key={p.platform}
                      className="grid grid-cols-3 px-4 py-3 border-b border-background-border last:border-0"
                    >
                      <span className="font-sans text-sm text-text-secondary">{p.platform}</span>
                      <span className="font-mono text-sm text-text-primary">{p.postCount}</span>
                      <span className="font-mono text-sm text-text-primary">
                        {(p.avgEngagementRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="border-t border-background-border" />

            {/* 3-Month Strategy */}
            <section>
              <h2 className="font-display text-3xl text-text-primary mb-6">Next 3 Months</h2>
              <div className="space-y-4">
                {reportData.strategy.months.map((month, i) => (
                  <div
                    key={i}
                    className="bg-background-secondary border border-background-border rounded-xl p-5"
                  >
                    <h3 className="font-display text-xl text-text-primary mb-4">{month.month}</h3>

                    {month.contentPillars.length > 0 && (
                      <div className="mb-4">
                        <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">
                          Content Pillars
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {month.contentPillars.map((p, j) => (
                            <span
                              key={j}
                              className="px-2 py-1 bg-background-tertiary border border-background-border rounded-md font-sans text-xs text-text-secondary"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {month.keyDates.length > 0 && (
                      <div className="mb-4">
                        <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">
                          Key Dates
                        </p>
                        <div className="space-y-2">
                          {month.keyDates.map((d, j) => (
                            <div key={j} className="flex gap-3">
                              <span className="font-sans text-xs font-medium text-text-primary w-32 shrink-0">
                                {d.name}
                              </span>
                              <span className="font-sans text-xs text-text-secondary">{d.campaignIdea}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {month.recommendedFrequency.length > 0 && (
                      <div>
                        <p className="font-sans text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-2">
                          Post Frequency
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {month.recommendedFrequency.map((f, j) => (
                            <div
                              key={j}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-background-tertiary border border-background-border rounded-md"
                            >
                              <span className="font-sans text-xs text-text-secondary">{f.platform}</span>
                              <span className="font-mono text-xs text-text-primary">{f.postsPerWeek}×/week</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
