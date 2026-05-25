'use client'

import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ReportGeneratorModalProps {
  workspaceId: string
  open: boolean
  onClose: () => void
}

export function ReportGeneratorModal({ workspaceId, open, onClose }: ReportGeneratorModalProps) {
  const [period, setPeriod] = useState<'7d' | '30d'>('30d')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, period }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? `Report generation failed (${res.status}).`)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lyra-report-${period}-${Date.now()}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      onClose()
    } catch {
      setError('Report generation failed. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !generating) onClose() }}>
      <DialogContent className="bg-background-secondary border-background-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-sans font-medium text-text-primary">Generate report</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex rounded-lg border border-background-border overflow-hidden">
            {(['7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 text-sm font-sans transition-colors ${
                  period === p
                    ? 'bg-accent-platinum text-background-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-sm text-status-error font-sans">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent-platinum text-background-primary text-sm font-medium font-sans hover:bg-accent-white transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-background-primary/30 border-t-background-primary animate-spin" />
                Building your report. This takes about 10 seconds.
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" strokeWidth={1.5} />
                Generate PDF
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
