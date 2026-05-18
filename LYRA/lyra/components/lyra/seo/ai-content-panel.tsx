'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

const LABELS: Record<string, string> = {
  META_TITLE: 'Meta Title',
  META_DESC: 'Meta Description',
  H1: 'H1 Heading',
  INTRO: 'Intro Copy',
}

interface Props {
  content: Record<string, string>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors"
      aria-label="Copy to clipboard"
    >
      {copied
        ? <Check size={12} strokeWidth={2} className="text-status-success" />
        : <Copy size={12} strokeWidth={1.5} />}
    </button>
  )
}

export function AiContentPanel({ content }: Props) {
  const order = ['META_TITLE', 'META_DESC', 'H1', 'INTRO']
  const entries = order.filter((k) => content[k])

  if (entries.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
        AI-Generated Content
      </p>
      <div className="space-y-2">
        {entries.map((key) => (
          <div
            key={key}
            className="flex items-start justify-between gap-3 p-3 rounded-lg bg-background-tertiary"
          >
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.08em]">
                {LABELS[key] ?? key}
              </p>
              <p className="font-sans text-sm text-text-primary leading-relaxed">
                {content[key]}
              </p>
              <p className="font-mono text-xs text-text-tertiary">
                {content[key].length} chars
              </p>
            </div>
            <CopyButton text={content[key]} />
          </div>
        ))}
      </div>
    </div>
  )
}
