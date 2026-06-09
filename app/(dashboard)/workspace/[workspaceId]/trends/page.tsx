import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TrendHub } from '@/components/lyra/trends/trend-hub'
import Link from 'next/link'

interface Props {
  params: Promise<{ workspaceId: string }>
}

export default async function TrendsPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where:  { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true, trendEnabled: true },
  })
  if (!workspace) notFound()

  if (!workspace.trendEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl text-text-primary">LYRA Trend</h2>
          <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
        </div>
        <div className="p-8 rounded-xl bg-background-secondary border border-background-border text-center space-y-3">
          <p className="font-sans text-sm font-medium text-text-primary">LYRA Trend is not activated for this workspace.</p>
          <p className="font-sans text-xs text-text-secondary">Activate LYRA Trend in Settings to start receiving daily brand-matched trend intelligence.</p>
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-sans font-medium bg-accent-platinum text-background-primary hover:bg-accent-white transition-all"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">LYRA Trend</h2>
        <p className="text-text-secondary text-sm mt-1">{workspace.name}</p>
      </div>
      <TrendHub workspaceId={workspaceId} />
    </div>
  )
}
