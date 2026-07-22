import { PerformanceDashboard } from '@/components/lyra/analytics/performance-dashboard'
import { ReportButton } from '@/components/lyra/analytics/report-button'

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-4xl text-text-primary">Analytics</h1>
          <p className="text-sm text-[#555] mt-1">Performance across all connected platforms.</p>
        </div>
        <ReportButton workspaceId={workspaceId} />
      </div>
      <PerformanceDashboard workspaceId={workspaceId} />
    </div>
  )
}
