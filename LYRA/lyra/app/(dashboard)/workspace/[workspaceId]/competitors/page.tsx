'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CompetitorCard } from '@/components/lyra/competitors/competitor-card'
import { AddCompetitorForm } from '@/components/lyra/competitors/add-competitor-form'
import { Crosshair } from 'lucide-react'

interface Competitor {
  id: string
  name: string
  websiteUrl: string | null
  twitterHandle: string | null
  snapshots: {
    capturedAt: string
    postsPerWeek: number | null
    recentTopics: string[]
    recentPosts: unknown
  }[]
}

export default function CompetitorsPage() {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCompetitors = useCallback(async () => {
    const res = await fetch(`/api/competitors?workspaceId=${workspaceId}`)
    if (res.ok) setCompetitors(await res.json())
    setLoading(false)
  }, [workspaceId])

  useEffect(() => { fetchCompetitors() }, [fetchCompetitors])

  const handleRemove = async (id: string) => {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
    setCompetitors((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text-primary">Competitor Intelligence</h1>
        <AddCompetitorForm
          workspaceId={workspaceId}
          onAdded={fetchCompetitors}
          disabled={competitors.length >= 10}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
          ))}
        </div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Crosshair className="h-8 w-8 text-text-tertiary" strokeWidth={1.5} />
          <p className="text-sm font-sans text-text-secondary">No competitors added.</p>
          <p className="text-sm font-sans text-text-tertiary">Add a competitor to start tracking their content strategy.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              id={c.id}
              name={c.name}
              websiteUrl={c.websiteUrl}
              twitterHandle={c.twitterHandle}
              snapshots={c.snapshots}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
