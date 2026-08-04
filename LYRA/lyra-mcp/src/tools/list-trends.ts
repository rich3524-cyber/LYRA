import { callLyraApi, LyraApiError } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { wrapUntrusted } from '../untrusted-content'

interface Trend {
  id: string
  title: string
  relevanceScore: number
  sourceContent: string
}

interface ListTrendsParams {
  workspace_id?: string
}

// `GET /api/trends` in the main app hard-returns 503 "LYRA Trend launches in
// Phase 3." -- a deliberate product gate on a feature that isn't live yet,
// not a bug. This is a thin passthrough: it calls the real endpoint and
// reports whatever the endpoint says, rather than hardcoding a fake
// unavailability message independent of the real endpoint. Once LYRA Trend
// ships, this tool works with zero changes.
export async function listTrends(params: ListTrendsParams, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  try {
    const trends = await callLyraApi<Trend[]>('/api/trends', bearerToken, { workspaceId: workspace_id })
    return {
      available: true,
      trends: trends.map((t) => ({
        id: t.id,
        title: t.title,
        relevanceScore: t.relevanceScore,
        sourceContent: wrapUntrusted(t.sourceContent, 'trend_source'),
      })),
    }
  } catch (err) {
    if (err instanceof LyraApiError && err.status === 503) {
      const message = (err.body as { error?: string })?.error ?? 'LYRA Trend is not available yet.'
      return { available: false, message }
    }
    throw err
  }
}
