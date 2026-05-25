'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { ReportGeneratorModal } from './report-generator-modal'

export function ReportButton({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-background-border text-sm font-medium font-sans text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors"
      >
        <FileText className="h-4 w-4" strokeWidth={1.5} />
        Generate report
      </button>
      <ReportGeneratorModal workspaceId={workspaceId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
