'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Plus } from 'lucide-react'

interface Suggestion {
  keyword:  string
  category: string
}

interface ActiveKeyword {
  id:    string
  value: string
}

const CATEGORY_LABELS: Record<string, string> = {
  legal: 'Legal', safety: 'Safety', discrimination: 'Discrimination',
  media: 'Media', business_specific: 'Business-specific',
}

export function CrisisKeywordsSection({
  workspaceId,
  initialSuggestions,
  initialActiveKeywords,
}: {
  workspaceId:           string
  initialSuggestions:    Suggestion[]
  initialActiveKeywords: ActiveKeyword[]
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [active, setActive]           = useState(initialActiveKeywords)
  const [newKeyword, setNewKeyword]   = useState('')
  const [busyKeyword, setBusyKeyword] = useState<string | null>(null)
  const [adding, setAdding]           = useState(false)

  async function approve(keyword: string, category?: string) {
    setBusyKeyword(keyword)
    try {
      const res  = await fetch('/api/brand-intelligence/crisis-keywords/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, keyword, category }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to approve keyword'); return }
      setSuggestions((prev) => prev.filter((s) => s.keyword.toLowerCase() !== keyword.toLowerCase()))
      setActive((prev) => (prev.some((k) => k.id === data.id) ? prev : [...prev, { id: data.id, value: data.value }]))
      toast.success(`"${keyword}" added as a crisis keyword.`)
    } catch {
      toast.error('Failed to approve keyword')
    } finally {
      setBusyKeyword(null)
    }
  }

  async function dismiss(keyword: string) {
    setBusyKeyword(keyword)
    try {
      const res = await fetch('/api/brand-intelligence/crisis-keywords/dismiss', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, keyword }),
      })
      if (!res.ok) { toast.error('Failed to dismiss suggestion'); return }
      setSuggestions((prev) => prev.filter((s) => s.keyword.toLowerCase() !== keyword.toLowerCase()))
    } catch {
      toast.error('Failed to dismiss suggestion')
    } finally {
      setBusyKeyword(null)
    }
  }

  async function remove(id: string, value: string) {
    setBusyKeyword(value)
    try {
      const res = await fetch(`/api/guardrails/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove keyword'); return }
      setActive((prev) => prev.filter((k) => k.id !== id))
    } catch {
      toast.error('Failed to remove keyword')
    } finally {
      setBusyKeyword(null)
    }
  }

  async function handleAdd() {
    const trimmed = newKeyword.trim()
    if (!trimmed) return
    setAdding(true)
    try {
      const res  = await fetch('/api/brand-intelligence/crisis-keywords/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, keyword: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to add keyword'); return }
      setActive((prev) => (prev.some((k) => k.id === data.id) ? prev : [...prev, { id: data.id, value: data.value }]))
      setNewKeyword('')
      toast.success(`"${trimmed}" added as a crisis keyword.`)
    } catch {
      toast.error('Failed to add keyword')
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="space-y-0.5">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Crisis keywords
        </p>
        <p className="font-sans text-xs text-text-tertiary">
          A comment containing any of these instantly escalates to a human instead of auto-replying.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="font-sans text-xs text-text-secondary">Suggested</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <div
                key={s.keyword}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
              >
                <span>{s.keyword}</span>
                <span className="text-text-tertiary">· {CATEGORY_LABELS[s.category] ?? s.category}</span>
                <button
                  type="button"
                  onClick={() => approve(s.keyword, s.category)}
                  disabled={busyKeyword === s.keyword}
                  aria-label={`Approve "${s.keyword}"`}
                  className="text-status-success hover:opacity-70 disabled:opacity-50 transition-opacity"
                >
                  <Check size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(s.keyword)}
                  disabled={busyKeyword === s.keyword}
                  aria-label={`Dismiss "${s.keyword}"`}
                  className="text-text-tertiary hover:text-text-primary disabled:opacity-50 transition-colors"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="font-sans text-xs text-text-secondary">Active</p>
        {active.length === 0 ? (
          <p className="font-sans text-xs text-text-tertiary">None yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
              >
                <span>{k.value}</span>
                <button
                  type="button"
                  onClick={() => remove(k.id, k.value)}
                  disabled={busyKeyword === k.value}
                  aria-label={`Remove "${k.value}"`}
                  className="text-text-tertiary hover:text-status-error disabled:opacity-50 transition-colors"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label="Add a crisis keyword"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !adding) handleAdd() }}
          placeholder="Add a keyword…"
          className="flex-1 rounded-lg bg-background-hover border border-background-border-mid px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newKeyword.trim()}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-background-hover border border-background-border-mid text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
        >
          <Plus size={12} strokeWidth={2} /> Add
        </button>
      </div>
    </section>
  )
}
