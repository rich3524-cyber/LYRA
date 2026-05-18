'use client'

import { CheckCircle2 } from 'lucide-react'
import { PageManager } from './page-manager'
import { GscAnalytics } from './gsc-analytics'
import type { SeoPageWithContent } from '@/app/(dashboard)/workspace/[workspaceId]/seo/page'

interface Props {
  workspaceId: string
  workspaceName: string
  propertyUrl: string
  initialPages: SeoPageWithContent[]
  justConnected: boolean
}

export function SeoDashboard({
  workspaceId,
  workspaceName,
  propertyUrl,
  initialPages,
  justConnected,
}: Props) {
  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="font-display text-4xl text-text-primary">SEO</h1>
          <p className="font-sans text-sm text-text-secondary">{workspaceName}</p>
        </div>
        <div className="shrink-0 pt-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-mono text-xs text-text-secondary">
            {propertyUrl}
          </span>
        </div>
      </div>

      {justConnected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-status-success/10 border border-status-success/20">
          <CheckCircle2 size={14} strokeWidth={1.5} className="text-status-success shrink-0" />
          <p className="font-sans text-sm text-status-success">
            Search Console connected. Add pages below to start scoring and generating content.
          </p>
        </div>
      )}

      <section className="p-5 rounded-xl bg-background-secondary border border-background-border">
        <PageManager workspaceId={workspaceId} initialPages={initialPages} />
      </section>

      <section className="p-5 rounded-xl bg-background-secondary border border-background-border">
        <GscAnalytics workspaceId={workspaceId} />
      </section>
    </div>
  )
}
