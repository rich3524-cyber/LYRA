import { PerformanceDashboard } from '@/components/lyra/analytics/performance-dashboard'

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-text-primary">Analytics</h1>
        <p className="font-sans text-sm text-text-secondary mt-1">Performance across all connected platforms.</p>
      </div>
      <PerformanceDashboard workspaceId={workspaceId} />
    </div>
  )
}
