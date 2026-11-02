'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { CompetitorCard } from '@/components/lyra/competitors/competitor-card'
import { AddCompetitorForm } from '@/components/lyra/competitors/add-competitor-form'
import { Crosshair, AlertCircle } from 'lucide-react'

interface Competitor {
  id: string
  name: string
  websiteUrl: string | null
  twitterHandle: string | null
  facebookPageId: string | null
  instagramHandle: string | null
  linkedinPageId: string | null
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
  // useSWR replaces a fetch-on-mount effect, continuing the migration the
  // shared fetcher was added for (see lib/swr-fetcher.ts and
  // components/lyra/app-shell/swr-provider.tsx). The effect version tripped
  // react-hooks/set-state-in-effect; more usefully, it also had no error
  // state at all -- a failed load silently rendered the "No competitors
  // added" empty state, which reads as "you have none" rather than "we
  // couldn't load them."
  //
  // `data ?? []` preserves the original's behaviour on failure (render the
  // empty state rather than crash) while `error` now makes a real failure
  // distinguishable -- see the error branch in the markup below.
  const { data, error, isLoading, mutate } = useSWR<Competitor[]>(
    `/api/competitors?workspaceId=${workspaceId}`
  )
  const competitors = data ?? []
  const loading = isLoading

  const handleRemove = useCallback(async (id: string) => {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
    // Drops the row from the cache without re-fetching, matching what the
    // previous local setCompetitors call did. `revalidate: false` is what
    // keeps this like-for-like rather than adding a new background request.
    await mutate((prev) => (prev ?? []).filter((c) => c.id !== id), { revalidate: false })
  }, [mutate])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-text-primary">Competitor Intelligence</h1>
        <AddCompetitorForm
          workspaceId={workspaceId}
          onAdded={() => { void mutate() }}
          disabled={competitors.length >= 10}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-8 w-8 text-status-error" strokeWidth={1.5} />
          <p className="text-sm font-sans text-text-secondary">Competitors could not be loaded.</p>
          <button
            type="button"
            onClick={() => { void mutate() }}
            className="font-sans text-sm text-accent-platinum hover:text-accent-white transition-colors"
          >
            Try again
          </button>
        </div>
      ) : competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Crosshair className="h-8 w-8 text-text-tertiary" strokeWidth={1.5} />
          <p className="text-sm font-sans text-text-secondary">No competitors added.</p>
          <p className="text-sm font-sans text-text-secondary">Add a competitor to start tracking their content strategy.</p>
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
              facebookPageId={c.facebookPageId}
              instagramHandle={c.instagramHandle}
              linkedinPageId={c.linkedinPageId}
              snapshots={c.snapshots}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
