'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Upload, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { BulkImportReviewTable, type ImportRow } from './bulk-import-review-table'

interface BulkImportClientProps {
  workspaceId: string
  timeZone: string
  hasConnectedAccounts: boolean
}

export function BulkImportClient({ workspaceId, timeZone, hasConnectedAccounts }: BulkImportClientProps) {
  const router = useRouter()
  const [rows, setRows]           = useState<ImportRow[] | null>(null)
  const [selected, setSelected]   = useState<Set<number>>(new Set())
  const [parsing, setParsing]     = useState(false)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName]   = useState<string | null>(null)

  async function handleUpload(file: File) {
    setParsing(true)
    setRows(null)
    setFileName(file.name)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch(`/api/workspaces/${workspaceId}/bulk-import/parse`, {
        method: 'POST',
        body:   form,
      })
      const data = (await res.json()) as { rows?: ImportRow[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to read that file')

      const parsed = data.rows ?? []
      setRows(parsed)
      // Warnings are pre-checked: the post itself is valid, only its media is
      // in question. Errors are never selectable.
      setSelected(new Set(parsed.filter((r) => r.status !== 'error').map((r) => r.rowNumber)))
    } catch (err) {
      setFileName(null)
      toast.error(err instanceof Error ? err.message : 'Failed to read that file')
    } finally {
      setParsing(false)
    }
  }

  function toggleRow(rowNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  async function handleImport() {
    if (!rows) return
    const toImport = rows.filter((r) => selected.has(r.rowNumber) && r.post).map((r) => r.post!)
    if (toImport.length === 0) return

    setImporting(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/bulk-import/commit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows: toImport }),
      })
      const data = (await res.json()) as { created?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')

      toast.success(`Imported ${data.created} post${data.created === 1 ? '' : 's'}`)
      router.push(`/workspace/${workspaceId}/calendar`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const readyCount   = rows?.filter((r) => r.status === 'ready').length   ?? 0
  const warningCount = rows?.filter((r) => r.status === 'warning').length ?? 0
  const errorCount   = rows?.filter((r) => r.status === 'error').length   ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-4xl text-text-primary">Bulk import</h2>
          <p className="font-sans text-sm text-text-secondary mt-1">
            Download the template, fill in one row per post, then upload it. Nothing is scheduled until you confirm.
          </p>
        </div>
        <Link
          href={`/workspace/${workspaceId}/calendar`}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-sans font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          Back to calendar
        </Link>
      </div>

      {!hasConnectedAccounts && (
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border">
          <p className="font-sans text-sm text-text-primary">No social accounts connected.</p>
          <p className="font-sans text-sm text-text-secondary mt-1">
            Connect an account in Settings first. Until then the template has no platforms to choose from and no row
            can be imported.
          </p>
        </div>
      )}

      <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/workspaces/${workspaceId}/bulk-import/template`}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver"
          >
            <Download size={13} strokeWidth={1.5} />
            Download template
          </a>

          <label className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver cursor-pointer">
            {parsing ? (
              <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Upload size={13} strokeWidth={1.5} />
            )}
            {parsing ? 'Reading…' : 'Upload filled template'}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={parsing}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Reset so re-uploading the same filename after a fix still fires.
                e.target.value = ''
                if (file) void handleUpload(file)
              }}
            />
          </label>

          {fileName && !parsing && (
            <span className="font-sans text-xs text-text-tertiary">{fileName}</span>
          )}
        </div>

        <p className="font-sans text-[11px] text-text-tertiary leading-relaxed">
          One row per platform — a post going to Facebook and Instagram is two rows. Times are read in this
          workspace&apos;s timezone ({timeZone}). Media URL is optional.
        </p>
      </div>

      {parsing && (
        <div className="h-32 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
      )}

      {rows && !parsing && (
        <div className="space-y-4">
          <p className="font-sans text-sm text-text-secondary">
            <span className="font-mono text-text-primary">{readyCount}</span> ready,{' '}
            <span className="font-mono text-text-primary">{warningCount}</span> with warnings,{' '}
            <span className="font-mono text-text-primary">{errorCount}</span> blocked.
            {errorCount > 0 && ' Fix blocked rows in the spreadsheet and upload again.'}
          </p>

          <BulkImportReviewTable
            rows={rows}
            selected={selected}
            onToggle={toggleRow}
            timeZone={timeZone}
          />

          <button
            onClick={handleImport}
            disabled={importing || selected.size === 0}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-accent-platinum text-background-primary hover:bg-accent-white disabled:opacity-40 disabled:pointer-events-none"
          >
            {importing && <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />}
            {importing
              ? 'Importing…'
              : `Import ${selected.size} post${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}
