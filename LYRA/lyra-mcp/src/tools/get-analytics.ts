import { callLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface GetAnalyticsParams {
  workspace_id?: string
  period?: number
}

// Mirrors the hand-computed response shape built by GET /api/analytics in the
// main app (app/api/analytics/route.ts) -- summary stats, a daily series,
// per-platform post counts, and the top posts by reach. Unlike the raw
// Prisma-record endpoints behind get-brand-profile/list-workspaces, this
// response is already aggregated/shaped server-side, so there's no
// DB-column-leak risk motivating a destructure-and-reconstruct here; a plain
// typed pass-through is sufficient.
interface AnalyticsSeriesPoint {
  date: string
  likes: number
  comments: number
  shares: number
  reach: number
  views: number
}

interface AnalyticsPlatformBreakdown {
  platform: string
  count: number
}

interface AnalyticsTopPost {
  id: string
  content: string
  platform: string
  reach: number
  views: number
  likes: number
  comments: number
  publishedAt: string | null
}

interface AnalyticsResponse {
  summary: {
    postsPublished: number
    totalReach: number
    totalViews: number
    totalLikes: number
    totalComments: number
    totalShares: number
    commentResponseRate: number
    inboxPending: number
  }
  series: AnalyticsSeriesPoint[]
  platformBreakdown: AnalyticsPlatformBreakdown[]
  topPosts: AnalyticsTopPost[]
}

export async function getAnalytics(params: GetAnalyticsParams, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const period = params.period ?? 30
  return callLyraApi<AnalyticsResponse>('/api/analytics', bearerToken, {
    workspaceId: workspace_id,
    period: String(period),
  })
}
