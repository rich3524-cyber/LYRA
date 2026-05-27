'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface AddCompetitorFormProps {
  workspaceId: string
  onAdded: () => void
  disabled?: boolean
}

export function AddCompetitorForm({ workspaceId, onAdded, disabled }: AddCompetitorFormProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', websiteUrl: '', twitterHandle: '', facebookPageId: '' })
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...form }),
      })
      if (res.ok) {
        setForm({ name: '', websiteUrl: '', twitterHandle: '', facebookPageId: '' })
        setOpen(false)
        onAdded()
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Failed to add competitor.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-background-border text-sm font-medium font-sans text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors disabled:opacity-50"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} />
        Add competitor
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium font-sans text-text-primary">Add competitor</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close form">
          <X className="h-4 w-4 text-text-tertiary" strokeWidth={1.5} />
        </button>
      </div>
      {[
        { key: 'name', label: 'Name', placeholder: 'Acme Co', required: true },
        { key: 'websiteUrl', label: 'Website URL', placeholder: 'https://acme.com' },
        { key: 'twitterHandle', label: 'Twitter handle', placeholder: 'acmeco' },
        { key: 'facebookPageId', label: 'Facebook page ID', placeholder: '123456789' },
      ].map(({ key, label, placeholder, required }) => (
        <div key={key}>
          <label className="block text-xs font-medium font-sans text-text-secondary mb-1">{label}{required && ' *'}</label>
          <input
            value={form[key as keyof typeof form]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            required={required}
            className="w-full px-3 py-2 rounded-lg bg-background-tertiary border border-background-border text-sm font-sans text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-background-border-mid"
          />
        </div>
      ))}
      {error && <p className="text-xs text-status-error font-sans">{error}</p>}
      <button
        type="submit"
        disabled={saving || !form.name.trim()}
        className="w-full py-2 rounded-lg bg-accent-platinum text-background-primary text-sm font-medium font-sans hover:bg-accent-white transition-colors disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add competitor'}
      </button>
    </form>
  )
}
