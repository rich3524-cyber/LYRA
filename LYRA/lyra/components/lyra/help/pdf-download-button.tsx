'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

export function PdfDownloadButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const handleDownload = async () => {
    if (state === 'loading') return
    setState('loading')

    try {
      const res = await fetch('/api/help/pdf')

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'LYRA-Help-Guide.pdf'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setState('idle')
    } catch (err) {
      console.error('[PdfDownloadButton]', err)
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={state === 'loading'}
      aria-label="Download help guide as PDF"
      className="flex items-center gap-2 font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {state === 'loading' ? (
        <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <Download size={13} strokeWidth={1.5} />
      )}
      {state === 'loading'
        ? 'Generating PDF…'
        : state === 'error'
          ? 'Generation failed — try again'
          : 'Download PDF'}
    </button>
  )
}
