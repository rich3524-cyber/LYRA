import { callLyraApi } from '../lyra-api-client'

interface GetAnalyticsParams {
  workspace_id: string
  period?: number
}

export async function getAnalytics(params: GetAnalyticsParams, bearerToken: string) {
  if (!params.workspace_id) throw new Error('workspace_id is required')
  const period = params.period ?? 30
  return callLyraApi('/api/analytics', bearerToken, { workspaceId: params.workspace_id, period: String(period) })
}
