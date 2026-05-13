'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const INDUSTRIES = [
  'Retail', 'Hospitality', 'Health & Fitness', 'Real Estate',
  'Professional Services', 'Beauty & Wellness', 'Food & Beverage',
  'Education', 'Technology', 'Finance', 'Entertainment', 'Other',
]

export default function NewWorkspacePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    industry: '',
    websiteUrl: '',
    clientAccessLevel: 'NONE',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create workspace')
      }

      const workspace = await res.json()
      router.push(`/workspace/${workspace.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <Link
          href="/agency/clients"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors mb-4"
        >
          <ArrowLeft size={12} />
          Back to clients
        </Link>
        <h2 className="font-display text-2xl text-text-primary">New workspace</h2>
        <p className="text-text-secondary text-sm mt-1">Create a workspace for a new client.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs text-text-secondary">
            Client name <span className="text-status-error">*</span>
          </Label>
          <Input
            id="name"
            placeholder="Acme Coffee Co."
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-background-secondary border-background-border text-text-primary placeholder:text-text-tertiary focus-visible:ring-accent-silver"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="industry" className="text-xs text-text-secondary">Industry</Label>
          <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v ?? '' }))}>
            <SelectTrigger
              id="industry"
              className="bg-background-secondary border-background-border text-text-primary"
            >
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent className="bg-background-tertiary border-background-border">
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind} className="text-text-secondary focus:text-text-primary focus:bg-background-hover">
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="websiteUrl" className="text-xs text-text-secondary">Website URL</Label>
          <Input
            id="websiteUrl"
            type="url"
            placeholder="https://acmecoffee.com.au"
            value={form.websiteUrl}
            onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            className="bg-background-secondary border-background-border text-text-primary placeholder:text-text-tertiary focus-visible:ring-accent-silver"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="clientAccessLevel" className="text-xs text-text-secondary">Client access</Label>
          <Select
            value={form.clientAccessLevel}
            onValueChange={(v) => setForm((f) => ({ ...f, clientAccessLevel: v ?? 'NONE' }))}
          >
            <SelectTrigger
              id="clientAccessLevel"
              className="bg-background-secondary border-background-border text-text-primary"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-tertiary border-background-border">
              <SelectItem value="NONE" className="text-text-secondary focus:text-text-primary focus:bg-background-hover">No access</SelectItem>
              <SelectItem value="VIEW_ONLY" className="text-text-secondary focus:text-text-primary focus:bg-background-hover">View only</SelectItem>
              <SelectItem value="APPROVE_POSTS" className="text-text-secondary focus:text-text-primary focus:bg-background-hover">Approve posts</SelectItem>
              <SelectItem value="FULL" className="text-text-secondary focus:text-text-primary focus:bg-background-hover">Full access</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-text-tertiary">Controls what the client can see and do in their portal.</p>
        </div>

        {error && (
          <p className="text-xs text-status-error">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="bg-accent-platinum text-text-inverse hover:bg-accent-white"
          >
            {loading ? 'Creating…' : 'Create workspace'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-text-secondary hover:text-text-primary"
            onClick={() => router.push('/agency/clients')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
