'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageCard } from './page-card'
import type { SeoPageWithContent } from '@/app/(dashboard)/workspace/[workspaceId]/seo/page'

interface Props {
  workspaceId: string
  initialPages: SeoPageWithContent[]
}

export function PageManager({ workspaceId, initialPages }: Props) {
  const [pages, setPages] = useState(initialPages)
  const [urlInput, setUrlInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAdd() {
    setAddError(null)
    const url = urlInput.trim()
    if (!url) return

    try {
      new URL(url)
    } catch {
      setAddError('Enter a valid URL including https://')
      return
    }

    setAdding(true)
    try {
      const res = await fetch('/api/seo/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, url }),
      })

      if (res.status === 409) { setAddError('URL already tracked.'); return }
      if (!res.ok) throw new Error('Failed')

      const page = await res.json() as SeoPageWithContent
      setPages((prev) => [page, ...prev])
      setUrlInput('')
    } catch {
      setAddError('Failed to add page. Try again.')
    } finally {
      setAdding(false)
    }
  }

  function handleDeleted(pageId: string) {
    setPages((prev) => prev.filter((p) => p.id !== pageId))
  }

  async function handleContentGenerated(pageId: string) {
    const res = await fetch(`/api/seo/pages?workspaceId=${workspaceId}`)
    if (!res.ok) return
    const all = await res.json() as SeoPageWithContent[]
    const updated = all.find((p) => p.id === pageId)
    if (updated) {
      setPages((prev) => prev.map((p) => (p.id === pageId ? updated : p)))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Tracked Pages
        </p>
        <span className="font-mono text-xs text-text-tertiary">{pages.length}</span>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="https://example.com/page"
          className="flex-1 px-3 py-2 rounded-lg bg-background-tertiary border border-background-border-mid font-sans text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-silver transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !urlInput.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background-tertiary border border-background-border-mid font-sans text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
          aria-label="Add page"
        >
          <Plus size={14} strokeWidth={1.5} />
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>

      {addError && (
        <p className="font-sans text-xs text-status-error">{addError}</p>
      )}

      {pages.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="font-sans text-sm text-text-secondary">No pages tracked yet.</p>
          <p className="font-sans text-xs text-text-tertiary">
            Add a URL above to score it and generate AI content.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              onDeleted={handleDeleted}
              onContentGenerated={handleContentGenerated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
