'use client'

import { getPlatformLabel } from '@/lib/platform-labels'
import type { Platform } from '@prisma/client'

export interface ImportRow {
  rowNumber: number
  status: 'ready' | 'warning' | 'error'
  reason?: string
  post?: {
    socialAccountId: string
    platform: string
    content: string
    scheduledAt: string
    mediaUrl: string | null
  }
}

interface BulkImportReviewTableProps {
  rows: ImportRow[]
  selected: Set<number>
  onToggle: (rowNumber: number) => void
  /** Workspace timezone, so a row reads back at the time the user typed. */
  timeZone: string
}

const STATUS_STYLES: Record<ImportRow['status'], string> = {
  ready:   'text-status-success',
  warning: 'text-status-warning',
  error:   'text-status-error',
}

function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone,
  }).format(new Date(iso))
}

export function BulkImportReviewTable({ rows, selected, onToggle, timeZone }: BulkImportReviewTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-background-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-background-border text-left">
            <th className="p-3 w-10">
              <span className="sr-only">Include</span>
            </th>
            <th className="p-3 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Row</th>
            <th className="p-3 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">When</th>
            <th className="p-3 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Platform</th>
            <th className="p-3 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Caption</th>
            <th className="p-3 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Media</th>
            <th className="p-3 font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const blocked = row.status === 'error'
            return (
              <tr
                key={row.rowNumber}
                className="border-b border-background-border last:border-0 align-top"
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    disabled={blocked}
                    checked={selected.has(row.rowNumber)}
                    onChange={() => onToggle(row.rowNumber)}
                    aria-label={`Include spreadsheet row ${row.rowNumber}`}
                    className="accent-accent-platinum disabled:opacity-40"
                  />
                </td>
                <td className="p-3 font-mono text-xs text-text-tertiary">{row.rowNumber}</td>
                <td className="p-3 font-mono text-xs text-text-secondary whitespace-nowrap">
                  {row.post ? formatWhen(row.post.scheduledAt, timeZone) : '—'}
                </td>
                <td className="p-3 font-sans text-xs text-text-secondary whitespace-nowrap">
                  {row.post ? getPlatformLabel(row.post.platform as Platform) : '—'}
                </td>
                <td className="p-3 font-sans text-xs text-text-primary max-w-xs truncate">
                  {row.post?.content ?? '—'}
                </td>
                <td className="p-3 font-sans text-xs text-text-tertiary whitespace-nowrap">
                  {row.post?.mediaUrl ? 'Attached' : 'None'}
                </td>
                <td className={`p-3 font-sans text-xs ${STATUS_STYLES[row.status]}`}>
                  {row.status === 'ready' ? 'Ready' : row.reason}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
